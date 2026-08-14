import React, { useState } from 'react';
import { useStore } from '../store';
import { timeAgo } from '../components/ui';
import { KindDot } from './Overview';

const KIND_LABEL: Record<string, string> = {
  system: 'system',
  auth: 'security',
  register: 'registry',
  update: 'registry',
  remove: 'registry',
  gateway: 'gateway',
  config: 'config',
  task_done: 'task',
  task_error: 'task',
  install: 'install',
};

export default function Activity() {
  const { activity } = useStore();
  const [filter, setFilter] = useState('all');

  const kinds = Array.from(new Set(activity.map((a) => KIND_LABEL[a.kind] || a.kind)));
  const filtered = filter === 'all' ? activity : activity.filter((a) => (KIND_LABEL[a.kind] || a.kind) === filter);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Activity</h1>
        <p className="text-sm text-slate-500">An audit trail of everything AlphaX Agents OS has done.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1">
        {['all', ...kinds].map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              filter === k
                ? 'border-accent bg-accent/15 text-white'
                : 'border-ink-600 bg-ink-800 text-slate-400 hover:text-white'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-ink-800">
            {filtered.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3">
                <span className="mt-1.5">
                  <KindDot kind={a.kind} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-slate-200">{a.message}</p>
                    <span className="shrink-0 rounded bg-ink-800 px-1.5 py-px text-[10px] uppercase tracking-wide text-slate-500">
                      {a.kind}
                    </span>
                  </div>
                  {a.detail && (
                    <pre className="mt-1 max-h-24 overflow-auto rounded bg-black/30 p-2 font-mono text-[11px] text-slate-500">
                      {JSON.stringify(a.detail, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-600">{timeAgo(a.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}