import { getDb, nowIso } from './db';
import { audit, type SecurityContext } from './security';
import { GovernedMcpAdapter, type McpProvider } from './mcp-adapters';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'disabled';

export interface ProviderHealth {
  providerId: string;
  status: ProviderHealthStatus;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  toolCount: number;
  error: string | null;
}

export function initMcpHealthSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS mcp_provider_health (
      provider_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_checked_at TEXT,
      latency_ms INTEGER,
      tool_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
  `);
}

export function listProviderHealth(): ProviderHealth[] {
  return getDb().prepare(`SELECT provider_id as providerId,status,last_checked_at as lastCheckedAt,latency_ms as latencyMs,tool_count as toolCount,error FROM mcp_provider_health ORDER BY provider_id`).all() as ProviderHealth[];
}

export async function checkProviderHealth(ctx: SecurityContext, provider: McpProvider, adapter = new GovernedMcpAdapter()): Promise<ProviderHealth> {
  const started = Date.now();
  if (!provider.enabled) {
    const health: ProviderHealth = { providerId: provider.id, status: 'disabled', lastCheckedAt: nowIso(), latencyMs: 0, toolCount: 0, error: null };
    saveHealth(health);
    return health;
  }
  try {
    const tools = await adapter.discover(ctx, provider);
    const latencyMs = Date.now() - started;
    const health: ProviderHealth = {
      providerId: provider.id,
      status: latencyMs > 5000 ? 'degraded' : 'healthy',
      lastCheckedAt: nowIso(),
      latencyMs,
      toolCount: tools.length,
      error: null,
    };
    saveHealth(health);
    audit(ctx.actor, 'mcp.provider.health', provider.id, 'allow', health);
    return health;
  } catch (e) {
    const error = String((e as Error).message);
    const health: ProviderHealth = { providerId: provider.id, status: 'unreachable', lastCheckedAt: nowIso(), latencyMs: Date.now() - started, toolCount: 0, error };
    saveHealth(health);
    audit(ctx.actor, 'mcp.provider.health', provider.id, 'deny', { error });
    return health;
  }
}

function saveHealth(health: ProviderHealth): void {
  getDb().prepare(`INSERT INTO mcp_provider_health(provider_id,status,last_checked_at,latency_ms,tool_count,error) VALUES(?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET status=excluded.status,last_checked_at=excluded.last_checked_at,latency_ms=excluded.latency_ms,tool_count=excluded.tool_count,error=excluded.error`).run(health.providerId, health.status, health.lastCheckedAt, health.latencyMs, health.toolCount, health.error);
}
