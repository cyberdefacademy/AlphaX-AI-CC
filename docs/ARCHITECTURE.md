# AlphaX Agents OS — Architecture

## Purpose

AlphaX Agents OS is a local-first AI security control plane. It discovers and controls AI agents, but the security control plane is the authority that decides **who may do what, against which scope, with which tool, under which risk policy, and whether human approval is required**.

The design intentionally separates planning from execution.

```text
Operator / Dashboard
        |
        v
 Authentication + RBAC + MFA
        |
        v
 Mission / Scope / Policy Engine
        |
        +----> Human Approval Gate
        |
        v
 Agent Orchestrator / Planner
        |
        v
 Persistent Task Queue
        |
        +----> Agent Workers
        |          |
        |          +--> AI agents (OpenClaw / Hermes / Claude / opencode / generic)
        |
        +----> Governed MCP Registry
                   |
                   +--> Kali MCP
                   +--> HexStrike MCP
                   +--> future approved MCP servers
        |
        v
 Execution Receipt + Result Normalizer
        |
        +--> MITRE ATT&CK correlation
        +--> Finding / Evidence correlation
        +--> Audit Ledger
        +--> Dashboard / WebSocket events
```

## Security boundary

The MCP server and AI agent are **not** trusted as policy authorities. They are execution providers. Every privileged execution should carry a signed/recorded context containing at minimum:

- authenticated actor
- mission ID
- project ID
- target/scope ID
- tool ID
- requested action
- risk classification
- approval state
- policy decision
- correlation ID

The execution layer must reject requests that cannot be associated with an authorized mission and scope.

## Core components

### Identity

Persistent local users, roles, password hashing, sessions, TOTP MFA, session revocation and authentication-abuse controls.

### Policy

Policy evaluates scope, requested capability, tool risk and approval requirements before execution.

### Orchestration

The planner decomposes an authorized mission into bounded tasks. Workers execute tasks from the queue and report structured results. The planner may adapt subsequent tasks only within the mission's approved scope and policy budget.

### MCP registry

The registry describes approved MCP servers and tools. It should be treated as an allow-list, not a discovery mechanism for arbitrary remote execution.

### Audit

Security-relevant decisions produce immutable, hash-linked audit records. Execution receipts connect a task to its policy decision, tool invocation and result.

## Execution lifecycle

1. Operator creates a mission.
2. Mission is associated with a project and explicit target scope.
3. Planner proposes tasks.
4. Policy engine classifies each task.
5. Tasks requiring approval enter the approval queue.
6. Approved tasks are leased to workers.
7. Worker invokes an approved MCP/tool adapter.
8. Tool output is captured as a structured result.
9. Receipt records actor, mission, scope, tool, timing and outcome.
10. Results are normalized and correlated with ATT&CK techniques and findings.
11. Audit event is appended.
12. Dashboard receives the state transition.
13. Planner may propose the next bounded task.

## Failure model

The safe failure mode is **deny and explain**. A missing scope, expired approval, disabled user, unknown tool, policy mismatch, emergency stop, invalid lease, or unavailable audit store must not silently degrade into unrestricted execution.

## Deployment model

Default deployment is local-only on `127.0.0.1`. Network exposure should be treated as a separate deployment profile requiring TLS, reverse-proxy controls, network authentication and a deliberate threat-model review.

## Design principle

> Agents propose. Policies decide. Humans approve high-risk actions. Governed tools execute. Receipts prove what happened.
