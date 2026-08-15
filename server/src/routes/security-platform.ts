import { Router, Request } from 'express';
import { requirePermission, type SecurityContext, type RiskLevel, resolveApproval, listApprovals, listAudit, createApproval } from '../security';
import { authorizeTool, listTools, recordToolCall } from '../mcp';
import { listTechniques } from '../mitre';
import { addEvidence, getEvidence } from '../evidence';
import { createFinding, listFindings, validateFinding } from '../findings';

export const router=Router();
function ctx(req:Request):SecurityContext{return {actor:'local-admin',role:'admin',projectId:typeof req.body?.projectId==='string'?req.body.projectId:undefined,target:typeof req.body?.target==='string'?req.body.target:undefined,risk:(req.body?.risk||'low') as RiskLevel};}
router.get('/tools',(_req,res)=>res.json({tools:listTools()}));
router.post('/tools/authorize',(req,res)=>{try{const c=ctx(req),r=authorizeTool(c,{tool:req.body.tool,target:req.body.target,arguments:req.body.arguments});let approvalId:string|undefined;if(r.approvalRequired)approvalId=createApproval({...c,tool:r.tool.name,target:req.body.target,risk:r.tool.risk},req.body);const callId=recordToolCall(c,{tool:r.tool.name,target:req.body.target,arguments:req.body.arguments},r.decision,approvalId);res.json({...r,approvalId,callId});}catch(e){res.status(403).json({error:String((e as Error).message)});}});
router.get('/approvals',(req,res)=>res.json({approvals:listApprovals(typeof req.query.status==='string'?req.query.status:undefined)}));
router.post('/approvals/:id',(req,res)=>{try{const c=ctx(req);requirePermission(c,'approvals.review');if(req.body.decision!=='approved'&&req.body.decision!=='denied')throw new Error('decision must be approved or denied');resolveApproval(req.params.id,c.actor,req.body.decision,req.body.reason||'');res.json({ok:true});}catch(e){res.status(400).json({error:String((e as Error).message)});}});
router.get('/audit',(req,res)=>res.json({events:listAudit(Number(req.query.limit)||200)}));
router.get('/mitre/techniques',(_req,res)=>res.json({techniques:listTechniques()}));
router.post('/evidence',(req,res)=>{try{const c=ctx(req);requirePermission(c,'missions.execute');if(typeof req.body.content!=='string')throw new Error('content must be supplied as text for this API');res.status(201).json({id:addEvidence(c.actor,req.body)});}catch(e){res.status(400).json({error:String((e as Error).message)});}});
router.get('/evidence/:id',(req,res)=>{try{res.json(getEvidence(req.params.id));}catch(e){res.status(404).json({error:String((e as Error).message)});}});
router.get('/findings',(_req,res)=>res.json({findings:listFindings()}));
router.post('/findings',(req,res)=>{try{res.status(201).json({id:createFinding('local-admin',req.body)});}catch(e){res.status(400).json({error:String((e as Error).message)});}});
router.post('/findings/:id/validate',(req,res)=>{try{validateFinding('local-admin',req.params.id,Boolean(req.body.valid),req.body.confidence);res.json({ok:true});}catch(e){res.status(400).json({error:String((e as Error).message)});}});
