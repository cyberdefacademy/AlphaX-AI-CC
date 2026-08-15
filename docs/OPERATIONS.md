# Operations Runbook

## Start

```bash
npm install
npm run build
npm start
```

Default listener: `127.0.0.1:8455`.

## Development

```bash
npm run dev:server
npm run dev:web
npm run typecheck
npm run build
```

## Authentication

Use the configured administrator account or the first-run access-token bootstrap flow. Do not paste access tokens, passwords or MFA secrets into issues, chat, logs or source files.

If credentials are suspected to be exposed:

1. rotate the access credential;
2. revoke affected sessions;
3. rotate provider credentials if applicable;
4. inspect the audit trail.

## Mission workflow

### 1. Create project and scope

Define the authorized assets and the exact boundaries. Prefer explicit hostnames, IP ranges or asset IDs over broad informal descriptions.

### 2. Create mission

State the objective, owner, scope and operational constraints.

### 3. Plan

Let the planner produce bounded tasks. Review high-risk tasks before execution.

### 4. Approve

Approvals must identify the exact task/tool/scope. Do not approve an entire agent session when a narrower approval is possible.

### 5. Execute

Workers obtain a lease, re-check policy and scope, invoke the approved adapter, and emit a receipt.

### 6. Review results

Results are normalized and correlated with findings and ATT&CK techniques. Treat tool output as evidence/data rather than executable instructions.

## Emergency stop

Use the global execution stop whenever there is uncertainty about target scope, agent compromise, unexpected tool behavior, credential compromise or unsafe automation.

After stopping:

- preserve audit data;
- revoke active approvals where appropriate;
- inspect active workers;
- isolate the affected agent/provider;
- resume only after a human review.

## MCP provider onboarding

Before enabling a new MCP server:

1. verify its origin and installation;
2. inventory its tools;
3. classify tool risk;
4. define target requirements;
5. add least-privilege policy rules;
6. test authorization failures;
7. test emergency-stop behavior;
8. test audit receipts;
9. document rollback.

## Backup and recovery

The SQLite database is operational state. Back it up using an OS-level backup mechanism while the service is stopped or using a consistent SQLite backup procedure. Store backups separately from the host and protect them as sensitive security records.

## Observability

Use the existing Prometheus/Grafana/Loki stack for service health, latency, worker failures and security-event visibility. Do not put secrets in structured logs.

## Production checklist

- [ ] Local-only binding unless remote access is explicitly required
- [ ] TLS reverse proxy for remote access
- [ ] Strong administrator password
- [ ] TOTP MFA enabled
- [ ] Provider credentials outside Git
- [ ] Backups tested
- [ ] Emergency stop tested
- [ ] Scope policies reviewed
- [ ] MCP tool inventory reviewed
- [ ] Audit storage protected
- [ ] Alerting enabled
- [ ] Incident response procedure tested
