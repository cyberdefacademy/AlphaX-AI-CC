import express, { Express, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { parseCookies, validSession } from './auth';
import { router as authRouter } from './routes/auth';
import { router as systemRouter } from './routes/system';
import { router as agentsRouter } from './routes/agents';
import { router as activityRouter } from './routes/activity';
import { router as tasksRouter } from './routes/tasks';
import { prometheusHandler, observeHttp } from './metricsProm';
import { error as logError } from './logger';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  app.use('/metrics', prometheusHandler);

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health' || req.path === '/auth/login') {
      next();
      return;
    }
    const cookies = parseCookies(req.headers.cookie || '');
    if (!cookies.session || !validSession(cookies.session)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'alphax-agents-os', time: new Date().toISOString() });
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => observeHttp(req, res));
    next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/tasks', tasksRouter);

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  const dist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        next();
        return;
      }
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send(
          'AlphaX Agents OS server is running but the web UI has not been built yet.\n\n' +
            'Run `npm run build` at the project root, then restart with `npm start`.'
        );
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logError('http error', { message: String(err.message || err), stack: err.stack });
    res.status(500).json({ error: String(err.message || err) });
  });

  return app;
}