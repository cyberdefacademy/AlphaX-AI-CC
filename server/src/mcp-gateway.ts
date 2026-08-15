import { getDb, randomId, nowIso } from './db';
import { audit, requirePermission, type RiskLevel, type SecurityContext } from './security';

export type McpTransport = 'http' | 'https';
export interface McpTool { name: string; description?: string; inputSchema?: unknown; outputSchema?: unknown; risk: RiskLevel; permission: string; readOnly: boolean; requiresTarget?: boolean; upstreamName?: string; }
export interface McpServer { id: string; name: string; endpoint: string; transport: McpTransport; enabled: boolean; kind: string; }

export function initMcpSchema(): void { /* Schema is initialized by the unified governed MCP module. */ }

export function registerMcpServer(ctx: SecurityContext, input: { name: string; endpoint: string; transport?: McpTransport; kind?: string }): string {
  requirePermission(ctx, 'tools.manage');
  const url = new URL(input.endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MCP endpoint must use HTTP(S)');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) throw new Error('remote MCP endpoints must use HTTPS');
  const id = randomId(); const ts = nowIso();
  getDb().prepare(`INSERT INTO mcp_servers(id,name,endpoint,kind,enabled,created_at,updated_at) VALUES(?,?,?,?,1,?,?)`).run(id, input.name, url.toString(), input.kind ?? 'generic', ts, ts);
  audit(ctx.actor, 'mcp.server.registered', id, 'allow', { name: input.name, endpoint: url.origin, kind: input.kind ?? 'generic' });
  return id;
}

export function listMcpServers(): unknown[] { return getDb().prepare('SELECT id,name,endpoint,kind,enabled,created_at,updated_at FROM mcp_servers ORDER BY name').all(); }

export function registerMcpTool(ctx: SecurityContext, serverId: string, tool: McpTool): string {
  requirePermission(ctx, 'tools.manage');
  const server: any = getDb().prepare('SELECT id FROM mcp_servers WHERE id=?').get(serverId);
  if (!server) throw new Error('MCP server not found');
  const name = tool.upstreamName && tool.name !== tool.upstreamName ? tool.name : tool.name;
  const id = randomId();
  getDb().prepare(`INSERT INTO mcp_tools(name,description,risk,required_permission,read_only,server,enabled,created_at,input_schema,output_schema,requires_target,upstream_name,last_seen_at) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET description=excluded.description,risk=excluded.risk,required_permission=excluded.required_permission,read_only=excluded.read_only,server=excluded.server,enabled=1,input_schema=excluded.input_schema,output_schema=excluded.output_schema,requires_target=excluded.requires_target,upstream_name=excluded.upstream_name,last_seen_at=excluded.last_seen_at`).run(name, tool.description ?? '', tool.risk, tool.permission, tool.readOnly ? 1 : 0, serverId, nowIso(), JSON.stringify(tool.inputSchema ?? null), JSON.stringify(tool.outputSchema ?? null), tool.requiresTarget ? 1 : 0, tool.upstreamName ?? name, nowIso());
  audit(ctx.actor, 'mcp.tool.registered', id, 'allow', { serverId, name, risk: tool.risk, readOnly: tool.readOnly });
  return id;
}

export function listMcpTools(serverId?: string): unknown[] {
  const rows: any[] = serverId ? getDb().prepare('SELECT name,description,input_schema as inputSchema,output_schema as outputSchema,risk,required_permission as permission,read_only as readOnly,server as serverId,requires_target as requiresTarget,upstream_name as upstreamName FROM mcp_tools WHERE server=? AND enabled=1 ORDER BY name').all(serverId) as any[] : getDb().prepare('SELECT name,description,input_schema as inputSchema,output_schema as outputSchema,risk,required_permission as permission,read_only as readOnly,server as serverId,requires_target as requiresTarget,upstream_name as upstreamName FROM mcp_tools WHERE enabled=1 ORDER BY name').all() as any[];
  return rows.map((row) => ({ ...row, inputSchema: row.inputSchema ? JSON.parse(row.inputSchema) : undefined, outputSchema: row.outputSchema ? JSON.parse(row.outputSchema) : undefined, readOnly: Boolean(row.readOnly), requiresTarget: Boolean(row.requiresTarget) }));
}
