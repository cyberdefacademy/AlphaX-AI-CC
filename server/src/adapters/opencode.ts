import os from 'os';
import path from 'path';
import { run, stream, which } from '../runner';
import { fileNames, procsFor } from './parse';
import type {
  AgentAdapter,
  AgentInstance,
  AgentStatus,
  LogSource,
  SessionInfo,
  TaskOptions,
  TaskResult,
} from './types';

const BIN = 'opencode';
const AGENTS_DIR = path.join(os.homedir(), '.config', 'opencode', 'agents');

async function opencodeVersion(): Promise<string | undefined> {
  try {
    const r = await run(BIN, ['--version'], { timeout: 10000 });
    return r.stdout.trim().split('\n')[0] || undefined;
  } catch {
    return undefined;
  }
}

const adapter: AgentAdapter = {
  type: 'opencode',
  displayName: 'opencode',
  description:
    'Open-source coding agent in your terminal. Headless one-shot mode via `opencode run`; agents live in ~/.config/opencode/agents.',
  hasGateway: false,
  installCatalog: {
    install: 'curl -fsSL https://opencode.ai/install | bash',
    uninstall: 'rm -f ~/.opencode/bin/opencode',
    note: 'Official opencode installer.',
  },

  async detect() {
    const bin = await which(BIN);
    if (!bin) return { found: false };
    return { found: true, binary: bin, version: await opencodeVersion() };
  },

  async getStatus(agent): Promise<AgentStatus> {
    const bin = await which(BIN);
    const status: AgentStatus = {
      installed: Boolean(bin),
      binary: bin || undefined,
      running: false,
    };
    if (bin) status.version = await opencodeVersion();
    const pids = await procsFor('opencode');
    status.running = pids.length > 0;
    status.healthy = status.running;
    return status;
  },

  async listAgents(agent): Promise<AgentInstance[]> {
    const names = fileNames(AGENTS_DIR, '.md');
    if (names.length) return names.map((n) => ({ id: n, name: n }));
    return [{ id: 'default', name: 'default (CLI)' }];
  },

  async sendMessage(agent, opts: TaskOptions, onLine?): Promise<TaskResult> {
    const args = ['run', opts.prompt];
    const h = stream(BIN, args, { timeout: opts.timeout ?? 300000 }, onLine);
    const r = await h.done;
    return { ok: r.code === 0, stdout: r.stdout.trim(), stderr: r.stderr, code: r.code };
  },

  async startGateway() {
    return { code: 1, stdout: '', stderr: 'opencode has no persistent gateway; it runs per command.' };
  },
  async stopGateway() {
    return { code: 0, stdout: 'No gateway to stop.', stderr: '' };
  },
  async restartGateway() {
    return { code: 1, stdout: '', stderr: 'opencode has no persistent gateway.' };
  },

  async listSessions(): Promise<SessionInfo[]> {
    const candidates = [
      path.join(os.homedir(), '.local', 'share', 'opencode'),
      path.join(os.homedir(), '.config', 'opencode', 'sessions'),
    ];
    const fs = require('fs');
    const out: SessionInfo[] = [];
    for (const base of candidates) {
      try {
        if (fs.existsSync(base)) {
          const walk = (dir: string, depth: number) => {
            if (depth > 3) return;
            for (const ent of fs.readdirSync(dir)) {
              const p = path.join(dir, ent);
              const st = fs.statSync(p);
              if (st.isDirectory()) walk(p, depth + 1);
              else if (ent.endsWith('.jsonl') || ent.endsWith('.json')) {
                out.push({ id: p.replace(os.homedir(), '~'), source: 'opencode' });
              }
            }
          };
          walk(base, 0);
        }
      } catch {
        /* ignore */
      }
    }
    return out.slice(-40).reverse();
  },

  async listChannels() {
    return [];
  },
  async listModels() {
    return [];
  },
  async listCron() {
    return [];
  },
  async getConfig() {
    return [];
  },

  async getLogs(): Promise<LogSource[]> {
    return [];
  },

  async getProcesses() {
    return procsFor('opencode');
  },

  async runCommand(agent, args, opts) {
    return run(BIN, args, opts);
  },
};

export default adapter;