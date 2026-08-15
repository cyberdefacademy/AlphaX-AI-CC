import {Router,Request} from 'express';
import {executeGovernedMcp} from '../mcp-execution';
import {type SecurityContext} from '../security';
import {getSessionPrincipal,parseCookies} from '../auth';
export const router=Router();
const ctx=(req:Request):SecurityContext=>{const cookies=parseCookies(req.headers.cookie||'');const principal=cookies.session?getSessionPrincipal(cookies.session):null;if(!principal)throw new Error('authenticated session required');return {actor:principal.actor,role:principal.role,projectId:req.body?.projectId,target:req.body?.target,risk:req.body?.risk??'low',tool:req.body?.tool};};
router.post('/execute',async(req,res)=>{try{const c=ctx(req);const result=await executeGovernedMcp(c,{tool:req.body?.tool,target:req.body?.target,arguments:req.body?.arguments,missionId:req.body?.missionId,taskId:req.body?.taskId,agentId:req.body?.agentId},req.header('x-alphax-approval-id')||undefined);res.status(result.status==='approval_required'?428:200).json(result);}catch(e){const message=String((e as Error).message);res.status(message.includes('authenticated session')?401:403).json({error:message});}});
