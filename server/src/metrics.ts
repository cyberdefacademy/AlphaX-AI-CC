import os from 'os';
import fs from 'fs';
import { procsFor } from './adapters/parse';
import { getDb } from './db';

export interface SystemMetrics {
  load: number[];
  cpuCount: number;
  memTotalMB: number;
  memUsedMB: number;
  memUsedPct: number;
  uptimeSec: number;
  bootTime: number;
  agentProcesses: number;
}

let lastCpuStat: { busy: number; total: number; ts: number } | null = null;

function readCpuStat(): { busy: number; total: number } | null {
  try {
    const raw = fs.readFileSync('/proc/stat', 'utf8');
    const line = raw.split('\n').find((l) => l.startsWith('cpu '));
    if (!line) return null;
    const parts = line.split(/\s+/).slice(1).map(Number);
    const total = parts.reduce((a, b) => a + (b || 0), 0);
    const idle = (parts[3] || 0) + (parts[4] || 0);
    return { busy: total - idle, total };
  } catch {
    return null;
  }
}

function cpuUsagePct(): number | null {
  const cur = readCpuStat();
  if (!cur) return null;
  if (lastCpuStat) {
    const dTotal = cur.total - lastCpuStat.total;
    const dBusy = cur.busy - lastCpuStat.busy;
    lastCpuStat = { ...cur, ts: Date.now() };
    if (dTotal > 0) return Math.round((dBusy / dTotal) * 1000) / 10;
    return null;
  }
  lastCpuStat = { ...cur, ts: Date.now() };
  return null;
}

export function systemMetrics(): SystemMetrics {
  const total = os.totalmem();
  const free = os.freemem();
  const memTotalMB = Math.round(total / 1024 / 1024);
  const memUsedMB = Math.round((total - free) / 1024 / 1024);
  let bootTime = 0;
  try {
    const raw = fs.readFileSync('/proc/stat', 'utf8');
    const m = raw.split('\n').find((l) => l.startsWith('btime'));
    if (m) bootTime = Number(m.split(/\s+/)[1] || 0);
  } catch {
    /* ignore */
  }
  return {
    load: os.loadavg(),
    cpuCount: os.cpus().length,
    memTotalMB,
    memUsedMB,
    memUsedPct: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0,
    uptimeSec: os.uptime(),
    bootTime,
    agentProcesses: 0,
  };
}

export function uptimeHuman(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export { procsFor };

export interface MetricPoint {
  ts: number;
  load1: number;
  memPct: number;
  cpuPct: number | null;
  cpuCount: number;
  tasksRunning: number;
}

export function sampleAndRecord(): MetricPoint {
  const m = systemMetrics();
  const cpuPct = cpuUsagePct();
  const running = getDb()
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('running','queued')")
    .get() as unknown as { n: number };
  const point: MetricPoint = {
    ts: Date.now(),
    load1: m.load[0] || 0,
    memPct: m.memUsedPct,
    cpuPct,
    cpuCount: m.cpuCount,
    tasksRunning: running.n,
  };
  getDb()
    .prepare('INSERT INTO metrics (ts, load1, mem_pct, cpu_pct, tasks_running) VALUES (?, ?, ?, ?, ?)')
    .run(point.ts, point.load1, point.memPct, point.cpuPct, point.tasksRunning);
  getDb()
    .prepare('DELETE FROM metrics WHERE ts < ?')
    .run(Date.now() - 6 * 3600 * 1000);
  return point;
}

export function metricSeries(minutes = 60): MetricPoint[] {
  const from = Date.now() - Math.min(minutes, 360) * 60 * 1000;
  const rows = getDb()
    .prepare('SELECT ts, load1, mem_pct, cpu_pct, tasks_running FROM metrics WHERE ts >= ? ORDER BY ts ASC')
    .all(from) as unknown as {
    ts: number;
    load1: number;
    mem_pct: number;
    cpu_pct: number | null;
    tasks_running: number;
  }[];
  const bucketMs = 60000;
  const buckets = new Map<number, { ts: number; load1: number[]; mem: number[]; cpu: number[]; tasks: number[] }>();
  for (const r of rows) {
    const b = Math.floor(r.ts / bucketMs) * bucketMs;
    let cur = buckets.get(b);
    if (!cur) {
      cur = { ts: b, load1: [], mem: [], cpu: [], tasks: [] };
      buckets.set(b, cur);
    }
    cur.load1.push(r.load1);
    cur.mem.push(r.mem_pct);
    if (r.cpu_pct !== null && Number.isFinite(r.cpu_pct)) cur.cpu.push(r.cpu_pct);
    cur.tasks.push(r.tasks_running);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return Array.from(buckets.values()).map((b) => ({
    ts: b.ts,
    load1: Math.round(avg(b.load1) * 100) / 100,
    memPct: Math.round(avg(b.mem) * 10) / 10,
    cpuPct: b.cpu.length ? Math.round(avg(b.cpu) * 10) / 10 : null,
    cpuCount: os.cpus().length,
    tasksRunning: Math.round(avg(b.tasks)),
  }));
}