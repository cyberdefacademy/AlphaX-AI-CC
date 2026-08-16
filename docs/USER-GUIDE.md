# AlphaX Agents OS — Complete Installation & User Guide

**Repository:** `cyberdefacademy/AlphaX-AI-CC`

This guide covers installation, first start, authentication, configuration, Kali MCP and HexStrike MCP integration, missions, scopes, approvals, task execution, audit/review, emergency stop, backups, troubleshooting, production deployment, and safe shutdown/recovery.

> **Authorized-use requirement:** AlphaX is a control plane for AI agents and authorized security automation. Only connect tools to systems and assets for which you have explicit authorization. Keep high-risk execution behind the approval, scope, policy, and safety controls.

---

## 1. What AlphaX Agents OS does

AlphaX is a locally hosted control plane for AI agents and authorized security automation. It provides a browser dashboard and API around authentication, RBAC, scope/policy enforcement, human approvals, task orchestration, governed MCP execution, audit trails, mission orchestration, MITRE ATT&CK correlation, evidence and findings.

Kali MCP and HexStrike MCP are treated as execution providers. AlphaX is the governance layer; providers do not grant themselves permission.

### Execution model

```text
Operator
  |
  v
Authentication / MFA
  |
  v
RBAC + Project + Scope
  |
  v
Mission / Task
  |
  v
Policy + Risk decision
  |
  +----> Human approval when required
  |
  v
Task queue / worker lease
  |
  v
Governed MCP gateway
  |
  +----> Kali MCP
  |
  +----> HexStrike MCP
  |
  v
Result normalization
  |
  +----> ATT&CK / findings / evidence
  |
  +----> execution receipt
  |
  +----> audit timeline
```

---

## 2. Prerequisites

### Recommended host

For the first deployment, use the Kali Linux machine that already hosts your Kali MCP and HexStrike MCP services.

Minimum practical requirements:

- Linux/Kali host
- Git
- Node.js **22.13+**
- npm
- Network access to the MCP providers you intend to use
- At least 2 GB free RAM for the control plane and normal development tooling
- A protected filesystem for AlphaX state and credentials

The repository declares Node `>=22.13.0`. Use Node 24 LTS if it is already available in your environment, or Node 22.13+ for the closest compatibility with the repository declaration.

### Check prerequisites

```bash
node --version
npm --version
git --version
```

If Node is missing on Kali, install the Node.js version appropriate for your organization's package-management policy. Avoid mixing multiple Node installation methods in the same production host unless you understand the resulting PATH and service environment.

---

## 3. Obtain the source

Clone the repository:

```bash
git clone https://github.com/cyberdefacademy/AlphaX-AI-CC.git
cd AlphaX-AI-CC
```

Confirm the branch and working tree:

```bash
git branch --show-current
git status
```

For a controlled deployment, use a tagged/reviewed release or a known commit rather than an unreviewed development branch.

---

## 4. Install dependencies

AlphaX is an npm workspace containing `server` and `web` packages. Run installation from the repository root:

```bash
npm install
```

Do not normally run separate ad-hoc installs inside `server/` or `web/` unless a development task specifically requires it.

For reproducible CI/deployment installs when the lockfile is present:

```bash
npm ci
```

---

## 5. Verify the installation

Run type checking:

```bash
npm run typecheck
```

Build both server and web UI:

```bash
npm run build
```

If both commands complete successfully, the application is ready to start.

---

## 6. First start

Start AlphaX:

```bash
npm start
```

The default listener is:

```text
http://127.0.0.1:8455
```

The first start generates/displays a one-time bootstrap access token when no token is already configured. Treat that token as a secret. Do not put it into Git, screenshots, tickets, chat messages, shell history shared with others, or documentation.

Open the dashboard in your browser:

```text
http://127.0.0.1:8455
```

### Health check

The unauthenticated health endpoint is:

```bash
curl --fail http://127.0.0.1:8455/api/health
```

A successful response confirms that the control plane is running.

### Rotate the bootstrap token

