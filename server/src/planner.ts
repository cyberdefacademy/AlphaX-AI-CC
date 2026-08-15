import { getDb, nowIso, randomId } from './db';
import { audit, riskDecision, type SecurityContext, type RiskLevel } from './security';
import { routeCapability } from './capabilities';

export interface PlanStep { id:string; capability:string; objective:string; target?:string; risk:RiskLevel; dependsOn:string[]; requiresApproval:boolean; provider?:string; tool?:string; }
export interface MissionPlan { missionId:string; steps:PlanStep[]; rationale:string; }

export function initPlannerSchema(){getDb().exec(`CREATE TABLE IF NOT EXISTS mission_plans(id TEXT PRIMARY KEY,mission_id TEXT UNIQUE NOT NULL,plan_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'proposed',created_at TEXT NOT NULL,approved_at TEXT);`)}

const allowedRisk=(r:any):RiskLevel=>['low','medium','high','critical'].includes(r)?r:'medium';

export function validatePlan(ctx:SecurityContext,plan:MissionPlan){if(!plan.missionId||!Array.isArray(plan.steps)||plan.steps.length===0)throw new Error('plan requires missionId and at least one step');const ids=new Set<string>();for(const s of plan.steps){if(ids.has(s.id))throw new Error(`duplicate step ${s.id}`);ids.add(s.id);if(!s.capability)throw new Error(`step ${s.id} missing capability`);for(const dep of s.dependsOn||[])if(!ids.has(dep))throw new Error(`step ${s.id} has unresolved dependency ${dep}`);const risk=allowedRisk(s.risk);const decision=riskDecision({...ctx,target:s.target,risk,tool:s.tool});if(decision==='deny')throw new Error(`policy denied step ${s.id}`);if(risk==='high'||risk==='critical')s.requiresApproval=true;const route=routeCapability({...ctx,target:s.target,risk}, {capability:s.capability,target:s.target,risk,projectId:ctx.projectId});s.provider=route.provider;s.tool=route.tool;s.risk=risk;s.requiresApproval=s.requiresApproval||route.approvalRequired;}return plan;}

export function savePlan(ctx:SecurityContext,plan:MissionPlan){const checked=validatePlan(ctx,structuredClone(plan));const id=randomId();getDb().prepare(`INSERT INTO mission_plans(id,mission_id,plan_json,version,status,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(mission_id) DO UPDATE SET plan_json=excluded.plan_json,version=mission_plans.version+1,status='proposed',created_at=excluded.created_at`).run(id,checked.missionId,JSON.stringify(checked),1,'proposed',nowIso());audit(ctx.actor,'mission.plan.created',checked.missionId,'allow',{steps:checked.steps.length});return checked;}

export function getPlan(missionId:string){const row:any=getDb().prepare('SELECT * FROM mission_plans WHERE mission_id=?').get(missionId);if(!row)throw new Error('plan not found');return {...row,plan:JSON.parse(row.plan_json)};}
