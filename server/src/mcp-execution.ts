import { getDb } from './db';
import { authorizeTool, recordToolCall, type ToolRequest } from './mcp';
import { requireApprovedApproval, type SecurityContext } from './security';
import { GovernedMcpAdapter, type McpProvider } from './mcp-adapters';
import { assertExecutionEnabled } from './safety';

export async function executeGovernedMcp(ctx:SecurityContext,req:ToolRequest,approvalId?:string){
  assertExecutionEnabled();
  const auth=authorizeTool(ctx,req);
  if(auth.decision==='deny') throw new Error('policy denied tool execution');
  if(auth.approvalRequired){if(!approvalId) return {status:'approval_required',tool:auth.tool.name}; requireApprovedApproval(approvalId,{...ctx,tool:auth.tool.name,target:req.target,risk:auth.tool.risk});}
  const callId=recordToolCall(ctx,req,'approved',approvalId);
  const row:any=getDb().prepare('SELECT id,name,endpoint,enabled FROM mcp_servers WHERE id=?').get(auth.tool.server);
  if(!row) throw new Error(`MCP server '${auth.tool.server}' is not registered`);
  const adapter=new GovernedMcpAdapter();
  const result=await adapter.invoke(ctx,{id:row.id,name:row.name,kind:row.id==='kali'?'kali':row.id==='hexstrike'?'hexstrike':'generic',endpoint:row.endpoint,enabled:Boolean(row.enabled)},auth.tool.name,req.arguments??{});
  return {status:result.ok?'completed':'failed',callId,...result};
}
