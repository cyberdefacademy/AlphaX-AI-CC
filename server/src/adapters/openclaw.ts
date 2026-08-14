import { run, stream, which } from '../runner';
import { filesMatching, procsFor, tailFile } from './parse';
import type {
  AgentAdapter,
  AgentInstance,
  AgentRecord,
  AgentStatus,
  ChannelInfo,
  ConfigEntry,
  CronInfo,
  ModelInfo,
  LogSource,
  SessionInfo,
  TaskOptions,
  TaskResult,
} from './types';

const BIN = 'openclaw';

async function openclawVersion(): Promise<string | undefined> {
  try {
    const r = await run(BIN, ['--version'], { timeout: 10000 });
    const m = r.stdout.match(/OpenClaw\s+([\w.\-+]+)/);
    return m ? m[1] : r.stdout.trim().split('\n')[0] || undefined;
  } catch {
    return undefined;
  }
}

const adapter: AgentAdapter = {
  type: 'openclaw',
  displayName: 'OpenClaw',
  description:
    'Personal AI assistant with a local Gateway control plane — agents, routing, channels, skills, memory, and cron.',
  hasGateway: true,
  installCatalog: {
    install: 'npm install -g openclaw@latest',
    uninstall: 'npm uninstall -g openclaw',
    note: 'Installs via npm (Node.js required).',
  },

  async detect() {
    const bin = await which(BIN);
    if (!bin) return { found: false };
    return { found: true, binary: bin, version: await openclawVersion() };
  },

  async getStatus(agent) {
    const bin = await which(BIN);
    const status: AgentStatus = {
      installed: Boolean(bin),
      binary: bin || undefined,
      running: false,
      service: 'openclaw-gateway',
    };
    if (bin) status.version = await openclawVersion();
    try {
      const gw = await run(BIN, ['gateway', 'status'], { timeout: 25000 });
      if (/Runtime:\s*running/i.test(gw.stdout)) {
        status.running = true;
        status.healthy = /Connectivity probe:\s*ok/i.test(gw.stdout);
      }
      const m = gw.stdout.match(/Listening:\s*(.+)/i);
      if (m) status.detail = { listening: m[1].trim() };
    } catch {
      /* gateway may be down */
    }
    try {
      const ag = await run(BIN, ['agents', 'list'], { timeout: 25000 });
      const modelLine = ag.stdout.split('\n').find((l) => /Model:/.test(l));
      if (modelLine) status.model = modelLine.replace(/Model:\s*/, '').trim();
    } catch {
      /* ignore */
    }
    return status;
  },

  async listAgents(agent) {
    const r = await run(BIN, ['agents', 'list'], { timeout: 25000 });
    const instances: AgentInstance[] = [];
    let current: Partial<AgentInstance> | null = null;
    for (const raw of r.stdout.split('\n')) {
      const line = raw.trim().replace(/\u001b\[[0-9;]*m/g, '');
      if (!line.startsWith('- ')) {
        if (current && /Model:/.test(line)) current.model = line.replace(/Model:\s*/, '').trim();
        else if (current && /Workspace:/.test(line))
          current.workspace = line.replace(/Workspace:\s*/, '').trim();
        continue;
      }
      const m = line.match(/^- ([A-Za-z0-9][A-Za-z0-9._@/+-]*)(?=$|\s+\(default\)|\s+--)/);
      if (m) {
        const id = m[1];
        const rest = line.slice(2).trim();
        const name = /^[A-Za-z0-9._@/+-]+$/.test(rest) ? rest : id + (/(\(default\)--?)/.test(rest) ? ' (default)' : '');
        current = { id, name };
        instances.push(current as AgentInstance);
      }
    }
    if (!instances.length) instances.push({ id: 'main', name: 'main (default)' });
    return instances;
  },

  async sendMessage(agent, opts: TaskOptions, onLine?): Promise<TaskResult> {
    let instance = opts.instance ? String(opts.instance).trim() : '';
    instance = instance.replace(/\s+\(default\)$/i, '').split(/\s+/)[0] || '';
    if (!instance) instance = 'main';
    const args = ['agent'];
    if (instance) args.push('--agent', instance);
    args.push('--message', opts.prompt, '--json');
    const h = stream(BIN, args, { timeout: opts.timeout ?? 300000 }, onLine);
    const r = await h.done;
    let ok = r.code === 0;
    let text = r.stdout;
    try {
      const j = JSON.parse(r.stdout);
      if (j && (j.error || j.status === 'error')) ok = false;
      const reply = j?.reply || j?.result || j?.message || j?.text;
      if (reply) text = String(reply);
    } catch {
      /* non-JSON output */
    }
    return { ok, stdout: text.trim(), stderr: r.stderr, code: r.code };
  },

  async startGateway() {
    return run(BIN, ['gateway', 'start'], { timeout: 60000 });
  },
  async stopGateway() {
    return run(BIN, ['gateway', 'stop'], { timeout: 60000 });
  },
  async restartGateway() {
    return run(BIN, ['gateway', 'restart'], { timeout: 90000 });
  },

  async listChannels(): Promise<ChannelInfo[]> {
    const r = await run(BIN, ['channels', 'list'], { timeout: 25000 });
    const out: ChannelInfo[] = [];
    for (const raw of r.stdout.split('\n')) {
      const line = raw.trim();
      const m = line.match(/^([a-z0-9][a-z0-9-]*)/i);
      if (m && !/^(channel|name|account|all|—|─|-+)$/i.test(m[1])) {
        out.push({ name: m[1] });
      }
    }
    return out;
  },

  async listModels(): Promise<ModelInfo[]> {
    const r = await run(BIN, ['models', 'list'], { timeout: 25000 });
    const out: ModelInfo[] = [];
    for (const raw of r.stdout.split('\n')) {
      const line = raw.trim();
      const id = line.split(/\s+/)[0];
      if (
        id &&
        !/^(Model|-+)$/.test(id) &&
        !line.startsWith('Model') &&
        id !== ''
      ) {
        out.push({ id, local: /ollama|local\b/i.test(line) });
      }
    }
    return out.slice(0, 120);
  },

  async listCron(): Promise<CronInfo[]> {
    try {
      const r = await run(BIN, ['cron', 'list'], { timeout: 25000 });
      return parseCronBlocks(r.stdout);
    } catch {
      return [];
    }
  },

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const r = await run(BIN, ['sessions', 'list'], { timeout: 25000 });
      return r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^sessions?$/i.test(l))
        .slice(0, 40)
        .map((id) => ({ id, source: 'gateway' }));
    } catch {
      return [];
    }
  },

  async getConfig(): Promise<ConfigEntry[]> {
    return [];
  },
  async setConfig(agent, key, value) {
    return run(BIN, ['config', 'set', key, value], { timeout: 30000 });
  },

  async getLogs(): Promise<LogSource[]> {
    const out: LogSource[] = [];
    for (const f of filesMatching('/tmp/openclaw', '.log')) {
      out.push({ name: 'gateway:' + (f.split('/').pop() || 'log'), path: f, lines: tailFile(f, 400) });
    }
    return out;
  },

  async runCron(agent, cronId) {
    return run(BIN, ['cron', 'run', cronId], { timeout: 300000 });
  },
  async enableCron(agent, cronId) {
    return run(BIN, ['cron', 'enable', cronId], { timeout: 30000 });
  },
  async disableCron(agent, cronId) {
    return run(BIN, ['cron', 'disable', cronId], { timeout: 30000 });
  },

  async getProcesses() {
    return procsFor('openclaw');
  },

  async runCommand(agent: AgentRecord, args: string[], opts) {
    return run(BIN, args, opts);
  },
};

function parseCronBlocks(text: string): CronInfo[] {
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
    const km = line.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (!km) continue;
    const k = km[1].trim().toLowerCase();
    const v = km[2].trim();
    if (k === 'name') cur.name = v;
    else if (k === 'schedule') cur.schedule = v;
    else if (k === 'next') cur.nextRun = v;
    else if (/last run/.test(k)) {
      cur.lastRun = v;
      if (/error:/i.test(v)) cur.lastStatus = 'error';
      else if (/ok|success/i.test(v) && cur.lastStatus === 'active') cur.lastStatus = 'success';
    }
  }
  return out;
}

export default adapter;