import React, { useEffect, useState } from 'react';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Agents from './pages/Agents';
import AgentDetail from './pages/AgentDetail';
import Health from './pages/Health';
import Tasks from './pages/Tasks';
import Activity from './pages/Activity';
import Settings from './pages/Settings';
import { IconHome, IconCpu, IconTask, IconActivity, IconSettings } from './components/Icons';
import { apiGet } from './api';
import { useStore } from './store';

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => {
      setHash(location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  const { loaded, wsConnected } = useStore();
  const [authed, setAuthed] = useState<null | boolean>(null);

  useEffect(() => {
    apiGet<{ authenticated: boolean }>('/api/auth/status')
      .then(() => setAuthed(true))
      .catch(() => {
        setAuthed(false);
        location.hash = '#/login';
      });
  }, []);

  useEffect(() => {
    const onAuth = () => {
      setAuthed(false);
      location.hash = '#/login';
    };
    window.addEventListener('auth:expired', onAuth);
    return () => window.removeEventListener('auth:expired', onAuth);
  }, []);

  if (authed === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
      </div>
    );
  }

  if (hash === '#/login' || !authed) return <Login />;

  if (hash.startsWith('#/agents/')) {
    const id = hash.split('#/agents/')[1];
    return <AgentDetail id={id} />;
  }

  const page =
    hash === '#/agents' ? <Agents /> : hash === '#/tasks' ? <Tasks /> : hash === '#/activity' ? <Activity /> : hash === '#/settings' ? <Settings /> : <Overview />;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-ink-700/60 bg-ink-900">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-cyan text-sm font-bold text-white">
            A
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide text-white">AlphaX</div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
              Agents OS
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <NavLink href="#/" active={hash === '#/'}>
            <IconHome width={16} height={16} /> Overview
          </NavLink>
          <NavLink href="#/agents" active={hash === '#/agents'}>
            <IconCpu width={16} height={16} /> Agents
          </NavLink>
          <NavLink href="#/tasks" active={hash === '#/tasks'}>
            <IconTask width={16} height={16} /> Tasks
          </NavLink>
          <NavLink href="#/activity" active={hash === '#/activity'}>
            <IconActivity width={16} height={16} /> Activity
          </NavLink>
          <NavLink href="#/settings" active={hash === '#/settings'}>
            <IconSettings width={16} height={16} /> Settings
          </NavLink>
        </nav>
        <div className="border-t border-ink-700/60 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span
              className={`inline-block h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
              style={{ boxShadow: wsConnected ? '0 0 6px #34d399' : '0 0 6px #fbbf24' }}
            />
            {wsConnected ? 'live link' : 'reconnecting…'} · local
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{page}</main>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-ink-800 text-white ring-1 ring-ink-600' : 'text-slate-400 hover:bg-ink-800/60 hover:text-white'
      }`}
    >
      {children}
    </a>
  );
}