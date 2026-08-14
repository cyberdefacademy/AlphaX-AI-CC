import React, { useState } from 'react';
import { Modal, Ladle } from '../components/ui';
import { IconKey } from '../components/Icons';
import { apiPost } from '../api';
import { useStore } from '../store';

export default function Settings() {
  const { system, agents, wsConnected, refreshAgents } = useStore();
  const [rotating, setRotating] = useState(false);
  const [newToken, setNewToken] = useState('');

  const rotate = async () => {
    if (!confirm('Rotate the access token? The current token will stop working immediately.')) return;
    setRotating(true);
    try {
      const r = await apiPost<{ token: string }>('/api/auth/rotate');
      setNewToken(r.token);
    } finally {
      setRotating(false);
    }
  };

  const logout = async () => {
    await apiPost('/api/auth/logout');
    location.hash = '#/login';
    location.reload();
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-500">Control-plane configuration for AlphaX Agents OS.</p>
      </header>

      <div className="space-y-6">
        <section className="card">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Dashboard</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Ladle label="Host" value={location.hostname} />
            <Ladle label="Port" value={location.port || '80'} />
            <Ladle label="Realtime link" value={wsConnected ? 'connected' : 'reconnecting'} />
            <Ladle label="Registered agents" value={String(agents.length)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => location.hash = '#/agents'}>
              Manage agents
            </button>
            <button className="btn btn-danger" onClick={logout}>
              Sign out
            </button>
          </div>
        </section>

        <section className="card">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Security</h3>
          <p className="mb-3 text-xs text-slate-500">
            The dashboard binds to 127.0.0.1 and every API call and WebSocket requires a session cookie set at
            login. No agent API keys are stored by this control plane.
          </p>
          <button className="btn btn-ghost" onClick={rotate} disabled={rotating}>
            <IconKey width={14} height={14} /> {rotating ? 'Rotating…' : 'Rotate access token'}
          </button>
          <p className="mt-2 text-xs text-slate-600">
            A new token is shown once. Your current token is only stored as a hash.
          </p>
        </section>

        <section className="card">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Detection</h3>
          <p className="text-xs text-slate-500">
            AlphaX Agents OS auto-scans your PATH, common config directories (~/.openclaw, ~/.hermes,
            ~/.claude, ~/.config/opencode), systemd user services, and known gateway ports every 60s (env:
            DETECT_INTERVAL), and re-registers anything new automatically.
          </p>
        </section>

        <section className="card">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Environment / config
          </h3>
          <pre className="rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-400">
{`ALPHAX_HOME        data directory (default ~/.alphax-agents-os)
PORT               dashboard port (default 8455)
HOST               bind address (default 127.0.0.1)
DETECT_INTERVAL    auto-rescan seconds (default 60)`}
          </pre>
        </section>
      </div>

      <Modal open={!!newToken} onClose={() => setNewToken('')} title="New access token">
        <p className="mb-3 text-xs text-slate-500">
          Copy this now — it will not be shown again. Use it on the sign-in screen.
        </p>
        <div className="flex gap-2">
          <input className="input font-mono" readOnly value={newToken} />
          <button
            className="btn btn-primary"
            onClick={() => {
              navigator.clipboard?.writeText(newToken);
              setNewToken('');
              refreshAgents();
            }}
          >
            Copy &amp; close
          </button>
        </div>
      </Modal>
    </div>
  );
}