import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Ladle, Spinner, StatusBadge, Tabs, timeAgo } from '../components/ui';
import TaskDock from '../components/TaskDock';
import { typeColor } from '../components/AgentCard';
import { IconBack, IconPlay, IconStop, IconRefresh } from '../components/Icons';
import { apiGet, apiPost } from '../api';
import type {
  Agent,
  AgentInstance,
  ChannelInfo,
  ConfigEntry,
  CronInfo,
  LogSource,
  ModelInfo,
  ProcessInfo,
  SessionInfo,
} from '../types';

const TABS = ['status', 'tasks', 'sessions', 'channels', 'models', 'cron', 'config', 'processes', 'logs'];

interface TaskItem {
  id: string;
  ts: string;
  prompt: string;
  status: string;
  result: string | null;
  duration_ms: number | null;
  live?: { lines: string[]; status: string };
}

export default function AgentDetail({ id }: { id: string }) {
  const { agents, tasks, liveTasks, refreshAgents } = useStore();
  const agent = agents.find((a) => a.id === id);
  const [tab, setTab] = useState('status');
  const [taskDock, setTaskDock] = useState(false);
  const [gwBusy, setGwBusy] = useState(false);
  const [gwMsg, setGwMsg] = useState('');

  useEffect(() => {
    if (!agent) refreshAgents();
  }, [id, agent, refreshAgents]);

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading agent…" />
      </div>
    );
  }

  const hasGateway = agent.type === 'openclaw' || agent.type === 'hermes';

  const gateway = async (action: 'start' | 'stop' | 'restart') => {
    setGwBusy(true);
    setGwMsg('');
    try {
      const r = await apiPost<{ result: { code: number | null; stdout: string; stderr: string } }>(
        `/api/agents/${agent.id}/gateway/${action}`
      );
      setGwMsg(r.result.stderr || r.result.stdout || `exit ${r.result.code}`);
      await refreshAgents();
    } catch (e) {
      setGwMsg((e as Error).message);
    } finally {
      setGwBusy(false);
    }
  };

  const agentTasks = tasks
    .filter((t) => t.agent_id === id)
    .map((t) => ({ ...t, live: liveTasks[t.id] }))
    .slice(0, 20);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <button
        onClick={() => (location.hash = '#/agents')}
        className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <IconBack width={14} height={14} /> Agents
      </button>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${
                agent.type === 'openclaw' ? '#0ea5e9' : agent.type === 'hermes' ? '#8b5cf6' : agent.type === 'claude' ? '#f97316' : agent.type === 'opencode' ? '#10b981' : '#64748b'
              }, #1e293b)`,
            }}
          >
            {agent.name.slice(0, 1)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
              <span className={`rounded border px-1.5 py-px text-[10px] font-medium ${typeColor(agent.type)}`}>
                {agent.type}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {agent.status?.version ? `v${agent.status.version} · ` : ''}
              {agent.detected ? 'auto-detected' : 'manual registration'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasGateway && (
            <>
              <button className="btn btn-primary" disabled={gwBusy} onClick={() => gateway('restart')}>
                <IconRefresh width={14} height={14} /> Restart gateway
              </button>
              {agent.status?.running ? (
                <button className="btn btn-danger" disabled={gwBusy} onClick={() => gateway('stop')}>
                  <IconStop width={14} height={14} /> Stop
                </button>
              ) : (
                <button className="btn btn-primary" disabled={gwBusy} onClick={() => gateway('start')}>
                  <IconPlay width={14} height={14} /> Start
                </button>
              )}
            </>
          )}
          <button className="btn btn-ghost" onClick={() => setTaskDock(true)}>
            <IconPlay width={14} height={14} /> Run task
          </button>
        </div>
      </header>

      {gwMsg && (
        <p className="mb-4 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 font-mono text-xs text-slate-400">
          {gwMsg}
        </p>
      )}

      <Tabs
        tabs={[
          { id: 'status', label: 'Status' },
          { id: 'tasks', label: 'Tasks', count: agentTasks.filter((t) => t.status === 'running').length },
          { id: 'sessions', label: 'Sessions' },
          { id: 'channels', label: 'Channels' },
          { id: 'models', label: 'Models' },
          { id: 'cron', label: 'Cron' },
          { id: 'config', label: 'Config' },
          { id: 'processes', label: 'Processes' },
          { id: 'logs', label: 'Logs' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'status' && <StatusTab agent={agent} />}
      {tab === 'tasks' && <TasksTab agent={agent} tasks={agentTasks} onNew={() => setTaskDock(true)} />}
      {tab === 'sessions' && <SessionsTab agent={agent} />}
      {tab === 'channels' && <ChannelsTab agent={agent} />}
      {tab === 'models' && <ModelsTab agent={agent} />}
      {tab === 'cron' && <CronTab agent={agent} />}
      {tab === 'config' && <ConfigTab agent={agent} />}
      {tab === 'processes' && <ProcessesTab agent={agent} />}
      {tab === 'logs' && <LogsTab agent={agent} />}

      {taskDock && <TaskDock open={taskDock} onClose={() => setTaskDock(false)} agent={agent} />}
    </div>
  );
}

function StatusTab({ agent }: { agent: Agent }) {
  const s = agent.status;
  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-3">
        <StatusBadge running={s?.running} healthy={s?.healthy} />
        <span className="text-xs text-slate-500">
          {s?.service ? `systemd · ${s.service}` : 'no persistent service'}
        </span>
      </div>
      {s?.auth?.loggedIn === false && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {s.auth.hint || 'Not logged in.'} After logging in once, dispatch will work.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Ladle label="Binary" value={s?.binary || '—'} />
        <Ladle label="Version" value={s?.version || '—'} />
        <Ladle label="Model" value={s?.model || '—'} />
        <Ladle label="Provider" value={s?.provider || '—'} />
        <Ladle label="Type" value={agent.type} />
        <Ladle label="Registered" value={timeAgo(agent.created_at)} />
      </div>
      {s?.detail && Object.keys(s.detail).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Details</p>
          <pre className="rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-400">
            {JSON.stringify(s.detail, null, 2)}
          </pre>
        </div>
      )}
      {agent.config && Object.keys(agent.config).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Type config</p>
          <pre className="rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-400">
            {JSON.stringify(agent.config, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function TasksTab({
  agent,
  tasks,
  onNew,
}: {
  agent: Agent;
  tasks: TaskItem[];
  onNew: () => void;
}) {
  const items = tasks || [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={onNew}>
          <IconPlay width={14} height={14} /> New task
        </button>
      </div>
      {items.length === 0 ? (
        <div className="card text-center py-8 text-sm text-slate-500">
          No tasks for this agent yet. Run one to see output stream live.
        </div>
      ) : (
        items.map((t) => {
          const live = t.live;
          const lines = live?.lines || (t.result ? t.result.split('\n') : []);
          return (
            <div key={t.id} className="card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-sm text-slate-200">{t.prompt}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    running={t.status === 'running' || live?.status === 'running'}
                    healthy={t.status !== 'error' && live?.status !== 'error'}
                    label={t.status === 'running' ? 'running' : t.status === 'error' ? 'failed' : 'done'}
                  />
                  <span className="text-xs text-slate-600">{timeAgo(t.ts)}</span>
                </div>
              </div>
              {lines.length > 0 && (
                <div className="log-box max-h-52 overflow-y-auto">{lines.join('\n')}</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function useSimple<T>(path: string, agentId: string, key: string): [T | null, () => void, boolean] {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    apiGet<Record<string, T>>(path)
      .then((r) => setData((r[key] as T) ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [path, key]);
  useEffect(() => load(), [load]);
  return [data, load, loading];
}

function SessionsTab({ agent }: { agent: Agent }) {
  const [data, reload, loading] = useSimple<SessionInfo[]>(`/api/agents/${agent.id}/sessions`, agent.id, 'sessions');
  return <SimpleList title="Sessions" loading={loading} count={data?.length} onReload={reload}
    empty="No sessions found." render={data?.map((s) => ({ id: s.id, sub: s.source }))} />;
}

function ChannelsTab({ agent }: { agent: Agent }) {
  const [data, reload, loading] = useSimple<ChannelInfo[]>(`/api/agents/${agent.id}/channels`, agent.id, 'channels');
  return <SimpleList title="Channels" loading={loading} count={data?.length} onReload={reload}
    empty="No channels found." render={data?.map((c) => ({ id: c.name, sub: c.status }))} />;
}

function ModelsTab({ agent }: { agent: Agent }) {
  const [data, reload, loading] = useSimple<ModelInfo[]>(`/api/agents/${agent.id}/models`, agent.id, 'models');
  return <SimpleList title="Models" loading={loading} count={data?.length} onReload={reload}
    empty="No models listed." render={data?.map((m) => ({ id: m.id, sub: m.local ? 'local' : m.context || '' }))} />;
}

function CronTab({ agent }: { agent: Agent }) {
  const [data, reload, loading] = useSimple<CronInfo[]>(`/api/agents/${agent.id}/cron`, agent.id, 'cron');
  return (
    <ReloadCard title="Scheduled jobs" count={data?.length} loading={loading} onReload={reload}>
      {!data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No scheduled jobs.</p>
      ) : (
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Schedule</th>
              <th>Next run</th>
              <th>Last run</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td className="font-medium text-white">{c.name || c.id}</td>
                <td className="font-mono">{c.schedule}</td>
                <td className="text-xs">{c.nextRun || '—'}</td>
                <td className="text-xs">{c.lastRun || '—'}</td>
                <td>
                  <StatusBadge
                    running={c.lastStatus !== 'error' && c.lastStatus !== 'disabled'}
                    healthy={c.lastStatus !== 'error'}
                    label={c.lastStatus || 'active'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReloadCard>
  );
}

function ConfigTab({ agent }: { agent: Agent }) {
  const [data, reload, loading] = useSimple<ConfigEntry[]>(`/api/agents/${agent.id}/config`, agent.id, 'config');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');

  const setCfg = async () => {
    setMsg('');
    try {
      const r = await apiPost<{ result: { code: number | null; stderr: string } }>(`/api/agents/${agent.id}/config`, {
        key,
        value,
      });
      setMsg(r.result.stderr || `exit ${r.result.code}`);
      setKey('');
      setValue('');
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <ReloadCard title="Configuration" count={data?.length} loading={loading} onReload={reload}>
      {data && data.length > 0 ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.key}>
                  <td className="font-mono text-xs">{c.key}</td>
                  <td className="max-w-[400px] truncate font-mono text-xs">{c.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-slate-500">No readable config for this agent type.</p>
      )}
      <div className="mt-4 border-t border-ink-700 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Set config key
        </p>
        <div className="flex gap-2">
          <input className="input flex-1 font-mono" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className="input flex-1 font-mono" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} />
          <button className="btn btn-primary" onClick={setCfg} disabled={!key}>
            Set
          </button>
        </div>
        {msg && <p className="mt-2 font-mono text-xs text-slate-400">{msg}</p>}
      </div>
    </ReloadCard>
  );
}

function ProcessesTab({ agent }: { agent: Agent }) {
  const [data, reload, loading] = useSimple<ProcessInfo[]>(`/api/agents/${agent.id}/processes`, agent.id, 'processes');
  useEffect(() => {
    const t = setInterval(() => reload(), 5000);
    return () => clearInterval(t);
  }, [reload]);
  return (
    <ReloadCard title="Processes" count={data?.length} loading={loading} onReload={reload}>
      {!data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No running processes for this agent.</p>
      ) : (
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>PID</th>
              <th>Name</th>
              <th>CPU %</th>
              <th>Memory</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.pid}>
                <td className="font-mono">{p.pid}</td>
                <td className="font-mono">{p.name}</td>
                <td className="font-mono">{p.cpuPct.toFixed(1)}%</td>
                <td className="font-mono">{p.memMB} MB</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReloadCard>
  );
}

function LogsTab({ agent }: { agent: Agent }) {
  const [data, reload, loading] = useSimple<LogSource[]>(`/api/agents/${agent.id}/logs`, agent.id, 'logs');
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (!follow) return;
    const t = setInterval(() => reload(), 4000);
    return () => clearInterval(t);
  }, [follow, reload]);

  return (
    <ReloadCard title="Logs" count={data?.length} loading={loading} onReload={reload}
      extra={
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          follow
        </label>
      }>
      {!data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No log files found for this agent. Task output is available under the Tasks tab.
        </p>
      ) : (
        <div className="space-y-4">
          {data.map((src) => (
            <div key={src.name}>
              <p className="mb-1 font-mono text-xs text-slate-500">{src.name}</p>
              <div className="log-box max-h-64 overflow-y-auto">{src.lines.join('\n')}</div>
            </div>
          ))}
        </div>
      )}
    </ReloadCard>
  );
}

function SimpleList({
  title,
  loading,
  count,
  onReload,
  empty,
  render,
}: {
  title: string;
  loading: boolean;
  count?: number;
  onReload: () => void;
  empty: string;
  render?: Array<{ id: string; sub?: string }> | null;
}) {
  return (
    <ReloadCard title={title} count={count} loading={loading} onReload={onReload}>
      {!render || render.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {render.map((r) => (
            <div key={r.id} className="truncate rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
              <p className="truncate font-mono text-xs text-slate-200">{r.id}</p>
              {r.sub && <p className="truncate text-[11px] text-slate-600">{r.sub}</p>}
            </div>
          ))}
        </div>
      )}
    </ReloadCard>
  );
}

function ReloadCard({
  title,
  count,
  loading,
  onReload,
  children,
  extra,
}: {
  title: string;
  count?: number;
  loading: boolean;
  onReload: () => void;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {title}
          {typeof count === 'number' ? <span className="ml-2 text-slate-600">{count}</span> : null}
        </h3>
        <div className="flex items-center gap-3">
          {extra}
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={onReload}>
            {loading ? <Spinner /> : <IconRefresh width={12} height={12} />}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}