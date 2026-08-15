import { Router, Request } from 'express';
import { getSessionPrincipal, parseCookies } from '../auth';
import { audit, requirePermission, type SecurityContext } from '../security';
import { isExecutionPaused, setExecutionPaused } from '../safety';
import { hub } from '../ws';

export const router = Router();

function principal(req: Request) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (!cookies.session) throw new Error('authenticated session required');
  const value = getSessionPrincipal(cookies.session);
  if (!value) throw new Error('authenticated session required');
  return value;
}

router.get('/status', (req, res) => {
  try {
    const p = principal(req);
    const ctx: SecurityContext = { actor: p.actor, role: p.role, risk: 'low' };
    requirePermission(ctx, 'security.read');
    res.json({ ok: true, executionPaused: isExecutionPaused() });
  } catch (e) {
    res.status(403).json({ error: String((e as Error).message) });
  }
});

router.post('/pause', (req, res) => {
  try {
    const p = principal(req);
    const ctx: SecurityContext = { actor: p.actor, role: p.role, risk: 'critical' };
    requirePermission(ctx, 'policy.manage');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    setExecutionPaused(ctx.actor, true, reason);
    audit(ctx.actor, 'safety.pause.requested', 'global', 'deny', { reason });
    hub.broadcast('execution:safety', { paused: true, actor: ctx.actor, reason });
    res.json({ ok: true, executionPaused: true });
  } catch (e) {
    res.status(403).json({ error: String((e as Error).message) });
  }
});

router.post('/resume', (req, res) => {
  try {
    const p = principal(req);
    const ctx: SecurityContext = { actor: p.actor, role: p.role, risk: 'critical' };
    requirePermission(ctx, 'policy.manage');
    setExecutionPaused(ctx.actor, false, typeof req.body?.reason === 'string' ? req.body.reason.trim() : '');
    audit(ctx.actor, 'safety.resume.requested', 'global', 'allow');
    hub.broadcast('execution:safety', { paused: false, actor: ctx.actor });
    res.json({ ok: true, executionPaused: false });
  } catch (e) {
    res.status(403).json({ error: String((e as Error).message) });
  }
});
