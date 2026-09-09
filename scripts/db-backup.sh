#!/usr/bin/env bash
set -euo pipefail

if [[ "${NODE_ENV:-development}" == "production" && "${ALLOW_DEMO_RESET:-false}" == "true" ]]; then
  echo "Refusing backup with demo reset enabled in production." >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" || $# -ne 1 ]]; then
  echo "Usage: DATABASE_URL=postgresql://... scripts/db-backup.sh /secure/path/clinic.dump" >&2
  exit 2
fi
pg_dump --format=custom --no-owner --file="$1" "$DATABASE_URL"
echo "Backup written to the requested path. Protect it as sensitive data."
