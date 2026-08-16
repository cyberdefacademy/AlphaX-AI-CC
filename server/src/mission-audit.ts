import {getDb,nowIso} from './db';

/**
 * Mission audit is backed by the canonical security_audit ledger.
 * Older code referenced an audit_log table that is not created by the
 * current database bootstrap, which caused a clean installation to abort
 * during startup. Keep the mission-facing API stable while reading from the
 * canonical, hash-chained audit ledger.
 */
export function initMissionAuditSchema(){
  getDb().exec(`CREATE INDEX IF NOT EXISTS idx_security_audit_resource_time ON security_audit(resource,ts);`);
}

export function missionTimeline(missionId:string){
  return getDb().prepare(`
    SELECT
      id,
      ts AS created_at,
      actor,
      action AS event,
      resource AS resource_id,
      decision,
      detail AS metadata_json
    FROM security_audit
    WHERE resource=? OR json_extract(detail,'$.missionId')=?
    ORDER BY ts ASC
  `).all(missionId,missionId);
}

export function missionSummary(missionId:string){
  const db=getDb();
  return {
    missionId,
    generatedAt:nowIso(),
    events:(db.prepare(`
      SELECT COUNT(*) c
      FROM security_audit
      WHERE resource=? OR json_extract(detail,'$.missionId')=?
    `).get(missionId,missionId) as any).c,
    approvals:db.prepare('SELECT status,COUNT(*) c FROM approval_requests WHERE mission_id=? GROUP BY status').all(missionId),
    correlations:db.prepare('SELECT kind,COUNT(*) c FROM finding_correlations WHERE mission_id=? GROUP BY kind').all(missionId)
  };
}
