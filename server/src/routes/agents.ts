import { Router, Request, Response } from 'express';
import {
  listRegistered,
  getRegistered,
  registerManual,
  updateAgent,
  removeAgent,
  getStatusFor,
  refreshStatus,
  invalidateCache,
} from '../registry';
import { adapterFor } from '../adapters';
import { runAgentTask } from '../tasks';
import { addActivity, getDb } from '../db';
import { hub } from '../ws';
import { streamShell, runShell } from '../runner';
import { installerFor } from '../installers';
import { genericConfigFor } from '../system';

export const router = Router();

function agentOr404(res: Response, id: string) {
  const agent = getRegistered(id);
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return null;
  }
  return agent;
}

router.get('/', async (_req, res) => {
  const agents = listRegistered();
  const out = [];
  for (const a of agents) {
    out.push({ ...a, status: (await getStatusFor(a)) || null });
  }
  res.json({ agents: out });
});

router.post('/register', (req, res) => {
  const body = (req.body || {}) as {
    type?: string;
    name?: string;
    config?: Record<string, unknown>;
    preset?: string;
    binary?: string;
  };
  const type = body.type || 'generic';
  const name = body.name || body.preset || 'Custom agent';
  const config = body.config || {};
  if (body.preset && type === 'generic' && !config.binary) {
    Object.assign(config, genericConfigFor(body.preset, body.binary));
  }
  const rec = registerManual({ type, name, config });
  addActivity('register', `Registered agent ${rec.name} (${rec.type})`, rec.id);
  hub.broadcast('agents:changed', { id: rec.id });
  res.json({ agent: rec });
});

router.patch('/:id', (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const { name, enabled, config } = (req.body || {}) as {
    name?: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
  };
  const updated = updateAgent(agent.id, { name, enabled, config });
  addActivity('update', `Updated agent ${updated?.name}`, agent.id);
  hub.broadcast('agents:changed', { id: agent.id });
  res.json({ agent: updated });
});

router.delete('/:id', (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  removeAgent(agent.id);
  res.json({ ok: true });
});

router.get('/:id/status', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const status = await refreshStatus(agent);
  res.json({ status });
});

router.get('/:id/agents', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  if (!a) {
    res.status(400).json({ error: 'No adapter' });
    return;
  }
  const instances = await a.listAgents(agent);
  res.json({ instances });
});

router.post('/:id/send', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const { prompt, instance, timeout } = (req.body || {}) as {
    prompt?: string;
    instance?: string;
    timeout?: number;
  };
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  try {
    const task = await runAgentTask(agent.id, instance, prompt.trim(), timeout);
    res.json({ taskId: task.id, ok: true });
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message) });
  }
});

router.post('/:id/gateway/:action', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const action = req.params.action;
  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: 'action must be start|stop|restart' });
    return;
  }
  const a = adapterFor(agent.type);
  if (!a) {
    res.status(400).json({ error: 'No adapter' });
    return;
  }
  const fn = action === 'start' ? a.startGateway : action === 'stop' ? a.stopGateway : a.restartGateway;
  const result = await fn(agent);
  invalidateCache();
  addActivity('gateway', `${action} gateway for ${agent.name}`, agent.id, {
    code: result.code,
    stderr: result.stderr.slice(0, 300),
  });
  hub.broadcast('agents:changed', { id: agent.id });
  res.json({ result });
});

router.get('/:id/sessions', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  res.json({ sessions: a ? await a.listSessions(agent) : [] });
});

router.get('/:id/channels', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  res.json({ channels: a ? await a.listChannels(agent) : [] });
});

router.get('/:id/models', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  res.json({ models: a ? await a.listModels(agent) : [] });
});

router.get('/:id/cron', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  if (!a) {
    res.json({ cron: [] });
    return;
  }
  const cron = await a.listCron(agent);
  const { classifyResult } = await import('../classify');
  res.json({
    cron: cron.map((c) => ({
      ...c,
      class: c.class || classifyResult({ status: c.lastStatus === 'error' ? 'error' : 'ok', stderr: c.lastRun || '' }).class,
    })),
  });
});

