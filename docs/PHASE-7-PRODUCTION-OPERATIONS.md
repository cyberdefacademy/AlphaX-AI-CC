# Phase 7 — Production Deployment & Operations

## Objective

Move the governed AlphaX control plane from a development-oriented installation into a repeatable production operating profile without weakening the existing authorization, scope, approval, emergency-stop, audit or MCP governance boundaries.

This phase is deliberately infrastructure-first: the production edge terminates TLS and applies request-rate controls while AlphaX remains bound to loopback. The application process runs under a dedicated service account with a restricted systemd sandbox, and SQLite backups are scheduled and retained as protected operational records.

## Included in the first Phase 7 slice

- hardened systemd service profile;
- nginx TLS reverse-proxy profile with WebSocket support;
- edge rate limits for API traffic and authentication;
- daily SQLite backup service and timer;
- production deployment environment conventions;
- rollout, rollback and recovery procedure.

## Deployment layout

```text
Internet / corporate network
        |
      TLS
        |
   nginx / WAF
   rate limits
        |
  127.0.0.1:8455
        |
 AlphaX Agents OS
  systemd sandbox
        |
  /var/lib/alphax-agents-os
        |
   SQLite + backups
```

The application should not be exposed directly to an untrusted network. If remote access is not required, keep the service local-only and omit nginx entirely.

## Production installation

Create a dedicated service account and state directory:

```bash
sudo useradd --system --home /var/lib/alphax-agents-os --shell /usr/sbin/nologin alphax
sudo install -d -o alphax -g alphax -m 0700 /var/lib/alphax-agents-os
sudo install -d -o root -g root -m 0750 /etc/alphax-agents-os
sudo install -m 0600 /path/to/production.env /etc/alphax-agents-os/production.env
```

Install the application under `/opt/alphax-agents-os/current`, build it with the supported Node runtime, then install the unit files from `deploy/systemd/`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now alphax-agents-os.service
sudo systemctl enable --now alphax-backup.timer
```

Check service state and the unauthenticated health endpoint locally:

```bash
systemctl status alphax-agents-os.service
curl --fail http://127.0.0.1:8455/api/health
```

## Reverse proxy

Use `deploy/nginx/alphax-agents-os.conf.example` as a starting point. Replace the example hostname and certificate paths, validate the configuration with `nginx -t`, then reload nginx.

The proxy profile provides:

- TLS 1.2/1.3;
- explicit WebSocket forwarding;
- 5 MiB request-body limit matching the application JSON limit;
- authentication request throttling;
- general API throttling;
- basic browser hardening headers.

The example is intentionally conservative. Tune limits from observed traffic rather than disabling them globally.

## Secrets

Do not place provider credentials, bootstrap tokens, database keys or MFA secrets in the repository. The systemd unit reads `/etc/alphax-agents-os/production.env`, which must be owned by root and mode `0600`.

Rotate credentials after any suspected disclosure. Keep a separate inventory of provider credentials and their owners/expiry dates.

## Backup and restore

The existing `scripts/backup-local.sh` performs a consistent SQLite backup when `sqlite3` is available and writes a SHA-256 sidecar. The Phase 7 timer runs it daily.

Verify a backup before relying on it:

```bash
ALPHAX_HOME=/var/lib/alphax-agents-os \
  /bin/bash scripts/verify-backup.sh /var/lib/alphax-agents-os/backups/<backup>.db
```

Maintain at least one copy outside the application host. Backups contain security-sensitive operational state and must receive the same or stronger access controls as the live database.

A restore is a controlled maintenance operation:

1. stop AlphaX;
2. preserve the current database before replacement;
3. verify checksum and SQLite integrity of the candidate backup;
4. restore the database with ownership `alphax:alphax` and mode `0600`;
5. start AlphaX;
6. verify `/api/health`, authentication, audit access and task-worker recovery;
7. review the audit trail before resuming governed execution.

## Rollout

1. Build and test the exact release commit.
2. Back up the current production database.
3. Install the new application beside the current release.
4. Switch `/opt/alphax-agents-os/current` atomically to the tested release.
5. Restart the systemd service.
6. Confirm health, logs, metrics and worker state.
7. Perform a non-destructive authenticated smoke test.
8. Resume governed execution only after operator verification.

## Rollback

If health checks, authentication, worker recovery, MCP provider discovery or audit behavior regress:

1. stop the service;
2. restore the previous release symlink;
3. restart the service;
4. do not automatically restore a database backup unless the release changed database state incompatibly;
5. inspect logs and audit events;
6. keep the failed release available for forensic analysis;
7. document the incident and corrective action.

## Security invariants

Phase 7 must not change these invariants:

- AI agents cannot grant themselves permissions;
- privileged execution remains mission/scope/policy/approval governed;
- unknown MCP tools fail closed;
- emergency stop blocks governed execution;
- tool output remains untrusted data;
- audit and execution receipts remain enabled;
- secrets remain outside Git;
- production remote access terminates at a trusted TLS edge.

## Definition of done

- [ ] production service runs under a dedicated unprivileged account;
- [ ] application remains loopback-bound behind the TLS edge;
- [ ] edge rate limits are active and tested;
- [ ] backup timer runs successfully;
- [ ] backup checksum and SQLite integrity verification are exercised;
- [ ] off-host backup copy exists;
- [ ] rollback procedure has been rehearsed;
- [ ] health, metrics and logs are monitored;
- [ ] credential rotation procedure is documented;
- [ ] existing governance/security regression suite remains green.

## Next Phase 7 increments

The next implementation slices should add application-level distributed rate-limit support where required, resource quotas for workers/tasks, structured security alerts and automated disaster-recovery verification. These should be introduced independently so each change can be validated without expanding the execution authority of agents or MCP providers.
