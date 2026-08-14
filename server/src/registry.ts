import { getDb, nowIso, randomId } from './db';
import type { AgentRecord } from './adapters';
import { adapterFor } from './adapters';
import { hub } from './ws';
import { addActivity } from './db';

export interface AgentRow {
  id: string;
  type: string;
  name: string;
  detected: number;
  enabled: number;
  config: string;
  created_at: string;
  updated_at: string;
}

const statusCache = new Map<string, { ts: number; status: unknown }>();
const CACHE_TTL = 8000;

function rowToRecord(row: AgentRow): AgentRecord {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.config || '{}');
  } catch {
    config = {};
  }
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    detected: Boolean(row.detected),
    enabled: Boolean(row.enabled),
    config,
  };
}

export function listRegistered(): AgentRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM agents ORDER BY created_at ASC')
    .all() as unknown as AgentRow[];
  return rows.map(rowToRecord);
}

export function getRegistered(id: string): AgentRecord | null {
  const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as unknown as AgentRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function upsertByTypeName(
  type: string,
  name: string,
  fields: { detected: boolean; config?: Record<string, unknown> }
): AgentRecord {
  const existing = getDb()
    .prepare('SELECT * FROM agents WHERE type = ? AND name = ?')
    .get(type, name) as unknown as AgentRow | undefined;
  const is = nowIso();
  if (existing) {
    const config = fields.config
      ? JSON.stringify({ ...parse(existing.config), ...fields.config })
      : existing.config;
    getDb()
      .prepare(
        'UPDATE agents SET detected = ?, config = ?, updated_at = ? WHERE id = ?'
      )
      .run(fields.detected ? 1 : existing.detected, config, is, existing.id);
    return getRegistered(existing.id) as AgentRecord;
  }
  const id = randomId();
  getDb()
    .prepare(
      'INSERT INTO agents (id, type, name, detected, enabled, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, type, name, fields.detected ? 1 : 0, 1, JSON.stringify(fields.config || {}), is, is);
  return getRegistered(id) as AgentRecord;
}

export function registerManual(input: {
  type: string;
  name: string;
  config: Record<string, unknown>;
}): AgentRecord {
  return upsertByTypeName(input.type, input.name, { detected: false, config: input.config });
}

export function updateAgent(
  id: string,
  patch: { name?: string; enabled?: boolean; config?: Record<string, unknown> }
): AgentRecord | null {
  const existing = getRegistered(id);
  if (!existing) return null;
  const is = nowIso();
  const name = patch.name ?? existing.name;
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled ? 1 : 0;
  const config = patch.config ? JSON.stringify({ ...existing.config, ...patch.config }) : JSON.stringify(existing.config);
  getDb()
    .prepare('UPDATE agents SET name = ?, enabled = ?, config = ?, updated_at = ? WHERE id = ?')
    .run(name, enabled, config, is, id);
  statusCache.delete(id);
  return getRegistered(id);
}

export function removeAgent(id: string): boolean {
  const r = getDb().prepare('DELETE FROM agents WHERE id = ?').run(id);
  statusCache.delete(id);
  hub.broadcast('agents:changed', { id, removed: true });
  addActivity('remove', 'Removed agent registration', id);
  return Number((r as unknown as { changes: number }).changes) > 0;
}

export async function refreshStatus(agent: AgentRecord) {
  const a = adapterFor(agent.type);
  if (!a) return null;
  try {
    const status = await a.getStatus(agent);
    cacheStatus(agent.id, status);
    return status;
  } catch (e) {
    cacheStatus(agent.id, {
      installed: false,
      running: false,
      detail: { error: String((e as Error).message) },
    });
    return null;
  }
}

export async function getStatusFor(agent: AgentRecord, force = false) {
  const hit = statusCache.get(agent.id);
  if (!force && hit && Date.now() - hit.ts < CACHE_TTL) return hit.status;
  return refreshStatus(agent);
}

export function cacheStatus(id: string, status: unknown): void {
  statusCache.set(id, { ts: Date.now(), status });
}

export function invalidateCache(): void {
  statusCache.clear();
}

function parse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}