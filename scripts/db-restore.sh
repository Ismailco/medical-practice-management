#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" || $# -ne 1 ]]; then
  echo "Usage: DATABASE_URL=postgresql://... scripts/db-restore.sh /secure/path/clinic.dump" >&2
  exit 2
fi
database="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.pathname.slice(1))' "$DATABASE_URL")"
case "$database" in
  ""|postgres|clinic|*production*|*staging*) echo "Refusing restore into an unsafe database name." >&2; exit 1;;
esac
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$1"
echo "Restore completed. Run migration and integrity checks before serving traffic."
