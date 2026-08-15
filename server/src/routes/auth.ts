import { Router, Request, Response } from 'express';
import {
  createSession,
  destroySession,
  generateToken,
  getSessionPrincipal,
  parseCookies,
  verifyToken,
} from '../auth';
import { SESSION_TTL_MS } from '../auth-session';

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

router.post('/login', (req: Request, res: Response) => {
  noStore(res);
  const { token } = (req.body || {}) as { token?: string };
  if (!token || typeof token !== 'string' || !verifyToken(token)) {
    res.status(401).json({ error: 'Invalid access token' });
    return;
  }
  const session = createSession('admin');
  setSessionCookie(req, res, session, Math.floor(SESSION_TTL_MS / 1000));
  res.json({ ok: true, role: 'admin' });
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
  const cookies = parseCookies(req.headers.cookie || '');
  const principal = cookies.session ? getSessionPrincipal(cookies.session) : null;
  if (!principal) {
    res.status(401).json({ configured: true, authenticated: false });
    return;
  }
  res.json({ configured: true, authenticated: true, actor: principal.actor, role: principal.role });
});

router.post('/rotate', (req: Request, res: Response) => {
  noStore(res);
  const cookies = parseCookies(req.headers.cookie || '');
  const principal = cookies.session ? getSessionPrincipal(cookies.session) : null;
  if (!principal || principal.role !== 'admin') {
    res.status(403).json({ error: 'admin role required' });
    return;
  }
  const raw = generateToken();
  res.json({ token: raw });
});