import { getDb, nowIso, randomId } from './db';
import { audit, type SecurityContext, type RiskLevel } from './security';
import { registerCapability } from './capabilities';
import { GovernedMcpAdapter, type McpProvider } from './mcp-adapters';

export async function syncMcpProvider(ctx:SecurityContext, provider:McpProvider, adapter=new GovernedMcpAdapter()){
  const db=getDb();
  db.prepare(`INSERT INTO mcp_servers(id,name,endpoint,enabled,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,endpoint=excluded.endpoint`).run(provider.id,provider.name,provider.endpoint,provider.enabled?1:0,nowIso());
  const tools=await adapter.discover(ctx,provider);
  for(const t of tools){
    const risk=(t.risk||'medium') as RiskLevel;
    registerCapability(ctx,{name:t.name,description:t.description,provider:provider.id,tool:t.name,permission:`tools.execute.${risk}`,risk,readOnly:Boolean(t.readOnly),mitre:[]});
  }
  audit(ctx.actor,'mcp.provider.synced',provider.id,'allow',{tools:tools.length});
  return tools;
}

export function registerConfiguredProviders(){
  const providers:McpProvider[]=[];
  const kali=process.env.ALPHAX_KALI_MCP_URL||process.env.KALI_MCP_ENDPOINT||'http://127.0.0.1:9999';
  const hex=process.env.ALPHAX_HEXSTRIKE_MCP_URL;
  if(kali) providers.push({id:'kali',name:'Kali MCP',kind:'kali',endpoint:kali,enabled:true});
  if(hex) providers.push({id:'hexstrike',name:'HexStrike AI MCP',kind:'hexstrike',endpoint:hex,enabled:true});
  const db=getDb(); for(const p of providers) db.prepare(`INSERT INTO mcp_servers(id,name,endpoint,enabled,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,endpoint=excluded.endpoint,enabled=excluded.enabled`).run(p.id,p.name,p.endpoint,1,nowIso());
  return providers;
}
