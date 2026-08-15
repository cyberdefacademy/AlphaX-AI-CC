# Implementation Roadmap

## Phase 1 — Governance foundation

Status: **complete / merged to main**

- RBAC and permissions
- sessions and MFA
- route authorization
- policy and scope controls
- approvals
- audit ledger
- MCP governance foundation
- mission/task primitives
- ATT&CK and evidence primitives
- authentication abuse controls
- CI security regression checks

## Phase 2 — Operational orchestration

Status: **next**

- persistent task queue with priorities
- worker leases and retries
- mission state machine
- cancellation and timeout propagation
- agent health/heartbeat
- unified event bus
- execution receipts exposed to UI

## Phase 3 — MCP provider adapters

- Kali MCP adapter
- HexStrike MCP adapter
- provider health monitoring
- dynamic capability inventory
- schema validation
- provider-specific result normalizers
- safe integration test harness

## Phase 4 — Intelligence

- result normalization
- ATT&CK candidate mapper
- evidence extraction
- finding correlation
- deduplication
- confidence scoring
- analyst review workflow

## Phase 5 — Operator experience

- live mission timeline
- task queue view
- approval center
- MCP/provider health page
- ATT&CK coverage dashboard
- evidence/finding explorer
- audit explorer
- emergency-stop control with confirmation

## Phase 6 — Production hardening

- TLS deployment profile
- secret management integration
- backup/restore verification
- rate limiting
- resource quotas
- structured security alerts
- disaster recovery runbook
- security test suite expansion

## Definition of done for an execution adapter

An adapter is not production-ready until it has:

- explicit capability registration
- risk classification
- target/scope enforcement
- authentication/authorization integration
- approval integration
- timeout and cancellation
- deterministic request schema validation
- structured receipt
- audit event
- normalized result
- failure tests
- emergency-stop test
- documented rollback

## Guiding rule

Build the governance and observability path before increasing autonomous execution power. The platform should become more capable **without becoming less controllable**.
