import { Router, Request } from 'express';
import { audit, requirePermission, type RiskLevel, type SecurityContext } from '../security';
import { addMissionTask, createMission, getMission, initOrchestrationSchema, listMissions, updateMissionStatus } from '../orchestration';

export const router = Router();
initOrchestrationSchema();

function context(req: Request): SecurityContext {
  return {
    actor: 'local-admin',
    role: 'admin',
    projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
    target: typeof req.body?.target === 'string' ? req.body.target : undefined,
    risk: (req.body?.risk || 'low') as RiskLevel,
  };
}

router.get('/', (req, res) => {
  try {
    const ctx = context(req);
    requirePermission(ctx, 'security.read');
    res.json({ missions: listMissions() });
  } catch (e) { res.status(403).json({ error: String((e as Error).message) }); }
});

router.post('/', (req, res) => {
  try {
    const ctx = context(req);
    const id = createMission(ctx, req.body);
    res.status(201).json({ id, status: 'draft' });
  } catch (e) { res.status(400).json({ error: String((e as Error).message) }); }
});

router.get('/:id', (req, res) => {
  try {
    const ctx = context(req);
    requirePermission(ctx, 'security.read');
    res.json(getMission(req.params.id));
  } catch (e) { res.status(404).json({ error: String((e as Error).message) }); }
});

router.post('/:id/tasks', (req, res) => {
  try {
    const ctx = context(req);
    const result = addMissionTask(ctx, { ...req.body, missionId: req.params.id });
    res.status(201).json(result);
  } catch (e) { res.status(400).json({ error: String((e as Error).message) }); }
});

router.post('/:id/status', (req, res) => {
  try {
    const ctx = context(req);
    updateMissionStatus(ctx, req.params.id, req.body?.status);
    audit(ctx.actor, 'mission.status.api', req.params.id, 'allow', { status: req.body?.status });
    res.json({ ok: true, status: req.body?.status });
  } catch (e) { res.status(400).json({ error: String((e as Error).message) }); }
});
