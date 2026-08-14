import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiGet, apiPost, connectWs } from './api';
import type {
  Agent,
  SystemOverview,
  ActivityItem,
  TaskRecord,
  QueueState,
  FleetHealth,
} from './types';

export interface LiveTask {
  lines: string[];
  status: string;
}

interface StoreValue {
  agents: Agent[];
  system: SystemMetricsLike | null;
  activity: ActivityItem[];
  tasks: TaskRecord[];
  liveTasks: Record<string, LiveTask>;
  health: FleetHealth | null;
  queue: QueueState;
  loaded: boolean;
  wsConnected: boolean;
  refreshAgents: () => Promise<void>;
  refreshSystem: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  sendTask: (agentId: string, instance: string, prompt: string) => Promise<string>;
  rerunTask: (taskId: string, prompt?: string) => Promise<string>;
}

interface SystemMetricsLike {
  load: number[];
  cpuCount: number;
  memTotalMB: number;
  memUsedMB: number;
  memUsedPct: number;
  uptimeSec: number;
  bootTime: number;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [system, setSystem] = useState<SystemMetricsLike | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [liveTasks, setLiveTasks] = useState<Record<string, LiveTask>>({});
  const [health, setHealth] = useState<FleetHealth | null>(null);
  const [queue, setQueue] = useState<QueueState>({ running: 0, queued: 0, positions: {} });
  const [loaded, setLoaded] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const isLiveRef = useRef(location.hash !== '#/login');

  const refreshAgents = useCallback(async () => {
    try {
      const r = await apiGet<{ agents: Agent[] }>('/api/agents');
      setAgents(r.agents);
    } catch {
      /* handled by auth event */
    }
  }, []);

  const refreshSystem = useCallback(async () => {
    try {
      const r = await apiGet<{ agents: Agent[]; system: SystemMetricsLike }>('/api/system/overview');
      setAgents(r.agents);
      setSystem(r.system);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshActivity = useCallback(async () => {
    try {
      const r = await apiGet<{ activity: ActivityItem[] }>('/api/activity?limit=80');
      setActivity(r.activity);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const r = await apiGet<{ tasks: TaskRecord[] }>('/api/tasks?limit=100');
      setTasks(r.tasks);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const r = await apiGet<FleetHealth>('/api/system/health');
      setHealth(r);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      const q = await apiGet<QueueState>('/api/system/queue');
      setQueue(q);
    } catch {
      /* ignore */
    }
  }, []);

  const sendTask = useCallback(async (agentId: string, instance: string, prompt: string) => {
    const r = await apiPost<{ taskId: string }>(`/api/agents/${agentId}/send`, {
      prompt,
      instance: instance || undefined,
    });
    refreshTasks();
    return r.taskId;
  }, [refreshTasks]);

  const rerunTask = useCallback(async (taskId: string, prompt?: string) => {
    const r = await apiPost<{ taskId: string }>(`/api/tasks/${taskId}/rerun`, prompt ? { prompt } : undefined);
    refreshTasks();
    return r.taskId;
  }, [refreshTasks]);

  const loadAll = useCallback(async () => {
    await Promise.all([refreshSystem(), refreshActivity(), refreshTasks(), refreshHealth(), refreshQueue()]);
    setLoaded(true);
  }, [refreshSystem, refreshActivity, refreshTasks, refreshHealth, refreshQueue]);

  useEffect(() => {
    loadAll();
    const timer = setInterval(() => {
      if (!document.hidden) refreshSystem();
    }, 10000);
    const timer2 = setInterval(() => {
      if (!document.hidden) refreshQueue();
    }, 4000);
    return () => {
      clearInterval(timer);
      clearInterval(timer2);
    };
  }, [loadAll, refreshSystem, refreshQueue]);

  useEffect(() => {
    const onAuth = () => {
      location.hash = '#/login';
    };
    window.addEventListener('auth:expired', onAuth);
    return () => window.removeEventListener('auth:expired', onAuth);
  }, []);

  useEffect(() => {
    if (location.hash === '#/login') {
      setLoaded(true);
      return;
    }
    const ws = connectWs((topic, data) => {
      setWsConnected(true);
      switch (topic) {
        case 'agents:changed':
          refreshSystem();
          refreshAgents();
          break;
        case 'detect:done':
          refreshAgents();
          break;
        case 'queue:changed': {
          const q = data as QueueState;
          setQueue(q);
          setLiveTasks((p) => {
            const next = { ...p };
            for (const [tid, pos] of Object.entries(q.positions || {})) {
              const cur = next[tid] || { lines: [], status: 'queued' };
              next[tid] = { ...cur, status: `queued #${pos}` };
            }
            for (const [tid, lt] of Object.entries(next)) {
              if (lt.status.startsWith('queued') && !(q.positions || {})[tid]) {
                next[tid] = { ...lt, status: 'queued' };
              }
            }
            return next;
          });
          break;
        }
        case 'health:changed':
          refreshHealth();
          break;
        case 'task:started': {
          const d = data as { taskId: string };
          setLiveTasks((p) => ({ ...p, [d.taskId]: { lines: [], status: 'running' } }));
          break;
        }
        case 'task:line': {
          const d = data as { taskId: string; line: string };
          setLiveTasks((p) => {
            const cur = p[d.taskId] || { lines: [], status: 'running' };
            return { ...p, [d.taskId]: { ...cur, lines: [...cur.lines, d.line].slice(-2000) } };
          });
          break;
        }
        case 'task:done': {
          const d = data as { taskId: string; ok: boolean };
          setLiveTasks((p) => {
            const cur = p[d.taskId] || { lines: [], status: 'running' };
            return { ...p, [d.taskId]: { ...cur, status: d.ok ? 'done' : 'error' } };
          });
          refreshTasks();
          refreshActivity();
          refreshHealth();
          refreshQueue();
          break;
        }
        case 'tasks:changed':
          refreshTasks();
          break;
        case 'install:line': {
          const d = data as { agentId: string; line: string };
          const key = 'install:' + d.agentId;
          setLiveTasks((p) => {
            const cur = p[key] || { lines: [], status: 'running' };
            return { ...p, [key]: { ...cur, lines: [...cur.lines, d.line].slice(-1500) } };
          });
          break;
        }
        case 'install:done': {
          const d = data as { agentId: string; code: number };
          const key = 'install:' + d.agentId;
          setLiveTasks((p) => {
            const cur = p[key] || { lines: [], status: 'running' };
            return { ...p, [key]: { ...cur, status: d.code === 0 ? 'done' : 'error' } };
          });
          refreshAgents();
          refreshActivity();
          break;
        }
        default:
          break;
      }
    });
    return () => ws.close();
  }, [refreshAgents, refreshSystem, refreshActivity, refreshTasks]);

  const value: StoreValue = {
    agents,
    system,
    activity,
    tasks,
    liveTasks,
    health,
    queue,
    loaded,
    wsConnected,
    refreshAgents,
    refreshSystem,
    refreshActivity,
    refreshTasks,
    refreshHealth,
    refreshQueue,
    sendTask,
    rerunTask,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}