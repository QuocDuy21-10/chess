# VPS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `https://chess.duydq.cloud` serves the whole game from the owner's VPS, in small images that GitHub Actions builds and deploys.

**Architecture:** The site becomes a static export in a `caddy:2-alpine` image that also proxies the API paths to the server, so site and API share one origin. The server becomes one esbuild bundle on Alpine with only the `node` binary. The Caddy of the other application on the VPS stays the TLS edge and forwards the chess host over an external Docker network, `edge`.

**Tech Stack:** Next.js 16 (static export), Node 22.23, esbuild, Caddy 2, Docker Compose, Postgres 17, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-27-vps-deploy-design.md`

## Global Constraints

- Work on branch `deploy-vps`.
- The working tree holds the owner's unfinished model work. **Never commit** `apps/web/public/models/`, `apps/web/src/scene/pieces/models.ts` or `apps/web/scripts/blender/build_kaykit_*.py`. Some of it is already staged, so **every commit names its paths**: `git commit -m "…" -- <paths>` (after `git add` for new files). Never `git commit -a`, never a bare `git commit`.
- Commit messages end with the session's attribution line.
- No push, pull request, GitHub setting or VPS change without the owner's approval for that action.
- The repository is public: no IP address, SSH alias, secret or name of the other application in any committed file.
- Do not read any `.env` file without the owner's permission.
- Before changing Next.js config, read the guide in `node_modules/next/dist/docs/01-app/02-guides/static-exports.md` (`apps/web/AGENTS.md`).
- Local runs: Node 22.23 first on `PATH`, Docker running, `npm run db:up -w @chess/server`, ports 3000 and 3001 free.
- Exact values: address `https://chess.duydq.cloud`; images `ghcr.io/quocduy21-10/chess-server` and `ghcr.io/quocduy21-10/chess-web`; build and server base `node:22-alpine3.24` and `alpine:3.24`; memory limits `web` 64m, `server` 192m, `postgres` 192m; `TRUST_PROXY=2`; network `edge`, alias `chess-web`.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `e2e/online.spec.ts` | modify (Task 1) | whatever its timeout's cause requires |
| `apps/server/package.json`, `Dockerfile` | modify | bundle and slim image |
| `apps/server/docker/smoke.sh` | create | what a deploy relies on, checked against a built image |
| `apps/web/scripts/caddy-headers.ts` (+ test) | create | security and cache headers as a Caddy snippet |
| `apps/web/Caddyfile`, `Dockerfile` | create | routing and the site image |
| `apps/web/next.config.ts`, `package.json` | modify | static export |
| `.dockerignore` | modify | context for both images |
| `apps/web/src/net/online.ts`, `e2e/playwright.config.ts` | modify | one origin, tested |
| `deploy/compose.yml`, `deploy.sh`, `env.example` | modify; `deploy/Caddyfile` delete | the production stack |
| `scripts/deploy.test.sh` | create | which images a deploy removes |
| `.github/workflows/ci.yml`, `README.md` | modify | pipeline and instructions |

---

### Task 1: Find why `online.spec` times out on Chromium in CI

**Files:** Modify: `e2e/online.spec.ts` (or the code the cause points to)

**Interfaces:** Produces: a green Chromium e2e job, which Task 6's pipeline needs.

- [ ] **Step 0: Commit this plan**

```bash
git add docs/superpowers/plans/2026-11-27-vps-deploy.md
git commit -m "docs: plan the VPS deployment" -- docs/superpowers/plans/2026-11-27-vps-deploy.md
```

- [ ] **Step 1: Get the trace of the failed run**

Ask the owner first: this downloads the artifact `e2e-chromium` of run `44659993329`. State its size from `gh api repos/QuocDuy21-10/chess/actions/runs/44659993329/artifacts --jq '.artifacts[] | "\(.name) \(.size_in_bytes) expired=\(.expired)"'`. Then, with `$SCRATCH` a new empty folder in the scratchpad:

```bash
gh run download 44659993329 -n e2e-chromium -D "$SCRATCH"
find "$SCRATCH" -name 'trace.zip' -o -name 'error-context.md' -o -name 'test-failed-*.png'
```

If it has expired, the next run of this branch's pull request produces a new one.

- [ ] **Step 2: List how long each browser action took**

Unzip the `trace.zip` under the `online-…-chromium` result into a folder `t` inside `$SCRATCH`, then:

```bash
cat "$SCRATCH"/t/*.trace | node -e "
const lines = require('fs').readFileSync(0, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const open = new Map();
for (const e of lines) {
  if (e.type === 'before') open.set(e.callId, e);
  const s = e.type === 'after' && open.get(e.callId);
  if (s) { open.delete(e.callId); console.log(((e.endTime - s.startTime) / 1000).toFixed(1) + 's', s.class + '.' + s.method, JSON.stringify(s.params).slice(0, 120), e.error?.message ?? ''); }
}
for (const s of open.values()) console.log('NEVER FINISHED', s.class + '.' + s.method, JSON.stringify(s.params).slice(0, 120));
"
```

Look at the screenshots and `error-context.md` too.

- [ ] **Step 3: Decide from the evidence, and report which case it is**

- **Every action succeeds, only slowly, and they add up past 120 s** (software-rendered WebGL starving the page): add `test.slow()` as the first line of the test, which triples its timeout:

```ts
test('two browsers play online through the real server, and the game reaches the profile', async ({ page, browser }) => {
  test.slow(); // two software-rendered scenes at once: a CI runner needs well over the usual 120 s
```

- **One action never finishes, or the page shows a wrong state:** it is a bug, not slowness. Use superpowers:systematic-debugging, fix the cause, and do not raise the timeout.

- [ ] **Step 4: Run the spec locally**

