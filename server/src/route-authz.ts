import { Request, Response, NextFunction } from 'express';
import { getSessionPrincipal, parseCookies } from './auth';
import { getDb } from './db';
import { audit, hasPermission, initSecuritySchema } from './security';

export function ensureRoutePermissions(): void {
  initSecuritySchema();
  const db = getDb();
  const now = new Date().toISOString();
  const permissionNames = ['security.read', 'missions.read', 'tools.read', 'audit.read'];
  for (const name of permissionNames) db.prepare('INSERT OR IGNORE INTO security_permissions(id,name,created_at) VALUES(?,?,?)').run(`route-${name}`, name, now);
  const roles = db.prepare("SELECT id,name FROM security_roles WHERE name IN ('security-analyst','pentester','auditor','viewer')").all() as { id: string; name: string }[];
  const permissions = db.prepare('SELECT id,name FROM security_permissions WHERE name IN (?,?,?,?)').all(...permissionNames) as { id: string; name: string }[];
  const grant = db.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)');
  for (const role of roles) for (const permission of permissions) if (role.name === 'viewer' || permission.name === 'missions.read') grant.run(role.id, permission.id);
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
function permissionFor(req: Request): string | null {
  const path = req.path.replace(/\/+$/, '') || '/';
  const method = req.method as Method;
  if (path === '/health' || path === '/auth/login') return null;
  if (path.startsWith('/auth/')) return null;
  if (path === '/mcp/execute' || /^\/agents\/[^/]+\/command$/.test(path)) return null;
  const [area, action] = path.split('/').filter(Boolean);
  const write = method !== 'GET';
  switch (area) {
    case 'system': return write ? 'tools.manage' : 'tools.read';
    case 'security':
    case 'security-platform':
    case 'scope': return write ? 'policy.manage' : 'security.read';
    case 'safety': return write ? 'policy.manage' : 'security.read';
    case 'mcp': return write ? 'tools.manage' : 'tools.read';
    case 'capabilities': return write ? 'tools.manage' : 'tools.read';
    case 'agents': return 'tools.read';
    case 'missions': return write ? (method === 'POST' && action !== 'execute' ? 'missions.create' : 'missions.execute') : 'missions.read';
    case 'tasks': return write ? 'missions.execute' : 'missions.read';
    case 'agent-router':
    case 'planner':
    case 'adaptive':
    case 'coordination': return write ? 'missions.execute' : 'missions.read';
    case 'intelligence':
    case 'correlation': return 'security.read';
    case 'approvals': return 'approvals.review';
    case 'missions-audit':
    case 'activity': return 'audit.read';
    default: return '__route_not_governed__';
  }
}

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  if (req.path === '/auth/login') { next(); return; }
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (!origin && fetchSite === 'cross-site') { res.status(403).json({ error: 'cross-site request blocked' }); return; }
  if (origin) {
    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto?.split(',')[0].trim() || req.protocol;
    const expected = `${protocol}://${req.get('host')}`;
    try { if (new URL(origin).origin !== expected) { res.status(403).json({ error: 'invalid request origin' }); return; } }
    catch { res.status(403).json({ error: 'invalid request origin' }); return; }
  }
  next();
}

export function authorizeRoute(req: Request, res: Response, next: NextFunction): void {
  ensureRoutePermissions();
  const permission = permissionFor(req);
  if (!permission) { next(); return; }
  const cookies = parseCookies(req.headers.cookie || '');
  const principal = cookies.session ? getSessionPrincipal(cookies.session) : null;
  if (!principal) { res.status(401).json({ error: 'authenticated session required' }); return; }
  if (permission === '__route_not_governed__') { audit(principal.actor, 'route.blocked', req.path, 'deny', { method: req.method, reason: 'route_not_governed' }); res.status(403).json({ error: 'route is not governed by an explicit security policy' }); return; }
  if (!hasPermission(principal.role, permission)) { audit(principal.actor, 'route.authorization_denied', req.path, 'deny', { method: req.method, permission }); res.status(403).json({ error: `permission denied: ${permission}` }); return; }
  next();
}
