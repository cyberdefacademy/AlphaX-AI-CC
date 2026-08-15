# Security Model and Threat Model

## Security objectives

AlphaX Agents OS must preserve:

1. **Authorization** — only permitted actors can request privileged actions.
2. **Scope integrity** — tools cannot operate outside an approved target scope.
3. **Approval integrity** — high-risk execution requires an explicit, traceable approval.
4. **Audit integrity** — security decisions and executions are traceable and tamper-evident.
5. **Agent isolation** — an AI agent cannot grant itself new privileges.
6. **Fail-safe behavior** — missing policy, scope or approval results in denial.

## Threat actors

### Compromised AI agent

An agent may be manipulated by prompt injection, malicious content, a compromised provider or an incorrect plan. The agent is therefore untrusted and must not bypass AlphaX policy.

### Compromised MCP provider

A provider could return misleading tool metadata or malicious results. AlphaX should validate provider identity, maintain an explicit registry and treat returned data as untrusted.

### Malicious or accidental operator

RBAC, MFA, scope controls, approval gates and audit records reduce the blast radius of accidental or unauthorized operations.

### Stolen session

HttpOnly/SameSite cookies, session revocation, MFA and short-lived/rotatable credentials reduce session abuse. Production network exposure requires additional TLS and proxy controls.

### Malicious target content

Web pages, files and tool output may contain prompt-injection content. Never pass untrusted content to an agent as an instruction without preserving its data/instruction boundary.

## Control matrix

| Threat | Primary controls |
|---|---|
| Privilege escalation | RBAC, route authorization, policy engine |
| Out-of-scope target | scope validation immediately before execution |
| Unauthorized high-risk action | approval queue + policy gate |
| Agent prompt injection | untrusted-agent model + bounded task context |
| MCP tool abuse | explicit registry + risk classification |
| Session theft | HttpOnly/SameSite, MFA, revocation |
| Brute-force login | persistent failure tracking and lockout |
| CSRF | Origin/Sec-Fetch-Site checks |
| Audit tampering | hash-linked audit records |
| Rogue task replay | task state/lease/approval validation |
| Emergency incident | global execution stop |

## Secrets

Do not commit passwords, API keys, access tokens, provider secrets, private certificates or MFA recovery codes. Environment files containing secrets must remain outside version control.

The control plane should store only the minimum credential material required for its operation and should prefer one-way password hashes and encrypted-at-rest MFA secrets.

## Network exposure

The default local-only binding is intentional. Do not expose the dashboard directly to the Internet. If remote access is required, place it behind a properly configured TLS reverse proxy and add network-level authentication, rate limiting and an updated threat model.

## AI-specific rules

- Treat model output as recommendations, not authorization.
- Never allow a model to directly mutate policy or RBAC without a separately authorized administrative workflow.
- Do not allow model-generated tool arguments to bypass schema validation.
- Preserve the distinction between user instructions, trusted system policy and untrusted tool/target content.
- Record the model/agent identity and task correlation ID for consequential decisions.

## Incident response

When compromise is suspected:

1. Activate the emergency execution stop.
2. Revoke affected sessions and credentials.
3. Disable compromised agents/providers.
4. Preserve audit records and execution receipts.
5. Identify missions and scopes affected.
6. Review MCP/tool invocation history.
7. Rotate credentials.
8. Re-enable execution only after policy and provider integrity are verified.

## Security testing

Every new execution adapter should include tests for:

- authorization failure
- out-of-scope target
- missing approval
- expired approval
- emergency stop
- invalid tool schema
- provider timeout
- provider failure
- duplicate/replayed task
- receipt creation
- audit event creation