```bash
NEXT_PUBLIC_SERVER_URL=http://localhost:3001 npm run build -w @chess/web && npm run e2e -- --project=chromium online.spec.ts
```

Expected: PASS. This does not prove CI: the proof is the Chromium job on the pull request (Task 7, last step).

- [ ] **Step 5: Commit**

```bash
git commit -m "test(e2e): give the online game the time a software-rendered run needs" -- e2e/online.spec.ts
```

(For a bug fix, name its files and describe it instead.)

---

### Task 2: A small server image

**Files:**
- Create: `apps/server/docker/smoke.sh`
- Modify: `apps/server/package.json`, `apps/server/Dockerfile`, `package-lock.json`

**Interfaces:**
- Produces: `npm run bundle -w @chess/server` → `apps/server/dist/index.js`; `apps/server/docker/smoke.sh <image>` (exit 0 on success), used by Task 6. The image still listens on 3001, runs unprivileged, has `wget`, and takes the build arg `GIT_SHA`.

- [ ] **Step 1: Write the smoke test** — `apps/server/docker/smoke.sh`

```bash
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
```

```bash
chmod +x apps/server/docker/smoke.sh
```

- [ ] **Step 2: Add esbuild and the bundle script**

```bash
npm install -D esbuild@0.28.2 -w @chess/server
```

In `apps/server/package.json` `scripts`, after `"start"` (deliberately without the Sentry flag yet):

```json
"bundle": "esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/index.js --sourcemap --external:pg-native --banner:js=\"import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);\"",
```

(The alias matters: an unaliased `createRequire` in the banner clashes with one in the bundle and the server does not start.)

- [ ] **Step 3: Replace `apps/server/Dockerfile`**

```dockerfile
# The game server. Build it from the repository root, which holds the lockfile and packages/shared:
#   docker build -f apps/server/Dockerfile -t chess-server .
# The final stage uses the build stage's Alpine version, so its node binary finds the same libraries.
FROM node:22-alpine3.24 AS build
WORKDIR /app

# Manifests first: this layer is reused until a dependency changes. npm ci wants every workspace's
# package.json to match the lockfile, so the web app's comes too, but only the server's tree is installed.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @chess/server

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
RUN npm run bundle -w @chess/server

# Only node, the bundle and the migrations: no npm and no node_modules.
FROM alpine:3.24
RUN apk add --no-cache libstdc++
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
ENV NODE_ENV=production

# The commit this image was built from (CI passes it); Sentry tags every error with it.
ARG GIT_SHA=dev
ENV SENTRY_RELEASE=$GIT_SHA

USER nobody
EXPOSE 3001
CMD ["node", "--enable-source-maps", "apps/server/dist/index.js"]
```

- [ ] **Step 4: Run the smoke test and see it fail**

```bash
docker build -f apps/server/Dockerfile -t chess-server:local . && apps/server/docker/smoke.sh chess-server:local
```

Expected: FAIL with `Sentry warns about server-runtime-injection`.

- [ ] **Step 5: Drop Sentry's runtime injection from the bundle**

The server reports errors only (`log.error`, uncaught exceptions); Sentry's module hooks cannot work inside a bundle. Add to the `bundle` script, after `--external:pg-native`:

```
--define:__SENTRY_CHANNEL_INJECTION__=false
```

- [ ] **Step 6: Run it again, and check the size**

```bash
docker build -f apps/server/Dockerfile -t chess-server:local . && apps/server/docker/smoke.sh chess-server:local && docker image ls chess-server:local
```

Expected: `Smoke test passed`, disk usage about 200 MB or less.

- [ ] **Step 7: Check and commit**

```bash
npm run lint -w @chess/server && npm run typecheck -w @chess/server && npm test -w @chess/server
docker run --rm -v "$PWD":/w -w /w koalaman/shellcheck:stable apps/server/docker/smoke.sh
git add apps/server/docker/smoke.sh
git commit -m "build(server): ship one bundle on Alpine, with a smoke test of the image" -- apps/server/docker/smoke.sh apps/server/Dockerfile apps/server/package.json package-lock.json
```

---

### Task 3: The site as static files in a Caddy image

**Files:**
- Create: `apps/web/scripts/caddy-headers.ts`, `apps/web/scripts/caddy-headers.test.ts`, `apps/web/Caddyfile`, `apps/web/Dockerfile`
- Modify: `apps/web/next.config.ts`, `apps/web/package.json`, `.dockerignore`, comments in `apps/web/src/csp.ts`, `src/engine/files.test.ts`, `src/engine/uci.ts`, `src/scene/pieces/models.test.ts`

`models.test.ts` is committed code even though `models.ts` is the owner's unfinished work: change only its comment. Check `git diff apps/web/src/scene/pieces/models.test.ts` shows nothing else before committing.

**Interfaces:**
- Consumes: `contentSecurityPolicy({ serverUrl?, sentryDsn? }): string` from `apps/web/src/csp.ts`.
- Produces: `caddyHeaders({ serverUrl?, sentryDsn? }): string`; an image listening on :80, with build args `NEXT_PUBLIC_SERVER_URL` (required) and `NEXT_PUBLIC_SENTRY_DSN`, and the environment variable `SERVER_UPSTREAM` (default `server:3001`).

e2e still starts `next start` until Task 4, so it does not run between these two tasks.

- [ ] **Step 1: Write the failing test** — `apps/web/scripts/caddy-headers.test.ts`

