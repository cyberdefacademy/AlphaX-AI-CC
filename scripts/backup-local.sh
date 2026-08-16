#!/usr/bin/env bash
set -euo pipefail

ALPHAX_HOME="${ALPHAX_HOME:-$HOME/.alphax-agents-os}"
BACKUP_DIR="${BACKUP_DIR:-$ALPHAX_HOME/backups}"
DB_PATH="${DB_PATH:-$ALPHAX_HOME/alphax.db}"

mkdir -p "$BACKUP_DIR"
if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/alphax-${stamp}.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$out'"
else
  cp --reflink=auto "$DB_PATH" "$out"
fi

sha256sum "$out" > "$out.sha256"
printf 'Backup created: %s\nChecksum: %s\n' "$out" "$out.sha256"