If you need to rotate the configured access token:

```bash
npm start -- --rotate-token
```

The new token is shown once. Store it in an approved secret-management location.

---

## 7. Important configuration variables

The principal configuration values are:

| Variable | Default | Purpose |
|---|---|---|
| `ALPHAX_HOME` | `~/.alphax-agents-os` | SQLite database and local state |
| `PORT` | `8455` | HTTP listener port |
| `HOST` | `127.0.0.1` | Bind address |
| `DETECT_INTERVAL` | `60` | Agent discovery interval, seconds |
| `ALPHAX_KALI_MCP_URL` | `http://127.0.0.1:9999` | Kali MCP endpoint |
| `ALPHAX_HEXSTRIKE_MCP_URL` | unset | Optional HexStrike MCP endpoint |
| `ALPHAX_MCP_ALLOWED_HOSTS` | loopback hosts | Explicit remote MCP host allowlist |
| `ALPHAX_MCP_TIMEOUT_MS` | `30000` | MCP request timeout |

### Example local configuration

```bash
export ALPHAX_HOME="$HOME/.alphax-agents-os"
export HOST="127.0.0.1"
export PORT="8455"
export ALPHAX_KALI_MCP_URL="http://127.0.0.1:9999"
```

Start after exporting variables:

```bash
npm start
```

For a permanent deployment, put secrets and environment settings in a protected environment file rather than committing them to the repository.

---

## 8. Authentication and roles

AlphaX provides persistent users and roles, password hashing, sessions, MFA, session revocation and login-abuse controls.

Supported roles include:

- `admin` — platform administration and security-control management
- `security-analyst` — security analysis and governed operations
- `pentester` — authorized assessment workflows within policy/scope
- `auditor` — audit/review functions
- `viewer` — read-only access where permitted

### First-login checklist

1. Sign in with the bootstrap/admin mechanism.
2. Change the initial credential if the deployment workflow requires it.
3. Enable TOTP MFA.
4. Create individual named users instead of sharing the administrator account.
5. Assign the least privilege needed for each operator.
6. Revoke unused sessions.
7. Confirm the audit trail records administrative activity.

Never share administrator credentials between operators.

---

## 9. Understand the governance model before connecting security tools

AlphaX deliberately separates **proposal** from **authorization**.

An AI agent may propose a task. It does not automatically receive permission to execute it.

Before privileged execution, AlphaX can evaluate:

1. authenticated identity;
2. role/permission;
3. project;
4. mission;
5. target scope;
6. policy;
7. capability/tool risk;
8. human approval;
9. provider health;
10. input schema;
11. execution/safety state.

The execution boundary performs fresh checks because tasks can become stale after they are created.

---

## 10. Create an authorized project and scope

Start with the assets you are explicitly authorized to test.

Prefer exact scope definitions such as:

- specific IP addresses;
- explicitly authorized CIDR ranges;
- exact hostnames;
- asset IDs;
- lab networks;
- dedicated test environments.

Avoid vague scope such as "the company's network" unless the authorization document defines it precisely elsewhere.

### Recommended scope record

```text
Project: AlphaX Internal Security Lab
Owner: Security Team
Authorized assets:
  192.168.56.10
  192.168.56.20
  lab.example.internal
Excluded:
  production.example.com
  192.168.1.0/24
Allowed window:
  09:00–17:00 UTC
```

The scope should match your actual written authorization.

---

## 11. Create a mission

A mission should state:

- objective;
- project;
- scope;
- owner/operator;
- constraints;
- expected outputs;
- allowed operational window where applicable.

Example:

```text
Mission: Authorized Web Application Assessment
Objective: Identify and document security weaknesses in the lab application.
Project: AlphaX Internal Security Lab
Scope: 192.168.56.10 only
Constraints: No destructive testing; no persistence; stop on instability.
Outputs: Findings, evidence references, ATT&CK candidates where applicable.
```

Use bounded missions rather than giving an agent an open-ended instruction such as "hack the network."

---

