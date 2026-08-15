import { Router, Request } from 'express';
import { listMcpServers, listMcpTools, registerMcpServer, registerMcpTool } from '../mcp-gateway';
import { getSessionPrincipal, parseCookies } from '../auth';
import type { SecurityContext } from '../security';

export const router = Router();

function ctx(req: Request): SecurityContext {
  const cookies = parseCookies(req.headers.cookie || '');
  const principal = cookies.session ? getSessionPrincipal(cookies.session) : null;
  if (!principal) throw new Error('authenticated session required');
  return {
    actor: principal.actor,
    role: principal.role,
    projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
    target: typeof req.body?.target === 'string' ? req.body.target : undefined,
    tool: typeof req.body?.tool === 'string' ? req.body.tool : undefined,
    risk: req.body?.risk || 'low',
  };
}

function errorResponse(res: any, error: unknown): void {
  const message = String((error as Error).message || error);
  if (message.includes('authenticated session')) {
    res.status(401).json({ error: message });
    return;
  }
  if (message.startsWith('permission denied:')) {
    res.status(403).json({ error: message });
    return;
  }
  res.status(400).json({ error: message });
}

router.get('/servers', (_req, res) => res.json({ servers: listMcpServers() }));
router.get('/tools', (req, res) => res.json({ tools: listMcpTools(typeof req.query.serverId === 'string' ? req.query.serverId : undefined) }));

router.post('/servers', (req, res) => {
  try {
    const id = registerMcpServer(ctx(req), req.body);
    res.status(201).json({ id });
  } catch (e) {
    errorResponse(res, e);
  }
});

router.post('/servers/:id/tools', (req, res) => {
  try {
    const id = registerMcpTool(ctx(req), req.params.id, req.body);
    res.status(201).json({ id });
  } catch (e) {
    errorResponse(res, e);
  }
});
