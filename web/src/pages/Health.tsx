import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import { ClassBadge, Spinner, timeAgo } from '../components/ui';
import { typeColor } from '../components/AgentCard';
import { IconPing, IconRefresh, IconPlay, IconStop } from '../components/Icons';
import { apiPost } from '../api';
import type { FleetHealth, Recommendation } from '../types';

const SEV_COLOR: Record<string, string> = {
  high: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  medium: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  low: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
};

export default function Health() {
  const { health, refreshHealth } = useStore();
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      await refreshHealth();
    } finally {
      setBusy(false);
    }
  }, [refreshHealth]);

  useEffect(() => {
    reload();
  }, [reload]);

  const act = async (r: Recommendation) => {
    if (!r.action || !r.agentId) return;
    if (r.action.kind === 'gateway') {
      if (!confirm(`${r.title}\n\nRun gateway "${r.action.value}" for this agent?`)) return;
      await apiPost(`/api/agents/${r.agentId}/gateway/${r.action.value}`);
    } else if (r.action.kind === 'ping') {
      await apiPost(`/api/agents/${r.agentId}/ping`);
    } else {
      location.hash = `#/agents/${r.agentId}`;
    }
    reload();
  };

  if (!health) {
    return <div className="flex h-full items-center justify-center"><Spinner label="Assessing fleet…" /></div>;
  }

  const { matrix, recommendations, byClass, failingTaskPct24h } = health;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fleet Health</h1>
          <p className="text-sm text-slate-500">Vitals, failure classes, and recommended actions.</p>
        </div>
        <button className="btn btn-ghost" onClick={reload} disabled={busy}>
          <IconRefresh width={14} height={14} className={busy ? 'animate-spin' : ''} />
          Re-assess
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Agents" value={String(matrix.length)} />
        <Stat label="Recommendations" value={String(recommendations.length)} tone={recommendations.length ? 'warn' : 'ok'} />
        <Stat label="Task failure (24h)" value={`${failingTaskPct24h}%`} tone={failingTaskPct24h > 10 ? 'warn' : 'ok'} />
        <Stat label="Failure classes" value={String(Object.keys(byClass).length)} />
      </div>

      {recommendations.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Recommended actions</h2>
          <div className="card divide-y divide-ink-800">
            {recommendations.map((r) => (
              <div key={r.id} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-px text-[10px] font-semibold uppercase ${SEV_COLOR[r.severity] || SEV_COLOR.medium}`}>
                  {r.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">{r.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
                </div>
                {r.action && (
                  <button className="btn btn-ghost shrink-0 !px-2 !py-1 text-xs" onClick={() => act(r)}>
                    {r.action.kind === 'gateway' ? (r.action.value === 'start' || r.action.value === 'restart' ? <IconPlay width={12} height={12} /> : <IconStop width={12} height={12} />) : <IconPing width={12} height={12} />}
                    {r.action.value}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Agent matrix</h2>
        <div className="card overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Gateway</th>
                <th>Last task</th>
                <th>Failures <span title="last 24h">24h</span></th>
                <th>Cron</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => {
                const fail = row.taskFailures24h;
                const cronBad = row.cronFailures > 0;
                return (
                  <tr key={row.agentId} className="hover:bg-ink-850/50">
                    <td>
                      <a href={`#/agents/${row.agentId}`} className="font-medium text-white hover:text-accent-soft">
                        {row.name}
                      </a>
                      <span className={`ml-2 rounded border px-1.5 py-px text-[10px] font-medium ${typeColor(row.type)}`}>
                        {row.type}
                      </span>
                    </td>
                    <td>
                      <Dot ok={row.running} bad={row.running && row.healthy === false} label={row.running ? (row.healthy === false ? 'unhealthy' : 'up') : 'down'} />
                    </td>
                    <td>
                      {row.lastTask ? (
                        <span className="flex items-center gap-2">
                          <span className={row.lastTask.status === 'error' ? 'text-rose-300' : 'text-slate-400'}>{row.lastTask.status}</span>
                          <ClassBadge cls={row.lastTask.class} />
                          <span className="text-xs text-slate-600">{timeAgo(row.lastTask.ts)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">no tasks</span>
                      )}
                    </td>
                    <td>
                      <span className={fail === 0 ? 'text-slate-400' : fail >= 3 ? 'text-rose-300' : 'text-amber-300'}>
                        {fail}/{row.taskTotal24h}
                      </span>
                    </td>
                    <td>
                      {row.cronTotal === 0 ? (
                        <span className="text-xs text-slate-600">—</span>
                      ) : (
                        <span className={cronBad ? 'text-rose-300' : 'text-emerald-300'}>
                          {row.cronFailures}/{row.cronTotal} fail
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {Object.keys(byClass).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Failure classes <span className="text-slate-600">(last 24h)</span>
          </h2>
          <div className="card">
            {Object.entries(byClass)
              .sort((a, b) => b[1] - a[1])
              .map(([cls, n]) => (
                <div key={cls} className="flex items-center justify-between border-b border-ink-800 py-2 last:border-0">
                  <ClassBadge cls={cls === 'unknown' ? null : cls} />
                  <span className="font-mono text-sm text-slate-300">{n}</span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-ink-700/60 bg-ink-850/60 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`font-mono text-lg ${tone === 'warn' ? 'text-amber-300' : tone === 'ok' ? 'text-emerald-300' : 'text-slate-200'}`}>
        {value}
      </span>
    </div>
  );
}

function Dot({ ok, bad, label }: { ok: boolean; bad?: boolean; label: string }) {
  const color = bad ? '#f59e0b' : ok ? '#22c55e' : '#64748b';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      <span className={ok ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
    </span>
  );
}