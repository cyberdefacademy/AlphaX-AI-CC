import React,{useEffect,useState} from 'react';
import {apiGet,apiPost} from '../api';

type Safety={ok:boolean;executionPaused:boolean};

export default function SafetyCenter(){
  const [state,setState]=useState<Safety|null>(null);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=()=>apiGet<Safety>('/api/safety/status').then(setState).catch(e=>setError(String(e?.message||e)));
  useEffect(()=>{void load()},[]);
  const change=async(paused:boolean)=>{
    if(paused&&!reason.trim()){setError('Enter a reason before pausing execution.');return}
    setBusy(true);setError('');
    try{const next=await apiPost<Safety>(paused?'/api/safety/pause':'/api/safety/resume',{reason});setState(next);setReason('')}
    catch(e){setError(String((e as Error).message||e))}
    finally{setBusy(false)}
  };
  return <div className="p-6 md:p-8"><div className="mb-6"><div className="text-xs font-semibold uppercase tracking-widest text-accent">Security Center</div><h1 className="mt-1 text-2xl font-bold text-white">Execution Safety</h1><p className="mt-1 text-sm text-slate-400">Server-enforced global execution circuit breaker. This control affects governed execution, not merely the browser UI.</p></div>
    <div className="max-w-3xl rounded-xl border border-ink-700 bg-ink-900 p-5 shadow-lg"><div className="flex items-center justify-between gap-4"><div><div className="text-xs uppercase tracking-wider text-slate-500">Global execution state</div><div className="mt-2 flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${state?.executionPaused?'bg-red-400':'bg-emerald-400'}`}/><span className="text-lg font-semibold text-white">{state?state.executionPaused?'PAUSED':'ENABLED':'Loading…'}</span></div></div><div className="rounded-lg border border-ink-700 px-3 py-2 text-xs text-slate-400">Requires <span className="text-slate-200">policy.manage</span> to change</div></div>
      <div className="mt-6"><label className="text-xs font-medium text-slate-400">Operator reason</label><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why are you pausing/resuming governed execution?" className="mt-2 min-h-24 w-full rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm text-white outline-none focus:border-accent"/></div>
      {error&&<div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy||state?.executionPaused===true} onClick={()=>void change(true)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Pause execution</button><button disabled={busy||state?.executionPaused!==true} onClick={()=>void change(false)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Resume execution</button></div>
      <div className="mt-6 rounded-lg border border-ink-800 bg-ink-950/60 p-4 text-xs leading-5 text-slate-500">Every transition is recorded in the security audit ledger and broadcast over the authenticated event channel. Workers and governed MCP execution must re-check the safety state at the execution boundary.</div>
    </div></div>
}