## 12. Planning and task creation

The planner creates bounded work items. Review the generated tasks before execution, especially if the task can:

- modify a system;
- authenticate to another system;
- generate significant traffic;
- alter files or configuration;
- affect availability;
- access sensitive data;
- invoke a high-risk MCP capability.

The task queue persists lifecycle state and worker leases. Stale tasks are interrupted during startup recovery rather than silently continuing from an unknown state.

---

## 13. Human approval workflow

When policy requires approval:

1. inspect the proposed task;
2. inspect the exact tool/capability;
3. inspect the target and scope;
4. inspect the risk classification;
5. approve only the intended action;
6. execute;
7. review the resulting receipt and audit event.

Prefer narrow approvals tied to a mission/task/tool/scope rather than blanket agent permissions.

If you cannot explain exactly what an approval authorizes, do not approve it.

---

# 14. Connect Kali MCP

AlphaX supports the existing Kali MCP as a governed execution provider.

### 14.1 Verify Kali MCP first

On the Kali host, verify that your Kali MCP service is listening on its configured endpoint. The repository default is:

```text
http://127.0.0.1:9999
```

Do not assume the endpoint is healthy merely because the port is open. Verify the MCP service itself using its documented health/protocol method.

### 14.2 Configure AlphaX

For a local Kali MCP:

```bash
export ALPHAX_KALI_MCP_URL="http://127.0.0.1:9999"
```

Restart AlphaX after changing environment configuration:

```bash
npm start
```

### 14.3 Provider discovery

On startup AlphaX registers configured providers and attempts tool discovery. Provider health and discovered tools should appear in the dashboard/provider views.

Do not hard-code a tool inventory in your operational documentation. The actual inventory comes from the connected MCP provider at runtime.

### 14.4 Validate governance

Before executing anything:

- confirm provider identity;
- inspect discovered tools;
- review risk classification;
- confirm target requirements;
- verify scope policy;
- verify approval behavior;
- test a benign/read-only operation first;
- confirm an execution receipt is recorded.

---

# 15. Connect HexStrike MCP

HexStrike is another execution provider. AlphaX remains the governance boundary.

### 15.1 Configure endpoint

Set the endpoint supplied by your local HexStrike MCP deployment:

```bash
export ALPHAX_HEXSTRIKE_MCP_URL="http://127.0.0.1:<HEXSTRIKE_PORT>"
```

Replace `<HEXSTRIKE_PORT>` with the actual port used by your HexStrike MCP service.

If HexStrike is remote, do not simply point AlphaX at an arbitrary HTTP address. Use HTTPS/TLS, explicit host allowlisting, provider authentication, restricted egress, and a documented trust relationship.

### 15.2 Restart AlphaX

```bash
npm start
```

### 15.3 Confirm discovery

Verify that AlphaX discovers HexStrike tools and records provider health. If discovery fails, inspect AlphaX logs and the HexStrike MCP logs before attempting execution.

### 15.4 Security rule

HexStrike output is untrusted result data. It is not an authorization decision and must not be allowed to bypass AlphaX policy, scope, approval or safety checks.

---

# 16. MCP execution lifecycle

A governed MCP action follows this conceptual path:

```text
Mission
  -> Authentication
  -> RBAC
  -> Project/scope
  -> Policy
  -> Approval if required
  -> Capability/risk lookup
  -> Provider health
  -> Schema validation
  -> Final scope/safety check
  -> MCP provider
  -> Result normalization
  -> Receipt
  -> ATT&CK/finding/evidence correlation
  -> Audit timeline
```

If any required control fails, the operation should be denied rather than silently downgraded into an unauthorized execution.

---

# 17. MITRE ATT&CK and intelligence workflow

AlphaX can normalize results and associate them with ATT&CK candidates, findings and evidence.

Treat ATT&CK mappings as analyst-assistance data, not proof by themselves.

Recommended workflow:

