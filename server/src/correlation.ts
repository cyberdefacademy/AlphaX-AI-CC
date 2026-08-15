import { getDb, nowIso, randomId } from './db';
import { audit, type SecurityContext } from './security';

export interface CorrelationInput {
  taskId: string;
  missionId: string;
  evidence: string[];
  findings: Array<string | { id: string; key?: string }>;
  attackTechniques: string[];
  confidence: number;
}

export function initCorrelationSchema(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS finding_correlations(
    id TEXT PRIMARY KEY,mission_id TEXT NOT NULL,task_id TEXT NOT NULL,correlation_key TEXT NOT NULL,
    kind TEXT NOT NULL,confidence REAL NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,evidence_json TEXT NOT NULL DEFAULT '[]',attack_json TEXT NOT NULL DEFAULT '[]',
    UNIQUE(mission_id,correlation_key)
  ); CREATE TABLE IF NOT EXISTS correlation_links(
    id TEXT PRIMARY KEY,correlation_id TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,UNIQUE(correlation_id,entity_type,entity_id)
  );`);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function correlate(ctx: SecurityContext, input: CorrelationInput): unknown[] {
  if (!input.taskId || !input.missionId) throw new Error('taskId and missionId are required');
  const db = getDb(), out: unknown[] = [];
  for (const item of input.findings ?? []) {
    const findingId = typeof item === 'string' ? undefined : item.id;
    const keyText = typeof item === 'string' ? item : (item.key ?? item.id);
    if (!keyText.trim()) continue;
    const key = `finding:${norm(keyText)}`;
    const old = db.prepare('SELECT * FROM finding_correlations WHERE mission_id=? AND correlation_key=?').get(input.missionId, key) as Record<string, any> | undefined;
    const confidence = clamp(input.confidence);
    const ts = nowIso();
    if (old) {
      const mergedEvidence = [...new Set([...JSON.parse(String(old.evidence_json || '[]')), ...(input.evidence ?? [])])];
      const mergedAttack = [...new Set([...JSON.parse(String(old.attack_json || '[]')), ...(input.attackTechniques ?? [])])];
      db.prepare('UPDATE finding_correlations SET last_seen=?,count=count+1,confidence=?,evidence_json=?,attack_json=? WHERE id=?')
        .run(ts, Math.max(Number(old.confidence), confidence), JSON.stringify(mergedEvidence), JSON.stringify(mergedAttack), old.id);
      const correlationId = String(old.id);
      if (findingId) db.prepare('INSERT OR IGNORE INTO correlation_links(id,correlation_id,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)').run(randomId(), correlationId, 'finding', findingId, ts);
      for (const evidenceId of input.evidence ?? []) db.prepare('INSERT OR IGNORE INTO correlation_links(id,correlation_id,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)').run(randomId(), correlationId, 'evidence', evidenceId, ts);
      out.push({ id: correlationId, kind: 'existing', confidence: Math.max(Number(old.confidence), confidence) });
    } else {
      const id = randomId();
      db.prepare('INSERT INTO finding_correlations(id,mission_id,task_id,correlation_key,kind,confidence,first_seen,last_seen,evidence_json,attack_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, input.missionId, input.taskId, key, 'new', confidence, ts, ts, JSON.stringify(input.evidence ?? []), JSON.stringify(input.attackTechniques ?? []));
      if (findingId) db.prepare('INSERT INTO correlation_links(id,correlation_id,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)').run(randomId(), id, 'finding', findingId, ts);
      for (const evidenceId of input.evidence ?? []) db.prepare('INSERT INTO correlation_links(id,correlation_id,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)').run(randomId(), id, 'evidence', evidenceId, ts);
      out.push({ id, kind: 'new', confidence });
    }
  }
  audit(ctx.actor, 'finding.correlated', input.missionId, 'allow', { taskId: input.taskId, correlations: out.length });
  return out;
}

export function listCorrelations(missionId?: string): unknown[] {
  const db = getDb();
  const rows = missionId ? db.prepare('SELECT * FROM finding_correlations WHERE mission_id=? ORDER BY last_seen DESC').all(missionId) : db.prepare('SELECT * FROM finding_correlations ORDER BY last_seen DESC LIMIT 500').all();
  return (rows as Record<string, any>[]).map((row) => ({ ...row, evidence: JSON.parse(String(row.evidence_json || '[]')), attackTechniques: JSON.parse(String(row.attack_json || '[]')), links: db.prepare('SELECT entity_type,entity_id,created_at FROM correlation_links WHERE correlation_id=? ORDER BY created_at').all(row.id) }));
}
