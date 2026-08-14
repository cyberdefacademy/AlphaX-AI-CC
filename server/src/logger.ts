import fs from 'fs';
import path from 'path';
import { dataDir } from './config';

type Level = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  ts: string;
  level: Level;
  msg: string;
  agentId?: string;
  taskId?: string;
  [k: string]: unknown;
}

let stream: fs.WriteStream | null = null;
let logPath = '';
let toConsole = true;

function ensureStream(): void {
  if (stream) return;
  try {
    const dir = path.join(dataDir(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, 'server.log');
    stream = fs.createWriteStream(logPath, { flags: 'a' });
  } catch {
    /* logging must never crash the server */
  }
}

export function enableFileLogging(consoleToo = true): void {
  toConsole = consoleToo;
  ensureStream();
  info('structured file logging enabled', { path: logPath });
}

function write(entry: LogEntry): void {
  const line = `${entry.ts} ${entry.level.toUpperCase()} ${entry.msg}`;
  if (toConsole) {
    if (entry.level === 'error') console.error(line, entry);
    else if (entry.level === 'warn') console.warn(line, entry);
    else console.log(line, entry);
  }
  ensureStream();
  if (stream) {
    try {
      const json = JSON.stringify(entry);
      stream.write(json + '\n');
    } catch {
      /* ignore */
    }
  }
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  write({ ts: new Date().toISOString(), level, msg, ...fields });
}

export const info = (msg: string, fields: Record<string, unknown> = {}) => log('info', msg, fields);
export const warn = (msg: string, fields: Record<string, unknown> = {}) => log('warn', msg, fields);
export const error = (msg: string, fields: Record<string, unknown> = {}) => log('error', msg, fields);
export const debug = (msg: string, fields: Record<string, unknown> = {}) => log('debug', msg, fields);

export function close(): void {
  try {
    stream?.end();
  } catch {
    /* ignore */
  }
}