1. execute an authorized assessment action;
2. inspect raw provider output;
3. review normalized result;
4. review ATT&CK candidate mappings;
5. correlate evidence with findings;
6. validate confidence and context;
7. have an analyst approve/report the final conclusion.

Do not automatically convert an AI-generated ATT&CK candidate into a confirmed finding without review.

---

# 18. Audit trail and execution receipts

The system records security activity and mission timeline events. MCP execution receipts provide a record of governed tool invocation.

For an investigation or audit, preserve:

- operator identity;
- mission/project;
- scope;
- approval information;
- tool/provider;
- task ID;
- timestamps;
- result metadata;
- evidence references;
- audit events;
- relevant system logs.

Protect the database and evidence store from unauthorized modification.

---

# 19. Emergency stop

Use the global execution stop when:

- scope becomes uncertain;
- an agent appears compromised;
- a provider behaves unexpectedly;
- credentials may have leaked;
- a task appears unsafe;
- a tool behaves differently from its reviewed behavior;
- a target responds unexpectedly.

### Emergency procedure

1. Activate the global execution stop.
2. Preserve audit records.
3. Revoke active approvals where appropriate.
4. Inspect running workers/tasks.
5. Isolate the affected provider/agent.
6. Review logs and receipts.
7. Determine the cause.
8. Reconfirm scope and policy.
9. Resume only after human review.

The emergency stop is a server-side execution control, not merely a dashboard visual state.

---

# 20. Agent management

AlphaX can discover and manage supported agent adapters such as OpenClaw, Hermes, Claude Code, opencode and generic CLI/Docker agents.

The control plane can track agent state and, where an adapter supports it, send commands or manage a gateway.

### Recommended agent onboarding

1. Install the agent independently.
2. Verify its binary and configuration.
3. Run it manually in a safe environment.
4. Confirm the adapter detects it.
5. Register it in AlphaX.
6. Assign least privilege.
7. Place it inside an authorized project/mission workflow.
8. Test stop/restart behavior.
9. Test audit visibility.

Do not give an agent unrestricted credentials merely because AlphaX can manage it.

---

# 21. Observability

AlphaX exposes Prometheus metrics and supports the repository's observability stack.

The basic endpoint is:

```bash
curl http://127.0.0.1:8455/metrics
```

For the optional observability stack:

```bash
cd observability
cp .env.example .env
# Set a strong GRAFANA_ADMIN_PASSWORD
./obs.sh up
```

Monitor at minimum:

- application availability;
- request latency/errors;
- worker failures;
- queue growth;
- MCP provider health;
- authentication failures;
- safety-stop events;
- approval activity;
- disk space;
- backup success/failure.

Never put passwords, tokens, MFA secrets or provider credentials into logs.

---

# 22. Backup

The SQLite database contains operational state and security records.

Use the repository backup tooling and an OS-level/off-host backup mechanism.

Verify a backup before relying on it:

```bash
ALPHAX_HOME=/var/lib/alphax-agents-os \
  /bin/bash scripts/verify-backup.sh /var/lib/alphax-agents-os/backups/<backup>.db
```

Store at least one backup copy separately from the application host. Protect backups as sensitive security records.

---

# 23. Production deployment

For production, keep AlphaX bound to loopback and put a trusted TLS reverse proxy in front of it when remote access is required.

Recommended topology:

```text
Remote operator
      |
     TLS
      |
 nginx / WAF / rate limits
      |
127.0.0.1:8455
      |
 AlphaX Agents OS
      |
 SQLite / backups / MCP providers
```

The repository includes production deployment profiles under `deploy/` and a detailed production operations guide in `docs/PHASE-7-PRODUCTION-OPERATIONS.md`.

### Production service account

Create a dedicated account and state directory:

```bash
sudo useradd --system --home /var/lib/alphax-agents-os --shell /usr/sbin/nologin alphax
sudo install -d -o alphax -g alphax -m 0700 /var/lib/alphax-agents-os
sudo install -d -o root -g root -m 0750 /etc/alphax-agents-os
```

Store the production environment file as root-owned mode 0600:

