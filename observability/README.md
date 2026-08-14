# AlphaX Observability Stack

A single-host observability stack for the AlphaX Agents OS control plane:
Prometheus (metrics) · Grafana (dashboards/alerts) · Loki + Promtail (logs) · cAdvisor · Node Exporter · Alertmanager · Pushgateway.

## Quick start

```bash
# 1. Configure
cp .env.example .env
#    - REQUIRED: set GRAFANA_ADMIN_PASSWORD to a strong password
#    - Optional:  Slack/email for alerts, GitHub OAuth for team SSO

# 2. Bring the stack up
./obs.sh up
```

| Service        | URL                          | Default credentials            |
|----------------|------------------------------|--------------------------------|
| Grafana        | http://localhost:3000        | admin / <your GRAFANA_ADMIN_PASSWORD> |
| Prometheus     | http://localhost:9090        | —                              |
| Alertmanager   | http://localhost:9093        | —                              |
| Pushgateway    | http://localhost:9091        | —                              |
| Prometheus TSDB| (inside `prometheus-data` volume) | —                        |
| Loki           | http://localhost:3100        | —                              |

## What it monitors

### Metrics (`server/src/metricsProm.ts`, scraped from `http://127.0.0.1:8455/metrics`)
- `alphax_tasks_total{status}` — task completions by outcome
- `alphax_task_duration_seconds` — latency histogram → P50/P99
- `alphax_queue_depth{state}` — running / queued task depth
- `alphax_agents_up{type}` — discovered agents by status
- `alphax_agent_processes` — host agent process count
- `alphax_http_requests_total{route,status}` — API traffic
- Built-in process/host metrics (Node.js, CPU, memory, open fds) via `collectDefaultMetrics`

### Logs (`server/src/logger.ts` → `~/.alphax-agents-os/logs/server.log`)
Structured JSON lines (level, msg, agentId, taskId, ts) tailed by Promtail into Loki.

### Host & container metrics
- **cAdvisor** — per-container CPU / memory
- **Node Exporter** — CPU, memory, disk, load, network

## Grafana dashboards (auto-provisioned)
1. **AlphaX Fleet Overview** — agents up, task throughput, error rate, queue depth, P99 latency, HTTP traffic
2. **AlphaX Host Infrastructure** — CPU, memory, load, disk, network, container usage
3. **AlphaX Logs (Loki)** — streamed server logs with label filters

## Alerting
Rules in [`prometheus/rules/alphax.yml`](prometheus/rules/alphax.yml):

| Alert | Condition | Severity |
|-------|-----------|----------|
| `AlphaXAgentDown` | an agent down > 1m | critical |
| `AlphaXQueueBacklog` | queued > concurrency for 2m | warning |
| `AlphaXHighTaskErrorRate` | error rate > 5% for 3m | warning |
| `AlphaXSlowTasks` | P99 latency > 60s for 5m | warning |
| `AlphaXHostCPU` / `AlphaXHostMem` / `AlphaXDiskFull` | host resource exhaustion | warning/critical |
| `AlphaX*Down` | prometheus / loki / cadvisor / node-exporter down | warning/critical |

Routes to Slack + email via Alertmanager (`alertmanager/alertmanager.yml`). Set tokens in `.env`.

## Useful commands

```bash
./obs.sh up          # start stack
./obs.sh down        # stop (keeps data)
./obs.sh restart     # restart services
./obs.sh logs grafana # tail service logs
./obs.sh ps          # status
./obs.sh wipe        # stop and DELETE all metric/log/grafana data
```

## Understanding the configs

```
observability/
├── docker-compose.yml          # stack definition + volumes
├── .env.example                # copy to .env; secrets live here
├── obs.sh                      # control script
├── prometheus/
│   ├── prometheus.yml          # scrape configs (alphax, node, cadvisor, pushgateway)
│   └── rules/alphax.yml        # alert rules
├── promtail/promtail-config.yml# log tailing (server JSON logs, journald, docker)
├── loki/loki-config.yml        # log storage (30d default retention)
├── alertmanager/alertmanager.yml
└── grafana/
    ├── provisioning/           # datasources + dashboard provider
    └── dashboards/*.json       # Grafana dashboards (as code)
```

## Sending metrics/labels you can't scrape (batch/one-shot agents)

For short-lived agent processes that finish before Prometheus scrapes, push metrics:

```bash
# Send a one-shot task start/stop gauge, then delete once IPs are stable (after 3 min).
echo "alphax_agents_up{type=\"generic\"} 1" | \
  curl --data-binary @- http://localhost:9091/metrics/job/alphax_agents/instance/worker1
```

## Tuning for your fleet (100s of agents)

- **Queue alerts** — `rules/alphax.yml` backlog rules assume small concurrency. Scale triggers
  against your real `queue.concurrency` setting (`tasks → settings`).
- **Retention** — set `PROM_RETENTION`, `LOKI_RETENTION` in `.env`.
- **Auth** — enable GitHub OAuth in `.env` for team SSO (`GRAFANA_GITHUB_AUTH=true`).