import { Router, Request, Response } from 'express';
import { createSession, destroySession, generateToken, parseCookies, verifyToken } from '../auth';

export const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { token } = (req.body || {}) as { token?: string };
  if (!token || typeof token !== 'string' || !verifyToken(token)) {
    res.status(401).json({ error: 'Invalid access token' });
    return;
  }
  const session = createSession();
  res.setHeader(
    'Set-Cookie',
    `session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`
  );
  res.json({ ok: true });
});

router.post('/logout', (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.session) destroySession(cookies.session);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

router.get('/status', (_req, res) => {
  res.json({ configured: true, authenticated: true });
});

router.post('/rotate', (_req, res) => {
  const raw = generateToken();
  res.json({ token: raw });
});