import os from 'os';
import path from 'path';
import fs from 'fs';
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

const BIN = 'claude';
const AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents');

function claudeLoggedIn(): boolean {
  try {
    return fs.existsSync(path.join(os.homedir(), '.claude', '.credentials.json'));
  } catch {
    return false;
  }
}

async function claudeVersion(): Promise<string | undefined> {
  try {
    const r = await run(BIN, ['--version'], { timeout: 10000 });
    const m = r.stdout.match(/(\d+\.\d+\.\d+)/);
    return m ? m[1] : r.stdout.trim().split('\n')[0] || undefined;
  } catch {
    return undefined;
  }
}

const adapter: AgentAdapter = {
  type: 'claude',
  displayName: 'Claude Code',
  description:
    'Anthropic\u2019s terminal coding agent. Headless one-shot mode via `claude -p`; agent definitions live in ~/.claude/agents.',
  hasGateway: false,
  installCatalog: {
    install: 'curl -fsSL https://claude.ai/install.sh | bash',
    uninstall: 'rm -f ~/.local/bin/claude',
    note: 'Official Claude Code installer. Requires an Anthropic login/token.',
  },

  async detect() {
    const bin = await which(BIN);
    if (!bin) return { found: false };
    return { found: true, binary: bin, version: await claudeVersion() };
  },

  async getStatus(agent): Promise<AgentStatus> {
    const bin = await which(BIN);
    const status: AgentStatus = {
      installed: Boolean(bin),
      binary: bin || undefined,
      running: false,
    };
    if (bin) status.version = await claudeVersion();
    const pids = await procsFor('claude');
    status.running = pids.length > 0;
    status.healthy = status.running;
    const loggedIn = claudeLoggedIn();
    status.auth = {
      loggedIn,
      hint: loggedIn
        ? undefined
        : 'Run `claude` and /login once in a terminal to authenticate Claude Code.',
    };
    return status;
  },

  async listAgents(agent): Promise<AgentInstance[]> {
    const names = fileNames(AGENTS_DIR, '.md');
    if (names.length) return names.map((n) => ({ id: n, name: n }));
    return [{ id: 'default', name: 'default (CLI)' }];
  },

  async sendMessage(agent, opts: TaskOptions, onLine?): Promise<TaskResult> {
    const notLoggedInMsg =
      'Claude Code is not logged in. Run `claude` and /login once in a terminal, then retry.';
    if (!claudeLoggedIn()) {
      return { ok: false, stdout: notLoggedInMsg, stderr: notLoggedInMsg, code: 1 };
    }
    const args = ['-p', opts.prompt, '--output-format', 'text'];
    const h = stream(BIN, args, { timeout: opts.timeout ?? 300000 }, onLine);
    const r = await h.done;
    const notLoggedIn = /Not logged in|Please run \/login/i.test(r.stderr + ' ' + r.stdout);
    const text = r.stdout.trim();
    return {
      ok: r.code === 0 || (!notLoggedIn && text.length > 0),
      stdout: notLoggedIn ? notLoggedInMsg : text,
      stderr: notLoggedIn ? notLoggedInMsg : r.stderr,
      code: r.code,
    };
  },

  async startGateway() {
    return { code: 1, stdout: '', stderr: 'Claude Code has no persistent gateway; it runs per command.' };
  },
  async stopGateway() {
    return { code: 0, stdout: 'No gateway to stop.', stderr: '' };
  },
  async restartGateway() {
    return { code: 1, stdout: '', stderr: 'Claude Code has no persistent gateway.' };
  },

  async listSessions(): Promise<SessionInfo[]> {
    const base = path.join(os.homedir(), '.claude', 'projects');
    const out: SessionInfo[] = [];
    try {
      const fs = require('fs');
      if (fs.existsSync(base)) {
        for (const proj of fs.readdirSync(base)) {
          const dir = path.join(base, proj);
          const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.jsonl'));
          for (const f of files.slice(-10)) {
            out.push({ id: `${proj}/${f}`, source: 'claude' });
          }
        }
      }
    } catch {
      /* ignore */
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
    return procsFor('claude');
  },

  async runCommand(agent, args, opts) {
    return run(BIN, args, opts);
  },
};

export default adapter;