import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getDb, nowIso, randomId } from './db';

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// Keep session roles aligned with the control-plane RBAC roles in security.ts.
export type SessionRole = 'admin' | 'security-analyst' | 'pentester' | 'auditor' | 'viewer';

export interface SessionPrincipal {
  actor: string;
  role: SessionRole;
}

function hashSessionToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function actorForSession(id: string): string {
  return `session:${id.slice(0, 16)}`;
}

function isSessionRole(role: string): role is SessionRole {
  return ['admin', 'security-analyst', 'pentester', 'auditor', 'viewer'].includes(role);
}

export function initSessionSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(revoked_at, expires_at);
  `);
}

export function createPersistentSession(role: SessionRole = 'admin'): string {
  initSessionSchema();
  const raw = randomBytes(32).toString('base64url');
  const id = randomId();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  getDb().prepare(`
    INSERT INTO auth_sessions(id,token_hash,role,created_at,expires_at,last_seen_at)
    VALUES(?,?,?,?,?,?)
  `).run(id, hashSessionToken(raw), role, now, expiresAt, now);
  return raw;
}

export function getPersistentSession(raw: string): SessionPrincipal | null {
  if (!raw || raw.length < 32) return null;
  initSessionSchema();
  const hash = hashSessionToken(raw);
  const row = getDb().prepare(`
    SELECT id,token_hash,role,expires_at,revoked_at
    FROM auth_sessions WHERE token_hash=?
  `).get(hash) as { id:string; token_hash:string; role:string; expires_at:string; revoked_at:string|null } | undefined;
  if (!row) return null;
  const supplied = Buffer.from(hash, 'utf8');
  const stored = Buffer.from(row.token_hash, 'utf8');
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) return null;
  if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
    getDb().prepare('DELETE FROM auth_sessions WHERE id=?').run(row.id);
    return null;
  }
  if (!isSessionRole(row.role)) return null;
  getDb().prepare('UPDATE auth_sessions SET last_seen_at=? WHERE id=?').run(nowIso(), row.id);
  return { actor: actorForSession(row.id), role: row.role };
}

export function destroyPersistentSession(raw: string): void {
  if (!raw) return;
  initSessionSchema();
  getDb().prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?').run(nowIso(), hashSessionToken(raw));
}

export function purgeExpiredSessions(): void {
  initSessionSchema();
  getDb().prepare("DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL OR expires_at <= ?").run(nowIso());
}
