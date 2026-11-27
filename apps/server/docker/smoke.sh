#!/usr/bin/env bash
# Starts a built server image against a throwaway Postgres and checks what a deploy relies on:
#   apps/server/docker/smoke.sh <image>
set -euo pipefail
image=${1:?usage: smoke.sh <image>}
net=chess-smoke

cleanup() {
  docker rm -f chess-smoke-pg chess-smoke-server chess-smoke-sink >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
# Waits up to 30 s for a command to succeed.
retry() {
  for _ in $(seq 30); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "timed out: $*" >&2
  return 1
}
trap cleanup EXIT
cleanup

docker network create "$net" >/dev/null
docker run -d --name chess-smoke-pg --network "$net" \
  -e POSTGRES_USER=chess -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=chess postgres:17-alpine >/dev/null
retry docker exec chess-smoke-pg pg_isready -h 127.0.0.1 -U chess -d chess

# A stand-in for Sentry that prints what it receives.
docker run -d --name chess-smoke-sink --network "$net" --entrypoint node "$image" -e \
  "require('node:http').createServer((req, res) => { console.log(req.method, req.url); req.resume(); res.end('{}') }).listen(9000)" >/dev/null

server_env=(
  -e CLIENT_ORIGIN=https://chess.example.com -e PUBLIC_URL=https://chess.example.com
  -e GITHUB_CLIENT_ID=smoke -e GITHUB_CLIENT_SECRET=smoke
  -e SENTRY_DSN=http://key@chess-smoke-sink:9000/1
)

# Migrates an empty database, answers, accepts a handshake and stops cleanly.
docker run -d --name chess-smoke-server --network "$net" "${server_env[@]}" \
  -e DATABASE_URL=postgres://chess:smoke@chess-smoke-pg:5432/chess "$image" >/dev/null
retry docker exec chess-smoke-server wget -qO- http://127.0.0.1:3001/health
docker exec chess-smoke-server wget -qO- --header 'Origin: https://chess.example.com' \
  'http://127.0.0.1:3001/socket.io/?EIO=4&transport=polling' | grep -q '"sid"'
tables=$(docker exec chess-smoke-pg psql -U chess -d chess -Atc "select count(*) from pg_tables where schemaname = 'public'")
[[ $tables == 4 ]] || { echo "expected 4 tables, found $tables" >&2; exit 1; }
docker stop -t 15 chess-smoke-server >/dev/null
[[ $(docker inspect -f '{{.State.ExitCode}}' chess-smoke-server) == 0 ]] || { echo "did not stop cleanly" >&2; exit 1; }
if docker logs chess-smoke-server 2>&1 | grep -q 'server-runtime-injection'; then
  echo "Sentry warns about server-runtime-injection" >&2
  exit 1
fi

# A server that cannot reach its database fails, and the error reaches Sentry.
if docker run --rm --network "$net" "${server_env[@]}" \
  -e DATABASE_URL=postgres://chess:smoke@nowhere:5432/chess "$image" >/dev/null 2>&1; then
  echo "started without a database" >&2
  exit 1
fi
retry sh -c 'docker logs chess-smoke-sink | grep -q "POST /api/1/envelope/"'
echo "Smoke test passed: $image"
