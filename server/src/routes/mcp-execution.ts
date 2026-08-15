import {Router,Request} from 'express';
import {executeGovernedMcp} from '../mcp-execution';
import {type SecurityContext} from '../security';
export const router=Router();
const ctx=(req:Request):SecurityContext=>({actor:'local-admin',role:'admin',projectId:req.body?.projectId,target:req.body?.target,risk:req.body?.risk??'low'});
router.post('/execute',async(req,res)=>{try{const result=await executeGovernedMcp(ctx(req),{tool:req.body?.tool,target:req.body?.target,arguments:req.body?.arguments,missionId:req.body?.missionId,taskId:req.body?.taskId,agentId:req.body?.agentId},req.header('x-alphax-approval-id')||undefined);res.status(result.status==='approval_required'?428:200).json(result);}catch(e){res.status(403).json({error:String((e as Error).message)});}});
