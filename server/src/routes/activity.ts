import { Router } from 'express';
import { getDb } from '../db';

export const router = Router();

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const rows = getDb()
    .prepare('SELECT * FROM activity ORDER BY ts DESC LIMIT ?')
    .all(limit) as unknown as {
    id: string;
    ts: string;
    kind: string;
    agent_id: string | null;
    message: string;
    detail: string | null;
  }[];
  res.json({
    activity: rows.map((r) => ({
      ...r,
      detail: r.detail ? JSON.parse(r.detail) : null,
    })),
  });
});