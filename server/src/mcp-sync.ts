import { getDb, nowIso } from './db';
import { audit, type SecurityContext, type RiskLevel } from './security';
import { registerCapability } from './capabilities';
import { GovernedMcpAdapter, type McpProvider } from './mcp-adapters';
import { checkProviderHealth, initMcpHealthSchema } from './mcp-health';

export async function syncMcpProvider(ctx: SecurityContext, provider: McpProvider, adapter = new GovernedMcpAdapter()) {
  initMcpHealthSchema();
  const db = getDb();
  const ts = nowIso();
  db.prepare(`INSERT INTO mcp_servers(id,name,endpoint,kind,enabled,created_at,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,endpoint=excluded.endpoint,kind=excluded.kind,enabled=1,updated_at=excluded.updated_at`).run(provider.id, provider.name, provider.endpoint, provider.kind, ts, ts);

  const health = await checkProviderHealth(ctx, provider, adapter);
  if (health.status === 'unreachable') throw new Error(health.error || 'provider unreachable');

  const tools = await adapter.discover(ctx, provider);
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!tool.name || tool.name.length > 200) continue;
    const canonicalName = `${provider.id}:${tool.name}`;
    const risk = (tool.risk === 'low' || tool.risk === 'medium' || tool.risk === 'high' || tool.risk === 'critical' ? tool.risk : 'medium') as RiskLevel;
    const requiresTarget = Boolean((tool.inputSchema as any)?.properties?.target || (tool.inputSchema as any)?.properties?.targets);
    seen.add(canonicalName);
    db.prepare(`INSERT INTO mcp_tools(name,description,risk,required_permission,read_only,server,enabled,created_at,input_schema,output_schema,requires_target,upstream_name,last_seen_at) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET description=excluded.description,risk=excluded.risk,required_permission=excluded.required_permission,read_only=excluded.read_only,server=excluded.server,enabled=1,input_schema=excluded.input_schema,output_schema=excluded.output_schema,requires_target=excluded.requires_target,upstream_name=excluded.upstream_name,last_seen_at=excluded.last_seen_at`).run(canonicalName, tool.description || '', risk, `tools.execute.${risk}`, tool.readOnly ? 1 : 0, provider.id, ts, JSON.stringify(tool.inputSchema ?? null), JSON.stringify(tool.outputSchema ?? null), requiresTarget ? 1 : 0, tool.name, ts);
    registerCapability(ctx, { name: canonicalName, description: tool.description, provider: provider.id, tool: canonicalName, permission: `tools.execute.${risk}`, risk, readOnly: Boolean(tool.readOnly), mitre: [] });
  }

  const existing = db.prepare(`SELECT name FROM mcp_tools WHERE server=?`).all(provider.id) as {name:string}[];
  const disable = db.prepare(`UPDATE mcp_tools SET enabled=0 WHERE name=? AND server=?`);
  for (const row of existing) if (!seen.has(row.name)) disable.run(row.name, provider.id);
  db.prepare(`UPDATE mcp_servers SET updated_at=? WHERE id=?`).run(ts, provider.id);
  audit(ctx.actor, 'mcp.provider.synced', provider.id, 'allow', { tools: tools.length, disabledStaleTools: existing.filter((row) => !seen.has(row.name)).length });
  return tools;
}

export function registerConfiguredProviders(): McpProvider[] {
  const providers: McpProvider[] = [];
  const kali = process.env.ALPHAX_KALI_MCP_URL || process.env.KALI_MCP_ENDPOINT || 'http://127.0.0.1:9999';
  const hex = process.env.ALPHAX_HEXSTRIKE_MCP_URL;
  if (kali) providers.push({ id: 'kali', name: 'Kali MCP', kind: 'kali', endpoint: kali, enabled: true });
  if (hex) providers.push({ id: 'hexstrike', name: 'HexStrike AI MCP', kind: 'hexstrike', endpoint: hex, enabled: true });
  const db = getDb();
  const ts = nowIso();
  for (const p of providers) db.prepare(`INSERT INTO mcp_servers(id,name,endpoint,kind,enabled,created_at,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,endpoint=excluded.endpoint,kind=excluded.kind,enabled=1,updated_at=excluded.updated_at`).run(p.id, p.name, p.endpoint, p.kind, ts, ts);
  return providers;
}
