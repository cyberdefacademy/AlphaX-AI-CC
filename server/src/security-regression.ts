import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main(): Promise<void> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'alphax-security-'));
  process.env.ALPHAX_HOME = home;

  const { getDb } = await import('./db');
  const { initSecuritySchema, hasPermission, requirePermission } = await import('./security');
  const { ensureRoutePermissions } = await import('./route-authz');
  const { createUser, getUserByUsername } = await import('./auth-users');
  const { clearLoginFailures, loginBlocked, loginKey, recordLoginFailure } = await import('./auth-abuse');

  try {
    initSecuritySchema();
    ensureRoutePermissions();
    assert.equal(hasPermission('viewer', 'security.read'), true);
    assert.equal(hasPermission('viewer', 'missions.read'), true);
    assert.equal(hasPermission('pentester', 'missions.execute'), true);
    assert.equal(hasPermission('security-analyst', 'missions.execute'), false);
    assert.equal(hasPermission('security-analyst', 'audit.read'), true);
    assert.equal(hasPermission('admin', 'policy.manage'), true);
    assert.throws(() => requirePermission({ actor:'user:test', role:'viewer' }, 'tools.manage'), /permission denied/);

    const key = loginKey('RegressionUser', '127.0.0.1');
    clearLoginFailures(key);
    for (let i = 1; i < 5; i += 1) {
      const result = recordLoginFailure(key);
      assert.equal(result.locked, false);
      assert.equal(result.failures, i);
    }
    const locked = recordLoginFailure(key);
    assert.equal(locked.locked, true);
    assert.ok(loginBlocked(key) > 0);
    clearLoginFailures(key);
    assert.equal(loginBlocked(key), 0);

    const created = createUser('regression-user', 'Correct-Horse-Battery-Staple-2026!', 'viewer').user;
    assert.equal(getUserByUsername('regression-user')?.id, created.id);
    assert.equal(created.role, 'viewer');
    console.log('security regression checks passed');
  } finally {
    getDb().close();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
