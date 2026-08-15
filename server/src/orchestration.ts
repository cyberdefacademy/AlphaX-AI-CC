import { getDb, randomId, nowIso } from './db';
import { audit, requirePermission, requireTargetScope, riskDecision, type RiskLevel, type SecurityContext } from './security';

export type MissionStatus = 'draft' | 'planning' | 'awaiting_approval' | 'queued' | 'running' | 'validating' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'created' | 'policy_check' | 'waiting_approval' | 'queued' | 'leased' | 'running' | 'validating' | 'completed' | 'failed' | 'cancelled' | 'denied' | 'expired';
export interface MissionInput { name: string; objective: string; projectId?: string; target?: string; risk?: RiskLevel; }
export interface TaskInput { missionId: string; name: string; description?: string; agentId?: string; tool?: string; target?: string; risk?: RiskLevel; priority?: number; dependsOn?: string[]; }

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
      approval_id TEXT, result TEXT, priority INTEGER NOT NULL DEFAULT 50, attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3, worker_id TEXT, lease_until TEXT, heartbeat_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_task_dependencies (task_id TEXT NOT NULL, depends_on TEXT NOT NULL, PRIMARY KEY(task_id, depends_on));
    CREATE INDEX IF NOT EXISTS idx_security_missions_status ON security_missions(status);
    CREATE INDEX IF NOT EXISTS idx_security_mission_tasks_queue ON security_mission_tasks(status,priority,created_at);
    CREATE INDEX IF NOT EXISTS idx_security_mission_tasks_lease ON security_mission_tasks(lease_until);
    CREATE INDEX IF NOT EXISTS idx_security_mission_tasks_mission ON security_mission_tasks(mission_id);
  `);
  ensureColumn('security_mission_tasks','priority','INTEGER NOT NULL DEFAULT 50');
  ensureColumn('security_mission_tasks','attempts','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('security_mission_tasks','max_attempts','INTEGER NOT NULL DEFAULT 3');
  ensureColumn('security_mission_tasks','worker_id','TEXT');
  ensureColumn('security_mission_tasks','lease_until','TEXT');
  ensureColumn('security_mission_tasks','heartbeat_at','TEXT');
}
function ensureColumn(table:string,col:string,decl:string):void { const cols=getDb().prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]; if(!cols.some(c=>c.name===col)) getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`); }

