#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" || ! -f "$BACKUP_FILE.sha256" ]]; then
  echo "Usage: $0 /path/to/alphax-<timestamp>.db" >&2
  exit 2
fi

sha256sum -c "$BACKUP_FILE.sha256"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$BACKUP_FILE" 'PRAGMA quick_check;' | grep -qx 'ok'
else
  echo "Checksum verified; install sqlite3 for structural database verification."
fi

echo "Backup verification passed: $BACKUP_FILE"
