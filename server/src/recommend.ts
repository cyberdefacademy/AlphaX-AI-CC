import { getDb } from './db';
import { listRegistered, getStatusFor } from './registry';
import type { AgentRecord } from './adapters';
import type { AgentStatus } from './adapters';
import { adapterFor } from './adapters';

export interface Recommendation {
  id: string;
  agentId: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  action?: { kind: 'gateway' | 'ping' | 'settings'; value: string };
}

export interface MatrixRow {
  agentId: string;
  name: string;
  type: string;
  enabled: boolean;
  running: boolean;
  healthy: boolean | undefined;
  version?: string;
  model?: string;
  auth?: { loggedIn?: boolean };
  lastTask: { status: string; class: string; ts: string } | null;
  taskFailures24h: number;
  taskTotal24h: number;
  cronFailures: number;
  cronTotal: number;
}

export interface FleetHealth {
  matrix: MatrixRow[];
  recommendations: Recommendation[];
  byClass: Record<string, number>;
  failingTaskPct24h: number;
}

interface TaskLike {
  status: string;
  class: string | null;
  ts: string;
}

function recentTasks(agentId: string, limit = 8): TaskLike[] {
  return getDb()
    .prepare('SELECT status, class, ts FROM tasks WHERE agent_id = ? ORDER BY ts DESC LIMIT ?')
    .all(agentId, limit) as unknown as TaskLike[];
}

function recentTasks24h(agentId: string): TaskLike[] {
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  return getDb()
    .prepare('SELECT status, class, ts FROM tasks WHERE agent_id = ? AND ts > ?')
    .all(agentId, cutoff) as unknown as TaskLike[];
}

function recommendFor(agent: AgentRecord, status: AgentStatus | null, tasks: TaskLike[], cronFailures: number, cronTotal: number): Recommendation[] {
  const out: Recommendation[] = [];
  const push = (rec: Omit<Recommendation, 'id' | 'agentId'>) =>
    out.push({ ...rec, id: `${agent.id}:${rec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, agentId: agent.id });

  if (!agent.enabled) return [];

  // Auth gate
  if (status?.auth?.loggedIn === false) {
    push({
      severity: 'high',
      title: `${agent.name} is not logged in`,
      detail: 'Authenticate once from a terminal before dispatching tasks.',
      action: { kind: 'settings', value: 'auth' },
    });
  }

  // Gateway health
  const hasGateway = agent.type === 'openclaw' || agent.type === 'hermes';
  if (hasGateway && status && status.running === false) {
    push({
      severity: 'high',
      title: `${agent.name} gateway is not running`,
      detail: 'Start the gateway to enable dispatch and scheduled jobs.',
      action: { kind: 'gateway', value: 'start' },
    });
  }
  if (hasGateway && status?.running && status.healthy === false) {
    push({
      severity: 'medium',
      title: `${agent.name} gateway is unhealthy`,
      detail: 'The gateway is running but reports an unhealthy probe. Restart it.',
      action: { kind: 'gateway', value: 'restart' },
    });
  }

  // Task class drill-down
  const lastFail = tasks.find((t) => t.status === 'error');
  const failures = tasks.filter((t) => t.status === 'error');
  if (status?.running === false && hasGateway && failures.length) {
    // already surfaced gateway-down above
  }
  const classCount: Record<string, number> = {};
  for (const t of failures) classCount[t.class || 'unknown'] = (classCount[t.class || 'unknown'] || 0) + 1;
  const top = Object.entries(classCount).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    const [cls, n] = top;
    const msg: Record<string, string> = {
      rate_limit: 'Recent tasks keep hitting rate limits. Reduce concurrency or check provider quota.',
      auth_required: 'Recent tasks keep failing authentication. Complete the login flow for this agent.',
      timeout: 'Recent tasks are timing out. Increase the task timeout or split prompts.',
      gateway_down: 'Recent tasks could not reach the gateway. Start or restart it.',
      not_found: 'Recent tasks target a missing instance/session. Pick a valid agent instance.',
      config_error: 'Recent tasks are failing on configuration. Review config and logs.',
    };
    if (msg[cls]) {
      push({
        severity: top[1] >= 4 ? 'high' : 'medium',
        title: `${n} recent failures due to ${cls.replace('_', ' ')}`,
        detail: msg[cls],
        action: lastFail ? { kind: 'ping', value: 'verify' } : undefined,
      });
    }
  }

  // Cron health
  if (cronFailures > 0 && cronTotal >= cronFailures) {
    push({
      severity: cronFailures >= 3 ? 'high' : 'medium',
      title: `${cronFailures} scheduled job${cronFailures > 1 ? 's' : ''} failing`,
      detail: `${cronFailures} of ${cronTotal} cron jobs last ended in error for ${agent.name}.`,
    });
  }
  return out;
}

export async function buildFleetHealth(): Promise<FleetHealth> {
  const agents = listRegistered();
  const matrix: MatrixRow[] = [];
  const recommendations: Recommendation[] = [];
  const byClass: Record<string, number> = {};
  let taskFailures24h = 0;
  let taskTotal24h = 0;

  for (const agent of agents) {
    const status = ((await getStatusFor(agent)) || null) as AgentStatus | null;
    const tasks24 = recentTasks24h(agent.id);
    const tasks8 = recentTasks(agent.id);
    for (const t of tasks24) {
      byClass[t.class || 'unknown'] = (byClass[t.class || 'unknown'] || 0) + 1;
      if (t.status === 'error') taskFailures24h += 1;
      if (t.status !== 'interrupted') taskTotal24h += 1;
    }

    let cronFailures = 0;
    let cronTotal = 0;
    try {
      const a = adapterFor(agent.type);
      if (a?.listCron) {
        const cron = await a.listCron(agent);
        cronTotal = cron.length;
        cronFailures = cron.filter((c) => c.lastStatus === 'error').length;
      }
    } catch {
      /* ignore */
    }

    const lastTaskRaw = recentTasks(agent.id, 1)[0];
    matrix.push({
      agentId: agent.id,
      name: agent.name,
      type: agent.type,
      enabled: agent.enabled,
      running: status?.running || false,
      healthy: status?.healthy,
      version: status?.version,
      model: status?.model,
      auth: status?.auth ? { loggedIn: status.auth.loggedIn } : undefined,
      lastTask: lastTaskRaw ? { status: lastTaskRaw.status, class: lastTaskRaw.class || 'ok', ts: lastTaskRaw.ts } : null,
      taskFailures24h: tasks24.filter((t) => t.status === 'error').length,
      taskTotal24h: tasks24.filter((t) => t.status !== 'interrupted').length,
      cronFailures,
      cronTotal,
    });

    recommendations.push(...recommendFor(agent, status, tasks8, cronFailures, cronTotal));
  }

  return {
    matrix,
    recommendations,
    byClass,
    failingTaskPct24h: taskTotal24h ? Math.round((taskFailures24h / taskTotal24h) * 100) : 0,
  };
}