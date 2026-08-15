import {Router,Request} from 'express';
import {type SecurityContext,requirePermission} from '../security';
import {registerAgentCapabilities,routeAgent} from '../agent-router';
export const router=Router();
const ctx=(req:Request):SecurityContext=>({actor:'local-admin',role:'admin',projectId:req.body?.projectId,target:req.body?.target,risk:req.body?.risk??'low'});
router.post('/:id/capabilities',(req,res)=>{try{const c=ctx(req);registerAgentCapabilities(c,req.params.id,Array.isArray(req.body?.capabilities)?req.body.capabilities:[]);res.json({ok:true});}catch(e){res.status(403).json({error:String((e as Error).message)});}});
router.post('/route',(req,res)=>{try{const c=ctx(req);requirePermission(c,'missions.execute');res.json(routeAgent(c,req.body?.capability,req.body?.target,req.body?.risk));}catch(e){res.status(403).json({error:String((e as Error).message)});}});
