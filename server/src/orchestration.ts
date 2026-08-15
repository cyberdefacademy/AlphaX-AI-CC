import { getDb, randomId, nowIso } from './db';
import { audit, requirePermission, requireTargetScope, riskDecision, type RiskLevel, type SecurityContext } from './security';

export type MissionStatus = 'draft' | 'planning' | 'awaiting_approval' | 'queued' | 'running' | 'validating' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'created' | 'policy_check' | 'waiting_approval' | 'queued' | 'running' | 'validating' | 'completed' | 'failed' | 'cancelled' | 'denied';

export interface MissionInput { name: string; objective: string; projectId?: string; target?: string; risk?: RiskLevel; }
export interface TaskInput { missionId: string; name: string; description?: string; agentId?: string; tool?: string; target?: string; risk?: RiskLevel; dependsOn?: string[]; }

export function initOrchestrationSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_missions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, objective TEXT NOT NULL, project_id TEXT, target TEXT,
      risk TEXT NOT NULL DEFAULT 'low', status TEXT NOT NULL DEFAULT 'draft', created_by TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_mission_tasks (
      id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      agent_id TEXT, tool TEXT, target TEXT, risk TEXT NOT NULL DEFAULT 'low', status TEXT NOT NULL DEFAULT 'created',
      approval_id TEXT, result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_task_dependencies (task_id TEXT NOT NULL, depends_on TEXT NOT NULL, PRIMARY KEY(task_id, depends_on));
    CREATE INDEX IF NOT EXISTS idx_security_missions_status ON security_missions(status);
    CREATE INDEX IF NOT EXISTS idx_security_mission_tasks_mission ON security_mission_tasks(mission_id);
  `);
}

export function createMission(ctx: SecurityContext, input: MissionInput): string {
  requirePermission(ctx, 'missions.create');
  if (!input.name?.trim() || !input.objective?.trim()) throw new Error('mission name and objective are required');
  requireTargetScope(input.projectId, input.target);
  const id = randomId();
  const ts = nowIso();
  getDb().prepare(`INSERT INTO security_missions (id,name,objective,project_id,target,risk,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, input.name.trim(), input.objective.trim(), input.projectId ?? null, input.target ?? null, input.risk ?? 'low', 'draft', ctx.actor, ts, ts);
  audit(ctx.actor, 'mission.created', id, 'allow', { name: input.name, target: input.target, risk: input.risk ?? 'low' });
  return id;
}

export function addMissionTask(ctx: SecurityContext, input: TaskInput): { id: string; status: TaskStatus; approvalId?: string } {
  requirePermission(ctx, 'missions.create');
  const mission = getDb().prepare('SELECT id,project_id,target FROM security_missions WHERE id=?').get(input.missionId) as { id: string; project_id: string | null; target: string | null } | undefined;
  if (!mission) throw new Error('mission not found');
  const projectId = mission.project_id ?? ctx.projectId;
  const target = input.target ?? mission.target ?? ctx.target;
  requireTargetScope(projectId ?? undefined, target ?? undefined);
  const risk = input.risk ?? 'low';
  const taskId = randomId();
  const taskCtx = { ...ctx, projectId: projectId ?? undefined, tool: input.tool, target: target ?? undefined, risk };
  const decision = riskDecision(taskCtx);
  let status: TaskStatus = decision === 'deny' ? 'denied' : decision === 'approval_required' ? 'waiting_approval' : 'queued';
  let approvalId: string | undefined;
  if (decision === 'approval_required') {
    const id = randomId();
    const expires = new Date(Date.now() + 30 * 60_000).toISOString();
    getDb().prepare(`INSERT INTO security_approvals (id,project_id,actor,tool,target,risk,request,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)`)
      .run(id, projectId ?? null, ctx.actor, input.tool ?? 'mission.task', target ?? null, risk, JSON.stringify({ kind: 'mission-task', missionId: input.missionId, taskId, name: input.name, tool: input.tool, target, risk }), expires, nowIso());
    approvalId = id;
  }
  getDb().prepare(`INSERT INTO security_mission_tasks (id,mission_id,name,description,agent_id,tool,target,risk,status,approval_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(taskId, input.missionId, input.name, input.description ?? '', input.agentId ?? null, input.tool ?? null, target ?? null, risk, status, approvalId ?? null, nowIso(), nowIso());
  for (const dependency of input.dependsOn ?? []) {
    const exists = getDb().prepare('SELECT 1 FROM security_mission_tasks WHERE id=? AND mission_id=?').get(dependency, input.missionId);
    if (!exists) throw new Error(`dependency not found in mission: ${dependency}`);
    if (dependency === taskId) throw new Error('task cannot depend on itself');
    getDb().prepare('INSERT OR IGNORE INTO security_task_dependencies (task_id,depends_on) VALUES (?,?)').run(taskId, dependency);
  }
  audit(ctx.actor, 'mission.task.created', taskId, decision, { missionId: input.missionId, risk, approvalId, target });
  return { id: taskId, status, approvalId };
}

export function listMissions(): unknown[] { return getDb().prepare('SELECT * FROM security_missions ORDER BY created_at DESC').all(); }

export function getMission(id: string): unknown {
  const mission = getDb().prepare('SELECT * FROM security_missions WHERE id=?').get(id);
  if (!mission) throw new Error('mission not found');
  const tasks = getDb().prepare('SELECT * FROM security_mission_tasks WHERE mission_id=? ORDER BY created_at').all(id);
  const dependencies = getDb().prepare('SELECT d.* FROM security_task_dependencies d JOIN security_mission_tasks t ON t.id=d.task_id WHERE t.mission_id=?').all(id);
  return { ...(mission as object), tasks, dependencies };
}

export function updateMissionStatus(ctx: SecurityContext, id: string, status: MissionStatus): void {
  requirePermission(ctx, 'missions.execute');
  const allowed: MissionStatus[] = ['planning','awaiting_approval','queued','running','validating','completed','failed','cancelled'];
  if (!allowed.includes(status)) throw new Error('invalid mission status');
  const result = getDb().prepare('UPDATE security_missions SET status=?,updated_at=? WHERE id=?').run(status, nowIso(), id);
  if (!result.changes) throw new Error('mission not found');
  audit(ctx.actor, 'mission.status.changed', id, 'allow', { status });
}
