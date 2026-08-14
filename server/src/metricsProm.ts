import client from 'prom-client';
import { Request, Response } from 'express';
import { getDb } from './db';
import { queueState } from './queue';
import { systemMetrics } from './metrics';

client.collectDefaultMetrics({ prefix: 'alphax_' });

const tasksTotal = new client.Counter({
  name: 'alphax_tasks_total',
  help: 'Total tasks enqueued since server start (categorized).',
  labelNames: ['status'] as const,
});

const tasksActive = new client.Gauge({
  name: 'alphax_tasks_active',
  help: 'Number of tasks currently running or queued.',
  labelNames: ['state'] as const,
});

const taskDuration = new client.Histogram({
  name: 'alphax_task_duration_seconds',
  help: 'Task wall-clock duration in seconds.',
  buckets: [1, 3, 5, 10, 30, 60, 120, 300, 600],
});

const agentsUp = new client.Gauge({
  name: 'alphax_agents_up',
  help: 'Number of agents running (1) vs down (0) per gateway status.',
  labelNames: ['type'] as const,
});

const queueDepth = new client.Gauge({
  name: 'alphax_queue_depth',
  help: 'Task queue depth by state.',
  labelNames: ['state'] as const,
});

const agentProcessCount = new client.Gauge({
  name: 'alphax_agent_processes',
  help: 'Number of discovered agent processes on the host.',
});

const httpRequests = new client.Counter({
  name: 'alphax_http_requests_total',
  help: 'HTTP requests served, by route and status.',
  labelNames: ['route', 'status'] as const,
});

const gatewayCalls = new client.Histogram({
  name: 'alphax_gateway_call_seconds',
  help: 'Agent gateway call latency in seconds.',
  labelNames: ['agent'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

export function observeHttp(req: Request, res: Response): void {
  const status = String(res.statusCode);
  const route = req.route?.path || req.path;
  httpRequests.inc({ route, status });
}

export function observeTaskFinish(status: 'done' | 'error' | 'interrupted', durationSec: number): void {
  tasksTotal.inc({ status });
  taskDuration.observe(durationSec);
}

export function recordLiveMetrics(): void {
  const q = queueState();
  queueDepth.set({ state: 'running' }, q.running);
  queueDepth.set({ state: 'queued' }, q.queued);
  tasksActive.set({ state: 'running' }, q.running);
  tasksActive.set({ state: 'queued' }, q.queued);

  let up = 0;
  let down = 0;
  try {
    const rows = getDb()
      .prepare("SELECT type, enabled, running FROM agents")
      .all() as unknown as { type: string | null; enabled: number; running: number }[];
    agentsUp.reset();
    for (const r of rows) {
      const t = r.type || 'unknown';
      agentsUp.set({ type: t }, r.running ? 1 : 0);
      if (r.running) up++;
      else down++;
    }
  } catch {
    /* db not ready during early boot */
  }

  const sys = systemMetrics();
  agentProcessCount.set(sys.agentProcesses);
}

export function prometheusHandler(_req: Request, res: Response): void {
  recordLiveMetrics();
  res.setHeader('Content-Type', client.register.contentType);
  client.register
    .metrics()
    .then((body) => res.end(body))
    .catch((err) => res.status(500).end(String(err)));
}