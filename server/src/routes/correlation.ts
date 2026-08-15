import { Router, Request } from 'express';
import { requirePermission, type SecurityContext } from '../security';
import { correlate, listCorrelations, type CorrelationInput } from '../correlation';

export const router = Router();
const ctx = (req: Request): SecurityContext => ({ actor: 'local-admin', role: 'admin', projectId: req.body?.projectId, target: req.body?.target, risk: req.body?.risk ?? 'low' });
router.get('/', (req, res) => { try { const c = ctx(req); requirePermission(c, 'security.read'); res.json({ correlations: listCorrelations(typeof req.query.missionId === 'string' ? req.query.missionId : undefined) }); } catch (e) { res.status(403).json({ error: String((e as Error).message) }); } });
router.post('/', (req, res) => { try { const c = ctx(req); requirePermission(c, 'missions.execute'); res.json(correlate(c, req.body as CorrelationInput)); } catch (e) { res.status(400).json({ error: String((e as Error).message) }); } });
