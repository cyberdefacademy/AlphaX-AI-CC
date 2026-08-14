import {Router,Request} from 'express';import {requirePermission,type SecurityContext} from '../security';import {createProject,addScope,listProjects,listScopes,initScopeSchema} from '../scope';
export const router=Router();initScopeSchema();const ctx=(req:Request):SecurityContext=>({actor:'local-admin',role:'admin'});
router.get('/projects',(_req,res)=>res.json({projects:listProjects()}));
router.post('/projects',(req,res)=>{try{requirePermission(ctx(req),'policy.manage');res.status(201).json({id:createProject('local-admin',req.body.name,req.body.description||'')});}catch(e){res.status(403).json({error:String((e as Error).message)});}});
router.get('/projects/:id/scopes',(req,res)=>res.json({scopes:listScopes(req.params.id)}));
router.post('/projects/:id/scopes',(req,res)=>{try{requirePermission(ctx(req),'policy.manage');res.status(201).json({id:addScope('local-admin',req.params.id,req.body.kind||'exact',req.body.value,Boolean(req.body.excluded))});}catch(e){res.status(400).json({error:String((e as Error).message)});}});
