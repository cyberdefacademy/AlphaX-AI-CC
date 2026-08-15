import { Router, Request } from 'express';
import { type SecurityContext, requirePermission } from '../security';
import { savePlan, getPlan, type MissionPlan } from '../planner';
export const router=Router();
const ctx=(req:Request):SecurityContext=>({actor:'local-admin',role:'admin',projectId:req.body?.projectId,target:req.body?.target,risk:req.body?.risk??'medium'});
router.post('/',(req,res)=>{try{const c=ctx(req);requirePermission(c,'missions.execute');res.status(201).json(savePlan(c,req.body as MissionPlan));}catch(e){res.status(400).json({error:String((e as Error).message)});}});
router.get('/:missionId',(req,res)=>{try{const c=ctx(req);requirePermission(c,'security.read');res.json(getPlan(req.params.missionId));}catch(e){res.status(404).json({error:String((e as Error).message)});}});
