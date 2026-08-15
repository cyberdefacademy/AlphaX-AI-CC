import { randomUUID } from 'node:crypto';
import { audit, type SecurityContext } from './security';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  readOnly?: boolean;
  risk?: string;
}

export interface McpProvider {
  id: string;
  name: string;
  kind: 'kali' | 'hexstrike' | 'generic';
  endpoint: string;
  enabled: boolean;
}

export interface McpInvocation {
  providerId: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface McpResult {
  providerId: string;
  tool: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  raw?: unknown;
}

export interface McpTransport {
  listTools(provider: McpProvider): Promise<McpTool[]>;
  callTool(provider: McpProvider, tool: string, args: Record<string, unknown>): Promise<unknown>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function allowedHosts(): Set<string> {
  const configured = process.env.ALPHAX_MCP_ALLOWED_HOSTS
    ?.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  // Fail closed for unconfigured remote endpoints: local MCP providers remain
  // usable, while remote providers require an explicit host allowlist.
  return new Set(configured ?? ['localhost', '127.0.0.1', '::1']);
}

function validateEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('MCP endpoint must use HTTP(S)');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!allowedHosts().has(host)) {
    throw new Error(`MCP endpoint host is not allowlisted: ${host}`);
  }

  // Plain HTTP is permitted only for explicitly local providers. Remote MCP
  // traffic must use TLS so credentials and tool arguments are not exposed.
  if (url.protocol === 'http:' && !isLoopbackHost(host)) {
    throw new Error('Remote MCP endpoints must use HTTPS');
  }

  return url;
}

function tokenForProvider(provider: McpProvider): string | undefined {
  const envName =
    provider.kind === 'kali'
      ? 'ALPHAX_KALI_MCP_TOKEN'
      : provider.kind === 'hexstrike'
        ? 'ALPHAX_HEXSTRIKE_MCP_TOKEN'
        : 'ALPHAX_GENERIC_MCP_TOKEN';
  return process.env[envName] || undefined;
}

export class JsonRpcHttpTransport implements McpTransport {
  constructor(
    private readonly timeoutMs = Number(process.env.ALPHAX_MCP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  ) {}

  private async rpc(endpoint: string, provider: McpProvider, method: string, params: unknown) {
    const url = validateEndpoint(endpoint);
    const token = tokenForProvider(provider);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(this.timeoutMs, 120_000)));

    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/json',
      };
      if (token) headers.authorization = `Bearer ${token}`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: randomUUID(),
          method,
          params,
        }),
        redirect: 'error',
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);

      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new Error('MCP response exceeds maximum size');
      }

      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
        throw new Error('MCP response exceeds maximum size');
      }

      if (!text) return null;
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error('MCP response is not valid JSON');
      }

      if (body?.error) {
        throw new Error(String(body.error.message || 'MCP JSON-RPC error'));
      }
      if (!body || body.jsonrpc !== '2.0' || !Object.prototype.hasOwnProperty.call(body, 'result')) {
        throw new Error('Invalid MCP JSON-RPC response');
      }
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async listTools(provider: McpProvider): Promise<McpTool[]> {
    const result: any = await this.rpc(provider.endpoint, provider, 'tools/list', {});
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(provider: McpProvider, tool: string, args: Record<string, unknown>): Promise<unknown> {
    return this.rpc(provider.endpoint, provider, 'tools/call', {
      name: tool,
      arguments: args,
    });
  }
}

export class GovernedMcpAdapter {
  constructor(private readonly transport: McpTransport = new JsonRpcHttpTransport()) {}

  async discover(ctx: SecurityContext, provider: McpProvider) {
    if (!provider.enabled) throw new Error('MCP provider disabled');
    validateEndpoint(provider.endpoint);
    const tools = await this.transport.listTools(provider);
    audit(ctx.actor, 'mcp.tools.discovered', provider.id, 'allow', {
      provider: provider.name,
      count: tools.length,
    });
    return tools;
  }

  async invoke(
    ctx: SecurityContext,
    provider: McpProvider,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<McpResult> {
    if (!provider.enabled) {
      return { providerId: provider.id, tool, ok: false, error: 'provider disabled' };
    }

    try {
      validateEndpoint(provider.endpoint);
      const result = await this.transport.callTool(provider, tool, args);
      audit(ctx.actor, 'mcp.tool.invoked', tool, 'allow', { provider: provider.id });
      return { providerId: provider.id, tool, ok: true, result };
    } catch (e) {
      const error = String((e as Error).message);
      audit(ctx.actor, 'mcp.tool.failed', tool, 'deny', {
        provider: provider.id,
        error,
      });
      return { providerId: provider.id, tool, ok: false, error };
    }
  }
}
