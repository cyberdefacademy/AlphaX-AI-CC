import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main():Promise<void>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'alphax-safety-'));
  process.env.ALPHAX_HOME=home;
  const {getDb}=await import('./db');
  const {initSecuritySchema}=await import('./security');
  const {initSafetySchema,isExecutionPaused,setExecutionPaused,assertExecutionEnabled}=await import('./safety');
  try{
    initSecuritySchema();
    initSafetySchema();
    assert.equal(isExecutionPaused(),false);
    assert.doesNotThrow(()=>assertExecutionEnabled());
    setExecutionPaused('regression-user',true,'synthetic emergency stop');
    assert.equal(isExecutionPaused(),true);
    assert.throws(()=>assertExecutionEnabled(),/global execution is paused/);
    setExecutionPaused('regression-user',false,'synthetic recovery');
    assert.equal(isExecutionPaused(),false);
    assert.doesNotThrow(()=>assertExecutionEnabled());
    const events=getDb().prepare("SELECT action,decision FROM security_audit WHERE actor='regression-user' ORDER BY ts ASC").all() as {action:string;decision:string}[];
    assert.deepEqual(events.map(e=>e.action),['execution.paused','execution.resumed']);
    assert.deepEqual(events.map(e=>e.decision),['deny','allow']);
    console.log('safety regression checks passed');
  }finally{getDb().close();fs.rmSync(home,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