```bash
sudo install -m 0600 /path/to/production.env /etc/alphax-agents-os/production.env
```

Then enable the service and backup timer according to the repository deployment profile:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now alphax-agents-os.service
sudo systemctl enable --now alphax-backup.timer
```

Verify:

```bash
systemctl status alphax-agents-os.service
curl --fail http://127.0.0.1:8455/api/health
```

For remote access, configure TLS and WebSocket forwarding using the supplied nginx example and validate it with:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Do not expose port 8455 directly to the Internet.

---

# 24. Updating AlphaX

For a controlled update:

```bash
cd /opt/alphax-agents-os/current
git fetch --tags origin
git status
```

Review the intended release/commit before switching production.

Then:

```bash
npm ci
npm run typecheck
npm run build
```

Back up the current database before the production switch.

Restart only after the new build passes local validation:

```bash
sudo systemctl restart alphax-agents-os.service
```

Then verify:

```bash
systemctl --no-pager --full status alphax-agents-os.service
curl --fail http://127.0.0.1:8455/api/health
```

Perform an authenticated, non-destructive smoke test before resuming governed execution.

---

# 25. Rollback

If the new release causes problems:

1. stop AlphaX;
2. preserve logs and the failed release for investigation;
3. switch the deployment symlink back to the previous known-good release;
4. restart the service;
5. verify health/authentication/audit/worker behavior;
6. restore a database backup only when required by an incompatible state change;
7. keep the failed release and relevant logs for forensic review;
8. document the incident and corrective action.

Do not automatically destroy the failed deployment before investigation.

---

# 26. Troubleshooting

## Dashboard does not open

Check:

```bash
systemctl status alphax-agents-os.service
ss -lntp | grep 8455
curl -v http://127.0.0.1:8455/api/health
```

If the service is not listening, inspect:

```bash
journalctl -u alphax-agents-os.service -n 200 --no-pager
```

## Build fails

Run:

```bash
node --version
npm --version
npm ci
npm run typecheck
npm run build
```

Confirm Node satisfies the repository engine requirement.

## Kali MCP is unavailable

Check the MCP service independently, then check AlphaX configuration:

```bash
echo "$ALPHAX_KALI_MCP_URL"
curl -v "$ALPHAX_KALI_MCP_URL"
```

Use the MCP server's own documented protocol/health test rather than assuming a successful TCP connection means the MCP service is functional.

## HexStrike MCP is unavailable

Check:

```bash
echo "$ALPHAX_HEXSTRIKE_MCP_URL"
curl -v "$ALPHAX_HEXSTRIKE_MCP_URL"
```

Then inspect AlphaX and HexStrike logs. Verify that the remote host is explicitly allowed if the provider is not on loopback.

## Tool appears but execution is denied

Check, in order:

1. authentication;
2. role/permission;
3. project;
4. mission;
5. target scope;
6. policy;
7. approval;
8. provider health;
9. tool registration/risk;
10. safety state.

A denial is often the intended security behavior.

## Emergency stop will not resume

Do not bypass the control manually. Inspect the safety state, audit events, active approvals and worker/task state. Resume only after the underlying condition is understood.

## Database problems

Stop the service before maintenance. Preserve the current database first. Verify candidate backups with checksum and SQLite integrity checks before restoration.

---

# 27. Safe first-run acceptance test

Perform this before connecting high-impact tools to real authorized targets.

### A. Core service

- [ ] `npm ci` succeeds
- [ ] `npm run typecheck` succeeds
- [ ] `npm run build` succeeds
- [ ] service starts
- [ ] `/api/health` succeeds
- [ ] dashboard loads

### B. Authentication

- [ ] administrator can log in
- [ ] MFA works
- [ ] a least-privilege user can log in
- [ ] unauthorized API request is rejected
- [ ] session revocation works

### C. Governance

- [ ] project exists
- [ ] scope is exact
- [ ] mission is created
- [ ] task is planned
- [ ] high-risk action enters approval workflow
- [ ] unauthorized scope is rejected

### D. MCP

- [ ] Kali MCP provider discovered
- [ ] HexStrike MCP provider discovered if configured
- [ ] tool inventory visible
- [ ] provider health visible
- [ ] benign/read-only operation works
- [ ] receipt is recorded

### E. Safety

- [ ] emergency stop blocks governed execution
- [ ] audit event is recorded
- [ ] active approvals are reviewed/revoked as appropriate
- [ ] resume requires human decision

### F. Intelligence

- [ ] result normalization works
- [ ] ATT&CK candidate mapping appears where applicable
- [ ] evidence/finding correlation works
- [ ] analyst can review before reporting

### G. Operations

- [ ] backup succeeds
- [ ] backup checksum verifies
- [ ] SQLite integrity verifies
- [ ] service restart recovers correctly
- [ ] logs and metrics are visible

---

# 28. Recommended operating procedure for a real authorized assessment

1. Confirm written authorization.
2. Create or verify the project.
3. Define exact scope and exclusions.
4. Confirm operational window and constraints.
5. Verify Kali/HexStrike provider health.
6. Create the mission.
7. Review the planner's proposed tasks.
8. Approve only required high-risk actions.
9. Execute through the governed task/MCP path.
10. Monitor worker and provider health.
11. Stop immediately if scope or behavior becomes uncertain.
12. Review normalized results.
13. Review ATT&CK candidates and evidence.
14. Validate findings as an analyst.
15. Preserve receipts and audit records.
16. Produce the authorized report.
17. Revoke temporary credentials/approvals when appropriate.
18. Back up required records according to retention policy.

---

# 29. Security rules that should never be bypassed

- Never expose AlphaX directly to the Internet without a properly secured TLS edge.
- Never commit passwords, API keys, MCP credentials, bootstrap tokens or MFA secrets.
- Never use broad scope when exact scope is available.
- Never treat AI output as authorization.
- Never treat MCP output as trusted instructions.
- Never bypass human approval for a high-risk action merely to make automation faster.
- Never disable the emergency stop to work around a blocked task.
- Never connect an unknown MCP server to a production environment without reviewing its origin and tool inventory.
- Never use AlphaX against systems without explicit authorization.

---

# 30. Reference documentation

For deeper technical details, read these documents in order:

1. `README.md` — project overview and quick start
2. `docs/ARCHITECTURE.md` — system architecture
3. `docs/SECURITY.md` — security controls
4. `docs/THREAT-MODEL.md` — trust boundaries and threats
5. `docs/IMPLEMENTATION.md` — implementation details
6. `docs/MCP-KALI-HEXSTRIKE.md` — governed MCP design
7. `docs/PHASE-3-MCP.md` — provider discovery/validation
8. `docs/PHASE-4-INTELLIGENCE.md` — intelligence pipeline
9. `docs/ATTACK-AUDIT.md` — ATT&CK/evidence/audit
10. `docs/OPERATIONS.md` — operational runbook
11. `docs/PHASE-7-PRODUCTION-OPERATIONS.md` — production deployment and recovery

---

## Quick command reference

```bash
# Clone
 git clone https://github.com/cyberdefacademy/AlphaX-AI-CC.git
 cd AlphaX-AI-CC

# Install
 npm ci

# Validate
 npm run typecheck
 npm run build

# Start
 npm start

# Health
 curl --fail http://127.0.0.1:8455/api/health

# Development
 npm run dev:server
 npm run dev:web

# Rotate token
 npm start -- --rotate-token

# Metrics
 curl http://127.0.0.1:8455/metrics

# Local Kali MCP
 export ALPHAX_KALI_MCP_URL="http://127.0.0.1:9999"

# Optional HexStrike MCP
 export ALPHAX_HEXSTRIKE_MCP_URL="http://127.0.0.1:<HEXSTRIKE_PORT>"
```

**End state:** AlphaX should be treated as the governance/control plane; Kali MCP and HexStrike MCP remain execution providers; the operator remains the authority for high-risk activity.
