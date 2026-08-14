import React, { useState } from 'react';
import { useStore } from '../store';
import AgentCard from '../components/AgentCard';
import TaskDock from '../components/TaskDock';
import { Ladle, timeAgo } from '../components/ui';
import { IconRefresh, IconTask } from '../components/Icons';
import type { Agent } from '../types';
import { apiPost } from '../api';

export default function Overview() {
  const { agents, system, activity, loaded, refreshSystem } = useStore();
  const [dock, setDock] = useState<Agent | null>(null);
  const [scanning, setScanning] = useState(false);

  const rescan = async () => {
    setScanning(true);
    try {
      await apiPost('/api/system/rescan');
      await refreshSystem();
    } finally {
      setScanning(false);
    }
  };

  if (!loaded) {
    return <Centered><span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-accent" /></Centered>;
  }

  const running = agents.filter((a) => a.status?.running).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Overview</h1>
          <p className="text-sm text-slate-500">All your AI agents, one control plane.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={rescan} disabled={scanning}>
            <IconRefresh width={14} height={14} className={scanning ? 'animate-spin' : ''} />
            Rescan
          </button>
          <button className="btn btn-primary" onClick={() => setDock(agents[0] || null)} disabled={!agents.length}>
            <IconTask width={14} height={14} /> New task
          </button>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Ladle label="Agents" value={`${agents.length} (${running} running)`} />
        <Ladle label="CPU" value={`${system?.load[0]?.toFixed(2) ?? '—'} / ${system?.cpuCount ?? '—'} cores`} />
        <Ladle label="Memory" value={system ? `${system.memUsedMB} / ${system.memTotalMB} MB` : '—'} />
        <Ladle label="Uptime" value={system ? uptime(system.uptimeSec) : '—'} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Agents
        </h2>
        {agents.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-slate-400">No agents registered yet.</p>
            <a href="#/agents" className="btn btn-primary">Open Agents &amp; discover</a>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Recent activity
        </h2>
        <div className="card">
          {activity.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-ink-800">
              {activity.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <KindDot kind={a.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-300">{a.message}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-600">{timeAgo(a.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {dock && <TaskDock open={!!dock} onClose={() => setDock(null)} agent={dock} />}
    </div>
  );
}

function uptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function KindDot({ kind }: { kind: string }) {
  const color = kind.startsWith('task_done')
    ? '#22c55e'
    : kind.startsWith('task_error')
    ? '#f43f5e'
    : kind.includes('gateway')
    ? '#22d3ee'
    : kind.includes('register')
    ? '#a78bfa'
    : kind === 'auth'
    ? '#f59e0b'
    : '#64748b';
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center">{children}</div>;
}