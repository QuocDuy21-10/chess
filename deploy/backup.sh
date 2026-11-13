#!/usr/bin/env bash
# Dumps the database to backups/chess.sql and pushes it to the private backup repository.
# Cron runs it every night and deploy.sh before every deploy. See README, "Backups".
set -euo pipefail
cd "$(dirname "$0")"

# Sessions keep their table but not their rows: sign-in tokens need not survive, and should not leave the server.
docker compose exec -T postgres pg_dump -U chess --clean --if-exists --no-owner \
  --exclude-table-data=sessions chess > backups/chess.sql.tmp
mv backups/chess.sql.tmp backups/chess.sql # only a complete dump replaces the last good one

git -C backups add chess.sql
if ! git -C backups diff --cached --quiet; then
  git -C backups -c user.name=chess-backup -c user.email=backup@localhost \
    commit -q -m "backup $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
git -C backups push -q origin HEAD # also pushes a commit an earlier failed push left behind

heartbeat=$(grep -E '^BACKUP_HEARTBEAT_URL=' .env | cut -d= -f2- || true)
if [ -n "$heartbeat" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$heartbeat"
fi
echo "Backup done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
