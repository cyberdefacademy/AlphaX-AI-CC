import os from 'os';
import path from 'path';
import { run, stream, which } from '../runner';
import { filesMatching, isServiceActive, procsFor, tailFile } from './parse';
import type {
  AgentAdapter,
  AgentInstance,
  AgentStatus,
  ChannelInfo,
  ConfigEntry,
  CronInfo,
  LogSource,
  SessionInfo,
  TaskOptions,
  TaskResult,
} from './types';

const BIN = 'hermes';
const SERVICE = 'hermes-gateway';

async function hermesVersion(): Promise<string | undefined> {
  try {
    const r = await run(BIN, ['--version'], { timeout: 10000 });
    const m = r.stdout.match(/v([\d.]+)/);
    return m ? m[1] : r.stdout.trim().split('\n')[0] || undefined;
  } catch {
    return undefined;
  }
}

const adapter: AgentAdapter = {
  type: 'hermes',
  displayName: 'Hermes Agent',
  description:
    'Self-improving AI agent (Nous Research) with messaging gateway, cron scheduler, sessions, skills, and memory.',
  hasGateway: true,
  installCatalog: {
    install:
      'git clone https://github.com/NousResearch/hermes-agent ~/.hermes/hermes-agent && cd ~/.hermes/hermes-agent && python3 -m venv venv && ./venv/bin/pip install --upgrade pip && ./venv/bin/pip install -r requirements.txt',
    uninstall: 'rm -rf ~/.hermes/hermes-agent',
    note: 'Clones the official Hermes Agent repo and creates a Python venv (same layout as the existing ~/.hermes install).',
  },

  async detect() {
    const bin = await which(BIN);
    if (!bin) return { found: false };
    return { found: true, binary: bin, version: await hermesVersion() };
  },

  async getStatus(agent): Promise<AgentStatus> {
    const bin = await which(BIN);
    const status: AgentStatus = {
      installed: Boolean(bin),
      binary: bin || undefined,
      running: false,
      service: SERVICE,
    };
    if (bin) status.version = await hermesVersion();
    try {
      status.running = await isServiceActive(SERVICE);
      const st = await run(BIN, ['status'], { timeout: 25000 });
      const modelLine = st.stdout.split('\n').find((l) => /Model:/i.test(l));
      const provLine = st.stdout.split('\n').find((l) => /Provider:/i.test(l));
      if (modelLine) status.model = modelLine.replace(/Model:\s*/, '').trim();
      if (provLine) status.provider = provLine.replace(/Provider:\s*/, '').trim();
      const active = st.stdout.split('\n').find((l) => /Active:/i.test(l));
      if (active) {
        if (/active\s*\(running\)|running/i.test(active)) status.running = true;
        status.detail = { jobservice: active.trim() };
      }
      status.healthy = status.running;
    } catch {
      /* ignore */
    }
    return status;
  },

  async listAgents(agent): Promise<AgentInstance[]> {
    try {
      const r = await run(BIN, ['gateway', 'list'], { timeout: 25000 });
      const instances: AgentInstance[] = [];
      for (const raw of r.stdout.split('\n')) {
        const m = raw.match(/^\s*([\w.\-@/]+)\s+\[(\w+)\]/);
        if (m) {
          instances.push({ id: m[1].trim(), name: m[1].trim() });
        }
      }
      if (!instances.length) instances.push({ id: 'default', name: 'default' });
      return instances;
    } catch {
      return [{ id: 'default', name: 'default' }];
    }
  },

  async sendMessage(agent, opts: TaskOptions, onLine?): Promise<TaskResult> {
    const args = ['-z', opts.prompt];
    const h = stream(BIN, args, { timeout: opts.timeout ?? 300000 }, onLine);
    const r = await h.done;
    return { ok: r.code === 0, stdout: r.stdout.trim(), stderr: r.stderr, code: r.code };
  },

  async startGateway() {
    return run(BIN, ['gateway', 'start'], { timeout: 60000 });
  },
  async stopGateway() {
    return run(BIN, ['gateway', 'stop'], { timeout: 60000 });
  },
  async restartGateway() {
    return run(BIN, ['gateway', 'restart'], { timeout: 120000 });
  },

  async listChannels(): Promise<ChannelInfo[]> {
    try {
      const r = await run(BIN, ['send', '--list'], { timeout: 20000 });
      const out = new Map<string, ChannelInfo>();
      for (const raw of r.stdout.split('\n')) {
        const m = raw.match(/^\s*([a-z0-9_-]+)([:#]\S+)?\b/i);
        if (m && m[1]) {
          const name = m[1];
          if (!out.has(name)) out.set(name, { name });
        }
      }
      return Array.from(out.values()).slice(0, 40);
    } catch {
      return [];
    }
  },

  async listModels(): Promise<never[]> {
    return [];
  },

  async listCron(): Promise<CronInfo[]> {
    try {
      const r = await run(BIN, ['cron', 'list'], { timeout: 25000 });
      return parseCron(r.stdout);
    } catch {
      return [];
    }
  },

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const r = await run(BIN, ['sessions', 'list', '--limit', '40'], { timeout: 25000 });
      return r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(
          (l) =>
            l &&
            !/^sessions?$/i.test(l) &&
            !/^Workspace/.test(l) &&
            !/^Title\s+Workspace/.test(l) &&
            !/^[-─]+$/.test(l) &&
            !/^[-─]{10,}/.test(l)
        )
        .map((id) => ({ id, source: 'hermes' }));
    } catch {
      return [];
    }
  },

  async getConfig(): Promise<ConfigEntry[]> {
    try {
      const r = await run(BIN, ['config', 'show'], { timeout: 25000 });
      const out: ConfigEntry[] = [];
      for (const raw of r.stdout.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('-')) continue;
        const idx = line.indexOf(':');
        if (idx < 1) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key && value) out.push({ key, value });
      }
      return out.slice(0, 200);
    } catch {
      return [];
    }
  },

  async setConfig(agent, key, value) {
    return run(BIN, ['config', 'set', key, value], { timeout: 30000 });
  },

  async getLogs(): Promise<LogSource[]> {
    const out: LogSource[] = [];
    const dirs = [path.join(os.homedir(), '.hermes', 'logs'), '/tmp/hermes'];
    for (const dir of dirs) {
      for (const f of filesMatching(dir, '.log')) {
        out.push({ name: (dir + '/' + f.split('/').pop()).replace(os.homedir(), '~'), path: f, lines: tailFile(f, 400) });
      }
    }
    return out;
  },

  async runCron(agent, cronId) {
    return run(BIN, ['cron', 'run', cronId], { timeout: 300000 });
  },
  async enableCron(agent, cronId) {
    return run(BIN, ['cron', 'resume', cronId], { timeout: 30000 });
  },
  async disableCron(agent, cronId) {
    return run(BIN, ['cron', 'pause', cronId], { timeout: 30000 });
  },

  async getProcesses() {
    return procsFor('hermes');
  },

  async runCommand(agent, args, opts) {
    return run(BIN, args, opts);
  },
};

function parseCron(text: string): CronInfo[] {
  const out: CronInfo[] = [];
  let cur: Partial<CronInfo> | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const idm = line.match(/^([0-9a-f]{10,})\s+\[(active|disabled)\]/);
    if (idm) {
      cur = { id: idm[1], schedule: '', name: '', lastStatus: idm[2] };
      out.push(cur as CronInfo);
      continue;
    }
    if (!cur) continue;
    const km = line.match(/^(Name|Schedule|Next run|Last run):\s*(.*)$/);
    if (!km) continue;
    const [, key, value] = km;
    if (key === 'Name') cur.name = value;
    else if (key === 'Schedule') cur.schedule = value;
    else if (key === 'Next run') cur.nextRun = value;
    else if (key === 'Last run') {
      cur.lastRun = value;
      if (/error:|failed/i.test(value)) cur.lastStatus = 'error';
      else if (cur.lastStatus !== 'error') cur.lastStatus = cur.lastStatus || 'ok';
    }
  }
  return out;
}

export default adapter;