```ts
import { expect, test } from 'vitest';
import { contentSecurityPolicy } from '../src/csp';
import { caddyHeaders } from './caddy-headers';

const build = { serverUrl: 'https://chess.example.com', sentryDsn: 'https://KEY@o1.ingest.us.sentry.io/2' };
const lines = caddyHeaders(build).split('\n');

test('static files get the security headers, with the CSP of csp.ts', () => {
  expect(lines).toContain(`\tContent-Security-Policy "${contentSecurityPolicy(build)}"`);
  expect(lines).toContain('\tX-Content-Type-Options "nosniff"');
  expect(lines).toContain('\tReferrer-Policy "strict-origin-when-cross-origin"');
  expect(lines).toContain('\tPermissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"');
  expect(lines).toContain('\tStrict-Transport-Security "max-age=63072000"');
});

test('versioned files are cached for a year, sounds for a week, and the rest is revalidated', () => {
  for (const path of ['/_next/static/*', '/engine/*', '/models/*']) {
    expect(lines).toContain(`header ${path} Cache-Control "public, max-age=31536000, immutable"`);
  }
  expect(lines).toContain('header /audio/* Cache-Control "public, max-age=604800, stale-while-revalidate=86400"');
  expect(lines).toContain('@revalidated not path /_next/static/* /engine/* /models/* /audio/*');
  expect(lines).toContain('header @revalidated Cache-Control "no-cache"');
});

test('no value closes its quotes early', () => {
  for (const line of lines.filter((line) => line.includes('"'))) expect(line.split('"'), line).toHaveLength(3);
});
```

