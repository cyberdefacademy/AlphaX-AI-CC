import { Router, Request } from 'express';
import { requirePermission, type SecurityContext } from '../security';
import { normalizeResult, listNormalizedResults, type NormalizedResult } from '../result-intelligence';
import { getFinding, listFindings, validateFinding, closeFinding } from '../findings';
import { getEvidence } from '../evidence';
import { listTechniques, mapFinding } from '../mitre';
import { listCorrelations } from '../correlation';

export const router = Router();

const ctx = (req: Request): SecurityContext => ({
  actor: 'local-admin', role: 'admin',
  projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
  target: typeof req.body?.target === 'string' ? req.body.target : undefined,
  risk: req.body?.risk ?? 'low', tool: req.body?.tool,
});

function guard(req: Request): SecurityContext { const c = ctx(req); requirePermission(c, 'security.read'); return c; }

router.post('/normalize', (req, res) => { try { const c = ctx(req); requirePermission(c, 'missions.execute'); res.json(normalizeResult(c, req.body as NormalizedResult)); } catch (e) { res.status(400).json({ error: String((e as Error).message) }); } });
router.get('/results', (req, res) => { try { guard(req); res.json({ results: listNormalizedResults(typeof req.query.missionId === 'string' ? req.query.missionId : undefined) }); } catch (e) { res.status(403).json({ error: String((e as Error).message) }); } });
router.get('/findings', (req, res) => { try { guard(req); res.json({ findings: listFindings({ missionId: typeof req.query.missionId === 'string' ? req.query.missionId : undefined, status: typeof req.query.status === 'string' ? req.query.status as any : undefined }) }); } catch (e) { res.status(403).json({ error: String((e as Error).message) }); } });
router.get('/findings/:id', (req, res) => { try { guard(req); res.json(getFinding(req.params.id)); } catch (e) { res.status(404).json({ error: String((e as Error).message) }); } });
router.post('/findings/:id/review', (req, res) => { try { const c = ctx(req); requirePermission(c, 'security.write'); if (typeof req.body?.valid !== 'boolean') throw new Error('valid boolean is required'); validateFinding(c.actor, req.params.id, req.body.valid, req.body.confidence); res.json(getFinding(req.params.id)); } catch (e) { res.status(400).json({ error: String((e as Error).message) }); } });
router.post('/findings/:id/close', (req, res) => { try { const c = ctx(req); requirePermission(c, 'security.write'); closeFinding(c.actor, req.params.id); res.json(getFinding(req.params.id)); } catch (e) { res.status(400).json({ error: String((e as Error).message) }); } });
router.post('/findings/:id/techniques', (req, res) => { try { const c = ctx(req); requirePermission(c, 'security.write'); if (typeof req.body?.techniqueId !== 'string') throw new Error('techniqueId is required'); mapFinding(req.params.id, req.body.techniqueId, Number(req.body?.confidence ?? 1), c.actor); res.json(getFinding(req.params.id)); } catch (e) { res.status(400).json({ error: String((e as Error).message) }); } });
router.get('/evidence/:id', (req, res) => { try { guard(req); res.json(getEvidence(req.params.id)); } catch (e) { res.status(404).json({ error: String((e as Error).message) }); } });
router.get('/techniques', (req, res) => { try { guard(req); res.json({ techniques: listTechniques() }); } catch (e) { res.status(403).json({ error: String((e as Error).message) }); } });
router.get('/correlations', (req, res) => { try { guard(req); res.json({ correlations: listCorrelations(typeof req.query.missionId === 'string' ? req.query.missionId : undefined) }); } catch (e) { res.status(403).json({ error: String((e as Error).message) }); } });
