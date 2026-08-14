import React, { useState } from 'react';
import { useStore } from '../store';
import { Modal, StatusBadge, timeAgo } from '../components/ui';
import { typeColor } from '../components/AgentCard';
import { IconRefresh, IconSearch, IconPlus, IconTrash, IconDownload } from '../components/Icons';
import { apiPost, apiGet, apiDelete } from '../api';
import type { DetectCandidate, PresetMeta } from '../types';

export default function Agents() {
  const { agents, refreshAgents } = useStore();
  const [candidates, setCandidates] = useState<DetectCandidate[] | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showGeneric, setShowGeneric] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyKey, setBusyKey] = useState<string>('');
  const [presets, setPresets] = useState<PresetMeta[]>([]);
  const [installError, setInstallError] = useState('');

  const scan = async () => {
    setScanning(true);
    try {
      const c = await apiPost<{ candidates: DetectCandidate[] }>('/api/system/detect');
      setCandidates(c.candidates);
    } finally {
      setScanning(false);
    }
  };

  const openInstall = async () => {
    setInstallError('');
    const pres = await apiGet<{ presets: PresetMeta[] }>('/api/system/detect/presets');
    setPresets(pres.presets);
    setShowInstall(true);
  };

  const registerCandidate = async (c: DetectCandidate) => {
    setBusyKey('cand:' + c.name + c.type);
    try {
      await apiPost('/api/agents/register', {
        type: c.type,
        name: c.preset ? presets.find((p) => p.slug === c.preset)?.name || c.name : c.name,
        preset: c.preset,
        binary: c.binary,
      });
      await refreshAgents();
      setCandidates((cs) => cs?.filter((x) => !(x.name === c.name && x.type === c.type)) || null);
    } finally {
      setBusyKey('');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this agent from the registry?')) return;
    await apiDelete(`/api/agents/${id}`);
    await refreshAgents();
  };

  const runInstall = async (type: string, name: string) => {
    setBusyKey('install:' + type);
    setInstallError('');
    try {
      await apiPost<{ ok: boolean }>(`/api/agents/${type}/run-install`);
      setShowInstall(false);
      alert(`${name} install started in the background. Streaming output appears under Tasks. Click Rescan when it finishes.`);
    } catch (e) {
      setInstallError((e as Error).message);
    } finally {
      setBusyKey('');
    }
  };

  const runPresetInstall = async (p: PresetMeta) => {
    setBusyKey('preset:' + p.slug);
    setInstallError('');
    try {
      const r = await apiPost<{ ok: boolean; agentId: string }>(`/api/system/presets/${p.slug}/install`);
      await refreshAgents();
      setShowInstall(false);
      alert(`${p.name} install started. Find output in Tasks.\n\nWhen done, click Rescan (or view ${p.name} under Agents) to confirm.`);
    } catch (e) {
      setInstallError((e as Error).message);
    } finally {
      setBusyKey('');
    }
  };

  const TYPED = [
    { type: 'openclaw', name: 'OpenClaw', note: 'npm (Node.js required)' },
    { type: 'hermes', name: 'Hermes Agent', note: 'git clone + Python venv (auto)' },
    { type: 'claude', name: 'Claude Code', note: 'Requires Anthropic login' },
    { type: 'opencode', name: 'opencode', note: 'Official installer' },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-sm text-slate-500">Discover what\u2019s installed, register it, and take control.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={scan} disabled={scanning}>
            <IconSearch width={14} height={14} /> Scan for agents
          </button>
          <button className="btn btn-ghost" onClick={() => setShowGeneric(true)}>
            <IconPlus width={14} height={14} /> Add generic CLI
          </button>
          <button className="btn btn-primary" onClick={openInstall}>
            <IconDownload width={14} height={14} /> Install new agent
          </button>
        </div>
      </header>

      <div className="card overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Type</th>
              <th>Status</th>
              <th>Model / provider</th>
              <th className="hidden lg:table-cell">Discovery</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="hover:bg-ink-850/50">
                <td>
                  <a href={`#/agents/${a.id}`} className="font-medium text-white hover:text-accent-soft">
                    {a.name}
                  </a>
                  <span className="ml-2 font-mono text-xs text-slate-600">{a.status?.version || ''}</span>
                </td>
                <td>
                  <span className={`rounded border px-1.5 py-px text-[10px] font-medium ${typeColor(a.type)}`}>
                    {a.type}
                  </span>
                </td>
                <td>
                  <StatusBadge running={a.status?.running} healthy={a.status?.healthy} />
                </td>
                <td className="max-w-[220px] truncate font-mono text-xs">
                  {a.status?.model || a.status?.provider || '—'}
                </td>
                <td className="hidden text-xs text-slate-600 lg:table-cell">
                  {a.detected ? 'auto' : 'manual'} · {timeAgo(a.updated_at)}
                </td>
                <td>
                  <div className="flex justify-end gap-1.5">
                    <a href={`#/agents/${a.id}`} className="btn btn-ghost !px-2 !py-1 text-xs">
                      Manage
                    </a>
                    <button
                      className="btn btn-ghost !px-2 !py-1 text-xs"
                      onClick={async () => {
                        setBusyKey('refresh:' + a.id);
                        try {
                          await apiGet(`/api/agents/${a.id}/status`);
                          await refreshAgents();
                        } finally {
                          setBusyKey('');
                        }
                      }}
                    >
                      <IconRefresh width={12} height={12} />
                    </button>
                    <button className="btn btn-danger !px-2 !py-1 text-xs" onClick={() => remove(a.id)}>
                      <IconTrash width={12} height={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">
                  Nothing here yet. Hit <span className="text-slate-300">Scan for agents</span> to discover
                  what\u2019s installed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Scan results */}
      <Modal open={candidates !== null} onClose={() => setCandidates(null)} title="Discovered agents" wide>
        {candidates === null ? null : candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No known agents detected. Add one manually as a generic CLI agent, or install one below.
          </p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {candidates.map((c, i) => (
              <div
                key={c.name + c.type + i}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-850 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{c.name}</span>
                    <span className={`rounded border px-1.5 py-px text-[10px] font-medium ${typeColor(c.type)}`}>
                      {c.type}
                    </span>
                    {c.version && <span className="font-mono text-xs text-slate-500">{c.version}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {c.foundBy.join(' · ')} {c.binary ? `· ${c.binary}` : ''}
                  </p>
                </div>
                <button
                  className="btn btn-primary shrink-0 !py-1 text-xs"
                  disabled={busyKey === 'cand:' + c.name + c.type}
                  onClick={() => registerCandidate(c)}
                >
                  {busyKey === 'cand:' + c.name + c.type ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Install modal */}
      <Modal open={showInstall} onClose={() => setShowInstall(false)} title="Install a new agent" wide>
        <div className="space-y-3">
          {TYPED.map((item) => {
            const installed = agents.find((a) => a.type === item.type)?.status?.installed;
            return (
              <div key={item.type} className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-850 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{item.name}</span>
                    {installed && <StatusBadge running={false} label="installed" />}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{item.note}</p>
                </div>
                {!installed && (
                  <button
                    className="btn btn-primary shrink-0 !py-1 text-xs"
                    disabled={busyKey === 'install:' + item.type}
                    onClick={() => runInstall(item.type, item.name)}
                  >
                    {busyKey === 'install:' + item.type ? 'Starting…' : 'Install'}
                  </button>
                )}
              </div>
            );
          })}
          <div className="border-t border-ink-700 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              More agents (installs + registers them)
            </p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.slug}
                  className="btn btn-ghost text-xs"
                  disabled={busyKey === 'preset:' + p.slug}
                  onClick={() => runPresetInstall(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {installError && <p className="mt-2 text-xs text-rose-400">{installError}</p>}
          </div>
        </div>
      </Modal>

      {/* Generic add modal */}
      <GenericAdd open={showGeneric} onClose={() => setShowGeneric(false)} onDone={refreshAgents} />
    </div>
  );
}

function GenericAdd({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: '',
    binary: '',
    sendArgs: '["{{message}}"]',
    versionArgs: '["--version"]',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      let sendArgs: string[];
      let versionArgs: string[];
      try {
        sendArgs = JSON.parse(form.sendArgs);
        versionArgs = JSON.parse(form.versionArgs);
      } catch {
        throw new Error('sendArgs/versionArgs must be valid JSON arrays');
      }
      await apiPost('/api/agents/register', {
        type: 'generic',
        name: form.name || form.binary,
        config: {
          binary: form.binary,
          sendArgs: JSON.stringify(sendArgs),
          versionArgs: JSON.stringify(versionArgs),
        },
      });
      await onDone();
      onClose();
      setForm({ name: '', binary: '', sendArgs: '["{{message}}"]', versionArgs: '["--version"]' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add generic CLI agent">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Wrap any command-line agent. Use <code className="rounded bg-ink-800 px-1">{"{{message}}"}</code> in
          sendArgs for the task text and <code className="rounded bg-ink-800 px-1">{"{{instance}}"}</code> for the
          selected instance.
        </p>
        <Field label="Name">
          <input
            className="input"
            value={form.name}
            placeholder="My Coding Agent"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Binary (command)">
          <input
            className="input font-mono"
            value={form.binary}
            placeholder="codex"
            onChange={(e) => setForm({ ...form, binary: e.target.value })}
          />
        </Field>
        <Field label="sendArgs (JSON array)">
          <input
            className="input font-mono"
            value={form.sendArgs}
            onChange={(e) => setForm({ ...form, sendArgs: e.target.value })}
          />
        </Field>
        <Field label="versionArgs (JSON array)">
          <input
            className="input font-mono"
            value={form.versionArgs}
            onChange={(e) => setForm({ ...form, versionArgs: e.target.value })}
          />
        </Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !form.binary} onClick={submit}>
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}