- [ ] **Step 2: Run it** — `npx -w @chess/web vitest run scripts/caddy-headers.test.ts`. Expected: FAIL, `./caddy-headers` cannot be resolved. (The web tests' setup needs Postgres up.)

- [ ] **Step 3: Write `apps/web/scripts/caddy-headers.ts`**

```ts
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy } from '../src/csp.ts';

// The site is static files behind Caddy (../Caddyfile), which imports what this prints. Run at image build.

const IMMUTABLE = 'public, max-age=31536000, immutable';

// The engine's and the models' names carry a version and never change in place (src/engine/files.test.ts,
// src/scene/pieces/models.test.ts); Next names its chunks by content. A changed sound reaches returning players
// within a week. Everything else, the page first, is revalidated, so a deploy is seen at once.
const CACHE: [path: string, value: string][] = [
  ['/_next/static/*', IMMUTABLE],
  ['/engine/*', IMMUTABLE],
  ['/models/*', IMMUTABLE],
  ['/audio/*', 'public, max-age=604800, stale-while-revalidate=86400'],
];

/** The headers of every static file, as Caddyfile directives. */
export function caddyHeaders(build: { serverUrl?: string; sentryDsn?: string }): string {
  const security = {
    'Content-Security-Policy': contentSecurityPolicy(build),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security': 'max-age=63072000',
  };
  return [
    'header {',
    ...Object.entries(security).map(([name, value]) => `\t${name} "${value}"`),
    '}',
    `@revalidated not path ${CACHE.map(([path]) => path).join(' ')}`,
    'header @revalidated Cache-Control "no-cache"',
    ...CACHE.map(([path, value]) => `header ${path} Cache-Control "${value}"`),
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { NEXT_PUBLIC_SERVER_URL: serverUrl, NEXT_PUBLIC_SENTRY_DSN: sentryDsn } = process.env;
  process.stdout.write(caddyHeaders({ serverUrl, sentryDsn }));
}
```

- [ ] **Step 4: Run the test** — same command. Expected: 3 passed.

- [ ] **Step 5: Switch to a static export**

Replace `apps/web/next.config.ts` with:

```ts
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static files only: ./Caddyfile serves them, with the headers scripts/caddy-headers.ts writes.
  output: "export",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Uploads source maps only when the build has SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT.
export default withSentryConfig(nextConfig, { silent: !process.env.CI, telemetry: false });
```

In `apps/web/package.json` delete the `"start": "next start",` script (a static export has no server).

Comments: in `src/csp.ts` line 1–2 replace "built at build time by next.config.ts" with "built at image build by scripts/caddy-headers.ts"; in `files.test.ts`, `models.test.ts` and `uci.ts` replace "next.config.ts caches" with "scripts/caddy-headers.ts caches".

- [ ] **Step 6: Write `apps/web/Caddyfile`**

```caddyfile
# The site and the one door to the server, inside the chess stack. TLS ends at the edge proxy in front.
{
	auto_https off
	admin off
	servers {
		# The edge proxy is on a private Docker network: keep the client address it reports.
		trusted_proxies static private_ranges
	}
}

:80 {
	log

	@api path /health /auth/* /me /me/* /socket.io/*
	handle @api {
		reverse_proxy {$SERVER_UPSTREAM:server:3001}
	}

	handle {
		root * /srv
		import /etc/caddy/headers.caddy
		file_server {
			precompressed zstd gzip
		}
	}

	handle_errors 404 {
		header Cache-Control "no-store"
		root * /srv
		rewrite * /404.html
		file_server
	}
}
```

- [ ] **Step 7: Write `apps/web/Dockerfile`**

```dockerfile
# The site: static files served by Caddy. Build it from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_SERVER_URL=http://localhost:3000 -t chess-web:e2e .
FROM node:22-alpine3.24 AS build
RUN apk add --no-cache gzip zstd
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The server too: the build type-checks the site's tests, and online.test.ts runs the real server.
RUN npm ci -w @chess/web -w @chess/server

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
COPY apps/web/ apps/web/

# Compiled into the site and its CSP.
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_SENTRY_DSN
RUN test -n "$NEXT_PUBLIC_SERVER_URL" || { echo "NEXT_PUBLIC_SERVER_URL is required" >&2; exit 1; }
RUN npm run build -w @chess/web \
  && node apps/web/scripts/caddy-headers.ts > headers.caddy \
  && find apps/web/out -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.txt' \
    -o -name '*.wasm' -o -name '*.json' -o -name '*.svg' \) -exec gzip -9 -k {} \; -exec zstd -19 -q -k {} \;

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/headers.caddy /etc/caddy/headers.caddy
COPY --from=build /app/apps/web/out /srv
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Replace `.dockerignore` with:

```
# Both images are built from here. Keep the context small and free of local files.
**/node_modules
**/.next
**/out
**/dist
.git
.vitest
docs
docs-local
deploy
.github
*.md
*.jpeg
apps/web/assets-src
apps/web/scripts/blender
apps/server/src/**/*.test.ts
**/.env
```

- [ ] **Step 8: Build, and check headers, routing and client addresses**

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_SERVER_URL=http://localhost:3000 -t chess-web:e2e .
docker network create chess-check
docker run -d --name chess-check-echo --network chess-check node:22-alpine3.24 node -e "require('http').createServer((q,s)=>s.end(q.headers['x-forwarded-for']||'')).listen(3001)"
docker run -d --name chess-check-web --network chess-check -e SERVER_UPSTREAM=chess-check-echo:3001 chess-web:e2e
docker run -d --name chess-check-edge --network chess-check caddy:2-alpine caddy reverse-proxy --from :80 --to chess-check-web:80
```

```bash
docker run --rm --network chess-check alpine:3.24 sh -c '
  apk add -q curl
  ip=$(hostname -i); echo "client $ip"
  echo "forwarded: $(curl -s -H "X-Forwarded-For: 6.6.6.6" http://chess-check-edge/health)"
  curl -s -D- -o /dev/null -H "Accept-Encoding: zstd" http://chess-check-edge/
  curl -s -D- -o /dev/null http://chess-check-edge/engine/stockfish-19-lite-single.wasm | grep -iE "^(HTTP|cache-control|content-type)"
  curl -s -D- -o /dev/null http://chess-check-edge/models/missing.glb | grep -iE "^(HTTP|cache-control|content-security-policy)"'
```

Expected: `forwarded:` is exactly two addresses, the client's then the edge's, with no `6.6.6.6` (so `TRUST_PROXY=2` names the client); `/` is 200 with `Content-Encoding: zstd`, the CSP and `Cache-Control: no-cache`; the engine is `immutable` and `application/wasm`; the missing model is 404 with `no-store` and a CSP. If the 404 lacks the CSP, add `import /etc/caddy/headers.caddy` as the first line of `handle_errors` and check again.

```bash
docker rm -f chess-check-echo chess-check-web chess-check-edge && docker network rm chess-check
docker image ls chess-web:e2e
```

Expected size: about 110 MB or less.

- [ ] **Step 9: Check and commit**

```bash
npm run lint -w @chess/web && npm run typecheck -w @chess/web && npm test -w @chess/web && npm run build && npm run size -w @chess/web
git add apps/web/scripts/caddy-headers.ts apps/web/scripts/caddy-headers.test.ts apps/web/Caddyfile apps/web/Dockerfile
git commit -m "build(web): export the site as static files served by Caddy" -- apps/web/scripts/caddy-headers.ts apps/web/scripts/caddy-headers.test.ts apps/web/Caddyfile apps/web/Dockerfile apps/web/next.config.ts apps/web/package.json apps/web/src/csp.ts apps/web/src/engine/files.test.ts apps/web/src/engine/uci.ts apps/web/src/scene/pieces/models.test.ts .dockerignore
```

---

### Task 4: One origin, tested end to end

**Files:** Modify: `e2e/playwright.config.ts`, `apps/web/src/net/online.ts:115-116`

**Interfaces:** Consumes: the local image `chess-web:e2e` (Task 3). Produces: `npm run e2e` runs against it; CI (Task 6) must build it first.

- [ ] **Step 1: Run e2e against the real image**

In `e2e/playwright.config.ts`, add `TRUST_PROXY: '1', // the web image's Caddy` to the server's `env`, and replace the second `webServer` entry with:

```ts
    {
      // The site's real image (README): one origin for the site and the server, with the real headers and routing.
      command:
        'docker run --rm --init --name chess-e2e-web -p 3000:80 --add-host host.docker.internal:host-gateway -e SERVER_UPSTREAM=host.docker.internal:3001 chess-web:e2e',
      url: 'http://localhost:3000',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 }, // a killed docker client would leave the container
      reuseExistingServer: !ci,
    },
```

- [ ] **Step 2: Run the online spec and see it fail**

```bash
npm run e2e -- --project=chromium online.spec.ts
```

Expected: FAIL; the room is never created, because the server refuses a same-origin polling handshake that has no `Origin`. **If it passes, stop and tell the owner:** the reason for the change below would be wrong.

- [ ] **Step 3: Connect over WebSocket only** — `apps/web/src/net/online.ts`

```ts
    // withCredentials: the handshake carries the sid cookie, which is who this player is to the server.
    // WebSocket only: the server refuses a handshake without Origin, and a browser sends none on a same-origin
    // polling request.
    const opened: Socket<ServerEvents, ClientEvents> = io(serverUrl(), { withCredentials: true, transports: ['websocket'] });
```

- [ ] **Step 4: Run everything**

```bash
npm test -w @chess/web
npm run e2e
```

Expected: all pass on Chromium, Firefox and WebKit, with no CSP violation. `docker ps` shows no `chess-e2e-web` afterwards. (Run unit tests and e2e one after the other: both empty `chess_test`.)

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint
git commit -m "fix(online): connect over WebSocket, and test the site and server on one origin" -- e2e/playwright.config.ts apps/web/src/net/online.ts
```

---

### Task 5: The production stack

**Files:**
- Create: `scripts/deploy.test.sh`
- Modify: `deploy/compose.yml`, `deploy/deploy.sh`, `deploy/env.example`
- Delete: `deploy/Caddyfile`

**Interfaces:** Consumes: both images; `IMAGE_TAG` is a 40-character commit SHA. Produces: `/opt/chess/last-good` holding `<current sha> <previous sha>`.

- [ ] **Step 1: Write the failing test** — `scripts/deploy.test.sh`

```bash
#!/usr/bin/env bash
# Checks which images deploy/deploy.sh removes, with a stand-in docker. Needs a sed that takes -i alone:
#   docker run --rm -v "$PWD":/w -w /w bash:5 bash scripts/deploy.test.sh
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
cp "$root/deploy/deploy.sh" "$dir/"
echo 'POSTGRES_PASSWORD=x' > "$dir/.env"
mkdir "$dir/bin"
cat > "$dir/bin/docker" <<'FAKE'
#!/usr/bin/env bash
case "$*" in
  'compose up'*) exit "${UP_EXIT:-0}" ;;
  'image ls '*) for tag in $TAGS; do echo "$tag"; done ;;
  'image rm '*) echo "$3" >> "$REMOVED" ;;
