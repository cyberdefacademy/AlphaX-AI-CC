import { Router, Request } from 'express';
import { audit, createApproval, listApprovals, listAudit, resolveApproval, requirePermission, riskDecision, type RiskLevel, type SecurityContext } from '../security';

export const router = Router();

// Identity is intentionally server-derived for now. Never trust a role/actor supplied by a client.
// The existing application is single-user/local-first; session-backed identities will replace this
// fixed local administrator context when multi-user RBAC is introduced.
function context(req: Request): SecurityContext {
  return {
    actor: 'local-admin',
    role: 'admin',
    projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
    target: typeof req.body?.target === 'string' ? req.body.target : undefined,
    tool: typeof req.body?.tool === 'string' ? req.body.tool : undefined,
    risk: (req.body?.risk || 'low') as RiskLevel,
  };
}

router.get('/status', (req, res) => {
  const ctx = context(req);
  try {
    requirePermission(ctx, 'security.read');
    audit(ctx.actor, 'security.status.read', 'security');
    res.json({ ok: true, actor: ctx.actor, role: ctx.role, controlPlane: 'enabled' });
  } catch (e) {
    res.status(403).json({ error: String((e as Error).message) });
  }
});

router.post('/evaluate', (req, res) => {
  const ctx = context(req);
  try {
    requirePermission(ctx, 'security.read');
    const decision = riskDecision(ctx);
    audit(ctx.actor, 'policy.evaluate', ctx.tool, decision, { target: ctx.target, risk: ctx.risk });
    if (decision === 'approval_required') {
      const approvalId = createApproval(ctx, req.body?.request ?? req.body);
      res.json({ decision, approvalId });
      return;
    }
    res.json({ decision });
  } catch (e) {
    res.status(403).json({ error: String((e as Error).message) });
  }
});

router.get('/approvals', (req, res) => {
  const ctx = context(req);
  try {
    requirePermission(ctx, 'approvals.review');
    res.json({ approvals: listApprovals(typeof req.query.status === 'string' ? req.query.status : undefined) });
  } catch (e) {
    res.status(403).json({ error: String((e as Error).message) });
  }
});

router.post('/approvals/:id/approve', (req, res) => {
  const ctx = context(req);
  try {
    requirePermission(ctx, 'approvals.review');
    resolveApproval(req.params.id, ctx.actor, 'approved', String(req.body?.reason || 'Approved by operator'));
    res.json({ ok: true, status: 'approved' });
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message) });
  }
});

router.post('/approvals/:id/deny', (req, res) => {
  const ctx = context(req);
  try {
    requirePermission(ctx, 'approvals.review');
    resolveApproval(req.params.id, ctx.actor, 'denied', String(req.body?.reason || 'Denied by operator'));
    res.json({ ok: true, status: 'denied' });
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message) });
  }
});

router.get('/audit', (req, res) => {
  const ctx = context(req);
  try {
    requirePermission(ctx, 'audit.read');
    res.json({ events: listAudit(Number(req.query.limit || 200)) });
  } catch (e) {
    res.status(403).json({ error: String((e as Error).message) });
  }
});
