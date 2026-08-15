import { getDb, nowIso } from './db';
import { audit } from './security';
export function initSafetySchema():void{getDb().exec(`CREATE TABLE IF NOT EXISTS safety_controls(id TEXT PRIMARY KEY,execution_paused INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',updated_by TEXT,updated_at TEXT NOT NULL);`);getDb().prepare("INSERT OR IGNORE INTO safety_controls(id,execution_paused,updated_at) VALUES ('global',0,?)").run(nowIso());}
export function isExecutionPaused():boolean{return Boolean((getDb().prepare("SELECT execution_paused FROM safety_controls WHERE id='global'").get() as {execution_paused:number}|undefined)?.execution_paused);}
export function setExecutionPaused(actor:string,paused:boolean,reason=''):void{getDb().prepare("UPDATE safety_controls SET execution_paused=?,reason=?,updated_by=?,updated_at=? WHERE id='global'").run(paused?1:0,reason,actor,nowIso());audit(actor,paused?'execution.paused':'execution.resumed','global',paused?'deny':'allow',{reason});}
export function assertExecutionEnabled():void{if(isExecutionPaused())throw new Error('global execution is paused by safety control');}
