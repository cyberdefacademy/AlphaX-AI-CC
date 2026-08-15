# AlphaX Agents OS — Production Hardening

## Status

This document is the production-readiness baseline for the Phase 6 hardening work. It distinguishes controls already enforced by the application from deployment controls that must be supplied by the operator/platform.

## 1. Network boundary

The application defaults to loopback (`127.0.0.1`). Keep that default for a single-host deployment whenever possible. The current server starts from the configured host/port and initializes the control plane, worker and governed providers from the same process. fileciteturn768file0L2-L6

For remote access:

- place the application behind a TLS reverse proxy;
- expose only the proxy externally;
- restrict the upstream to the application host/interface;
- disable direct public access to the Node listener;
- use HSTS only after HTTPS is confirmed end-to-end;
- restrict WebSocket upgrades to the same trusted origin/path.

Do not expose Kali MCP or HexStrike MCP directly to the public Internet.

## 2. Secrets

Never commit passwords, access tokens, MCP credentials, TOTP secrets or private keys.

Use deployment secret storage or environment injection. The application already supports configured MCP endpoints through environment variables, including `ALPHAX_KALI_MCP_URL` and `ALPHAX_HEXSTRIKE_MCP_URL`. fileciteturn769file0L2-L6

Recommended production practice:

- one credential per provider;
- least-privilege provider accounts;
- rotate credentials on personnel/provider changes;
- redact secrets from logs;
- never place credentials in task payloads;
- never return provider credentials through operator APIs.

## 3. Authentication

The login endpoint already applies persistent authentication-abuse tracking and temporary lockout. fileciteturn771file0L2-L6

Production requirements:

- enable MFA for privileged accounts;
- disable unused accounts;
- revoke sessions after privilege changes;
- use strong unique passwords;
- protect bootstrap/rotation procedures;
- keep session cookies Secure when deployed over HTTPS.

## 4. Authorization

Keep the server-side route authorization and fail-closed model enabled. Never rely on React/UI visibility as a permission boundary.

Privileged actions must be authorized again at the execution boundary. This includes mission execution, MCP tool invocation, agent commands, approvals and safety-state changes.

## 5. Emergency stop

The safety subsystem is a backend control. A production deployment must verify that:

1. the stop state is persisted;
2. governed execution checks it before invocation;
3. worker execution checks it before privileged work;
4. pause/resume transitions are audited;
5. operators can see the current state;
6. recovery requires explicit authorization.

Do not treat loss of the dashboard connection as equivalent to emergency stop.

## 6. Database and backups

The default data directory is `~/.alphax-agents-os`, or `ALPHAX_HOME` when configured. fileciteturn769file0L2-L6

Back up the complete application state, including:

- SQLite database;
- evidence objects/raw outputs;
- configuration metadata required to restore providers;
- audit records.

A backup is not production-ready until a restore has been tested on a separate host or isolated directory.

Recommended schedule:

- frequent local snapshot;
- encrypted off-host backup;
- retention policy appropriate to the engagement/evidence requirements;
- periodic restore drill;
- documented recovery owner.

Never store backups in the same directory as the only live database copy.

## 7. Evidence integrity

Preserve original evidence and provenance. Do not overwrite raw provider output with normalized intelligence. Retain hashes, acquisition metadata and correlation identifiers.

Evidence backups should be encrypted at rest and access-controlled separately from normal operator UI access.

## 8. MCP provider isolation

Provider configuration should remain explicit and allow-listed. For production:

- prefer local/loopback provider endpoints where practical;
- require TLS for remote providers;
- allow-list remote hosts;
- isolate provider credentials from application credentials;
- monitor provider health and latency;
- treat all provider output as untrusted data;
- revoke a provider immediately if its host or credential is compromised.

## 9. Logging and monitoring

Monitor at minimum:

- authentication failures/lockouts;
- authorization denials;
- safety pause/resume;
- approval decisions;
- MCP provider failures;
- task retries/lease expiry;
- abnormal task duration;
- evidence ingestion failures;
- database/storage errors;
- process restarts.

The application already initializes structured logging and Prometheus metrics during startup. fileciteturn768file0L2-L6

Alerting should be configured outside the application so a compromised application cannot silently disable all monitoring.

## 10. Rate limiting

Authentication already has dedicated persistent failure controls. For Internet-facing deployments, add infrastructure/API rate limiting at the reverse proxy as a second layer.

Recommended limits should be based on endpoint class rather than one global number:

- login: strict;
- MFA verification: strict;
- administrative mutation: moderate;
- read-only APIs: higher;
- WebSocket connection creation: strict;
- provider execution: policy-controlled rather than blindly rate-limited.

## 11. Deployment topology

### Single-host lab

```text
Browser -> localhost -> AlphaX -> local MCP providers -> authorized targets
```

This is the preferred topology for development and controlled labs.

### Hardened remote deployment

```text
Internet/VPN
    |
    v
TLS Reverse Proxy
    |
    v
AlphaX Control Plane
    |\
    | +--> SQLite / Evidence Store
    |
    +----> Kali MCP / HexStrike MCP
```

Keep security tooling on a protected network segment. Do not make MCP endpoints public simply because AlphaX is reachable remotely.

## 12. Recovery procedure

If compromise is suspected:

1. activate the application emergency stop;
2. isolate the AlphaX host from untrusted networks;
3. revoke sessions and privileged credentials;
4. disable affected MCP providers;
5. preserve logs, audit records and evidence;
6. determine the affected mission/task/provider set;
7. rotate secrets;
8. restore from a known-good backup if integrity is uncertain;
9. validate the restored control plane in an isolated environment;
10. only then reconnect authorized providers.

## 13. Release gate

A production release should not be promoted unless all of the following are true:

- typecheck passes;
- production build passes;
- security regression passes;
- MCP self-test passes without executing security tooling;
- intelligence regression passes;
- safety regression passes;
- backup/restore drill has passed;
- secrets are externalized;
- TLS/reverse proxy configuration has been reviewed;
- privileged accounts have MFA;
- provider endpoints are allow-listed;
- emergency stop has been tested;
- audit records are being persisted;
- monitoring and alerting are active.

## 14. Explicit non-goals

Production hardening does not grant authorization to test third-party systems. Scope, engagement authorization and applicable law remain external prerequisites for every security operation.
