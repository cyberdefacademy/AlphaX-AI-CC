import {Router,Request} from 'express';
import {requirePermission,type SecurityContext} from '../security';
import {listCapabilities,registerCapability,routeCapability,CapabilityInput} from '../capabilities';
export const router=Router();
const ctx=(req:Request):SecurityContext=>({actor:'local-admin',role:'admin',projectId:req.body?.projectId,target:req.body?.target,risk:req.body?.risk??'low',tool:req.body?.tool});
router.get('/',(req,res)=>{try{const c=ctx(req);requirePermission(c,'security.read');res.json({capabilities:listCapabilities()});}catch(e){res.status(403).json({error:String((e as Error).message)});}});
router.post('/',(req,res)=>{try{const c=ctx(req);const id=registerCapability(c,req.body as CapabilityInput);res.status(201).json({id});}catch(e){res.status(400).json({error:String((e as Error).message)});}});
router.post('/route',(req,res)=>{try{const c=ctx(req);res.json(routeCapability(c,req.body));}catch(e){res.status(403).json({error:String((e as Error).message)});}});
