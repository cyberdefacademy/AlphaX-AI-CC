import { audit, type SecurityContext } from './security';

export interface McpTool { name:string; description?:string; inputSchema?:unknown; readOnly?:boolean; risk?:string; }
export interface McpProvider { id:string; name:string; kind:'kali'|'hexstrike'|'generic'; endpoint:string; enabled:boolean; }
export interface McpInvocation { providerId:string; tool:string; arguments:Record<string,unknown>; }
export interface McpResult { providerId:string; tool:string; ok:boolean; result?:unknown; error?:string; raw?:unknown; }

export interface McpTransport { listTools(provider:McpProvider):Promise<McpTool[]>; callTool(provider:McpProvider,tool:string,args:Record<string,unknown>):Promise<unknown>; }

export class JsonRpcHttpTransport implements McpTransport {
  constructor(private readonly timeoutMs=30000) {}
  private async rpc(endpoint:string,method:string,params:unknown){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),signal:controller.signal}); if(!r.ok) throw new Error(`MCP HTTP ${r.status}`); const body:any=await r.json(); if(body.error) throw new Error(body.error.message||'MCP JSON-RPC error'); return body.result;}
    finally{clearTimeout(timer);}
  }
  async listTools(provider:McpProvider){const result:any=await this.rpc(provider.endpoint,'tools/list',{}); return Array.isArray(result?.tools)?result.tools:[];}
  async callTool(provider:McpProvider,tool:string,args:Record<string,unknown>){return this.rpc(provider.endpoint,'tools/call',{name:tool,arguments:args});}
}

export class GovernedMcpAdapter {
  constructor(private readonly transport:McpTransport=new JsonRpcHttpTransport()){}
  async discover(ctx:SecurityContext,provider:McpProvider){if(!provider.enabled) throw new Error('MCP provider disabled'); const tools=await this.transport.listTools(provider); audit(ctx.actor,'mcp.tools.discovered',provider.id,'allow',{provider:provider.name,count:tools.length}); return tools;}
  async invoke(ctx:SecurityContext,provider:McpProvider,tool:string,args:Record<string,unknown>):Promise<McpResult>{if(!provider.enabled) return {providerId:provider.id,tool,ok:false,error:'provider disabled'}; try{const result=await this.transport.callTool(provider,tool,args); audit(ctx.actor,'mcp.tool.invoked',tool,'allow',{provider:provider.id}); return {providerId:provider.id,tool,ok:true,result};}catch(e){const error=String((e as Error).message);audit(ctx.actor,'mcp.tool.failed',tool,'deny',{provider:provider.id,error});return {providerId:provider.id,tool,ok:false,error};}}
}
