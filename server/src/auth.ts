import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { getSetting, setSetting, addActivity } from './db';
import {
  createPersistentSession,
  destroyPersistentSession,
  getPersistentSession,
  purgeExpiredSessions,
  revokeUserSessions,
  type SessionPrincipal,
  type SessionRole,
} from './auth-session';
import {
  authenticateUser,
  ensureBootstrapAdmin,
  getUserById,
  type AuthUser,
} from './auth-users';

export type { SessionRole } from './auth-session';
export type { AuthUser } from './auth-users';

export function tokenConfigured(): boolean { return Boolean(getSetting('auth.token_hash')); }

export function generateToken(): string {
  const raw = 'ax-' + randomBytes(24).toString('hex');
  const salt = randomBytes(16).toString('hex');
  setSetting('auth.salt', salt);
  setSetting('auth.token_hash', scryptSync(raw, salt, 64).toString('hex'));
  addActivity('auth', 'Dashboard access token rotated');
  return raw;
}

export function verifyToken(raw: string): boolean {
  const salt = getSetting('auth.salt');
  const stored = getSetting('auth.token_hash');
  if (!salt || !stored) return false;
  const derived = scryptSync(raw, salt, 64);
  const expected = Buffer.from(stored, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function createUserSession(user: AuthUser): string {
  purgeExpiredSessions();
  return createPersistentSession(user.id, user.role);
}

export function authenticatePassword(username: string, password: string): AuthUser | null {
  return authenticateUser(username, password);
}

export function bootstrapTokenUser(): AuthUser {
  return ensureBootstrapAdmin();
}

export function getUser(id: string): AuthUser | null {
  return getUserById(id);
}

export function getSessionPrincipal(id: string): SessionPrincipal | null {
  return getPersistentSession(id);
}

export function validSession(id: string): boolean {
  return getPersistentSession(id) !== null;
}

export function destroySession(id: string): void {
  destroyPersistentSession(id);
}

export function revokeSessionsForUser(id: string): void {
  revokeUserSessions(id);
}

export function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1) {
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  }
  return out;
}
