#!/usr/bin/env bash
# Puts a backup back: ./restore.sh [commit]   (default: the latest; list them with git -C backups log --oneline)
# The database as it was goes to before-restore.sql first, so a restore can itself be undone.
set -euo pipefail
cd "$(dirname "$0")"

commit=${1:-HEAD}
dump=$(mktemp)
trap 'rm -f "$dump"' EXIT
git -C backups show "$commit:chess.sql" > "$dump"

docker compose exec -T postgres pg_dump -U chess --clean --if-exists --no-owner chess > before-restore.sql
docker compose stop server
# One transaction: a failure leaves the database as it was, and the server comes back either way.
if ! docker compose exec -T postgres psql -U chess -d chess -q -v ON_ERROR_STOP=1 --single-transaction < "$dump"; then
  docker compose start server
  echo "Restore failed; nothing was changed." >&2
  exit 1
fi
docker compose start server
echo "Restored $commit. The database as it was is in before-restore.sql."
