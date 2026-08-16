# AlphaX Agents OS

A locally-hosted control plane and dashboard for AI agents and authorized security automation.

It discovers, registers, monitors, and controls AI agents (OpenClaw, Hermes Agent, Claude Code, opencode, and generic CLI / Docker agents) from a single browser UI. The security control plane adds RBAC, MFA, scope and policy enforcement, human approval gates, governed MCP execution, audit trails, mission orchestration, MITRE ATT&CK correlation and evidence tracking.

![stack](https://img.shields.io/badge/Node-22%2B-green) ![stack](https://img.shields.io/badge/React-18-blue) ![stack](https://img.shields.io/badge/SQLite-Single%20File-orange) ![stack](https://img.shields.io/badge/Bind-127.0.0.1-brightgreen)

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system boundaries and execution lifecycle
- [Implementation Guide](docs/IMPLEMENTATION.md) — orchestration, task queue, MCP, approvals and integration definition of done
- [Security Model](docs/SECURITY.md) — threats, controls and incident response
- [Threat Model](docs/THREAT-MODEL.md) — AI/MCP trust boundaries and attack scenarios
- [Kali + HexStrike MCP](docs/MCP-KALI-HEXSTRIKE.md) — governed MCP integration design
- [Phase 3 MCP Implementation](docs/PHASE-3-MCP.md) — dynamic provider discovery, health, schemas, normalization and safe validation
- [Phase 4 Intelligence](docs/PHASE-4-INTELLIGENCE.md) — normalization, ATT&CK candidates, evidence, findings, correlation, deduplication and analyst review
- [Operations Runbook](docs/OPERATIONS.md) — installation, operation and recovery
- [Phase 7 Production Operations](docs/PHASE-7-PRODUCTION-OPERATIONS.md) — hardened deployment, TLS edge, backups, rollout, rollback and disaster recovery
- [ATT&CK + Evidence](docs/ATTACK-AUDIT.md) — intelligence, findings and provenance
- [Roadmap](docs/ROADMAP.md) — implementation phases and definition of done

## Quick start

```bash
npm install
npm run build
npm start
```

Default control-plane listener: `127.0.0.1:8455`.

On first start, the service displays its one-time bootstrap access token. Keep it private. Use the supported rotation workflow if access is lost:

```bash
npm start -- --rotate-token
```

A full database reset is destructive and should only be performed when a fresh installation is intended.

### Development

```bash
npm run typecheck
npm run build
npm run dev:server
npm run dev:web
```

## What it does

| Capability | Notes |
|---|---|
| Agent discovery | Detects supported local agents and gateways on a configurable interval. |
| Agent control | Start/stop/restart supported gateways and dispatch tasks. |
| Task execution | Records task lifecycle and streams results over WebSocket. |
| Security control plane | RBAC, permissions, policy, scope, approvals and emergency stop. |
| Authentication | Persistent sessions, password hashing, TOTP MFA, revocation and login-abuse controls. |
| MCP governance | Registered providers/tools, dynamic discovery, schema validation, risk gates, scope context and execution receipts. |
| Mission orchestration | Bounded planning, worker leases, typed handoffs and adaptive feedback. |
| Intelligence | Deterministic result normalization, ATT&CK candidate mapping, evidence extraction, finding correlation, deduplication, confidence scoring and analyst review. |
| Audit | Tamper-evident security audit records and mission timelines. |
| Observability | Prometheus metrics and optional Grafana/Loki stack. |
| Production operations | Hardened systemd profile, TLS reverse-proxy example, edge rate limits and scheduled SQLite backups. |

### Supported agent adapters

| Type | Binary | Gateway | What's controlled |
|---|---|---|---|
| `openclaw` | `openclaw` | `openclaw-gateway` | instances, send, gateway, sessions, channels, models, cron, config, logs |
| `hermes` | `hermes` | `hermes-gateway` | send, gateway, sessions, channels, cron, config, logs |
| `claude` | `claude` | none | send, config, logs |
| `opencode` | `opencode` | none | send, config, logs |
| `generic` | any CLI | none | send, config, logs according to agent configuration |

### Governed MCP providers

AlphaX places existing security MCP servers behind one authorization and audit boundary. Kali MCP and HexStrike AI MCP are execution providers, not policy authorities. Their tool inventories are discovered at runtime and registered with provider-qualified names; see [Phase 3 MCP Implementation](docs/PHASE-3-MCP.md).

## Security architecture

```text
Operator
  -> Authentication / MFA
  -> RBAC
  -> Mission + Scope
  -> Policy
  -> Human Approval (when required)
  -> Task Queue / Worker Lease
  -> Governed MCP Adapter
  -> Tool Execution
  -> Receipt + Audit
  -> Result / ATT&CK / Evidence
```

Important rules:

- AI agents propose actions; they do not grant themselves permissions.
- Tool output is treated as untrusted data.
- Scope is checked immediately before privileged execution.
- High-risk actions can require explicit human approval.
- Unknown or ungoverned routes/tools fail closed.
- Emergency stop blocks governed execution.
- Secrets must never be committed to Git.

## Authentication

- Persistent local users and roles: `admin`, `security-analyst`, `pentester`, `auditor`, `viewer`.
- Scrypt password hashing with per-user salts.
- Persistent opaque sessions with revocation support.
- TOTP MFA with encrypted-at-rest secret material.
- Login failure tracking and temporary lockout.
- HttpOnly + SameSite cookie protection and state-changing request origin checks.

## Network exposure

The default binding is **127.0.0.1**. Do not expose the dashboard directly to the Internet. For remote access, use a properly configured TLS reverse proxy and review the [Security Model](docs/SECURITY.md) and [Phase 7 Production Operations](docs/PHASE-7-PRODUCTION-OPERATIONS.md).

## Project layout

```text
server/                 Express + TypeScript control plane
  src/adapters/         OpenClaw, Hermes, Claude, opencode, generic drivers
  src/routes/           REST API routes
  src/                  auth, policy, missions, tasks, MCP, audit, intelligence, workers
web/                    React 18 + Vite + Tailwind dashboard
docs/                   Architecture, implementation, security and operations documentation
observability/          Prometheus / Grafana / Loki stack
deploy/                 Production systemd and nginx deployment profiles
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ALPHAX_HOME` | `~/.alphax-agents-os` | SQLite database and local state |
| `PORT` | `8455` | Dashboard port |
| `HOST` | `127.0.0.1` | Bind address; keep local-only by default |
| `DETECT_INTERVAL` | `60` | Agent discovery interval in seconds |
| `ALPHAX_KALI_MCP_URL` | `http://127.0.0.1:9999` | Kali MCP endpoint |
| `ALPHAX_HEXSTRIKE_MCP_URL` | unset | Optional HexStrike MCP endpoint |
| `ALPHAX_MCP_ALLOWED_HOSTS` | loopback hosts | Explicit MCP remote-host allowlist |
| `ALPHAX_MCP_TIMEOUT_MS` | `30000` | Governed MCP request timeout |

Example:

```bash
PORT=9000 ALPHAX_HOME=/home/me/.alphax-agents-os npm start
```

See `docs/PHASE-3-MCP.md` for provider authentication and remote endpoint configuration and `docs/PHASE-7-PRODUCTION-OPERATIONS.md` for production deployment.

## Observability

The server exposes a Prometheus `/metrics` endpoint and structured logs. A single-host Prometheus, Loki, Grafana, cAdvisor, Node Exporter, Alertmanager and Pushgateway stack is available under [`observability/`](observability/README.md).

```bash
cd observability
cp .env.example .env
# set a strong GRAFANA_ADMIN_PASSWORD
./obs.sh up
```

## Responsible use

AlphaX is intended for systems and assets for which the operator has explicit authorization. The control plane is deliberately designed to keep scope, approval, audit and evidence boundaries around security tooling. Do not use it to access or test systems without permission.

See [SECURITY.md](docs/SECURITY.md), [THREAT-MODEL.md](docs/THREAT-MODEL.md), [OPERATIONS.md](docs/OPERATIONS.md) and [PHASE-7-PRODUCTION-OPERATIONS.md](docs/PHASE-7-PRODUCTION-OPERATIONS.md) before enabling additional MCP providers or network exposure.
