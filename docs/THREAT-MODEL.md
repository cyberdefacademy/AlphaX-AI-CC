# AlphaX Agents OS — Threat Model

## Security objective

Prevent an AI agent, MCP provider, compromised worker, malicious task payload or unauthorized operator from converting planning capability into unauthorized execution.

## Assets

- credentials, sessions and MFA secrets
- mission and target scope definitions
- MCP provider configuration
- task queue and worker leases
- execution receipts
- audit ledger
- evidence and findings
- policy and approval records
- agent configuration

## Trust boundaries

1. Operator to web/API authentication boundary.
2. API to policy/scope boundary.
3. Planner to task-queue boundary.
4. Worker to MCP boundary.
5. MCP provider to external security tooling boundary.
6. Tool output to intelligence/evidence boundary.
7. Database/evidence storage to backup boundary.

## Primary threats and controls

| Threat | Required control |
|---|---|
| Stolen session | HttpOnly/SameSite cookies, revocation, MFA, short-lived sessions |
| Credential guessing | Persistent failure tracking and temporary lockout |
| Privilege escalation | Explicit RBAC and route authorization |
| Scope manipulation | Scope checks during planning and immediately before execution |
| Approval bypass | Server-side approval binding to mission/scope/tool/action/risk |
| Malicious MCP tool | Explicit provider/tool allow-list and risk policy |
| Prompt injection in tool output | Treat tool output as untrusted data; never interpret it as policy |
| Worker compromise | Short leases, revalidation before execution, minimum permissions |
| Replay of an old approval | Approval expiry plus binding to exact security context |
| Audit tampering | Hash-linked audit records and restricted mutation paths |
| Evidence alteration | Provenance and integrity metadata; preserve originals |
| Emergency-stop bypass | Stop checks at queue and execution boundaries |
| Unknown API endpoint | Explicit fail-closed route authorization |
| Secret leakage | No secrets in source control; redacted logs and outputs |

## AI-specific rules

AI agents are untrusted decision-support components. They may suggest tasks and summarize results, but they cannot grant themselves permissions, change mission scope, approve their own high-risk tasks, register arbitrary execution tools, disable the emergency stop, or treat tool output as policy instructions.

## Incident response

If compromise is suspected:

1. Activate emergency stop.
2. Revoke affected sessions.
3. Disable affected users, agents and providers.
4. Preserve audit and evidence data.
5. Identify affected missions, tasks and receipts.
6. Rotate exposed credentials and provider secrets.
7. Review scope and policy changes.
8. Restore only after validating control-plane integrity.

## Security review triggers

Perform a new threat-model review whenever adding a remote MCP provider, new execution capability, privileged role, external network exposure, persistent cloud storage, autonomous scheduling, new agent adapter or new evidence ingestion path.
