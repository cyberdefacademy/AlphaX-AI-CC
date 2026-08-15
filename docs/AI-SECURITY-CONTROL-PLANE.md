# AlphaX AI Security Control Plane

The control plane is designed as a local-first governance layer around existing agent adapters and task execution.

## Trust boundaries

1. Identity/session
2. RBAC permission
3. Project and target scope
4. Risk policy
5. Human approval
6. Global execution safety stop
7. Governed MCP tool registry
8. Agent/task execution
9. Evidence and audit ledger

## Mission lifecycle

`draft -> planning -> awaiting_approval -> queued -> running -> validating -> completed`

Terminal states are `failed`, `cancelled`, and `denied`.

## Governed tools

Tools are registered with a risk level, required permission, read-only flag and execution server. MCP authorization checks permission, project scope, policy and the global safety stop before a tool call can be admitted.

The current registry intentionally contains bounded, auditable capabilities rather than an unrestricted shell tool.

## Evidence

Evidence records contain a SHA-256 content hash and a chained custody ledger. This provides tamper-evident provenance suitable for security assessment workflows.

## ATT&CK

Findings can be mapped to ATT&CK technique identifiers with confidence scores. The initial registry is intentionally small and can be synchronized with an approved ATT&CK data source later.

## AI

The AI layer is local-first and provider-neutral. Ollama and LM Studio are first-class provider types. Planning is constrained by a JSON task contract and never grants authority: the policy, scope and approval layers remain authoritative.

## Safety

The global execution stop is an operator-controlled kill switch. When active, governed MCP authorization fails closed.

## Production hardening still required

- Replace placeholder `local-admin` request identity with authenticated user identity and role lookup.
- Add CSRF protection for cookie-authenticated state-changing endpoints.
- Add strict request schemas and rate limits.
- Add persistent encrypted secret management for remote MCP endpoints.
- Add full ATT&CK/STIX synchronization and version pinning.
- Add integration tests against a disposable SQLite database.
- Add a real MCP transport client only after endpoint authentication and per-tool policies are configured.
- Add frontend approval, scope, mission, evidence and ATT&CK views.
