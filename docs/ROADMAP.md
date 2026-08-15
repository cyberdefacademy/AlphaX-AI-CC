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

Status: **complete / merged to main**

- persistent task queue with priorities
- worker leases and retries
- mission state machine
- cancellation and timeout propagation
- agent health/heartbeat
- unified event bus
- execution receipts exposed to UI

## Phase 3 — MCP provider adapters

Status: **complete / merged to main**

- [x] Kali MCP adapter
- [x] HexStrike MCP adapter
- [x] provider health monitoring
- [x] dynamic capability inventory
- [x] schema-aware tool registration and bounded input validation
- [x] provider-specific result normalization
- [x] request cancellation and timeout propagation
- [x] provider-qualified tool identities to avoid cross-provider name collisions
- [x] safe integration validation procedure

## Phase 4 — Intelligence

Status: **complete / merged to main**

- [x] deterministic result normalization and persistence
- [x] bounded ATT&CK candidate mapper
- [x] evidence extraction with SHA-256 content hashes and custody records
- [x] finding correlation and persisted entity links
- [x] mission-scoped result/finding deduplication
- [x] bounded confidence scoring
- [x] analyst finding review workflow
- [x] intelligence read/review API
- [x] regression test suite with synthetic, offline data

## Phase 5 — Operator experience

Status: **in progress**

- [x] operator console shell
- [x] live control-plane/provider health polling
- [x] approval center with governed approve/deny actions
- [x] finding explorer
- [x] ATT&CK coverage summary
- [x] navigation to mission timeline, audit activity and security center
- [ ] richer live mission timeline with WebSocket event rendering
- [ ] task queue controls and explicit cancellation UX
- [ ] evidence/custody detail viewer
- [ ] ATT&CK tactic/technique drill-down
- [ ] audit integrity verification view
- [ ] emergency-stop API and confirmation workflow

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
