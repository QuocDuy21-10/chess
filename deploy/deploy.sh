#!/usr/bin/env bash
# Ships one image: ./deploy.sh <full commit SHA>
# CI runs it over SSH after logging Docker in to ghcr.io; it also works by hand on the VPS, for a rollback.
set -euo pipefail
cd "$(dirname "$0")"
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

sha=${1:-}
if [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: $0 <40-character commit SHA>" >&2
  exit 2
fi
export IMAGE_TAG=$sha # compose needs a tag even to list the running services

# Back up before the new server starts and migrates. On the very first deploy there is no database yet.
if [ -n "$(docker compose ps --status running -q postgres)" ]; then
  ./backup.sh
else
  echo "Postgres is not running yet: nothing to back up."
fi

# Keep the tag in .env, so docker compose typed by hand later uses this image too. sed -i keeps .env's mode.
sed -i '/^IMAGE_TAG=/d' .env
echo "IMAGE_TAG=$sha" >> .env

docker compose pull
docker compose up -d --wait --wait-timeout 120
docker image prune -f
echo "Deployed $sha"
