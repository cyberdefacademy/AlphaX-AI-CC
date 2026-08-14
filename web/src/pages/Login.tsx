import React, { useState } from 'react';
import { apiPost } from '../api';
import { useStore } from '../store';

export default function Login() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { refreshAgents } = useStore();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/auth/login', { token });
      await refreshAgents();
      location.hash = '#/';
      location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-cyan text-xl font-bold text-white shadow-glow">
            A
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AlphaX Agents OS</h1>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              local control plane for your AI agents
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="card">
          <h2 className="mb-1 text-sm font-semibold text-white">Sign in</h2>
          <p className="mb-4 text-xs text-slate-500">
            Enter the access token printed when the dashboard first started (Settings ▸ Rotate token to
            get a new one).
          </p>
          <input
            className="input font-mono"
            placeholder="ax-…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
          />
          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
          <button className="btn btn-primary mt-4 w-full justify-center" disabled={busy || !token}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}