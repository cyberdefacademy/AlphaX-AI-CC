import { Router, Request } from 'express';
import { listMcpServers, listMcpTools, registerMcpServer, registerMcpTool } from '../mcp-gateway';
import type { SecurityContext } from '../security';

export const router = Router();
function ctx(req: Request): SecurityContext { return { actor: 'local-admin', role: 'admin', projectId: typeof req.body?.projectId==='string'?req.body.projectId:undefined, target: typeof req.body?.target==='string'?req.body.target:undefined, tool: typeof req.body?.tool==='string'?req.body.tool:undefined, risk: req.body?.risk||'low' }; }
router.get('/servers', (_req,res)=>res.json({servers:listMcpServers()}));
router.get('/tools', (req,res)=>res.json({tools:listMcpTools(typeof req.query.serverId==='string'?req.query.serverId:undefined)}));
router.post('/servers', (req,res)=>{ try { const id=registerMcpServer(ctx(req),req.body); res.status(201).json({id}); } catch(e){res.status(400).json({error:String((e as Error).message)});} });
router.post('/servers/:id/tools', (req,res)=>{ try { const id=registerMcpTool(ctx(req),req.params.id,req.body); res.status(201).json({id}); } catch(e){res.status(400).json({error:String((e as Error).message)});} });
