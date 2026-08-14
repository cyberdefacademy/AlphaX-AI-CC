#!/usr/bin/env bash
# AlphaX Observability helper
# Starts/stops the Prometheus + Loki + Grafana stack.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [[ ! -f .env && -f .env.example ]]; then
  echo "[alphax-obs] No .env found - copying .env.example to .env"
  cp .env.example .env
fi

case "${1:-help}" in
  up|start)
    echo "[alphax-obs] Starting observability stack..."
    docker compose --env-file .env up -d
    echo
    echo "  Grafana        : http://localhost:3000"
    echo "  Prometheus     : http://localhost:9090/targets"
    echo "  Alertmanager   : http://localhost:9093"
    echo "  Pushgateway    : http://localhost:9091"
    ;;
  down|stop)
    docker compose --env-file .env down
    ;;
  restart)
    docker compose --env-file .env restart
    ;;
  logs)
    docker compose --env-file .env logs -f "${2:-grafana}"
    ;;
  ps|status)
    docker compose --env-file .env ps
    ;;
  wipe)
    echo "[alphax-obs] Removing containers AND volumes (all metrics/logs lost)."
    docker compose --env-file .env down -v
    ;;
  *)
    echo "Usage: $0 {up|down|restart|logs [svc]|ps|wipe}"
    ;;
esac