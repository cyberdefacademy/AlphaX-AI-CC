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
- [x] environment-scoped provider authentication
- [x] loopback-by-default and remote host allowlisting
- [x] offline MCP self-test in CI

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

Status: **complete / baseline merged to main**

- [x] operator console shell
- [x] live control-plane/provider health polling
- [x] approval center with governed approve/deny actions
- [x] finding explorer
- [x] ATT&CK coverage summary
- [x] navigation to mission timeline, audit activity and security center
- [x] richer live mission timeline with WebSocket event rendering
- [x] task queue controls and explicit cancellation UX
- [x] evidence/custody detail viewer
- [x] ATT&CK tactic/technique drill-down
- [x] audit integrity verification view
- [x] emergency-stop API and confirmation workflow

## Phase 6 — Production hardening

Status: **complete / merged to main**

- [x] committed-secret hygiene regression
- [x] high-severity npm dependency audit gate
- [x] repeatable local SQLite backup tooling
- [x] backup checksum and SQLite integrity verification
- [x] CI integration for security gates

## Phase 7 — Production deployment & operations

Status: **in progress**

### Slice 1 — deployment foundation

- [x] hardened systemd service profile
- [x] dedicated unprivileged service account convention
- [x] loopback-only application deployment profile
- [x] nginx TLS reverse-proxy profile
- [x] WebSocket proxying profile
- [x] edge API/auth rate-limit profile
- [x] scheduled SQLite backup service/timer
- [x] production rollout and rollback runbook
- [x] disaster-recovery restore procedure definition

### Slice 2 — runtime resilience

- [ ] application-level distributed rate limiting where multi-instance deployment requires it
- [ ] worker/task resource quotas
- [ ] bounded request concurrency and queue backpressure
- [ ] graceful readiness/draining state for rolling restarts

### Slice 3 — security operations

- [ ] structured security alert events and severity taxonomy
- [ ] alert routing/runbook integration
- [ ] automated audit-integrity monitoring
- [ ] credential rotation/expiry checks

### Slice 4 — disaster recovery and release engineering

- [ ] automated restore verification in an isolated environment
- [ ] release artifact provenance and SBOM publication
- [ ] tested RPO/RTO targets
- [ ] production smoke-test workflow
- [ ] documented release promotion gates

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
