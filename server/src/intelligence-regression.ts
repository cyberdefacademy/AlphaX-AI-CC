import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

async function main(): Promise<void> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'alphax-intelligence-'));
  process.env.ALPHAX_HOME = home;
  try {
    const { initSecuritySchema } = await import('./security');
    const { initMitreSchema, candidateTechniques } = await import('./mitre');
    const { initEvidenceSchema } = await import('./evidence');
    const { initFindingsSchema, listFindings, validateFinding } = await import('./findings');
    const { initCorrelationSchema, listCorrelations } = await import('./correlation');
    const { initResultIntelligenceSchema, normalizeResult } = await import('./result-intelligence');

    initSecuritySchema(); initMitreSchema(); initEvidenceSchema(); initFindingsSchema(); initCorrelationSchema(); initResultIntelligenceSchema();
    const ctx = { actor: 'regression', role: 'admin', risk: 'low' as const };
    const candidates = candidateTechniques({ provider: 'kali', tool: 'nmap', text: 'open ports and network service scan' });
    assert.ok(candidates.some((x) => x.id === 'T1046'));

    const input = {
      taskId: 'task-1', missionId: 'mission-1', provider: 'kali', tool: 'nmap', ok: true,
      summary: 'discovered open services', observations: ['22/tcp ssh', '443/tcp https'],
      evidence: ['scan output retained'], findings: ['Unexpected exposed management service'], confidence: 0.7,
      raw: { ports: [22, 443] },
    };
    const first = normalizeResult(ctx, input);
    assert.equal(first.deduplicated, false); assert.equal(first.findingIds.length, 1); assert.ok(first.evidenceIds.length >= 2); assert.ok(first.attackTechniques.includes('T1046'));
    const duplicate = normalizeResult(ctx, { ...input, taskId: 'task-2' });
    assert.equal(duplicate.deduplicated, true); assert.equal(duplicate.resultId, first.resultId);

    const findings = listFindings({ missionId: 'mission-1' }) as Array<Record<string, unknown>>;
    assert.equal(findings.length, 1);
    validateFinding('reviewer', String(findings[0].id), true, 0.92);
    assert.equal((listFindings({ missionId: 'mission-1', status: 'validated' }) as Array<Record<string, unknown>>).length, 1);
    assert.equal((listCorrelations('mission-1') as Array<Record<string, unknown>>).length, 1);
    console.log('Phase 4 intelligence regression checks passed');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
