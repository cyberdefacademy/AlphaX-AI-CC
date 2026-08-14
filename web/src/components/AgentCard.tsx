import React from 'react';
import type { Agent } from '../types';
import { StatusBadge } from './ui';
import { IconChevron } from './Icons';

export function typeColor(type: string): string {
  switch (type) {
    case 'openclaw':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'hermes':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    case 'claude':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'opencode':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

export default function AgentCard({ agent }: { agent: Agent }) {
  const s = agent.status;
  const running = Boolean(s?.running);
  const healthy = s?.healthy !== false;
  return (
    <a
      href={`#/agents/${agent.id}`}
      className="card card-hover group flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold uppercase text-white"
            style={{
              background: `linear-gradient(135deg, ${
                agent.type === 'openclaw' ? '#0ea5e9' : agent.type === 'hermes' ? '#8b5cf6' : agent.type === 'claude' ? '#f97316' : agent.type === 'opencode' ? '#10b981' : '#64748b'
              }, #1e293b)`,
            }}
          >
            {agent.name.slice(0, 1)}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
            <span className={`mt-0.5 inline-block rounded border px-1.5 py-px text-[10px] font-medium ${typeColor(agent.type)}`}>
              {agent.type}
            </span>
          </div>
        </div>
        <StatusBadge running={running} healthy={healthy} />
      </div>
      {s?.auth?.loggedIn === false && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
          Not logged in — run <code className="font-mono">claude</code> and <code className="font-mono">/login</code> in a terminal.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div className="truncate">
          <span className="text-slate-600">version </span>
          <span className="font-mono text-slate-300">{s?.version || '—'}</span>
        </div>
        <div className="truncate">
          <span className="text-slate-600">model </span>
          <span className="font-mono text-slate-300">{s?.model || (s?.provider || '—')}</span>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
        <span>
          {agent.detected ? 'auto-detected' : 'manual'} {s?.service ? `· ${s.service}` : ''}
        </span>
        <span className="flex items-center gap-1 text-slate-400 transition-transform group-hover:translate-x-0.5">
          manage
          <IconChevron width={14} height={14} />
        </span>
      </div>
    </a>
  );
}