esac
FAKE
chmod +x "$dir/bin/docker"

a=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
b=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
c=cccccccccccccccccccccccccccccccccccccccc
d=dddddddddddddddddddddddddddddddddddddddd

# deploy <sha> <tags on the machine>
deploy() {
  : > "$dir/removed"
  PATH="$dir/bin:$PATH" REMOVED="$dir/removed" TAGS="$2" bash "$dir/deploy.sh" "$1" >/dev/null
}
# The expected removals of these tags, from both repositories.
images() {
  for repo in server web; do
    for tag in "$@"; do echo "ghcr.io/quocduy21-10/chess-$repo:$tag"; done
  done | sort | tr '\n' ' '
}
expect() { # expect <step> <removals>
  local got
  got=$(sort "$dir/removed" | tr '\n' ' ')
  [[ $got == "$2" ]] || { echo "FAIL $1: removed [$got], expected [$2]" >&2; exit 1; }
}

deploy "$a" "$a";       expect 'first deploy' "$(images)"
deploy "$b" "$a $b";    expect 'second deploy keeps the first' "$(images)"
deploy "$c" "$a $b $c"; expect 'third deploy drops the oldest' "$(images "$a")"
deploy "$c" "$b $c";    expect 'a redeploy keeps the previous version' "$(images)"
if UP_EXIT=1 deploy "$d" "$b $c $d"; then echo "FAIL: an unhealthy deploy succeeded" >&2; exit 1; fi
expect 'an unhealthy deploy removes nothing' "$(images)"
deploy "$d" "$b $c $d"; expect 'the next healthy deploy keeps the last good one' "$(images "$b")"
echo "deploy.sh keeps the current and previous versions"
```

- [ ] **Step 2: Run it and see it fail**

```bash
docker run --rm -v "$PWD":/w -w /w bash:5 bash scripts/deploy.test.sh
```

Expected: `FAIL third deploy drops the oldest`.

- [ ] **Step 3: Prune in `deploy/deploy.sh`** — replace the three lines from `docker compose up` to `docker image prune -f` with:

```bash
docker compose up -d --wait --wait-timeout 120 # a failure stops here, before anything is removed

# Keep this version and the one that worked before it, for a rollback: the disk is small and shared.
good='' older=''
if [[ -f last-good ]]; then read -r good older < last-good; fi
if [[ $good != "$sha" ]]; then older=$good; fi
echo "$sha $older" > last-good
for repo in ghcr.io/quocduy21-10/chess-server ghcr.io/quocduy21-10/chess-web; do
  for tag in $(docker image ls "$repo" --format '{{.Tag}}'); do
    if [[ $tag != "$sha" && $tag != "$older" ]]; then
      docker image rm "$repo:$tag" >/dev/null || echo "Could not remove $repo:$tag" >&2
    fi
  done
done
docker image prune -f # untagged images only
```

Change the header comment `# Ships one image:` to `# Ships one version (both images):`.

- [ ] **Step 4: Run the test** — same command. Expected: `deploy.sh keeps the current and previous versions`.

- [ ] **Step 5: Replace `deploy/compose.yml`**

```yaml
# The production stack. CI copies this directory to /opt/chess on the VPS and runs deploy.sh there;
# /opt/chess/.env (from env.example) holds the secrets. No port is published: the VPS's edge proxy reaches
# web over the external network "edge". See README, "Production (VPS)".
name: chess

x-logging: &logging # Docker's own logs, capped: the VPS has 25 GB of disk
  driver: json-file
  options:
    max-size: 10m
    max-file: '3'

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    logging: *logging
    mem_limit: 192m
    command: ['postgres', '-c', 'shared_buffers=64MB']
    environment:
      POSTGRES_USER: chess
      POSTGRES_DB: chess
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'chess', '-d', 'chess']
      interval: 5s
      timeout: 5s
      retries: 10

  server:
    image: ghcr.io/quocduy21-10/chess-server:${IMAGE_TAG:?set IMAGE_TAG (deploy.sh does)}
    restart: unless-stopped
    logging: *logging
    mem_limit: 192m
    env_file: .env
    environment:
      DATABASE_URL: postgres://chess:${POSTGRES_PASSWORD}@postgres:5432/chess
      NODE_OPTIONS: --max-old-space-size=128
      TRUST_PROXY: '2' # the edge proxy, then web's Caddy
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:3001/health']
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 20s
    stop_grace_period: 15s # the server closes every connection within 10 s of SIGTERM

  web:
    image: ghcr.io/quocduy21-10/chess-web:${IMAGE_TAG:?set IMAGE_TAG (deploy.sh does)}
    restart: unless-stopped
    logging: *logging
    mem_limit: 64m
    depends_on:
      server:
        condition: service_healthy
    healthcheck: # through its own proxy, so it covers the server too
      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1/health']
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      default:
      edge:
        aliases: [chess-web]

volumes:
  pgdata:

networks:
  edge:
    external: true # shared with the edge proxy; created once, by hand
```

