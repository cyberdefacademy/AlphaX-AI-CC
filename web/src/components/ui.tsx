import React from 'react';

export function Ladle({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-ink-700/60 bg-ink-850/60 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="truncate font-mono text-sm text-slate-200">{value}</span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function StatusBadge({ running, healthy, label }: { running?: boolean; healthy?: boolean; label?: string }) {
  const color = running ? (healthy === false ? '#f59e0b' : '#22c55e') : '#64748b';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-600/70 bg-ink-800/70 px-2 py-0.5 text-xs font-medium text-slate-300">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label || (running ? (healthy === false ? 'degraded' : 'running') : 'stopped')}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className={`card max-h-[85vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} flex flex-col overflow-hidden`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-ink-700 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-700/70">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === t.id
              ? 'border-accent text-white'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          {t.label}
          {typeof t.count === 'number' && t.count >= 0 ? (
            <span className="rounded-full bg-ink-700 px-1.5 py-0.5 text-[10px] text-slate-400">
              {t.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CLASS_COLORS: Record<string, string> = {
  ok: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  rate_limit: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  auth_required: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  gateway_down: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  timeout: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  not_found: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  config_error: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  interrupted: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
};

export function ClassBadge({ cls }: { cls?: string | null }) {
  if (!cls || cls === 'ok') return null;
  return (
    <span
      className={`inline-block rounded border px-1.5 py-px font-mono text-[10px] ${
        CLASS_COLORS[cls] || 'bg-ink-700/50 text-slate-300 border-ink-600'
      }`}
    >
      {cls.replace('_', ' ')}
    </span>
  );
}