import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getDb, nowIso, randomId } from './db';
import { getUserById, isSessionRole } from './auth-users';

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type SessionRole = 'admin' | 'security-analyst' | 'pentester' | 'auditor' | 'viewer';

export interface SessionPrincipal {
  actor: string;
  role: SessionRole;
  userId?: string;
  username?: string;
}

function hashSessionToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function actorForLegacySession(id: string): string {
  return `session:${id.slice(0, 16)}`;
}

export function initSessionSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  `);
  const columns = db.prepare('PRAGMA table_info(auth_sessions)').all() as unknown as { name: string }[];
  if (!columns.some((column) => column.name === 'user_id')) {
    db.exec('ALTER TABLE auth_sessions ADD COLUMN user_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)');
  }
}

export function createPersistentSession(userId: string, role: SessionRole): string {
  initSessionSchema();
  if (!isSessionRole(role)) throw new Error('invalid session role');
  const raw = randomBytes(32).toString('base64url');
  const id = randomId();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  getDb().prepare(`
    INSERT INTO auth_sessions(id,token_hash,user_id,role,created_at,expires_at,last_seen_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(id, hashSessionToken(raw), userId, role, now, expiresAt, now);
  return raw;
}

export function getPersistentSession(raw: string): SessionPrincipal | null {
  if (!raw || raw.length < 32) return null;
  initSessionSchema();
  const hash = hashSessionToken(raw);
  const row = getDb().prepare(`
    SELECT id,token_hash,user_id,role,expires_at,revoked_at
    FROM auth_sessions WHERE token_hash=?
  `).get(hash) as { id:string; token_hash:string; user_id:string|null; role:string; expires_at:string; revoked_at:string|null } | undefined;
  if (!row) return null;
  const supplied = Buffer.from(hash, 'utf8');
  const stored = Buffer.from(row.token_hash, 'utf8');
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) return null;
  if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
    getDb().prepare('DELETE FROM auth_sessions WHERE id=?').run(row.id);
    return null;
  }

  if (row.user_id) {
    const user = getUserById(row.user_id);
    if (!user || !user.enabled) {
      getDb().prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?').run(nowIso(), row.id);
      return null;
    }
    getDb().prepare('UPDATE auth_sessions SET role=?,last_seen_at=? WHERE id=?').run(user.role, nowIso(), row.id);
    return { actor: `user:${user.id}`, role: user.role, userId: user.id, username: user.username };
  }

  // Compatibility path for sessions created before persistent user identities existed.
  if (!isSessionRole(row.role)) return null;
  getDb().prepare('UPDATE auth_sessions SET last_seen_at=? WHERE id=?').run(nowIso(), row.id);
  return { actor: actorForLegacySession(row.id), role: row.role };
}

export function destroyPersistentSession(raw: string): void {
  if (!raw) return;
  initSessionSchema();
  getDb().prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?').run(nowIso(), hashSessionToken(raw));
}

export function revokeUserSessions(userId: string): void {
  initSessionSchema();
  getDb().prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(nowIso(), userId);
}

export function purgeExpiredSessions(): void {
  initSessionSchema();
  getDb().prepare("DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL OR expires_at <= ?").run(nowIso());
}
