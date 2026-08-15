# Kali MCP + HexStrike MCP Integration

## Objective

Integrate the existing Kali MCP and HexStrike AI MCP installations behind one AlphaX governance boundary.

AlphaX should **not** duplicate the tool implementations. It provides identity, authorization, mission context, scope enforcement, risk decisions, approvals, task scheduling, provider health, receipts and audit.

**Phase 3 implementation:** see [`PHASE-3-MCP.md`](PHASE-3-MCP.md) for the implemented provider registry, dynamic discovery, schema validation, health monitoring, result normalization, cancellation and safe validation procedure.

## Adapter contract

Each MCP provider is normalized behind:

- provider ID and provider kind (`kali`, `hexstrike`, `generic`)
- connection status and health latency
- runtime tool inventory
- stable provider-qualified tool name
- upstream tool name
- input and output schema
- risk classification
- target requirements
- timeout/cancellation support
- evidence/result mapping

The actual tool list comes from the connected MCP server at runtime; AlphaX does not hard-code the provider's installed security-tool inventory.

## HexStrike role

HexStrike can act as an AI-assisted security tool orchestration provider. AlphaX remains the governance layer. HexStrike output is **untrusted tool/result data**, not an authorization decision.

A governed HexStrike request carries mission/task context through the AlphaX execution path, including actor, project/scope, correlation and approval context. Provider credentials are kept in environment configuration and are not persisted in the database.

## Tool invocation flow

```text
Task / Mission
  -> Authentication
  -> Policy check
  -> Scope check
  -> Approval check
  -> Capability lookup
  -> Provider health check
  -> Input schema validation
  -> Governed MCP adapter
  -> Kali MCP / HexStrike MCP
  -> Result normalization
  -> Receipt
  -> ATT&CK / finding / evidence correlation
  -> Audit
```

## Target enforcement

Target validation happens immediately before execution, not only when a task is created. This protects against stale tasks and planner mistakes.

The adapter rejects or blocks:

- targets outside the mission scope
- disabled projects/providers
- tasks without a valid mission context
- tasks whose approval is missing, expired or revoked
- tools not currently registered/allowed
- invalid tool arguments
- requests exceeding configured execution time/response budgets
- untrusted remote MCP endpoints

## Human approval

High-risk capabilities enter the approval queue. Approval is specific to the task, scope, tool and requested action. Approval is never a blanket permission for an agent to perform unrelated actions.

## Recommended risk tiers

| Tier | Meaning | Default behavior |
|---|---|---|
| 0 | Read-only metadata | Allow within authenticated session |
| 1 | Low-risk discovery | Allow when scope is valid |
| 2 | Active assessment | Policy evaluation; approval according to project policy |
| 3 | Potentially disruptive | Human approval required |
| 4 | Destructive / high-impact | Explicit human approval + strong policy constraints |

The exact classification belongs in policy configuration and must be reviewed for each environment.

## Network requirements

For local MCP servers, prefer loopback transport. If a provider is remote:

- use HTTPS/TLS
- authenticate the provider
- explicitly allowlist the host
- reject unexpected redirects or protocols
- restrict egress
- record provider identity and health

The current HTTP transport emits the MCP `2026-07-28` protocol/method/tool headers. The JSON-RPC body remains authoritative and provider compatibility should be verified before enabling modern-only behavior in an older server.

## Safe integration checklist

- [x] Discover actual MCP tools
- [x] Assign stable provider/tool IDs
- [x] Persist schemas
- [x] Define risk levels
- [x] Define target requirements
- [x] Add policy and approval enforcement
- [x] Add execution timeout/cancellation
- [x] Record receipts
- [x] Normalize results
- [ ] Add ATT&CK mappings per discovered tool family
- [x] Add safe integration self-test harness
- [x] Verify emergency stop remains in the governed execution path

See [`PHASE-3-MCP.md`](PHASE-3-MCP.md) for the operator validation sequence and rollback procedure.
