import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { getSetting, setSetting, addActivity } from './db';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const sessions = new Map<string, { expiresAt:number; role:string }>();

function hashToken(raw: string): string {
  const salt = getSetting('auth.salt');
  return scryptSync(raw, salt, 64).toString('hex');
}

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

export function createSession(role='admin'): string {
  const id = randomBytes(24).toString('hex');
  sessions.set(id, { expiresAt:Date.now() + SESSION_TTL_MS, role });
  return id;
}

export function validSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  if (session.expiresAt < Date.now()) { sessions.delete(id); return false; }
  return true;
}

export function getSessionPrincipal(id: string): { actor:string; role:string } | null {
  if (!validSession(id)) return null;
  const session = sessions.get(id);
  if (!session) return null;
  const actor = `session:${createHash('sha256').update(id).digest('hex').slice(0,16)}`;
  return { actor, role:session.role };
}

export function destroySession(id: string): void { sessions.delete(id); }

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