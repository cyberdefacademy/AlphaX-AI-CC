# AlphaX Agents OS

A locally-hosted control plane and dashboard for every AI agent installed on your machine.

It discovers, registers, monitors, and controls AI agents (OpenClaw, Hermes Agent, Claude Code,
opencode, and any generic CLI / Docker agent) from a single browser UI with live task streaming.

![stack](https://img.shields.io/badge/Node-22%2B-green) ![stack](https://img.shields.io/badge/React-18-blue) ![stack](https://img.shields.io/badge/SQLite-Single%20File-orange) ![stack](https://img.shields.io/badge/Bind-127.0.0.1-brightgreen)

---

## Quick start

```bash
# 1. Install dependencies (Node 22+ required)
npm install

# 2. Build the backend (TypeScript) and frontend (React/Vite)
npm run build

# 3. Start the control plane (listens on 127.0.0.1:8455)
npm start
```

On first start you will see the banner with your one-time access token:

```
  AlphaX Agents OS is running
  Dashboard : http://127.0.0.1:8455
  Access token : ax-...
```

Open `http://127.0.0.1:8455`, paste the token, and sign in. That's it — the dashboard auto-detects
all installed agents on the first scan (every 60s).

### Lost / forgot your token?

The token is only ever shown once — it is **not stored** (just a scrypt hash). Two ways to get a new one:

```bash
# Option A — rotate in place: keeps agents, activity, and active login sessions.
# The old token stops working immediately.
npm start -- --rotate-token

# Option B — full reset: wipes registrations + activity (fresh token on next start).
rm ~/.alphax-agents-os/data.db
npm start
```

### Other CLI flags

```bash
npm start                  # run the dashboard (default port 8455)
npm start -- --rotate-token  # print a new access token and exit
npm start -- --help          # usage summary
```

### Rebuilding after edits

```bash
npm run build        # full rebuild
npm run typecheck    # type-check server + web
```

---

## What it does

| Capability | Notes |
|---|---|
| Agent discovery | Scans PATH, `~/.openclaw`, `~/.hermes`, `~/.claude`, `~/.config/opencode`, systemd user services, and known gateway ports every `DETECT_INTERVAL` (default 60s). Anything new is registered automatically. |
| Status / health | Installed version, running state, gateway service, model/provider, process list per agent. |
| Task dispatch | Send a prompt to any agent instance (e.g. `openclaw main`) and watch the output stream live over WebSocket. Results are recorded in `tasks`. |
| Gateway control | Start / stop / restart an agent's gateway (e.g. `systemctl --user` or `openclaw gateway`). |
| Deep inspection | Sessions, channels, models, cron jobs, config, and log tails per agent. |
| Processes | Live process table for each agent (PID, CPU, memory, command). |
| Cron | Lists each agent's scheduled jobs with next/last run and last status. |
| Install new agents | From the **Agents** page: one-click install of OpenClaw, Hermes, Claude Code, opencode, plus presets (Codex, Aider, Ollama, Goose, Gemini). |
| Activity log | Every action (login, detect, install, task) is written to `activity` and streamed to the dashboard. |

### Supported adapters

| Type | Binary | Gateway | What's controlled |
|---|---|---|---|
| `openclaw` | `openclaw` | `openclaw-gateway` (systemd/port 18789) | instances (`main`, others), send, gateway start/stop/restart, sessions, channels, models, cron, config, logs |
| `hermes` | `hermes` | `hermes-gateway` (systemd) | send, gateway start/stop/restart, sessions, channels, cron, config, logs |
| `claude` | `claude` | none | send, config, logs |
| `opencode` | `opencode` | none | send, config, logs |
| `generic` | any CLI | none | send, config, logs (declared in agent config) |

---

## Project layout

```
server/   Express + TypeScript control plane
  src/adapters/   openclaw · hermes · claude · opencode · generic drivers
  src/routes/     auth · agents · tasks · activity · system REST endpoints
  src/            detector · registry · installers · metrics · tasks runner
  src/            db (SQLite) · auth (token+sessions) · ws (hub) · runner
web/      React 18 + Vite + Tailwind dashboard (single-page app)
  src/pages/      Overview · Agents · AgentDetail · Tasks · Activity · Settings
  src/components/ UI primitives · AgentCard · TaskDock · Icons
```

---

## Configuration

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `ALPHAX_HOME` | `~/.alphax-agents-os` | Where `data.db` (SQLite) and state live |
| `PORT` | `8455` | Dashboard port |
| `HOST` | `127.0.0.1` | Bind address (keep local-only) |
| `DETECT_INTERVAL` | `60` | Seconds between auto-rescans |

Example:

```bash
PORT=9000 ALPHAX_HOME=/home/me/.alphax-agents-os npm start
```

---

## Observability (optional Prometheus + Grafana + Loki stack)

The server exposes a Prometheus `/metrics` endpoint and writes structured JSON logs for log-aggregation.
A ready-made single-host observability stack (Prometheus, Loki, Grafana, cAdvisor, Node Exporter,
Alertmanager, Pushgateway) lives in [`observability/`](observability/README.md).

```bash
cd observability
cp .env.example .env        # set GRAFANA_ADMIN_PASSWORD first!
./obs.sh up
```

- Grafana : http://localhost:3000  (dashboards auto-provisioned)
- Prometheus targets : http://localhost:9090/targets
- Alertmanager : http://localhost:9093

See [`observability/README.md`](observability/README.md) for full details, dashboards, and alert tuning.

---

## Security model

- Binds to **127.0.0.1** only — not exposed on the network.
- First-run generates a random access token (printed once, stored only as a scrypt hash).
- Login issues an **HttpOnly + SameSite=Strict** session cookie (30-day TTL, in-memory).
- All `/api/*` routes and the `/ws` WebSocket require a valid session cookie.
- Tokens can be rotated any time from **Settings → Rotate access token**, or from the CLI with
  `npm start -- --rotate-token` (keeps all data and active sessions).
- No agent API keys are ever stored by this control plane.

---

## Notes & troubleshooting

- **Hermes CLI can be slow to answer** under load (cron jobs / provider rate limits). Every adapter call
  has a hard timeout, so the dashboard will show partial data rather than hang forever.
- **Task failures** (e.g. `API rate limit reached`) come from the agent/provider itself — the error text
  is captured in the task's stderr so you can see exactly what happened.
- **Data** lives in `~/.alphax-agents-os/data.db`. Delete it to reset registrations and activity
  (the token is reset too).
- Requires **Node.js 22+** (uses the built-in `node:sqlite` module).
