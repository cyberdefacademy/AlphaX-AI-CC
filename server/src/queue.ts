import { hub } from './ws';
import { getSetting, setSetting } from './db';

interface Item {
  taskId: string;
  agentId: string;
  run: () => Promise<void>;
  started: boolean;
  onStart?: () => void;
}

const queue: Item[] = [];
let active = 0;

function concurrency(): number {
  const raw = getSetting('queue.concurrency') || process.env.TASK_CONCURRENCY || '3';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.floor(n), 1), 12) : 3;
}

export function setConcurrency(n: number): void {
  setSetting('queue.concurrency', String(Math.max(1, Math.floor(n))));
  pump();
}

function positionOf(taskId: string): number {
  const seen = queue.findIndex((i) => i.taskId === taskId);
  if (seen === -1) return 0;
  return queue.slice(0, seen).filter((i) => !i.started).length + 1;
}

function broadcast(): void {
  const runningNow = queue.filter((i) => i.started);
  const queued = queue.filter((i) => !i.started);
  const positions: Record<string, number> = {};
  for (const i of queued) positions[i.taskId] = positionOf(i.taskId);
  hub.broadcast('queue:changed', { running: runningNow.length, queued: queued.length, positions });
}

function pump(): void {
  while (active < concurrency()) {
    const next = queue.find((i) => !i.started);
    if (!next) break;
    next.started = true;
    active += 1;
    broadcast();
    next.onStart?.();
    Promise.resolve()
      .then(next.run)
      .catch(() => {
        /* errors are captured inside run() */
      })
      .finally(() => {
        const idx = queue.indexOf(next);
        if (idx !== -1) queue.splice(idx, 1);
        active -= 1;
        broadcast();
        pump();
      });
  }
}

export function enqueue(item: Omit<Item, 'started'>): number {
  const full: Item = { ...item, started: false };
  queue.push(full);
  broadcast();
  pump();
  return positionOf(item.taskId);
}

export function queueState(): { running: number; queued: number; positions: Record<string, number> } {
  const queued = queue.filter((i) => !i.started);
  const positions: Record<string, number> = {};
  for (const i of queued) positions[i.taskId] = positionOf(i.taskId);
  return { running: active, queued: queued.length, positions };
}