export function createMission(ctx: SecurityContext, input: MissionInput): string {
  requirePermission(ctx, 'missions.create');
  if (!input.name?.trim() || !input.objective?.trim()) throw new Error('mission name and objective are required');
  requireTargetScope(input.projectId, input.target);
  const id=randomId(), ts=nowIso();
  getDb().prepare(`INSERT INTO security_missions (id,name,objective,project_id,target,risk,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,input.name.trim(),input.objective.trim(),input.projectId??null,input.target??null,input.risk??'low','draft',ctx.actor,ts,ts);
  audit(ctx.actor,'mission.created',id,'allow',{name:input.name,target:input.target,risk:input.risk??'low'}); return id;
}

export function addMissionTask(ctx: SecurityContext, input: TaskInput): {id:string;status:TaskStatus;approvalId?:string} {
  requirePermission(ctx,'missions.create');
  const mission=getDb().prepare('SELECT id,project_id,target FROM security_missions WHERE id=?').get(input.missionId) as {id:string;project_id:string|null;target:string|null}|undefined;
  if(!mission) throw new Error('mission not found');
  const projectId=mission.project_id??ctx.projectId, target=input.target??mission.target??ctx.target;
  requireTargetScope(projectId??undefined,target??undefined);
  const risk=input.risk??'low', taskId=randomId(), taskCtx={...ctx,projectId:projectId??undefined,tool:input.tool,target:target??undefined,risk};
  const decision=riskDecision(taskCtx); let status:TaskStatus=decision==='deny'?'denied':decision==='approval_required'?'waiting_approval':'queued'; let approvalId:string|undefined;
  if(decision==='approval_required'){approvalId=randomId();const expires=new Date(Date.now()+30*60_000).toISOString();getDb().prepare(`INSERT INTO security_approvals (id,project_id,actor,tool,target,risk,request,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)`).run(approvalId,projectId??null,ctx.actor,input.tool??'mission.task',target??null,risk,JSON.stringify({kind:'mission-task',missionId:input.missionId,taskId,name:input.name,tool:input.tool,target,risk}),expires,nowIso());}
  const priority=Math.max(0,Math.min(100,Math.trunc(input.priority??50)));
  getDb().prepare(`INSERT INTO security_mission_tasks (id,mission_id,name,description,agent_id,tool,target,risk,status,approval_id,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(taskId,input.missionId,input.name,input.description??'',input.agentId??null,input.tool??null,target??null,risk,status,approvalId??null,priority,nowIso(),nowIso());
  for(const dependency of input.dependsOn??[]){if(dependency===taskId)throw new Error('task cannot depend on itself');const exists=getDb().prepare('SELECT 1 FROM security_mission_tasks WHERE id=? AND mission_id=?').get(dependency,input.missionId);if(!exists)throw new Error(`dependency not found in mission: ${dependency}`);getDb().prepare('INSERT OR IGNORE INTO security_task_dependencies (task_id,depends_on) VALUES (?,?)').run(taskId,dependency);}
  audit(ctx.actor,'mission.task.created',taskId,decision,{missionId:input.missionId,risk,approvalId,target,priority}); return {id:taskId,status,approvalId};
}

export function listMissions():unknown[]{return getDb().prepare('SELECT * FROM security_missions ORDER BY created_at DESC').all();}
export function getMission(id:string):unknown{const mission=getDb().prepare('SELECT * FROM security_missions WHERE id=?').get(id);if(!mission)throw new Error('mission not found');const tasks=getDb().prepare('SELECT * FROM security_mission_tasks WHERE mission_id=? ORDER BY priority DESC,created_at').all(id);const dependencies=getDb().prepare('SELECT d.* FROM security_task_dependencies d JOIN security_mission_tasks t ON t.id=d.task_id WHERE t.mission_id=?').all(id);return {...mission as object,tasks,dependencies};}
export function updateMissionStatus(ctx:SecurityContext,id:string,status:MissionStatus):void{requirePermission(ctx,'missions.execute');const allowed:MissionStatus[]=['planning','awaiting_approval','queued','running','validating','completed','failed','cancelled'];if(!allowed.includes(status))throw new Error('invalid mission status');const result=getDb().prepare('UPDATE security_missions SET status=?,updated_at=? WHERE id=?').run(status,nowIso(),id);if(!result.changes)throw new Error('mission not found');audit(ctx.actor,'mission.status.changed',id,'allow',{status});}

export function recoverExpiredLeases(now=nowIso()):number {
  const db=getDb();
  const rows=db.prepare(`SELECT id,mission_id,worker_id,attempts,max_attempts FROM security_mission_tasks WHERE status IN ('leased','running') AND lease_until IS NOT NULL AND lease_until < ?`).all(now) as {id:string;mission_id:string;worker_id:string|null;attempts:number;max_attempts:number}[];
  for(const row of rows){const next=row.attempts < row.max_attempts ? 'queued' : 'failed';db.prepare(`UPDATE security_mission_tasks SET status=?,worker_id=NULL,lease_until=NULL,heartbeat_at=NULL,updated_at=? WHERE id=?`).run(next,now,row.id);audit('system','task.lease.expired',row.id,next==='queued'?'allow':'deny',{missionId:row.mission_id,workerId:row.worker_id,attempts:row.attempts,maxAttempts:row.max_attempts,next});}
  return rows.length;
}

export function claimNextTask(workerId:string,leaseMs:number):any|null {
  const db=getDb(), now=Date.now(), iso=new Date(now).toISOString(), until=new Date(now+leaseMs).toISOString();
  recoverExpiredLeases(iso);
  const row=db.prepare(`SELECT t.* FROM security_mission_tasks t WHERE t.status='queued' AND (t.approval_id IS NULL OR EXISTS (SELECT 1 FROM security_approvals a WHERE a.id=t.approval_id AND a.status='approved' AND a.expires_at>?)) AND NOT EXISTS (SELECT 1 FROM security_task_dependencies d JOIN security_mission_tasks dep ON dep.id=d.depends_on WHERE d.task_id=t.id AND dep.status!='completed') ORDER BY t.priority DESC,t.created_at ASC LIMIT 1`).get(iso) as any;
  if(!row)return null;
  const updated=db.prepare(`UPDATE security_mission_tasks SET status='leased',worker_id=?,lease_until=?,heartbeat_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'`).run(workerId,until,iso,iso,row.id);
  if(!updated.changes)return null;
  audit(`worker:${workerId}`,'task.leased',row.id,'allow',{missionId:row.mission_id,leaseUntil:until});
  return db.prepare('SELECT * FROM security_mission_tasks WHERE id=?').get(row.id);
}

export function heartbeatTask(workerId:string,taskId:string,leaseMs:number):boolean{const now=nowIso(),until=new Date(Date.now()+leaseMs).toISOString();const result=getDb().prepare(`UPDATE security_mission_tasks SET heartbeat_at=?,lease_until=?,updated_at=? WHERE id=? AND worker_id=? AND status IN ('leased','running')`).run(now,until,now,taskId,workerId);return Boolean(result.changes);}
export function transitionTask(workerId:string,taskId:string,status:TaskStatus,result?:unknown):void{const allowed:TaskStatus[]=['running','validating','completed','failed','cancelled'];if(!allowed.includes(status))throw new Error('invalid worker task transition');const ts=nowIso();const r=getDb().prepare(`UPDATE security_mission_tasks SET status=?,result=?,worker_id=NULL,lease_until=NULL,heartbeat_at=NULL,updated_at=? WHERE id=? AND worker_id=?`).run(status,result===undefined?null:JSON.stringify(result),ts,taskId,workerId);if(!r.changes)throw new Error('task lease is no longer owned by worker');audit(`worker:${workerId}`,`task.${status}`,taskId,status==='failed'?'deny':'allow',{result});}
