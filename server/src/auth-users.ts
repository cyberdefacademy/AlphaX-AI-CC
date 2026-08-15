import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb, nowIso, randomId } from './db';
import type { SessionRole } from './auth-session';
import { protectTotpSecret } from './totp';

export interface AuthUser {
  id: string;
  username: string;
  role: SessionRole;
  enabled: boolean;
  totpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

const ROLES: SessionRole[] = ['admin', 'security-analyst', 'pentester', 'auditor', 'viewer'];

export function isSessionRole(value: string): value is SessionRole {
  return ROLES.includes(value as SessionRole);
}

export function initUserSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      totp_secret_enc TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_users_enabled ON auth_users(enabled);
  `);
  const columns = db.prepare('PRAGMA table_info(auth_users)').all() as unknown as { name: string }[];
  if (!columns.some((column) => column.name === 'totp_secret_enc')) db.exec('ALTER TABLE auth_users ADD COLUMN totp_secret_enc TEXT');
  if (!columns.some((column) => column.name === 'totp_enabled')) db.exec('ALTER TABLE auth_users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
}

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64);
}

function passwordRecord(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16);
  return { salt: salt.toString('hex'), hash: hashPassword(password, salt).toString('hex') };
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validatePassword(password: string): void {
  if (typeof password !== 'string' || password.length < 12) throw new Error('password must be at least 12 characters');
  if (password.length > 256) throw new Error('password is too long');
}

export function validateUsername(username: string): string {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) throw new Error('username must be 3-64 characters using letters, numbers, dot, underscore or hyphen');
  return normalized;
}

export function ensureBootstrapAdmin(): AuthUser {
  initUserSchema();
  const existing = getDb().prepare('SELECT * FROM auth_users WHERE username=?').get('admin') as Record<string, unknown> | undefined;
  if (existing) return mapUser(existing);
  const now = nowIso();
  const record = passwordRecord(randomBytes(48).toString('base64url'));
  getDb().prepare(`INSERT INTO auth_users(id,username,password_salt,password_hash,role,enabled,totp_enabled,created_at,updated_at) VALUES(?,?,?,?,?,1,0,?,?)`).run(randomId(), 'admin', record.salt, record.hash, 'admin', now, now);
  return getUserByUsername('admin')!;
}

function mapUser(row: Record<string, unknown>): AuthUser {
  if (!isSessionRole(String(row.role))) throw new Error('stored user has invalid role');
  return {
    id: String(row.id),
    username: String(row.username),
    role: row.role as SessionRole,
    enabled: Number(row.enabled) === 1,
    totpEnabled: Number(row.totp_enabled) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

export function getUserById(id: string): AuthUser | null {
  initUserSchema();
  const row = getDb().prepare('SELECT * FROM auth_users WHERE id=?').get(id) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function getUserByUsername(username: string): AuthUser | null {
  initUserSchema();
  const normalized = normalizeUsername(username);
  const row = getDb().prepare('SELECT * FROM auth_users WHERE username=?').get(normalized) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function authenticateUser(username: string, password: string): AuthUser | null {
  initUserSchema();
  const normalized = normalizeUsername(username);
  const row = getDb().prepare('SELECT * FROM auth_users WHERE username=?').get(normalized) as Record<string, unknown> | undefined;
  if (!row || Number(row.enabled) !== 1) return null;
  const salt = Buffer.from(String(row.password_salt), 'hex');
  const expected = Buffer.from(String(row.password_hash), 'hex');
  const supplied = hashPassword(password, salt);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  const now = nowIso();
  getDb().prepare('UPDATE auth_users SET last_login_at=?,updated_at=? WHERE id=?').run(now, now, String(row.id));
  return getUserById(String(row.id));
}

export function createUser(username: string, password: string, role: SessionRole): { user: AuthUser } {
  const normalized = validateUsername(username);
  if (!isSessionRole(role)) throw new Error('invalid role');
  validatePassword(password);
  initUserSchema();
  if (getUserByUsername(normalized)) throw new Error('username already exists');
  const now = nowIso();
  const record = passwordRecord(password);
  const id = randomId();
  getDb().prepare(`INSERT INTO auth_users(id,username,password_salt,password_hash,role,enabled,totp_enabled,created_at,updated_at) VALUES(?,?,?,?,?,1,0,?,?)`).run(id, normalized, record.salt, record.hash, role, now, now);
  return { user: getUserById(id)! };
}

export function listUsers(): AuthUser[] {
  initUserSchema();
  return (getDb().prepare('SELECT * FROM auth_users ORDER BY username').all() as Record<string, unknown>[]).map(mapUser);
}

export function setUserEnabled(id: string, enabled: boolean): AuthUser {
  const user = getUserById(id);
  if (!user) throw new Error('user not found');
  if (user.role === 'admin' && !enabled) {
    const admins = listUsers().filter((candidate) => candidate.role === 'admin' && candidate.enabled);
    if (admins.length <= 1) throw new Error('cannot disable the last enabled admin');
  }
  const now = nowIso();
  getDb().prepare('UPDATE auth_users SET enabled=?,updated_at=? WHERE id=?').run(enabled ? 1 : 0, now, id);
  return getUserById(id)!;
}

export function setUserRole(id: string, role: SessionRole): AuthUser {
  if (!isSessionRole(role)) throw new Error('invalid role');
  const user = getUserById(id);
  if (!user) throw new Error('user not found');
  if (user.role === 'admin' && role !== 'admin' && user.enabled) {
    const admins = listUsers().filter((candidate) => candidate.role === 'admin' && candidate.enabled);
    if (admins.length <= 1) throw new Error('cannot demote the last enabled admin');
  }
  const now = nowIso();
  getDb().prepare('UPDATE auth_users SET role=?,updated_at=? WHERE id=?').run(role, now, id);
  return getUserById(id)!;
}

export function setUserPassword(id: string, password: string): AuthUser {
  validatePassword(password);
  const user = getUserById(id);
  if (!user) throw new Error('user not found');
  const record = passwordRecord(password);
  const now = nowIso();
  getDb().prepare('UPDATE auth_users SET password_salt=?,password_hash=?,updated_at=? WHERE id=?').run(record.salt, record.hash, now, id);
  return getUserById(id)!;
}

export function stageTotpSecret(id: string, secret: string): AuthUser {
  const user = getUserById(id);
  if (!user) throw new Error('user not found');
  const now = nowIso();
  getDb().prepare('UPDATE auth_users SET totp_secret_enc=?,totp_enabled=0,updated_at=? WHERE id=?').run(protectTotpSecret(secret), now, id);
  return getUserById(id)!;
}

export function getStoredTotpSecret(id: string): string | null {
  initUserSchema();
  const row = getDb().prepare('SELECT totp_secret_enc FROM auth_users WHERE id=?').get(id) as { totp_secret_enc:string|null } | undefined;
  if (!row?.totp_secret_enc) return null;
  return row.totp_secret_enc;
}

export function setTotpEnabled(id: string, enabled: boolean): AuthUser {
  const user = getUserById(id);
  if (!user) throw new Error('user not found');
  if (enabled && !getStoredTotpSecret(id)) throw new Error('TOTP enrollment is not staged');
  const now = nowIso();
  getDb().prepare('UPDATE auth_users SET totp_enabled=?,updated_at=? WHERE id=?').run(enabled ? 1 : 0, now, id);
  return getUserById(id)!;
}
