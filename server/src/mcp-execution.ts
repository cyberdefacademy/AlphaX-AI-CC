import { getDb } from './db';
import { authorizeTool, recordToolCall, type ToolRequest } from './mcp';
import { type SecurityContext } from './security';
import { requireApprovedApproval } from './approval-queue';
import { GovernedMcpAdapter } from './mcp-adapters';
import { assertExecutionEnabled } from './safety';
import { assertTargetInScope } from './scope';
import { beginReceipt,finishReceipt } from './mcp-receipts';

export async function executeGovernedMcp(ctx:SecurityContext,req:ToolRequest,approvalId?:string){
  assertExecutionEnabled();
  assertTargetInScope(ctx.actor,ctx.projectId,req.target);
  const auth=authorizeTool(ctx,req);
  if(auth.decision==='deny') throw new Error('policy denied tool execution');
  if(auth.approvalRequired){if(!approvalId) return {status:'approval_required',tool:auth.tool.name};requireApprovedApproval(approvalId,{...ctx,tool:auth.tool.name,target:req.target,risk:auth.tool.risk},req.missionId,req.taskId,req.agentId);}
  const callId=recordToolCall(ctx,req,'approved',approvalId);
  const row:any=getDb().prepare('SELECT id,name,endpoint,enabled FROM mcp_servers WHERE id=?').get(auth.tool.server);
  if(!row) throw new Error(`MCP server '${auth.tool.server}' is not registered`);
  const receiptId=beginReceipt(ctx,{callId,providerId:row.id,tool:auth.tool.name,target:req.target,risk:auth.tool.risk,approvalId,arguments:req.arguments??{}});
  try{
    const adapter=new GovernedMcpAdapter();
    const result=await adapter.invoke(ctx,{id:row.id,name:row.name,kind:row.id==='kali'?'kali':row.id==='hexstrike'?'hexstrike':'generic',endpoint:row.endpoint,enabled:Boolean(row.enabled)},auth.tool.name,req.arguments??{});
    finishReceipt(ctx,receiptId,result.ok?'completed':'failed',result.result,result.error);
    return {status:result.ok?'completed':'failed',callId,receiptId,...result};
  }catch(e){const error=String((e as Error).message);finishReceipt(ctx,receiptId,'failed',undefined,error);throw e;}
}
