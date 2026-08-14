import { createHash } from 'node:crypto';
import { getDb, randomId, nowIso } from './db';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Decision = 'allow' | 'deny' | 'approval_required';

export interface SecurityContext {
  actor: string;
  role: string;
  projectId?: string;
  target?: string;
  tool?: string;
  risk?: RiskLevel;
}

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function initSecuritySchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_roles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_permissions (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      PRIMARY KEY(role_id, permission_id)
    );
    CREATE TABLE IF NOT EXISTS security_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_scopes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      excluded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_policies (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      max_risk TEXT NOT NULL DEFAULT 'medium',
      require_approval_above TEXT NOT NULL DEFAULT 'medium',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_approvals (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      actor TEXT NOT NULL,
      tool TEXT NOT NULL,
      target TEXT,
      risk TEXT NOT NULL,
      request TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      decided_by TEXT,
      decision_reason TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT
    );
    CREATE TABLE IF NOT EXISTS security_audit (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT,
      decision TEXT,
      detail TEXT,
      previous_hash TEXT,
      event_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_security_audit_ts ON security_audit(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_security_approvals_status ON security_approvals(status);
  `);

  const roleCount = (db.prepare('SELECT COUNT(*) AS n FROM security_roles').get() as { n: number }).n;
  if (roleCount === 0) {
    const roles = ['admin', 'security-analyst', 'pentester', 'auditor', 'viewer'];
    const ins = db.prepare('INSERT INTO security_roles (id, name, created_at) VALUES (?, ?, ?)');
    for (const role of roles) ins.run(randomId(), role, nowIso());
  }
  const permissionNames = [
    'security.read', 'missions.create', 'missions.execute', 'tools.read',
    'tools.execute.low', 'tools.execute.medium', 'tools.execute.high',
    'tools.execute.critical', 'approvals.review', 'audit.read', 'policy.manage'
  ];
  const pIns = db.prepare('INSERT OR IGNORE INTO security_permissions (id, name, created_at) VALUES (?, ?, ?)');
  for (const name of permissionNames) pIns.run(randomId(), name, nowIso());

  const admin = db.prepare('SELECT id FROM security_roles WHERE name = ?').get('admin') as { id: string };
  const pentester = db.prepare('SELECT id FROM security_roles WHERE name = ?').get('pentester') as { id: string };
  const analyst = db.prepare('SELECT id FROM security_roles WHERE name = ?').get('security-analyst') as { id: string };
  const allPermissions = db.prepare('SELECT id, name FROM security_permissions').all() as { id: string; name: string }[];
  const rolePerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  for (const p of allPermissions) rolePerm.run(admin.id, p.id);
  for (const name of ['security.read', 'missions.create', 'missions.execute', 'tools.read', 'tools.execute.low', 'tools.execute.medium', 'approvals.review']) {
    const p = allPermissions.find((x) => x.name === name);
    if (p) rolePerm.run(pentester.id, p.id);
  }
  for (const name of ['security.read', 'tools.read', 'audit.read']) {
    const p = allPermissions.find((x) => x.name === name);
    if (p) rolePerm.run(analyst.id, p.id);
  }

  db.prepare(`INSERT OR IGNORE INTO security_policies
    (id, name, enabled, max_risk, require_approval_above, created_at, updated_at)
    VALUES (?, ?, 1, 'medium', 'medium', ?, ?)`)
    .run('default', 'default', nowIso(), nowIso());
}

export function hasPermission(role: string, permission: string): boolean {
  if (role === 'admin') return true;
  const row = getDb().prepare(`SELECT 1 FROM security_roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN security_permissions p ON p.id = rp.permission_id
    WHERE r.name = ? AND p.name = ?`).get(role, permission);
  return Boolean(row);
}

export function requirePermission(ctx: SecurityContext, permission: string): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new Error(`permission denied: ${permission}`);
  }
}

export function riskDecision(ctx: SecurityContext): Decision {
  const risk = ctx.risk ?? 'low';
  const policy = getDb().prepare('SELECT max_risk, require_approval_above FROM security_policies WHERE id = ? AND enabled = 1').get('default') as { max_risk: RiskLevel; require_approval_above: RiskLevel } | undefined;
  if (!policy) return 'deny';
  if (RISK_ORDER[risk] > RISK_ORDER[policy.max_risk]) return 'deny';
  if (RISK_ORDER[risk] >= RISK_ORDER[policy.require_approval_above]) return 'approval_required';
  return 'allow';
}

export function createApproval(ctx: SecurityContext, request: unknown, expiresMinutes = 30): string {
  const id = randomId();
  const expires = new Date(Date.now() + expiresMinutes * 60000).toISOString();
  getDb().prepare(`INSERT INTO security_approvals
    (id, project_id, actor, tool, target, risk, request, status, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .run(id, ctx.projectId ?? null, ctx.actor, ctx.tool ?? 'unknown', ctx.target ?? null, ctx.risk ?? 'low', JSON.stringify(request), expires, nowIso());
  audit(ctx.actor, 'approval.requested', id, 'approval_required', { tool: ctx.tool, target: ctx.target, risk: ctx.risk });
  return id;
}

export function resolveApproval(id: string, actor: string, decision: 'approved' | 'denied', reason = ''): void {
  const result = getDb().prepare(`UPDATE security_approvals SET status = ?, decided_by = ?, decision_reason = ?, decided_at = ? WHERE id = ? AND status = 'pending'`).run(decision, actor, reason, nowIso(), id);
  if (Number(result.changes) !== 1) throw new Error('approval not found or already resolved');
  audit(actor, `approval.${decision}`, id, decision, { reason });
}

export function audit(actor: string, action: string, resource?: string, decision?: string, detail?: unknown): void {
  const db = getDb();
  const previous = db.prepare('SELECT event_hash FROM security_audit ORDER BY ts DESC LIMIT 1').get() as { event_hash: string } | undefined;
  const ts = nowIso();
  const payload = JSON.stringify({ ts, actor, action, resource: resource ?? null, decision: decision ?? null, detail: detail ?? null, previous_hash: previous?.event_hash ?? null });
  const eventHash = createHash('sha256').update(payload).digest('hex');
  db.prepare(`INSERT INTO security_audit (id, ts, actor, action, resource, decision, detail, previous_hash, event_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomId(), ts, actor, action, resource ?? null, decision ?? null, detail ? JSON.stringify(detail) : null, previous?.event_hash ?? null, eventHash);
}

export function listApprovals(status?: string): unknown[] {
  if (status) return getDb().prepare('SELECT * FROM security_approvals WHERE status = ? ORDER BY created_at DESC').all(status);
  return getDb().prepare('SELECT * FROM security_approvals ORDER BY created_at DESC').all();
}

export function listAudit(limit = 200): unknown[] {
  return getDb().prepare('SELECT * FROM security_audit ORDER BY ts DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 1000));
}