Delete `deploy/Caddyfile`. Replace `deploy/env.example` with:

```bash
# Copy to /opt/chess/.env on the VPS, fill it in, and chmod 600 it. Keep comments on lines of their own.

# openssl rand -hex 24 (hex keeps DATABASE_URL valid)
POSTGRES_PASSWORD=
# The game's address: the site and the server share it.
CLIENT_ORIGIN=https://chess.duydq.cloud
PUBLIC_URL=https://chess.duydq.cloud
# At least one OAuth app, with the callback URL https://chess.duydq.cloud/auth/<provider>/callback
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Optional: report errors to Sentry.
SENTRY_DSN=
# Optional: a heartbeat URL that backup.sh pings after every backup.
BACKUP_HEARTBEAT_URL=
# Written by deploy.sh: the version now running.
IMAGE_TAG=
```

- [ ] **Step 6: Run the whole stack locally**

`deploy/.env` must not exist beforehand (`ls deploy/.env`); if it does, stop and ask. Requires the images of Tasks 2 and 3. The site image points at `localhost:3000`, which is fine here.

```bash
export IMAGE_TAG=0000000000000000000000000000000000000000
docker tag chess-server:local ghcr.io/quocduy21-10/chess-server:$IMAGE_TAG && docker tag chess-web:e2e ghcr.io/quocduy21-10/chess-web:$IMAGE_TAG
sed -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=local/' -e 's/^GITHUB_CLIENT_ID=$/GITHUB_CLIENT_ID=local/' -e 's/^GITHUB_CLIENT_SECRET=$/GITHUB_CLIENT_SECRET=local/' -e '/^IMAGE_TAG=/d' deploy/env.example > deploy/.env
docker network create edge && docker compose -f deploy/compose.yml up -d --wait --wait-timeout 120
docker run --rm --network edge alpine:3.24 wget -qO- http://chess-web/health
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
```

Expected: all three healthy; `{"status":"ok"}`; each within its limit.

```bash
docker compose -f deploy/compose.yml down -v && docker network rm edge && rm deploy/.env
docker rmi ghcr.io/quocduy21-10/chess-server:$IMAGE_TAG ghcr.io/quocduy21-10/chess-web:$IMAGE_TAG
```

