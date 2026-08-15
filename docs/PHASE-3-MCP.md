# Phase 3 — Governed Kali MCP + HexStrike MCP Integration

## Status

Implementation complete on the Phase 3 branch; validation and review are required before merge.

## What is implemented

- Dynamic `tools/list` discovery from configured MCP providers; tool implementations are not duplicated in AlphaX.
- First-class provider identities for `kali`, `hexstrike`, and `generic` MCP servers.
- Persistent provider health records with latency, last check, inventory count and failure state.
- Dynamic capability registration with stable provider-qualified names (`kali:<tool>`, `hexstrike:<tool>`).
- Tool input/output schemas are persisted with the inventory.
- Bounded JSON Schema argument validation before a governed call reaches the provider.
- Target requirements are derived from discovered input schemas and enforced again immediately before execution.
- Provider authentication via environment-scoped bearer tokens; secrets are never stored in the database.
- Local-only HTTP by default; remote providers require an explicit host allowlist and HTTPS.
- MCP 2026-07-28 method/name headers are emitted by the HTTP transport, while the JSON-RPC body remains the source of truth.
- Request cancellation is propagated to the upstream transport.
- Provider-specific result normalization preserves structured data while producing a bounded operator summary.
- Existing policy, RBAC, scope, approval, emergency-stop, receipt and audit controls remain mandatory.
- Stale discovered tools are disabled when a provider inventory is refreshed.

## Runtime configuration

```bash
# Kali MCP — default is local loopback
export ALPHAX_KALI_MCP_URL=http://127.0.0.1:9999
export ALPHAX_KALI_MCP_TOKEN='...optional...'

# HexStrike MCP — optional
export ALPHAX_HEXSTRIKE_MCP_URL=http://127.0.0.1:8000/mcp
export ALPHAX_HEXSTRIKE_MCP_TOKEN='...optional...'

# Remote provider allowlist; use only hosts you explicitly trust
export ALPHAX_MCP_ALLOWED_HOSTS='127.0.0.1,localhost,hexstrike.example.internal'
export ALPHAX_MCP_TIMEOUT_MS=30000
export ALPHAX_MCP_PROTOCOL_VERSION=2026-07-28
```

Do not commit tokens or place them in `.env` files that are tracked by Git.

## Governance path

```text
Agent / Mission
   -> authenticated session
   -> mission + project scope
   -> capability/tool authorization
   -> risk policy
   -> human approval when required
   -> provider health gate
   -> schema validation
   -> governed MCP adapter
   -> Kali MCP / HexStrike MCP
   -> normalized result
   -> execution receipt
   -> audit / ATT&CK / evidence pipeline
```

The upstream provider never decides whether an AlphaX action is permitted. Provider output is untrusted data.

## API surface

- `GET /api/mcp/providers/` — provider inventory and health summary.
- `POST /api/mcp/providers/:id/sync` — authenticated, permission-gated inventory refresh.
- `GET /api/mcp/tools` — governed registered tools.
- `POST /api/mcp/execute` — governed execution path; direct provider calls bypassing this route are not part of the AlphaX control plane.

## Safe validation

1. Start AlphaX with only loopback providers enabled.
2. Confirm the provider appears under `/api/mcp/providers/`.
3. Refresh the inventory and verify the count matches the provider's `tools/list` response.
4. Confirm each tool has a provider-qualified name and stored schema.
5. Attempt a malformed argument payload and verify schema validation blocks it before upstream execution.
6. Attempt a target outside the project scope and verify the request is denied.
7. Exercise a high-risk tool in a test project and verify the approval gate returns `428` until the exact approval is supplied.
8. Stop the provider and verify health changes to `unreachable` and governed execution fails closed.
9. Disconnect the HTTP client during a long-running test call and verify the upstream request is aborted and the receipt becomes `timeout`.
10. Inspect the receipt and audit entries; confirm no secret/token values are recorded.

Use only a lab or explicitly authorized engagement scope for any security-tool execution.

## Rollback

Disable the provider in its configuration or stop the provider process. AlphaX will fail closed for an unreachable provider. To roll back the application change, revert the Phase 3 merge; the persistent registry is additive and does not remove existing mission/audit records.
