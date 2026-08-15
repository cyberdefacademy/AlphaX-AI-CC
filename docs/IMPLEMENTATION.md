# AlphaX Agents OS — Implementation Guide

## Objective

AlphaX is a local-first AI security control plane for authorized security testing and security operations. AI agents propose work; the control plane decides whether that work is permitted.

## End-to-end flow

```text
Mission -> Scope -> Planner -> Policy/Risk -> Human Approval (if required)
       -> Task Queue -> Worker Lease -> Governed MCP Adapter
       -> Tool Execution -> Receipt -> Result Normalization
       -> ATT&CK + Finding/Evidence Correlation -> Audit -> Dashboard
```

Planning is never execution authority. A planned task must remain inside the mission project, target scope, policy budget and approval state.

## Phase 2 — Durable orchestration

The task queue is persistent SQLite state rather than an in-memory work list. Tasks support:

- priority ordering (0–100)
- dependency gating
- approval-aware claiming
- worker ownership
- renewable leases
- heartbeat timestamps
- attempt counters and retry limits
- expired-lease recovery
- worker-owned state transitions
- live WebSocket lifecycle events

The worker uses a unique process-local worker ID. It claims work through an atomic `queued -> leased` transition, renews its lease while running, and cannot complete a task after its ownership has been lost. Expired leases are returned to `queued` until the retry limit is reached, after which the task is failed and audited.

### Phase 2 lifecycle

```text
created -> policy decision
          |-> denied
          |-> waiting_approval -> approved
          `-> queued
               -> leased -> running -> completed
                              |-> failed
                              `-> cancelled
               ^
               | expired lease + retries remaining
```

Dependencies are enforced server-side: a queued task cannot be claimed while any dependency is not `completed`.

## Kali + HexStrike MCP

Kali MCP and HexStrike AI MCP are execution providers behind AlphaX's authorization and audit boundary. They do not define AlphaX policy.

A provider registration should contain a stable provider ID, transport, endpoint configuration, health state, approved tools, tool risk, required permissions, supported scope types, timeout/retry policy and audit metadata.

### Provider onboarding

1. Run the provider only on an authorized workstation or lab.
2. Register it in AlphaX; do not permit arbitrary provider discovery.
3. Allow-list only required tools.
4. Assign explicit risk levels and permissions.
5. Require human approval for high-impact actions.
6. Test against an explicitly authorized target/scope.
7. Verify execution receipts and audit events.
8. Verify the emergency stop blocks governed execution.

## Human approval

Approval is a security control, not a browser-side flag. Approval must bind to the exact mission, scope, tool, action and risk classification. Changing a security-relevant attribute invalidates the approval and forces policy reevaluation.

Never trust a client-supplied `approved=true` value.

## Permissions

Core permission classes are:

- `security.read`
- `missions.read`
- `missions.create`
- `missions.execute`
- `tools.read`
- `tools.manage`
- `approvals.review`
- `audit.read`
- `policy.manage`

Least privilege is mandatory. A read-only operator cannot gain execution authority by changing a task payload.

## Scope enforcement

Scope is checked during planning/policy evaluation **and again immediately before privileged execution**. This protects against stale approvals, changed scopes and compromised intermediate components.

A scope should identify the project, authorized targets and constraints such as time window, network boundaries and prohibited actions.

## Results, ATT&CK and evidence

Tool output is untrusted input. Normalize results before correlation. A normalized result should retain provider/tool, execution receipt, task/mission IDs, target reference, timestamp, status, structured observations, raw-output reference, confidence and parser/version metadata.

ATT&CK correlation should record technique ID, name, evidence reference and confidence. A tool result should not automatically be treated as proof of a technique.

Keep these concepts separate:

- **Audit:** what AlphaX decided and what security-control transitions occurred.
- **Receipt:** what governed execution requested and returned.
- **Evidence:** source material supporting a finding.
- **Finding:** normalized security observation with severity, confidence and references.

Preserve evidence provenance and integrity metadata. Never overwrite original evidence with normalized output.

## Emergency stop

When the global execution stop is active, new governed execution is denied, privileged queued work does not start, workers re-check the stop state before invoking tools, and the transition is audited. Recovery requires explicit operator action.

## Multi-agent orchestration

Agents should have bounded roles rather than unrestricted authority. A typical pipeline is:

```text
Discovery -> Analysis -> Validation -> Reporting
```

Agent-to-agent handoffs are typed and contain minimum necessary context. Agents must not exchange credentials or silently expand mission scope.

## Safe failure

Fail closed when authentication, authorization, scope, approval, tool registration, policy evaluation, audit persistence, emergency-stop state, worker lease or provider identity cannot be validated.

Errors should explain the control decision without exposing secrets.

## Operational test checklist

Before enabling a new provider or execution capability:

1. Typecheck and build.
2. Run security regression tests.
3. Test authentication and MFA.
4. Test denied permissions.
5. Test out-of-scope execution.
6. Test approval-required execution.
7. Test dependency ordering.
8. Test worker lease acquisition.
9. Test heartbeat and lease expiry/recovery.
10. Test retry exhaustion.
11. Test receipt/audit generation.
12. Test result normalization and ATT&CK correlation.

## Production principles

- Keep the default bind address local-only.
- Keep secrets out of Git.
- Use TLS for remote deployments.
- Back up the database and evidence store.
- Monitor authentication failures and execution denials.
- Keep MCP tools explicitly allow-listed.
- Review high-risk policy changes.
- Treat tool output as untrusted.
- Preserve an auditable chain from mission to execution to evidence.

## Integration definition of done

An integration is complete only when this chain works end-to-end:

`authenticated actor -> authorized mission -> in-scope target -> policy decision -> approval (if required) -> leased task -> governed tool call -> receipt -> normalized result -> ATT&CK/finding/evidence correlation -> audit -> operator-visible outcome`
