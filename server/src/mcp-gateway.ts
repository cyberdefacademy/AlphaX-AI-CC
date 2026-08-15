import { request } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { getDb, randomId, nowIso } from './db';
import { audit, requirePermission, requireTargetScope, riskDecision, type RiskLevel, type SecurityContext } from './security';

export type McpTransport = 'http' | 'https';
export interface McpTool { name: string; description?: string; inputSchema?: unknown; risk: RiskLevel; permission: string; readOnly: boolean; }
export interface McpServer { id: string; name: string; endpoint: string; transport: McpTransport; enabled: boolean; tools: McpTool[]; }

export function initMcpSchema(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS mcp_servers (id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,endpoint TEXT NOT NULL,transport TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS mcp_tools (id TEXT PRIMARY KEY,server_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',input_schema TEXT,permission TEXT NOT NULL,risk TEXT NOT NULL,read_only INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,UNIQUE(server_id,name));`);
}

export function registerMcpServer(ctx: SecurityContext, input: { name: string; endpoint: string; transport?: McpTransport }): string {
  requirePermission(ctx, 'tools.manage');
  const url = new URL(input.endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MCP endpoint must use HTTP(S)');
  const id = randomId(); const ts = nowIso();
  getDb().prepare(`INSERT INTO mcp_servers (id,name,endpoint,transport,enabled,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`).run(id,input.name,url.toString(),url.protocol==='https:'?'https':'http',ts,ts);
  audit(ctx.actor,'mcp.server.registered',id,'allow',{name:input.name,endpoint:url.origin}); return id;
}

export function listMcpServers(): unknown[] { return getDb().prepare('SELECT id,name,endpoint,transport,enabled,created_at,updated_at FROM mcp_servers ORDER BY name').all(); }

export function registerMcpTool(ctx: SecurityContext, serverId: string, tool: McpTool): string {
  requirePermission(ctx, 'tools.manage');
  const id=randomId();
  getDb().prepare(`INSERT INTO mcp_tools (id,server_id,name,description,input_schema,permission,risk,read_only,enabled) VALUES (?,?,?,?,?,?,?,?,1)`).run(id,serverId,tool.name,tool.description??'',JSON.stringify(tool.inputSchema??{}),tool.permission,tool.risk,tool.readOnly?1:0);
  audit(ctx.actor,'mcp.tool.registered',id,'allow',{serverId,name:tool.name,risk:tool.risk,readOnly:tool.readOnly}); return id;
}

export function listMcpTools(serverId?: string): unknown[] { return serverId ? getDb().prepare('SELECT * FROM mcp_tools WHERE server_id=? AND enabled=1 ORDER BY name').all(serverId) : getDb().prepare('SELECT * FROM mcp_tools WHERE enabled=1 ORDER BY name').all(); }

function postJson(endpoint: string, body: unknown, timeoutMs=30000): Promise<unknown> {
  const url=new URL(endpoint); const payload=Buffer.from(JSON.stringify(body)); const fn=url.protocol==='https:'?httpsRequest:request;
  return new Promise((resolve,reject)=>{
    const req=fn({hostname:url.hostname,port:url.port,path:`${url.pathname}${url.search}`,method:'POST',headers:{'content-type':'application/json','content-length':payload.length}},res=>{let data='';res.setEncoding('utf8');res.on('data',c=>data+=c);res.on('end',()=>{if((res.statusCode??500)>=400)return reject(new Error(`MCP HTTP ${res.statusCode}`));try{resolve(data?JSON.parse(data):null)}catch{resolve(data)}})});
    req.setTimeout(timeoutMs,()=>req.destroy(new Error('MCP request timeout'))); req.on('error',reject); req.write(payload); req.end();
  });
}

export async function callMcpTool(ctx: SecurityContext, serverId: string, toolName: string, args: unknown): Promise<unknown> {
  const server=getDb().prepare('SELECT * FROM mcp_servers WHERE id=? AND enabled=1').get(serverId) as {id:string;endpoint:string}|undefined;
  if(!server) throw new Error('MCP server not found or disabled');
  const tool=getDb().prepare('SELECT * FROM mcp_tools WHERE server_id=? AND name=? AND enabled=1').get(serverId,toolName) as {name:string;permission:string;risk:RiskLevel;read_only:number}|undefined;
  if(!tool) throw new Error('MCP tool not registered or disabled');
  requirePermission(ctx,tool.permission);
  requireTargetScope(ctx.projectId,ctx.target);
  const decision=riskDecision({...ctx,tool:tool.name,risk:tool.risk});
  if(decision!=='allow') throw new Error(`MCP tool requires ${decision}`);
  audit(ctx.actor,'mcp.tool.call.started',tool.name,'allow',{serverId,target:ctx.target,risk:tool.risk});
  const result=await postJson(server.endpoint,{jsonrpc:'2.0',id:randomId(),method:'tools/call',params:{name:tool.name,arguments:args}});
  audit(ctx.actor,'mcp.tool.call.completed',tool.name,'allow',{serverId});
  return result;
}
