import assert from 'node:assert/strict';
import { defaultConfig } from './config';

// Offline release-gate checks only. No MCP provider or security tool is contacted.
const original = {
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  ALPHAX_KALI_MCP_URL: process.env.ALPHAX_KALI_MCP_URL,
  ALPHAX_HEXSTRIKE_MCP_URL: process.env.ALPHAX_HEXSTRIKE_MCP_URL,
};

try {
  delete process.env.HOST;
  delete process.env.PORT;
  delete process.env.ALPHAX_KALI_MCP_URL;
  delete process.env.ALPHAX_HEXSTRIKE_MCP_URL;

  const defaults = defaultConfig();
  assert.equal(defaults.host, '127.0.0.1', 'default bind must remain loopback-only');
  assert.equal(defaults.port, 8455, 'default port changed unexpectedly');
  assert.equal(defaults.detectIntervalSec, 60, 'default discovery interval changed unexpectedly');
  assert.equal(defaults.kaliMcpUrl, undefined, 'Kali MCP must be opt-in');
  assert.equal(defaults.hexstrikeMcpUrl, undefined, 'HexStrike MCP must be opt-in');

  process.env.HOST = '127.0.0.1';
  process.env.PORT = '9443';
  process.env.ALPHAX_KALI_MCP_URL = 'https://127.0.0.1:9444';
  process.env.ALPHAX_HEXSTRIKE_MCP_URL = 'https://127.0.0.1:9445';
  const configured = defaultConfig();
  assert.equal(configured.host, '127.0.0.1');
  assert.equal(configured.port, 9443);
  assert.equal(configured.kaliMcpUrl, 'https://127.0.0.1:9444');
  assert.equal(configured.hexstrikeMcpUrl, 'https://127.0.0.1:9445');

  console.log('Production readiness regression passed: secure defaults and opt-in MCP configuration verified.');
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