(`down -v` removes only this local test's volume.)

- [ ] **Step 7: Check and commit**

```bash
docker run --rm -v "$PWD":/w -w /w koalaman/shellcheck:stable deploy/deploy.sh deploy/backup.sh deploy/restore.sh scripts/deploy.test.sh
git add scripts/deploy.test.sh
git rm -q deploy/Caddyfile
git commit -m "feat(deploy): run the site and server behind the shared proxy, keeping two versions" -- scripts/deploy.test.sh deploy/Caddyfile deploy/compose.yml deploy/deploy.sh deploy/env.example
```

---

### Task 6: The pipeline

**Files:** Modify: `.github/workflows/ci.yml`

**Interfaces:** Consumes: `apps/web/Dockerfile`, `apps/server/docker/smoke.sh`, `scripts/deploy.test.sh`; the repository variables `SITE_URL` (required to publish) and `NEXT_PUBLIC_SENTRY_DSN` (optional). The `deploy` job does not change.

- [ ] **Step 1: `check` job** — replace its last two steps with:

```yaml
      - name: Check the deploy scripts
        run: shellcheck deploy/*.sh scripts/*.sh apps/server/docker/*.sh
      - name: Check what a deploy removes
        run: bash scripts/deploy.test.sh
      - name: Check the production compose file
        run: cp deploy/env.example deploy/.env && docker compose -f deploy/compose.yml config -q
        env:
          IMAGE_TAG: '0000000000000000000000000000000000000000'
          POSTGRES_PASSWORD: ci
```

- [ ] **Step 2: `e2e` job** — replace the step `- run: npm run build -w @chess/web` (and its `env`) with:

```yaml
      - uses: docker/setup-buildx-action@v4
      - name: Build the site's image
        uses: docker/build-push-action@v7
        with:
          context: .
          file: apps/web/Dockerfile
          build-args: NEXT_PUBLIC_SERVER_URL=http://localhost:3000
          load: true
          tags: chess-web:e2e
          cache-from: type=gha,scope=web-e2e
          cache-to: type=gha,mode=max,scope=web-e2e
```

- [ ] **Step 3: `image` job** — replace the top-level `env` block with:

```yaml
env:
  IMAGES: ghcr.io/quocduy21-10/chess
```

and the whole `image` job with:

```yaml
  image:
    needs: [check, e2e]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    env:
      PUSH: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
      SITE_URL: ${{ vars.SITE_URL }}
    steps:
      - name: Require the site's address before publishing
        if: env.PUSH == 'true'
        run: '[[ -n $SITE_URL ]] || { echo "Set the repository variable SITE_URL" >&2; exit 1; }'
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - if: env.PUSH == 'true'
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build the server for its smoke test
        uses: docker/build-push-action@v7
        with:
          context: .
          file: apps/server/Dockerfile
          load: true
          tags: chess-server:smoke
          cache-from: type=gha,scope=server
      - run: apps/server/docker/smoke.sh chess-server:smoke
      # On a pull request the images are built and thrown away, which still catches a broken Dockerfile.
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: apps/server/Dockerfile
          build-args: GIT_SHA=${{ github.sha }}
          push: ${{ env.PUSH == 'true' }}
          tags: |
            ${{ env.IMAGES }}-server:${{ github.sha }}
            ${{ env.IMAGES }}-server:latest
          cache-from: type=gha,scope=server
          cache-to: type=gha,mode=max,scope=server
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: apps/web/Dockerfile
          build-args: |
            NEXT_PUBLIC_SERVER_URL=${{ vars.SITE_URL || 'https://chess.example.com' }}
            NEXT_PUBLIC_SENTRY_DSN=${{ vars.NEXT_PUBLIC_SENTRY_DSN }}
          push: ${{ env.PUSH == 'true' }}
          tags: |
            ${{ env.IMAGES }}-web:${{ github.sha }}
            ${{ env.IMAGES }}-web:latest
          cache-from: type=gha,scope=web
          cache-to: type=gha,mode=max,scope=web
```

- [ ] **Step 4: Check and commit**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest .github/workflows/ci.yml
git commit -m "ci: build and publish both images, and test the site's real one" -- .github/workflows/ci.yml
```

Expected: actionlint prints nothing. An "unknown action version" style warning about code this task did not change is reported to the owner, not fixed.

---

### Task 7: README, then the pull request

**Files:** Modify: `README.md`

- [ ] **Step 1: Edit these parts**

1. Delete the `create-next-app` boilerplate above `## Online play` (from the first line through the "Deploy on Vercel" section) and start the file with:

```markdown
# Combat Chess

Chess where every capture is a fight: a 3D board in the browser, against a computer or another player.
`npm install` and `npm run dev` start the site on port 3000.
```

2. Replace the paragraph starting "`npm run e2e` runs the browser tests" with:

````markdown
`npm run e2e` runs the browser tests (Docker and Postgres up, as for `npm test`, but not at the same time: both
empty `chess_test`). They play the site's real image, so build it first, and again after a change to the site:

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_SERVER_URL=http://localhost:3000 -t chess-web:e2e .
```

Pick one browser with `npm run e2e -- --project=webkit`; `npm run report -w @chess/e2e` opens the last report.
````

3. In the variables table: `TRUST_PROXY` meaning ends "`deploy/compose.yml` sets 2 (the edge proxy and the site's Caddy)."

4. Replace everything from `### Deploying` up to `## Continuous integration` with:

````markdown
### Images

Both are built from the repository root:

```bash
docker build -f apps/server/Dockerfile -t chess-server .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_SERVER_URL=https://chess.example.com -t chess-web .
```

`chess-server` is one bundle of the server on Alpine, with `node` and the migrations
(`apps/server/docker/smoke.sh chess-server` checks it). `chess-web` is the site as static files in Caddy, which
also passes `/health`, `/auth/*`, `/me` and `/socket.io/*` to the server named by `SERVER_UPSTREAM`
(default `server:3001`), so both share one address. Online play needs WebSocket.

The server applies pending migrations when it starts. `GET /health` answers `{"status":"ok"}`. On `SIGTERM` it
closes every connection, finishes saving any game that just ended, and exits. Rooms are kept in memory, so a
deploy ends every game in progress.
````

5. In "Continuous integration": item 1 also runs `scripts/deploy.test.sh`; item 2 "plays the site's real image against the real server"; item 3 "builds both images, smoke-tests the server's, and on `main` pushes `chess-server` and `chess-web`, tagged with the commit's SHA and `latest`. The site's address is the repository variable `SITE_URL`; `NEXT_PUBLIC_SENTRY_DSN` is optional." Replace the sentence about Vercel with nothing.

6. Replace the intro of "Production (VPS)" and its "One-time setup" steps 1–2 with:

```markdown
The VPS runs the site, the server and Postgres 17 with Docker Compose from `deploy/`, copied to `/opt/chess` by
every deploy. Images are built by GitHub Actions, never on the VPS. The stack publishes no port: the VPS's edge
proxy, which owns 80 and 443 and gets the certificate, reaches the site over the Docker network `edge`.

### One-time setup

1. Point a DNS `A` record for the game's name at the VPS.
2. Create the network and tell the edge proxy about the game. With Caddy: join its container to `edge` and add
   `chess.example.com { reverse_proxy chess-web:80 }`.
   `docker network create edge`
```

Keep the steps for the deploy user, key, `.env`, secrets and backups; change "Register `https://<API_DOMAIN>/auth/<provider>/callback`" to use the game's name. Add after the secrets table: "and the repository variable `SITE_URL` (Settings → Secrets and variables → Actions → Variables)."

7. In "Every deploy": "`deploy.sh <sha>` backs up the database, pulls both images, starts them, waits until `/health` answers through the site, and keeps only this version and the previous good one." Useful commands: `docker compose logs web` is the HTTP access log. In "Monitoring": the access log line names `web`; the Sentry bullet replaces "On Vercel, set `NEXT_PUBLIC_SENTRY_DSN`, and for readable stack traces …" with "Set the repository variable `NEXT_PUBLIC_SENTRY_DSN` and deploy."; the uptime URL is `https://<the game's name>/health`.

- [ ] **Step 2: Check nothing stale is left**

```bash
grep -niE 'vercel|API_DOMAIN|next start|api\.chess' README.md
```

Expected: no output.

- [ ] **Step 3: Full check and commit**

```bash
npm run lint && npm run typecheck && npm test
git commit -m "docs: describe the one-address VPS deployment" -- README.md
git status --short
```

Expected: only the owner's model work (and nothing of ours) remains uncommitted.

- [ ] **Step 4: Open the pull request (ask the owner first)**

```bash
git push -u origin deploy-vps
gh pr create --base main --title "Deploy the site and server to the VPS" --body-file <a file in the scratchpad describing the change, ending with the session's attribution line>
```

Then bind it with the app's PR tools and read CI. Expected: `check`, all three `e2e` jobs and `image` pass; `deploy` does not run on a pull request. CI builds without the uncommitted models.

---

### Task 8: The other application's repository

Made in that repository, because its deploy updates the VPS from it. **Ask the owner for its local path**, and follow its own branch and commit conventions.

**Files:** Modify: `Caddyfile`, `docker-compose.prod.yml`, `scripts/deploy.sh`

- [ ] **Step 1: Forward the chess host** — append to `Caddyfile`:

```caddyfile

chess.duydq.cloud {
	reverse_proxy chess-web:80
}
```

- [ ] **Step 2: `docker-compose.prod.yml`** — in service `caddy` set `mem_limit: 64m` and

```yaml
    networks:
      - backend
      - edge
```

and under the top-level `networks:` add

```yaml
  edge:
    external: true # shared with the chess stack: docker network create edge
```

- [ ] **Step 3: Keep three images** — in `scripts/deploy.sh`, before the final `$COMPOSE ps`:

```sh
# prune -f leaves tagged versions, each about 900 MB: keep the three newest and the one running.
current=$(docker inspect -f '{{.Config.Image}}' "$($COMPOSE ps -q backend)")
docker image ls "${current%:*}" --format '{{.Repository}}:{{.Tag}}' |
  grep -E ':[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | head -n -3 | grep -vxF "$current" |
  xargs -r docker image rm || echo "Could not remove some old images" >&2
```

- [ ] **Step 4: Validate**

```bash
docker run --rm -e API_DOMAIN=api.example.com -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Then run `docker compose -f docker-compose.prod.yml config -q` with dummy values for the variables it requires, and check the pruning pipeline's selection with `printf 'r:1.9.0\nr:1.10.0\nr:1.10.1\nr:1.2.0\n' | grep -E ':[0-9]+\.[0-9]+\.[0-9]+$' | sort -V` piped to GNU `head -n -3` (in `docker run -i --rm debian:stable-slim`): expected `r:1.2.0` only.

- [ ] **Step 5: Commit there; push, release and deploy only when the owner says so** (Task 9, step 5).

---

### Task 9: Rollout

Each step names who does it. The agent asks before every command that changes the VPS, DNS or GitHub, and never types a secret. `VPS` below is the owner's SSH alias for the machine: set it in the shell, do not write it into a file.

- [ ] **1. Owner:** decide about the model work and, if it is to ship, commit it. Add the DNS `A` record `chess` pointing at the VPS (`ssh "$VPS" hostname -I`, the first address). Register a GitHub OAuth app (homepage `https://chess.duydq.cloud`, callback `https://chess.duydq.cloud/auth/github/callback`). Create an empty **private** repository `chess-backups`.
- [ ] **2. Agent, after approval:** `gh variable set SITE_URL --body https://chess.duydq.cloud`, then on the VPS:

```bash
ssh "$VPS" 'adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy && install -d -o deploy -g deploy /opt/chess && install -d -m 700 -o deploy -g deploy /home/deploy/.ssh && docker network create edge'
```

- [ ] **3. Owner:** the deploy key and the four secrets.

```bash
ssh-keygen -t ed25519 -N '' -C chess-deploy -f ~/.ssh/chess_deploy
ssh "$VPS" 'cat >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys' < ~/.ssh/chess_deploy.pub
ssh-keyscan -t ed25519 chess.duydq.cloud > ~/.ssh/chess_known_hosts
ssh-keygen -lf ~/.ssh/chess_known_hosts
ssh "$VPS" ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

The two fingerprints must match. Then:

```bash
gh secret set VPS_HOST --env production --body chess.duydq.cloud
gh secret set VPS_USER --env production --body deploy
gh secret set VPS_SSH_KEY --env production < ~/.ssh/chess_deploy
gh secret set VPS_KNOWN_HOSTS --env production < ~/.ssh/chess_known_hosts
```

- [ ] **4. Owner:** the secrets file and the backups.

```bash
scp deploy/env.example "$VPS":/opt/chess/.env
ssh -t "$VPS" 'nano /opt/chess/.env && chown deploy:deploy /opt/chess/.env && chmod 600 /opt/chess/.env'
```

On the VPS as `deploy`, follow README "Backups" (key, deploy key with write access on `chess-backups`, clone into `/opt/chess/backups`, crontab line).

- [ ] **5. Owner picks the time; agent assists:** release and deploy the other application's change (Task 8). Its API is interrupted for a few seconds. Requires `edge` and the DNS record. Verify its readiness URL answers 200 afterwards. `chess.duydq.cloud` answers 502 until step 6. To undo, revert that change and deploy again.
- [ ] **6. Owner:** merge the pull request. Agent reads the `main` run: `image` pushes both images and `deploy` ends with `Deployed <sha>`.
- [ ] **7. Acceptance** (agent runs the commands, owner plays):

```bash
curl -sS -D- -o /dev/null https://chess.duydq.cloud/
curl -sS https://chess.duydq.cloud/health
ssh "$VPS" 'cd /opt/chess && docker compose ps && docker stats --no-stream && docker image ls && df -h / && docker compose logs --tail 5 web'
```

Expected: 200 with the CSP; `{"status":"ok"}`; three healthy services within their limits; in the access log, `client_ip` is the visitor's public address, not a `172.*` one. The owner signs in, plays the computer, and plays an online game between two devices. The other application answers as before.

- [ ] **8. Backup and restore, once** (after approval; do it before real players have data):

```bash
ssh "$VPS" 'sudo -u deploy /opt/chess/backup.sh && sudo -u deploy /opt/chess/restore.sh'
```

Expected: `Backup done at …` and `Restored HEAD…`, then `/health` answers again.
