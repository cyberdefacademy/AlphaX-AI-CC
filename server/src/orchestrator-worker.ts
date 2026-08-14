import { getDb, nowIso } from './db';
import { audit, requirePermission, type SecurityContext } from './security';

export interface WorkerHooks { dispatch:(task:any)=>Promise<unknown>; validate?:(task:any,result:unknown)=>Promise<boolean>; }
export class MissionWorker {
  private timer?:NodeJS.Timeout;
  constructor(private hooks:WorkerHooks,private intervalMs=2000){}
  start():void{if(this.timer)return;this.timer=setInterval(()=>void this.tick(),this.intervalMs);void this.tick();}
  stop():void{if(this.timer){clearInterval(this.timer);this.timer=undefined;}}
  async tick():Promise<void>{
    const db=getDb();
    const rows=db.prepare(`SELECT t.* FROM security_mission_tasks t JOIN security_missions m ON m.id=t.mission_id WHERE t.status='queued' AND m.status IN ('queued','running') ORDER BY t.created_at LIMIT 10`).all() as any[];
    for(const task of rows){
      const deps=db.prepare('SELECT depends_on FROM security_task_dependencies WHERE task_id=?').all(task.id) as {depends_on:string}[];
      const blocked=deps.some(d=>{const r=db.prepare('SELECT status FROM security_mission_tasks WHERE id=?').get(d.depends_on) as {status:string}|undefined;return !r||r.status!=='completed';});
      if(blocked)continue;
      try{db.prepare("UPDATE security_mission_tasks SET status='running',updated_at=? WHERE id=? AND status='queued'").run(nowIso(),task.id);db.prepare("UPDATE security_missions SET status='running',updated_at=? WHERE id=? AND status IN ('queued','planning')").run(nowIso(),task.mission_id);audit('worker','mission.task.started',task.id,'allow',{missionId:task.mission_id});const result=await this.hooks.dispatch(task);const valid=this.hooks.validate?await this.hooks.validate(task,result):true;db.prepare("UPDATE security_mission_tasks SET status=?,result=?,updated_at=? WHERE id=?").run(valid?'completed':'failed',JSON.stringify(result??null),nowIso(),task.id);audit('worker','mission.task.completed',task.id,valid?'allow':'deny',{validated:valid});this.maybeComplete(task.mission_id);}catch(e){db.prepare("UPDATE security_mission_tasks SET status='failed',result=?,updated_at=? WHERE id=?").run(JSON.stringify({error:String((e as Error).message)}),nowIso(),task.id);audit('worker','mission.task.failed',task.id,'deny',{error:String((e as Error).message)});}}
  }
  private maybeComplete(missionId:string):void{const db=getDb();const pending=(db.prepare("SELECT COUNT(*) n FROM security_mission_tasks WHERE mission_id=? AND status NOT IN ('completed','cancelled','denied')").get(missionId) as {n:number}).n;if(pending===0)db.prepare("UPDATE security_missions SET status='completed',updated_at=? WHERE id=?").run(nowIso(),missionId);}
}
export function canStartWorker(ctx:SecurityContext):void{requirePermission(ctx,'missions.execute');}
