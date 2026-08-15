import assert from 'node:assert/strict';
import { validateToolArguments } from './mcp-schema';
import { normalizeMcpResult } from './mcp-normalizers';

export function runMcpProviderSelfTest(): void {
  const schema = { type: 'object', required: ['message'], additionalProperties: false, properties: { message: { type: 'string', minLength: 1, maxLength: 64 } } };
  assert.equal(validateToolArguments({ message: 'safe test' }, schema).ok, true);
  assert.equal(validateToolArguments({}, schema).ok, false);
  assert.equal(validateToolArguments({ message: 'safe test', unexpected: true }, schema).ok, false);

  const normalized = normalizeMcpResult('fake-provider', 'safe.echo', { content: [{ type: 'text', text: 'safe response' }], structuredContent: { ok: true } });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.text[0], 'safe response');
  assert.deepEqual(normalized.structured, { ok: true });
  console.log('MCP provider self-test: PASS (no network or security tooling invoked)');
}

if (require.main === module) runMcpProviderSelfTest();
