import fs from 'fs';
import path from 'path';
import { run } from '../runner';
import type { ProcessInfo } from './types';

export function tailFile(file: string, n = 300): string[] {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n').filter((l) => l.length > 0);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

export function filesMatching(dir: string, pattern: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.includes(pattern))
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

export function fileNames(dir: string, ext: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(ext))
      .map((n) => n.slice(0, -ext.length));
  } catch {
    return [];
  }
}

export async function isServiceActive(unit: string): Promise<boolean> {
  try {
    const r = await run('systemctl', ['--user', 'is-active', unit], { timeout: 5000 });
    return r.stdout.trim().toLowerCase() === 'active';
  } catch {
    return false;
  }
}

export async function pgrep(name: string): Promise<number[]> {
  try {
    const r = await run('pgrep', ['-f', name], { timeout: 5000 });
    return (r.stdout.match(/\d+/g) || []).map(Number).filter((p) => p > 1);
  } catch {
    return [];
  }
}

const PAGE_KB = 4;

function readStat(pid: number): { comm: string; utime: number; stime: number; rssKB: number } | null {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const open = raw.indexOf('(');
    const close = raw.lastIndexOf(')');
    const comm = raw.slice(open + 1, close);
    const fields = raw.slice(close + 2).split(' ').filter(Boolean);
    return {
      comm,
      utime: Number(fields[11]) || 0,
      stime: Number(fields[12]) || 0,
      rssKB: (Number(fields[21]) || 0) * PAGE_KB,
    };
  } catch {
    return null;
  }
}

function readTotalTicks(): number {
  try {
    const raw = fs.readFileSync('/proc/stat', 'utf8');
    const line = raw.split('\n').find((l) => l.startsWith('cpu '));
    if (!line) return 0;
    const parts = line.split(/\s+/).slice(1).map(Number);
    return parts.reduce((a, b) => a + (b || 0), 0);
  } catch {
    return 0;
  }
}

export async function procsFor(name: string): Promise<ProcessInfo[]> {
  const pids = await pgrep(name);
  const cpuCount = require('os').cpus().length as number;
  const out: ProcessInfo[] = [];
  for (const pid of pids.slice(0, 24)) {
    const a = readStat(pid);
    if (!a) continue;
    const t1 = readTotalTicks();
    await new Promise((r) => setTimeout(r, 200));
    const b = readStat(pid);
    const t2 = readTotalTicks();
    if (!b) continue;
    const dProc = b.utime - a.utime + (b.stime - a.stime);
    const dTotal = t2 - t1;
    const cpuPct = dTotal > 0 ? Math.min(1000, (dProc / dTotal) * cpuCount * 100) : 0;
    out.push({
      pid,
      name: b.comm,
      cpuPct: Number(cpuPct.toFixed(1)),
      memMB: Number((b.rssKB / 1024).toFixed(1)),
    });
  }
  return out;
}