router.post('/:id/cron/:cronId/:action', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const { cronId, action } = req.params;
  if (!['run', 'toggle'].includes(action)) {
    res.status(400).json({ error: 'action must be run|toggle' });
    return;
  }
  const a = adapterFor(agent.type);
  if (!a) {
    res.status(400).json({ error: 'No adapter' });
    return;
  }
  if (action === 'run') {
    if (!a.runCron) {
      res.status(400).json({ error: 'Cron run not supported for ' + agent.type });
      return;
    }
    const result = await a.runCron(agent, cronId);
    addActivity('cron', `Cron "${cronId}" triggered on ${agent.name}`, agent.id, { code: result.code, stderr: result.stderr.slice(0, 300) });
    res.json({ result });
    return;
  }
  const wasDisabled = String(req.body?.disabled === true || req.body?.enabled === false);
  if (wasDisabled === 'true' && a.enableCron) {
    const result = await a.enableCron(agent, cronId);
    addActivity('cron', `Cron "${cronId}" enabled on ${agent.name}`, agent.id, { code: result.code });
    res.json({ result, now: 'enabled' });
    return;
  }
  if (a.disableCron) {
    const result = await a.disableCron(agent, cronId);
    addActivity('cron', `Cron "${cronId}" disabled on ${agent.name}`, agent.id, { code: result.code });
    res.json({ result, now: 'disabled' });
    return;
  }
  res.status(400).json({ error: 'Cron toggle not supported for ' + agent.type });
});

router.post('/:id/ping', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  if (!a) {
    res.status(400).json({ error: 'No adapter' });
    return;
  }
  const started = Date.now();
  try {
    const result = await a.sendMessage(
      agent,
      { prompt: 'Reply with exactly: PONG', instance: req.body?.instance, timeout: 60000 },
      undefined
    );
    const ms = Date.now() - started;
    addActivity('ping', `Ping ${agent.name} (${result.ok ? 'ok' : 'failed'}, ${ms}ms)`, agent.id, {
      code: result.code,
      stderr: result.stderr.slice(0, 300),
    });
    res.json({ ok: result.ok, ms, stdout: result.stdout.slice(0, 300), stderr: result.stderr.slice(0, 300) });
  } catch (e) {
    res.status(400).json({ ok: false, ms: Date.now() - started, error: String((e as Error).message) });
  }
});

router.get('/:id/config', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  res.json({ config: a ? await a.getConfig(agent) : [], typeConfig: agent.config });
});

router.post('/:id/config', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const { key, value } = (req.body || {}) as { key?: string; value?: string };
  if (!key) {
    res.status(400).json({ error: 'key required' });
    return;
  }
  const a = adapterFor(agent.type);
  if (!a || !a.setConfig) {
    res.status(400).json({ error: 'Config write not supported for this agent type' });
    return;
  }
  const result = await a.setConfig(agent, key, String(value ?? ''));
  addActivity('config', `Set config ${key} on ${agent.name}`, agent.id, { code: result.code });
  res.json({ result });
});

router.get('/:id/logs', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  res.json({ logs: a ? await a.getLogs(agent) : [] });
});

router.get('/:id/processes', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const a = adapterFor(agent.type);
  res.json({ processes: a ? await a.getProcesses(agent) : [] });
});

router.post('/:id/command', async (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const { args } = (req.body || {}) as { args?: string[] };
  if (!Array.isArray(args)) {
    res.status(400).json({ error: 'args must be an array' });
    return;
  }
  const a = adapterFor(agent.type);
  if (!a) {
    res.status(400).json({ error: 'No adapter' });
    return;
  }
  const result = await a.runCommand(agent, args);
  res.json({ result });
});

router.post('/:id/install', (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const inst = installerFor(agent.type);
  const cmd = inst ? inst.install : ((agent.config.installCommand as string) ?? '');
  if (!cmd) {
    res.status(400).json({ error: 'No installer for ' + agent.type });
    return;
  }
  res.json({ install: cmd, uninstall: inst?.uninstall, note: inst?.note });
});

router.post('/:id/run-install', (req, res) => {
  const agent = agentOr404(res, req.params.id);
  if (!agent) return;
  const inst = installerFor(agent.type);
  const cmd = inst ? inst.install : ((agent.config.installCommand as string) ?? '');
  if (!cmd) {
    res.status(400).json({ error: 'No installer for ' + agent.type });
    return;
  }
  const stream = streamShell(cmd, { timeout: 10 * 60 * 1000 }, (line) => {
    hub.broadcast('install:line', { agentId: agent.id, line });
  });
  stream.done.then((r) => {
    addActivity('install', `Install ${agent.name} finished (exit ${r.code})`, agent.id);
    hub.broadcast('install:done', { agentId: agent.id, code: r.code, stderr: r.stderr.slice(-500) });
  });
  res.json({ ok: true, started: true });
});

export const agentsDb = getDb;