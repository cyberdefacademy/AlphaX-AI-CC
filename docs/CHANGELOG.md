# Changelog

## 2026-08-15 — Security control plane foundation

- Merged the AI security control-plane foundation into `main`.
- Added RBAC, MFA, persistent sessions and authentication-abuse controls.
- Added route-wide authorization and fail-closed handling for ungoverned routes.
- Added mission, project, scope, policy and human approval controls.
- Added governed MCP registry and execution receipts.
- Added multi-agent coordination, task/mission primitives and adaptive planning controls.
- Added MITRE ATT&CK correlation and finding/evidence primitives.
- Added tamper-evident audit records and mission timelines.
- Added emergency-stop execution control.
- Added security regression validation to CI.

## 2026-08-15 — Documentation expansion

- Added `docs/IMPLEMENTATION.md` for orchestration, queues, MCP integration, approvals, evidence and integration testing.
- Added `docs/THREAT-MODEL.md` covering AI/MCP trust boundaries and security threats.
- Expanded README documentation links and security architecture overview.

## Next implementation focus

- Persistent task queue and worker lifecycle.
- Kali MCP and HexStrike MCP adapters.
- Provider health and dynamic capability inventory.
- Unified event bus and live mission timeline.
- Result normalization and ATT&CK/finding review workflow.
- Operator dashboard for approvals, providers, tasks, findings and audit.
- Production hardening, backup/restore validation and expanded security tests.
