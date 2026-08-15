# Phase 5 — Execution Safety Control

## Status

Implemented on `feature/phase5-safety-control-ui` and ready for CI/review against `main`.

## Control path

```text
Authenticated operator
  -> /api/safety/status
  -> /api/safety/pause | /api/safety/resume
  -> policy.manage authorization
  -> persistent safety_controls state
  -> audit ledger
  -> WebSocket execution:safety event
  -> worker/MCP execution boundary re-check
```

## API

- `GET /api/safety/status` — requires `security.read`.
- `POST /api/safety/pause` — requires `policy.manage` and a non-empty reason.
- `POST /api/safety/resume` — requires `policy.manage`.

State-changing requests remain behind the existing authenticated-session, CSRF and route-authorization middleware.

## Enforcement

The safety state is checked at agent-task creation and again immediately before an adapter invocation. Governed MCP execution uses the same server-side safety assertion. A browser state change alone therefore cannot authorize or resume execution.

## UI

The Security Center now has a dedicated Safety view with the current global execution state, pause/resume controls, required operator reason, permission indication, and a clear server-side enforcement warning.

## Audit and events

Pause/resume transitions are written to the hash-linked security audit ledger and broadcast as `execution:safety` events over the authenticated WebSocket channel.

## Regression coverage

`server/src/safety-regression.ts` validates default enabled state, pause/resume transitions, execution denial while paused, execution restoration, and the audit event sequence.

Run:

```bash
cd server
npm run test:safety
npm run typecheck
npm run build
```

The regression suite uses a temporary SQLite home and does not invoke security tooling or remote MCP providers.
