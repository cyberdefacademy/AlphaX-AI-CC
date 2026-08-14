import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { dataDir } from './config';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(dataDir(), { recursive: true });
  db = new DatabaseSync(path.join(dataDir(), 'data.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      detected INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      agent_id TEXT,
      message TEXT NOT NULL,
      detail TEXT
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      agent_id TEXT,
      instance TEXT,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      class TEXT,
      result TEXT,
      duration_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS metrics (
      ts INTEGER NOT NULL,
      load1 REAL,
      mem_pct REAL,
      cpu_pct REAL,
      tasks_running INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_ts ON tasks(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(ts);
  `);
  ensureColumn('tasks', 'class', 'TEXT');
  return db;
}

function ensureColumn(table: string, col: string, decl: string): void {
  const cols = db!.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (!cols.some((c) => c.name === col)) {
    db!.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  }
}

export function randomId(): string {
  return randomBytes(12).toString('hex');
}

export function getSetting(key: string, def = ''): string {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? row.value : def;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value);
}

export function addActivity(kind: string, message: string, agentId?: string, detail?: unknown): void {
  getDb()
    .prepare(
      'INSERT INTO activity (id, ts, kind, agent_id, message, detail) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      randomId(),
      new Date().toISOString(),
      kind,
      agentId ?? null,
      message,
      detail ? JSON.stringify(detail) : null
    );
}

export function nowIso(): string {
  return new Date().toISOString();
}