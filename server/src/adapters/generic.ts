import { run, stream, which } from '../runner';
import { procsFor } from './parse';
import type {
  AgentAdapter,
  AgentInstance,
  AgentRecord,
  AgentStatus,
  TaskOptions,
  TaskResult,
} from './types';

function cfg(agent: AgentRecord): Record<string, string> {
  return (agent.config || {}) as Record<string, string>;
}

function template(args: string[] | undefined, vars: { message: string; instance: string }): string[] {
  if (!args || !args.length) return [];
  return args.map((a) =>
    a.replaceAll('{{message}}', vars.message).replaceAll('{{instance}}', vars.instance)
  );
}

function binary(agent: AgentRecord): string {
  return cfg(agent).binary || agent.name;
}

const adapter: AgentAdapter = {
  type: 'generic',
  displayName: 'Generic CLI Agent',
  description:
    'Wrap any command-line agent by defining its binary and a message template. Great for codex, aider, goose, ollama, and custom tools.',
  hasGateway: true,

  async detect() {
    const b = binary({ id: '', type: 'generic', name: '', detected: false, enabled: true, config: {} });
    const bin = await which(b);
    return { found: Boolean(bin), binary: bin || undefined };
  },

  async getStatus(agent): Promise<AgentStatus> {
    const b = binary(agent);
    const bin = await which(b);
    const status: AgentStatus = {
      installed: Boolean(bin),
      binary: bin || undefined,
      running: false,
    };
    if (bin && cfg(agent).versionArgs) {
      const r = await run(b, JSON.parse(cfg(agent).versionArgs || '[]') as string[], { timeout: 8000 });
      if (r.code === 0 && r.stdout.trim()) status.version = r.stdout.trim().split('\n')[0];
    }
    const pids = await procsFor(b);
    status.running = pids.length > 0;
    status.healthy = status.running;
    return status;
  },

  async listAgents(agent): Promise<AgentInstance[]> {
    if (cfg(agent).listArgs) {
      try {
        const args = JSON.parse(cfg(agent).listArgs as string) as string[];
        const r = await run(binary(agent), args, { timeout: 15000 });
        const out: AgentInstance[] = [];
        for (const line of r.stdout.split('\n')) {
          const id = line.trim();
          if (id && !/^name|^model|^-+$/.test(id)) out.push({ id, name: id });
        }
        if (out.length) return out;
      } catch {
        /* fall through */
      }
    }
    return [{ id: 'main', name: binary(agent) }];
  },

  async sendMessage(agent, opts: TaskOptions, onLine?): Promise<TaskResult> {
    const args = template(JSON.parse(cfg(agent).sendArgs || '[]') as string[], {
      message: opts.prompt,
      instance: opts.instance || 'main',
    });
    const h = stream(binary(agent), args, { timeout: opts.timeout ?? 300000 }, onLine);
    const r = await h.done;
    return { ok: r.code === 0, stdout: r.stdout.trim(), stderr: r.stderr, code: r.code };
  },

  async startGateway(agent) {
    if (cfg(agent).gatewayStartArgs) {
      const args = JSON.parse(cfg(agent).gatewayStartArgs as string) as string[];
      return run(binary(agent), args, { timeout: 30000 });
    }
    return { code: 1, stdout: '', stderr: 'No gateway start command configured for this agent.' };
  },
  async stopGateway(agent) {
    if (cfg(agent).gatewayStopArgs) {
      const args = JSON.parse(cfg(agent).gatewayStopArgs as string) as string[];
      return run(binary(agent), args, { timeout: 30000 });
    }
    return { code: 1, stdout: '', stderr: 'No gateway stop command configured for this agent.' };
  },
  async restartGateway(agent) {
    if (cfg(agent).gatewayRestartArgs) {
      const args = JSON.parse(cfg(agent).gatewayRestartArgs as string) as string[];
      return run(binary(agent), args, { timeout: 30000 });
    }
    return { code: 1, stdout: '', stderr: 'No gateway restart command configured for this agent.' };
  },

  async listSessions() {
    return [];
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
    const out = [];
    for (const [k, v] of Object.entries(cfg({ id: '', type: 'generic', name: '', detected: false, enabled: true, config: {} }) as Record<string, string>)) {
      out.push({ key: k, value: v });
    }
    return out as { key: string; value: string }[];
  },

  async getLogs() {
    return [];
  },

  async getProcesses(agent) {
    return procsFor(binary(agent));
  },

  async runCommand(agent, args, opts) {
    return run(binary(agent), args, opts);
  },
};

export default adapter;