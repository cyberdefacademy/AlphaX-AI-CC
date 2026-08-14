import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { StatusBadge, timeAgo } from '../components/ui';
import { IconChevron } from '../components/Icons';

export default function Tasks() {
  const { tasks, liveTasks, agents } = useStore();
  const [filter, setFilter] = useState<'all' | 'running' | 'done' | 'error'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || id.slice(0, 8);

  const filtered = useMemo(
    () => tasks.filter((t) => (filter === 'all' ? true : t.status === filter)),
    [tasks, filter]
  );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-slate-500">Everything dispatched to your agents, streamed live.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {(['all', 'running', 'done', 'error'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                filter === f ? 'bg-ink-700 text-white' : 'text-slate-500 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-500">
          No tasks yet. Open an agent and hit “Run task”.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, 80).map((t) => {
            const live = liveTasks[t.id];
            const expanded = openId === t.id;
            const lines = live?.lines || (t.result ? t.result.split('\n').filter(Boolean) : []);
            return (
              <div key={t.id} className="card">
                <button
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setOpenId(expanded ? null : t.id)}
                >
                  <IconChevron
                    width={14}
                    height={14}
                    className={`shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{t.prompt}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {agentName(t.agent_id)}
                      {t.instance ? ` · ${t.instance}` : ''} · {timeAgo(t.ts)}
                      {t.duration_ms ? ` · ${(t.duration_ms / 1000).toFixed(1)}s` : ''}
                    </p>
                  </div>
                  <StatusBadge
                    running={t.status === 'running'}
                    healthy={t.status !== 'error'}
                    label={t.status}
                  />
                </button>
                {expanded && lines.length > 0 && (
                  <div className="log-box mt-3 max-h-72 overflow-y-auto">{lines.join('\n')}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}