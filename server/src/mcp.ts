import {randomId,nowIso,getDb} from './db';
import {audit,requirePermission,riskDecision,type SecurityContext,type RiskLevel} from './security';
import {assertTargetInScope} from './scope';
import {assertExecutionEnabled} from './safety';

export interface McpTool{name:string;description:string;risk:RiskLevel;requiredPermission:string;readOnly:boolean;server:string;inputSchema?:unknown;outputSchema?:unknown;requiresTarget?:boolean;upstreamName?:string;}
export interface ToolRequest{tool:string;target?:string;arguments?:Record<string,unknown>;missionId?:string;taskId?:string;agentId?:string}

function addColumn(sql:string):void{try{getDb().exec(sql);}catch{/* existing installations may already have the column */}}

export function initMcpSchema():void{
  const db=getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS mcp_servers(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,endpoint TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'generic',enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT '');CREATE TABLE IF NOT EXISTS mcp_tools(name TEXT PRIMARY KEY,description TEXT NOT NULL,risk TEXT NOT NULL,required_permission TEXT NOT NULL,read_only INTEGER NOT NULL DEFAULT 1,server TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,input_schema TEXT,output_schema TEXT,requires_target INTEGER NOT NULL DEFAULT 0,upstream_name TEXT,last_seen_at TEXT);CREATE TABLE IF NOT EXISTS mcp_tool_calls(id TEXT PRIMARY KEY,actor TEXT NOT NULL,tool TEXT NOT NULL,target TEXT,request TEXT NOT NULL,decision TEXT NOT NULL,approval_id TEXT,created_at TEXT NOT NULL);`);
  addColumn(`ALTER TABLE mcp_servers ADD COLUMN kind TEXT NOT NULL DEFAULT 'generic'`);
  addColumn(`ALTER TABLE mcp_servers ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);
  addColumn(`ALTER TABLE mcp_tools ADD COLUMN input_schema TEXT`);
  addColumn(`ALTER TABLE mcp_tools ADD COLUMN output_schema TEXT`);
  addColumn(`ALTER TABLE mcp_tools ADD COLUMN requires_target INTEGER NOT NULL DEFAULT 0`);
  addColumn(`ALTER TABLE mcp_tools ADD COLUMN upstream_name TEXT`);
  addColumn(`ALTER TABLE mcp_tools ADD COLUMN last_seen_at TEXT`);
  const tools:McpTool[]=[
    {name:'network.discovery',description:'Authorized network discovery capability',risk:'medium',requiredPermission:'tools.execute.medium',readOnly:true,server:'kali',requiresTarget:true,upstreamName:'network.discovery'},
    {name:'network.service_enumeration',description:'Authorized service enumeration capability',risk:'medium',requiredPermission:'tools.execute.medium',readOnly:true,server:'kali',requiresTarget:true,upstreamName:'network.service_enumeration'},
    {name:'dns.lookup',description:'DNS resolution and metadata lookup',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'kali',requiresTarget:true,upstreamName:'dns.lookup'},
    {name:'http.request',description:'Controlled HTTP request capability',risk:'medium',requiredPermission:'tools.execute.medium',readOnly:true,server:'kali',requiresTarget:true,upstreamName:'http.request'},
    {name:'artifact.hash',description:'Calculate cryptographic hashes for supplied artifacts',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'local',upstreamName:'artifact.hash'},
    {name:'artifact.metadata',description:'Extract metadata from supplied artifacts',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'local',upstreamName:'artifact.metadata'},
    {name:'report.generate',description:'Generate findings and reports from collected evidence',risk:'low',requiredPermission:'tools.execute.low',readOnly:true,server:'local',upstreamName:'report.generate'},
  ];
  const s=db.prepare(`INSERT OR IGNORE INTO mcp_servers(id,name,endpoint,kind,created_at,updated_at) VALUES (?,?,?,?,?,?)`);s.run('kali','Kali MCP',process.env.KALI_MCP_ENDPOINT||'http://127.0.0.1:9999','kali',nowIso(),nowIso());s.run('local','Local','internal://local','generic',nowIso(),nowIso());
  const t=db.prepare(`INSERT OR IGNORE INTO mcp_tools(name,description,risk,required_permission,read_only,server,created_at,upstream_name) VALUES (?,?,?,?,?,?,?,?)`);for(const x of tools)t.run(x.name,x.description,x.risk,x.requiredPermission,x.readOnly?1:0,x.server,nowIso(),x.upstreamName??x.name);
}

export function listTools():McpTool[]{return getDb().prepare('SELECT name,description,risk,required_permission as requiredPermission,read_only as readOnly,server,input_schema as inputSchema,output_schema as outputSchema,requires_target as requiresTarget,upstream_name as upstreamName FROM mcp_tools WHERE enabled=1 ORDER BY name').all().map((r:any)=>({...r,readOnly:Boolean(r.readOnly),requiresTarget:Boolean(r.requiresTarget),inputSchema:r.inputSchema?JSON.parse(r.inputSchema):undefined,outputSchema:r.outputSchema?JSON.parse(r.outputSchema):undefined})) as McpTool[];}

export function authorizeTool(ctx:SecurityContext,req:ToolRequest):{decision:string;tool:McpTool;approvalRequired:boolean}{
  assertExecutionEnabled();
  const row:any=getDb().prepare('SELECT name,description,risk,required_permission as requiredPermission,read_only as readOnly,server,input_schema as inputSchema,output_schema as outputSchema,requires_target as requiresTarget,upstream_name as upstreamName FROM mcp_tools WHERE name=? AND enabled=1').get(req.tool);
  if(!row)throw new Error('tool not registered');
  const tool:McpTool={name:row.name,description:row.description,risk:row.risk,requiredPermission:row.requiredPermission,readOnly:Boolean(row.readOnly),server:row.server,inputSchema:row.inputSchema?JSON.parse(row.inputSchema):undefined,outputSchema:row.outputSchema?JSON.parse(row.outputSchema):undefined,requiresTarget:Boolean(row.requiresTarget),upstreamName:row.upstreamName??row.name};
  requirePermission(ctx,tool.requiredPermission);
  if(tool.requiresTarget && !req.target) throw new Error('target is required for this tool');
  assertTargetInScope(ctx.actor,ctx.projectId,req.target);
  const decision=riskDecision({...ctx,tool:tool.name,target:req.target,risk:tool.risk});
  audit(ctx.actor,'mcp.tool.authorization',tool.name,decision,{target:req.target,risk:tool.risk,missionId:req.missionId,taskId:req.taskId,agentId:req.agentId});
  return {decision,tool,approvalRequired:decision==='approval_required'};
}

export function recordToolCall(ctx:SecurityContext,req:ToolRequest,decision:string,approvalId?:string):string{const id=randomId();getDb().prepare('INSERT INTO mcp_tool_calls(id,actor,tool,target,request,decision,approval_id,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,ctx.actor,req.tool,req.target??null,JSON.stringify({arguments:req.arguments??{},missionId:req.missionId??null,taskId:req.taskId??null,agentId:req.agentId??null}),decision,approvalId??null,nowIso());audit(ctx.actor,'mcp.tool.call',req.tool,decision,{target:req.target,approvalId,missionId:req.missionId,taskId:req.taskId,agentId:req.agentId});return id;}
export function initMcp():void{initMcpSchema();}
