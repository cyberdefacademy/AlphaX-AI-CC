import { Router, Request, Response } from 'express';
import {
  authenticatePassword,
  bootstrapTokenUser,
  createUserSession,
  destroySession,
  generateToken,
  getSessionPrincipal,
  parseCookies,
  revokeSessionsForUser,
  tokenConfigured,
  verifyToken,
} from '../auth';
import { SESSION_TTL_MS } from '../auth-session';
import {
  createUser,
  listUsers,
  setUserEnabled,
  setUserPassword,
  setUserRole,
  validatePassword,
  validateUsername,
  type AuthUser,
} from '../auth-users';
import { audit, hasPermission } from '../security';

export const router = Router();

function setSessionCookie(req: Request, res: Response, session: string, maxAgeSeconds: number): void {
  const forwardedProto = req.get('x-forwarded-proto');
  const secure = req.secure || forwardedProto === 'https';
  const secureFlag = secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `session=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secureFlag}`
  );
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

function currentPrincipal(req: Request) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies.session ? getSessionPrincipal(cookies.session) : null;
}

function requireAdmin(req: Request, res: Response): boolean {
  const principal = currentPrincipal(req);
  if (!principal) {
    res.status(401).json({ error: 'authenticated session required' });
    return false;
  }
  if (!hasPermission(principal.role, 'policy.manage')) {
    res.status(403).json({ error: 'admin permission required' });
    return false;
  }
  return true;
}

function publicUser(user: AuthUser): object {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    enabled: user.enabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

router.post('/login', (req: Request, res: Response) => {
  noStore(res);
  const body = (req.body || {}) as { token?: string; username?: string; password?: string };

  let user: AuthUser | null = null;
  if (typeof body.token === 'string' && body.token) {
    if (!verifyToken(body.token)) {
      res.status(401).json({ error: 'Invalid access token' });
      return;
    }
    user = bootstrapTokenUser();
  } else if (typeof body.username === 'string' && typeof body.password === 'string') {
    user = authenticatePassword(body.username, body.password);
    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
  } else {
    res.status(400).json({ error: 'provide either token or username/password' });
    return;
  }

  const session = createUserSession(user);
  setSessionCookie(req, res, session, Math.floor(SESSION_TTL_MS / 1000));
  audit(`user:${user.id}`, 'auth.login', user.id, 'allow', { username: user.username, role: user.role });
  res.json({ ok: true, user: publicUser(user) });
});

router.post('/logout', (req: Request, res: Response) => {
  noStore(res);
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.session) destroySession(cookies.session);
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

router.get('/status', (req: Request, res: Response) => {
  noStore(res);
  const principal = currentPrincipal(req);
  if (!principal) {
    res.status(401).json({ configured: tokenConfigured(), authenticated: false });
    return;
  }
  res.json({
    configured: tokenConfigured(),
    authenticated: true,
    actor: principal.actor,
    userId: principal.userId,
    username: principal.username,
    role: principal.role,
  });
});

router.post('/rotate', (req: Request, res: Response) => {
  noStore(res);
  if (!requireAdmin(req, res)) return;
  const principal = currentPrincipal(req)!;
  const raw = generateToken();
  audit(principal.actor, 'auth.token.rotated', principal.userId, 'allow');
  res.json({ token: raw });
});

router.get('/users', (req: Request, res: Response) => {
  noStore(res);
  if (!requireAdmin(req, res)) return;
  res.json({ users: listUsers().map(publicUser) });
});

router.post('/users', (req: Request, res: Response) => {
  noStore(res);
  if (!requireAdmin(req, res)) return;
  const principal = currentPrincipal(req)!;
  const body = (req.body || {}) as { username?: string; password?: string; role?: AuthUser['role'] };
  try {
    if (typeof body.username !== 'string' || typeof body.password !== 'string' || typeof body.role !== 'string') {
      throw new Error('username, password and role are required');
    }
    const username = validateUsername(body.username);
    validatePassword(body.password);
    const result = createUser(username, body.password, body.role);
    audit(principal.actor, 'auth.user.created', result.user.id, 'allow', { username: result.user.username, role: result.user.role });
    res.status(201).json({ user: publicUser(result.user) });
  } catch (error) {
    res.status(400).json({ error: String((error as Error).message) });
  }
});

router.patch('/users/:id/role', (req: Request, res: Response) => {
  noStore(res);
  if (!requireAdmin(req, res)) return;
  const principal = currentPrincipal(req)!;
  try {
    const role = (req.body || {}).role as AuthUser['role'];
    const user = setUserRole(req.params.id, role);
    revokeSessionsForUser(user.id);
    audit(principal.actor, 'auth.user.role_changed', user.id, 'allow', { role: user.role });
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: String((error as Error).message) });
  }
});

router.patch('/users/:id/enabled', (req: Request, res: Response) => {
  noStore(res);
  if (!requireAdmin(req, res)) return;
  const principal = currentPrincipal(req)!;
  try {
    const enabled = (req.body || {}).enabled;
    if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
    const user = setUserEnabled(req.params.id, enabled);
    if (!enabled) revokeSessionsForUser(user.id);
    audit(principal.actor, 'auth.user.enabled_changed', user.id, 'allow', { enabled: user.enabled });
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: String((error as Error).message) });
  }
});

router.patch('/users/:id/password', (req: Request, res: Response) => {
  noStore(res);
  const principal = currentPrincipal(req);
  if (!principal) {
    res.status(401).json({ error: 'authenticated session required' });
    return;
  }
  const isAdmin = hasPermission(principal.role, 'policy.manage');
  const isSelf = principal.userId === req.params.id;
  if (!isAdmin && !isSelf) {
    res.status(403).json({ error: 'admin permission required' });
    return;
  }
  try {
    const password = (req.body || {}).password;
    if (typeof password !== 'string') throw new Error('password is required');
    const user = setUserPassword(req.params.id, password);
    revokeSessionsForUser(user.id);
    audit(principal.actor, 'auth.user.password_changed', user.id, 'allow');
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: String((error as Error).message) });
  }
});
