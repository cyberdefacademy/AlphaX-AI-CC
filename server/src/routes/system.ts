import { Router, Request, Response } from 'express';
import { detectAll } from '../detector';
import { syncDetected, buildGenericConfig } from '../system';
import { listRegistered, getStatusFor, registerManual } from '../registry';
import { systemMetrics, metricSeries } from '../metrics';
import { buildFleetHealth } from '../recommend';
import { queueState } from '../queue';
import { adapterFor } from '../adapters';
import { presetFor, GENERIC_PRESETS } from '../installers';
import { streamShell } from '../runner';
import { hub } from '../ws';
import { addActivity } from '../db';

export const router = Router();

router.get('/overview', async (_req, res) => {
  const agents = listRegistered();
  const withStatus = [];
  for (const a of agents) {
    withStatus.push({ ...a, status: (await getStatusFor(a)) || null });
  }
  res.json({ agents: withStatus, system: systemMetrics() });
});

router.get('/metrics', async (_req, res) => {
  res.json(systemMetrics());
});

router.get('/metrics/series', (req, res) => {
  const minutes = Math.min(Math.max(Number(req.query.minutes) || 60, 5), 360);
  res.json({ points: metricSeries(minutes) });
});

router.get('/health', async (_req, res) => {
  res.json(await buildFleetHealth());
});

router.get('/queue', (_req, res) => {
  res.json(queueState());
});

router.post('/rescan', async (_req, res) => {
  const candidates = await detectAll();
  const registered = syncDetected(candidates);
  res.json({
    candidates,
    newlyRegistered: registered.map((r) => ({ id: r.id, type: r.type, name: r.name })),
  });
});

router.post('/detect', async (_req, res) => {
  const candidates = await detectAll();
  res.json({ candidates });
});

router.get('/detect/presets', (_req, res) => {
  const presets = Object.entries(GENERIC_PRESETS).map(([slug, p]) => ({
    slug,
    name: p.name,
    install: p.install,
    notes: p.notes,
  }));
  res.json({ presets });
});

router.post('/presets/:slug/install', (req, res) => {
  const slug = req.params.slug;
  const preset = presetFor(slug);
  if (!preset || !preset.install) {
    res.status(404).json({ error: 'No install command for preset ' + slug });
    return;
  }
  const config = buildGenericConfig(slug, undefined, preset.install);
  const rec = registerManual({ type: 'generic', name: preset.name, config });
  const s = streamShell(preset.install, { timeout: 10 * 60 * 1000 }, (line) => {
    hub.broadcast('install:line', { agentId: rec.id, line });
  });
  s.done.then((r) => {
    addActivity('install', `Install ${preset.name} finished (exit ${r.code})`, rec.id, {
      stderr: r.stderr.slice(-500),
    });
    hub.broadcast('install:done', { agentId: rec.id, code: r.code, stderr: r.stderr.slice(-500) });
  });
  res.json({ ok: true, agentId: rec.id, started: true, name: preset.name });
});

router.get('/adapter-types', (_req, res) => {
  res.json({ types: ['openclaw', 'hermes', 'claude', 'opencode', 'generic'] });
});

export const adapterInfo = (type: string) => {
  const a = adapterFor(type);
  return a
    ? { type: a.type, displayName: a.displayName, description: a.description, hasGateway: a.hasGateway, installCatalog: a.installCatalog }
    : null;
};