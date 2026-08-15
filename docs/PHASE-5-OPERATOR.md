# Phase 5 — Operator Experience

Phase 5 turns the governed control plane and Phase 4 intelligence services into a practical operator surface.

## Operator Console

The web UI now exposes `#/operator-console` with:

- control-plane health status
- pending and high/critical approval counts
- MCP provider health, latency and discovered tool counts
- human approval actions (approve/deny)
- open finding explorer
- bounded confidence display
- ATT&CK mapping coverage summary
- direct navigation to Mission Control, Activity and Security Center

The console reads from the existing governed APIs; it does not introduce a second authorization path.

## Governance invariants

1. The UI never authorizes an execution by itself.
2. Approval actions are submitted to the existing authenticated approval endpoint.
3. Provider health is observational; a healthy provider does not imply execution permission.
4. ATT&CK mappings are intelligence and remain advisory.
5. Finding confidence is bounded and does not grant execution authority.
6. Emergency-stop remains a separate control-plane capability and is not simulated by a UI-only flag.

## API surfaces used

- `GET /api/health`
- `GET /api/mcp/providers`
- `GET /api/security-platform/approvals`
- `POST /api/security-platform/approvals/:id`
- `GET /api/intelligence/findings`
- `GET /api/intelligence/techniques`

## Validation

The Phase 5 change is intentionally thin: it composes already-governed backend APIs and adds no direct Kali, HexStrike, shell, or network execution from the browser. CI must continue to run web/server typechecks, build, security regression, MCP self-test and intelligence regression before merge.

## Next operator-experience increments

- richer mission timeline with live WebSocket events
- task queue controls with explicit cancellation semantics
- evidence detail viewer with custody metadata
- ATT&CK tactic/technique drill-down
- audit integrity verification view
- explicit emergency-stop API and confirmation workflow once the backend control is implemented
