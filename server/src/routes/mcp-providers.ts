import { Router, Request } from 'express';
import { getSessionPrincipal, parseCookies } from '../auth';
import { type SecurityContext } from '../security';
import { getDb } from '../db';
import { syncMcpProvider } from '../mcp-sync';
import { listProviderHealth } from '../mcp-health';

export const router = Router();

function ctx(req: Request): SecurityContext {
  const cookies = parseCookies(req.headers.cookie || '');
  const principal = cookies.session ? getSessionPrincipal(cookies.session) : null;
  if (!principal) throw new Error('authenticated session required');
  return { actor: principal.actor, role: principal.role, projectId: req.body?.projectId, target: req.body?.target, risk: req.body?.risk ?? 'low' };
}

function provider(id: string): any {
  return getDb().prepare('SELECT id,name,endpoint,kind,enabled FROM mcp_servers WHERE id=?').get(id);
}

router.get('/', (_req, res) => {
  const rows = getDb().prepare(`SELECT s.id,s.name,s.endpoint,s.kind,s.enabled,s.updated_at as updatedAt,h.status as healthStatus,h.last_checked_at as lastCheckedAt,h.latency_ms as latencyMs,h.tool_count as toolCount,h.error FROM mcp_servers s LEFT JOIN mcp_provider_health h ON h.provider_id=s.id ORDER BY s.name`).all();
  res.json({ providers: rows, health: listProviderHealth() });
});

router.post('/:id/sync', async (req, res) => {
  try {
    const c = ctx(req); const row = provider(req.params.id);
    if (!row) return res.status(404).json({ error: 'MCP provider not found' });
    const tools = await syncMcpProvider(c, { id: row.id, name: row.name, endpoint: row.endpoint, kind: row.kind === 'kali' ? 'kali' : row.kind === 'hexstrike' ? 'hexstrike' : 'generic', enabled: Boolean(row.enabled) });
    res.json({ providerId: row.id, toolsDiscovered: tools.length, tools: tools.map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk, readOnly: tool.readOnly })) });
  } catch (e) {
    const message = String((e as Error).message);
    res.status(message.includes('authenticated session') ? 401 : message.includes('permission denied') ? 403 : 502).json({ error: message });
  }
});
