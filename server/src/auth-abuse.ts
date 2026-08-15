import { createHash } from 'node:crypto';
import { getDb, nowIso } from './db';

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function keyHash(key: string): string { return createHash('sha256').update(key).digest('hex'); }

export function initAuthAbuseSchema(): void {
  getDb().exec(`CREATE TABLE IF NOT EXISTS auth_login_abuse (
    key_hash TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    locked_until TEXT
  );`);
}

export function loginKey(usernameOrToken: string, clientIp: string): string {
  return `${usernameOrToken.trim().toLowerCase()}|${clientIp}`;
}

export function loginBlocked(key: string): number {
  initAuthAbuseSchema();
  const hash = keyHash(key);
  const row = getDb().prepare('SELECT failures,window_started_at,locked_until FROM auth_login_abuse WHERE key_hash=?').get(hash) as { failures:number; window_started_at:string; locked_until:string|null }|undefined;
  if (!row) return 0;
  const now = Date.now();
  if (row.locked_until && new Date(row.locked_until).getTime() > now) return Math.ceil((new Date(row.locked_until).getTime() - now) / 1000);
  if (now - new Date(row.window_started_at).getTime() > WINDOW_MS) {
    getDb().prepare('DELETE FROM auth_login_abuse WHERE key_hash=?').run(hash);
  }
  return 0;
}

export function recordLoginFailure(key: string): { locked:boolean; retryAfter:number; failures:number } {
  initAuthAbuseSchema();
  const db = getDb();
  const hash = keyHash(key);
  const now = Date.now();
  const nowText = nowIso();
  const row = db.prepare('SELECT failures,window_started_at FROM auth_login_abuse WHERE key_hash=?').get(hash) as { failures:number; window_started_at:string }|undefined;
  let failures = row && now - new Date(row.window_started_at).getTime() <= WINDOW_MS ? row.failures + 1 : 1;
  let locked = false;
  let retryAfter = 0;
  if (failures >= MAX_FAILURES) {
    locked = true;
    retryAfter = Math.ceil(LOCK_MS / 1000);
    const lockedUntil = new Date(now + LOCK_MS).toISOString();
    db.prepare(`INSERT INTO auth_login_abuse(key_hash,failures,window_started_at,locked_until) VALUES(?,?,?,?)
      ON CONFLICT(key_hash) DO UPDATE SET failures=excluded.failures,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until`).run(hash, failures, nowText, lockedUntil);
  } else {
    db.prepare(`INSERT INTO auth_login_abuse(key_hash,failures,window_started_at,locked_until) VALUES(?,?,?,NULL)
      ON CONFLICT(key_hash) DO UPDATE SET failures=excluded.failures,window_started_at=excluded.window_started_at,locked_until=NULL`).run(hash, failures, row?.window_started_at || nowText);
  }
  return { locked, retryAfter, failures };
}

export function clearLoginFailures(key: string): void {
  initAuthAbuseSchema();
  getDb().prepare('DELETE FROM auth_login_abuse WHERE key_hash=?').run(keyHash(key));
}
