import { randomBytes } from 'crypto';
import { getDb } from './db';
import { audit, requireApprovedApproval, riskDecision, type SecurityContext } from './security';
import { GovernedMcpAdapter, type McpProvider } from './mcp-adapters';
import { claimNextTask, heartbeatTask, recoverExpiredLeases, transitionTask } from './orchestration';
import { hub } from './ws';

export interface WorkerOptions { pollMs?:number; concurrency?:number; leaseMs?:number; heartbeatMs?:number; }
export class TaskWorker {
  private timer?:NodeJS.Timeout;
  private heartbeatTimer?:NodeJS.Timeout;
  private active=new Set<string>();
  private readonly workerId=`worker-${randomBytes(6).toString('hex')}`;
  constructor(private readonly adapter=new GovernedMcpAdapter(),private readonly options:WorkerOptions={}){}
  start(){if(this.timer)return;const poll=this.options.pollMs??1000;const heartbeat=Math.max(500,Math.min(this.options.heartbeatMs??3000,Math.floor((this.options.leaseMs??15000)/2)));this.timer=setInterval(()=>void this.tick(),poll);this.heartbeatTimer=setInterval(()=>this.heartbeat(),heartbeat);void this.tick();}
  stop(){if(this.timer)clearInterval(this.timer);if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);this.timer=undefined;this.heartbeatTimer=undefined;for(const id of this.active)void this.failOwned(id,'worker stopped');this.active.clear();}
  private async tick(){const limit=this.options.concurrency??2;if(this.active.size>=limit)return;recoverExpiredLeases();while(this.active.size<limit){const row=claimNextTask(this.workerId,this.options.leaseMs??15000);if(!row)break;this.active.add(row.id);hub.broadcast('task:leased',{taskId:row.id,missionId:row.mission_id,workerId:this.workerId});void this.run(row).finally(()=>this.active.delete(row.id));}}
  private heartbeat(){for(const id of this.active){if(!heartbeatTask(this.workerId,id,this.options.leaseMs??15000)){this.active.delete(id);hub.broadcast('task:lease-lost',{taskId:id,workerId:this.workerId});}}}
  private async run(row:any){const ctx:SecurityContext={actor:row.created_by||`worker:${this.workerId}`,role:'admin',projectId:row.project_id||undefined,target:row.target||undefined,risk:row.risk,tool:row.tool||undefined};try{if(row.approval_id)requireApprovedApproval(row.approval_id,ctx);if(riskDecision(ctx)==='deny')throw new Error('policy denied task at execution time');transitionTask(this.workerId,row.id,'running');hub.broadcast('task:running',{taskId:row.id,missionId:row.mission_id,workerId:this.workerId});if(!row.tool){transitionTask(this.workerId,row.id,'completed',{mode:'orchestration-only'});hub.broadcast('task:completed',{taskId:row.id,missionId:row.mission_id});return;}const provider=this.resolveProvider(row.tool);const result=await this.adapter.invoke(ctx,provider,row.tool,{});transitionTask(this.workerId,row.id,result.ok?'completed':'failed',result);hub.broadcast(result.ok?'task:completed':'task:failed',{taskId:row.id,missionId:row.mission_id,provider:provider.id,tool:row.tool});}catch(e){await this.failOwned(row.id,String((e as Error).message));}}
  private async failOwned(taskId:string,error:string){try{transitionTask(this.workerId,taskId,'failed',{error});hub.broadcast('task:failed',{taskId,error});}catch{audit(`worker:${this.workerId}`,'task.failure.unowned',taskId,'deny',{error});}}
  private resolveProvider(tool:string):McpProvider{const row:any=getDb().prepare(`SELECT provider FROM capability_catalog WHERE tool=? AND enabled=1 ORDER BY read_only DESC LIMIT 1`).get(tool);if(!row)throw new Error('no MCP provider registered for tool');const p:any=getDb().prepare(`SELECT id,name,kind,endpoint,enabled FROM mcp_servers WHERE id=?`).get(row.provider);if(!p)throw new Error(`MCP provider '${row.provider}' is not registered`);return {id:p.id,name:p.name,kind:p.kind,endpoint:p.endpoint,enabled:Boolean(p.enabled)};}
}
