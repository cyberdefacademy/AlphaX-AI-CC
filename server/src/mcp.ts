import { randomId, nowIso, getDb } from './db';
import { audit, requirePermission, riskDecision, type SecurityContext, type RiskLevel } from './security';

export interface McpTool { name:string; description:string; risk:RiskLevel; requiredPermission:string; readOnly:boolean; server:string; }
export interface ToolRequest { tool:string; target?:string; arguments?:Record<string, unknown>; }

export function initMcpSchema(): void {
  const db=getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS mcp_servers (id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,endpoint TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mcp_tools (name TEXT PRIMARY KEY,description TEXT NOT NULL,risk TEXT NOT NULL,required_permission TEXT NOT NULL,read_only INTEGER NOT NULL DEFAULT 1,server TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mcp_tool_calls (id TEXT PRIMARY KEY,actor TEXT NOT NULL,tool TEXT NOT NULL,target TEXT,request TEXT NOT NULL,decision TEXT NOT NULL,approval_id TEXT,created_at TEXT NOT NULL);`);
  const tools:McpTool[]=[
    {name:'network.discovery',description:'Authorized network discovery capability',risk:'medium',requiredPermission:'tools.execute.medium',readOnly:true,server:'kali'},
    {name:'network.service_enumeration',description:'Authorized service enumeration capability',risk:'medium',requiredPermission:'tools.execute.medium',readOnly:true,server:'kali'},
    {name:'dns.lookup',description:'DNS resolution and metadata lookup',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'kali'},
    {name:'http.request',description:'Controlled HTTP request capability',risk:'medium',requiredPermission:'tools.execute.medium',readOnly:true,server:'kali'},
    {name:'artifact.hash',description:'Calculate cryptographic hashes for supplied artifacts',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'local'},
    {name:'artifact.metadata',description:'Extract metadata from supplied artifacts',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'local'},
    {name:'report.generate',description:'Generate findings and reports from collected evidence',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'local'}
  ];
  const s=db.prepare('INSERT OR IGNORE INTO mcp_servers(id,name,endpoint,created_at) VALUES (?,?,?,?)'); s.run('kali','kali',process.env.KALI_MCP_ENDPOINT||'http://127.0.0.1:9999',nowIso()); s.run('local','local','internal://local',nowIso());
  const t=db.prepare('INSERT OR IGNORE INTO mcp_tools(name,description,risk,required_permission,read_only,server,created_at) VALUES (?,?,?,?,?,?,?)'); for(const x of tools)t.run(x.name,x.description,x.risk,x.requiredPermission,x.readOnly?1:0,x.server,nowIso());
}

export function listTools():McpTool[]{ return getDb().prepare('SELECT name,description,risk,required_permission as requiredPermission,read_only as readOnly,server FROM mcp_tools WHERE enabled=1 ORDER BY name').all() as McpTool[]; }

export function authorizeTool(ctx:SecurityContext, req:ToolRequest):{decision:string;tool:McpTool;approvalRequired:boolean}{
  const tool=getDb().prepare('SELECT name,description,risk,required_permission as requiredPermission,read_only as readOnly,server FROM mcp_tools WHERE name=? AND enabled=1').get(req.tool) as McpTool|undefined;
  if(!tool) throw new Error('tool not registered');
  requirePermission(ctx,tool.requiredPermission);
  const decision=riskDecision({...ctx,tool:tool.name,target:req.target,risk:tool.risk});
  audit(ctx.actor,'mcp.tool.authorization',tool.name,decision,{target:req.target,risk:tool.risk});
  return {decision,tool,approvalRequired:decision==='approval_required'};
}

export function recordToolCall(ctx:SecurityContext, req:ToolRequest, decision:string, approvalId?:string):string{
  const id=randomId(); getDb().prepare('INSERT INTO mcp_tool_calls(id,actor,tool,target,request,decision,approval_id,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,ctx.actor,req.tool,req.target??null,JSON.stringify(req.arguments??{}),decision,approvalId??null,nowIso());
  audit(ctx.actor,'mcp.tool.call',req.tool,decision,{target:req.target,approvalId}); return id;
}

export function initMcp():void{initMcpSchema();}
