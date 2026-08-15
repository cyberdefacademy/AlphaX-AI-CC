# Kali MCP + HexStrike MCP Integration

## Objective

Integrate the existing Kali MCP and HexStrike AI MCP installations behind one AlphaX governance boundary.

AlphaX should **not** duplicate the tool implementations. It should provide identity, authorization, mission context, scope enforcement, risk decisions, approvals, task scheduling, receipts and audit.

## Adapter contract

Each MCP provider should expose a normalized adapter with:

- provider ID
- connection status
- tool inventory
- tool name
- capability category
- input schema
- output schema
- risk classification
- target requirements
- timeout
- cancellation support
- evidence/result mapping

Example logical record:

```json
{
  "provider": "kali-mcp",
  "tool": "nmap",
  "category": "reconnaissance",
  "risk": "low",
  "requiresTarget": true,
  "supportsCancellation": true
}
```

The actual tool list must come from the connected MCP server at runtime; do not hard-code assumptions about installed tools.

## HexStrike role

HexStrike can act as an AI-assisted security tool orchestration provider. AlphaX remains the governance layer. HexStrike output must therefore be treated as **untrusted tool/result data**, not as an authorization decision.

A HexStrike request should carry:

```text
actor
missionId
projectId
scopeId
taskId
correlationId
policyDecisionId
approvalId (when required)
```

## Tool invocation flow

```text
Task Queue
  -> Policy check
  -> Scope check
  -> Approval check
  -> MCP capability lookup
  -> Provider health check
  -> Execute
  -> Capture stdout/stderr/structured result
  -> Receipt
  -> ATT&CK/finding correlation
  -> Audit
```

## Target enforcement

Target validation must happen immediately before execution, not only when a task is created. This protects against stale tasks and planner mistakes.

The adapter should reject:

- targets outside the mission scope
- disabled projects
- expired missions
- tasks without a valid policy decision
- tasks whose approval has expired or been revoked
- tools not currently registered/allowed
- requests exceeding configured execution budgets

## Human approval

High-risk capabilities should enter the approval queue. Approval is specific to the task, scope, tool and requested action. Approval must not become a blanket permission for the agent to perform unrelated actions.

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
- pin/validate the expected endpoint
- restrict egress
- record provider identity
- reject unexpected redirects or protocols

## Safe integration checklist

- [ ] Discover actual MCP tools
- [ ] Assign stable provider/tool IDs
- [ ] Define schemas
- [ ] Define risk levels
- [ ] Define target requirements
- [ ] Add policy rules
- [ ] Add approval rules
- [ ] Add execution timeout/cancellation
- [ ] Record receipts
- [ ] Normalize results
- [ ] Add ATT&CK mappings
- [ ] Add integration tests against a safe test target
- [ ] Verify emergency stop blocks execution
