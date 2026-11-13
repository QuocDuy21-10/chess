# Securing the API and WebSocket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate-limit the game server's HTTP routes, Socket.IO handshakes and game events; refuse cross-site handshakes; cap connections and open rooms; and send a Content-Security-Policy and other security headers from the site.

**Architecture:** A new `apps/server/src/limits.ts` wraps `rate-limiter-flexible`'s memory store and is used in three places: Express middleware (per IP), Socket.IO's `allowRequest` (per IP, plus the Origin check and a server-wide cap), and a `socket.use` middleware (per account). `rooms.ts` caps open rooms per player. The site maps the new refusals to sentences, and `next.config.ts` sends a static CSP built by a pure function in `apps/web/src/csp.ts`.

**Tech Stack:** Express 5, Socket.IO 4.8, `rate-limiter-flexible` 11.2.3, `proxy-addr` 2, Next.js 16.4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-13-api-websocket-security-design.md`

## Global Constraints

- Branch `phase5-s1-ci-cd` (S1's commits are already on it; S2 builds on `log.ts`, `deploy/compose.yml` and CI). End every commit message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `rate-limiter-flexible` is pinned at exactly `11.2.3` (`--save-exact`). Use only `RateLimiterMemory` and `RateLimiterRes`.
- `proxy-addr` becomes a direct dependency of `@chess/server` (Express already installs it); `@types/proxy-addr` a dev dependency.
- Limit values (copy exactly): HTTP 300 a minute per IP; `GET /auth/:provider` and `GET /auth/:provider/callback` 60 every 10 minutes per IP; Socket.IO handshakes 60 a minute per IP; 2000 connections in all; 5 connections per account; 20 game events every 10 seconds per account; 5 open rooms per player.
- Refusals: HTTP `429 {"error":"rate-limited"}` with `Retry-After` in whole seconds; handshake refused with HTTP 403 by engine.io; `connect_error` message `too-many-connections`; acks `{ error: 'rate-limited' }` and `{ error: 'too-many-rooms' }`.
- Refusals are logged with `log.warn('Rate limited', { limit, key })` once per key per window, never `log.error`, never Sentry.
- `TRUST_PROXY` default 0, whole number 0-10; `deploy/compose.yml` sets 1.
- The site's security headers are sent only when `NODE_ENV` is `production`.
- The server runs TypeScript by type stripping (Node ≥ 22.18, `erasableSyntaxOnly`): no enums, namespaces or parameter properties; relative imports end in `.ts`. The site's imports use the `@/` alias and no extension, except `next.config.ts`, which imports `./src/csp.ts`.
- Comments: one line, only the why.
- Never read any `.env` file. Tests need Postgres: `npm run db:up -w @chess/server`, and `TEST_DATABASE_URL` in `apps/server/.env` (the tests load it).

## File map

| File | Task | Job |
|---|---|---|
| `apps/server/src/limits.ts`, `limits.test.ts` | 1 | `LIMITS`, `ipKey`, `limiter`, `perIp`, `clientIp` |
| `apps/server/src/config.ts`, `config.test.ts` | 2 | `TRUST_PROXY` |
| `apps/server/src/http.ts`, `auth.ts`, `app.ts`, `index.ts` | 2 | HTTP limits, trust proxy |
| `apps/server/src/guards.test.ts` | 2, 4 | the limits seen through real HTTP and Socket.IO |
| `deploy/compose.yml`, `README.md` | 2 | `TRUST_PROXY: '1'`, the variable's row |
| `apps/server/src/rooms.ts`, `rooms.test.ts`, `game.ts` | 3 | open rooms per player |
| `packages/shared/src/protocol.ts` | 3 | the new error codes |
| `apps/server/src/app.ts`, `game.ts` | 4 | `allowRequest`, connections per account, event limit |
| `apps/web/src/net/online.ts`, `online.test.ts`, `ui/i18n.ts` | 5 | new `OnlineError`s and their sentences |
| `apps/web/src/csp.ts`, `csp.test.ts`, `next.config.ts` | 6 | CSP and headers |

---

### Task 1: The limits module

**Files:**
- Create: `apps/server/src/limits.ts`
- Test: `apps/server/src/limits.test.ts`
- Modify: `apps/server/package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `log` from `./log.ts` (S1).
- Produces:
  ```ts
  export interface Limits {
    httpPerMinute: number; authPer10Minutes: number; handshakesPerMinute: number;
    maxConnections: number; connectionsPerUser: number; eventsPer10Seconds: number;
  }
  export const LIMITS: Limits;
  export type Verdict = { ok: true } | { ok: false; retryAfterMs: number };
  export interface Limiter { take(key: string): Promise<Verdict> }
  export function ipKey(address: string): string;
  export function limiter(name: string, points: number, seconds: number): Limiter;
  export function perIp(limit: Limiter): RequestHandler;          // Express middleware, uses req.ip
  export function clientIp(req: IncomingMessage, hops: number): string;
  ```

- [ ] **Step 1: Install the two dependencies**

Run from the repository root:
```bash
npm install rate-limiter-flexible@11.2.3 --save-exact -w @chess/server
npm install proxy-addr@^2.0.7 -w @chess/server
npm install @types/proxy-addr@^2.0.3 --save-dev -w @chess/server
```
Expected: `apps/server/package.json` has `"rate-limiter-flexible": "11.2.3"` (no caret) and `"proxy-addr": "^2.0.7"` in `dependencies`, `"@types/proxy-addr"` in `devDependencies`.

- [ ] **Step 2: Write the failing tests**

Create `apps/server/src/limits.test.ts`:
```ts
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { clientIp, ipKey, limiter } from './limits.ts';
import { log } from './log.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('ipKey keeps an IPv4 address and unwraps an IPv4-mapped one', () => {
  expect(ipKey('203.0.113.7')).toBe('203.0.113.7');
  expect(ipKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
});

test('ipKey counts an IPv6 address under its /64 network', () => {
  const net = '2001:0db8:00aa:00bb::/64';
  expect(ipKey('2001:db8:aa:bb:1:2:3:4')).toBe(net);
  expect(ipKey('2001:db8:aa:bb::9')).toBe(net);
  expect(ipKey('2001:DB8:AA:BB:ffff::1')).toBe(net);
  expect(ipKey('2001:db8:aa:bc::1')).toBe('2001:0db8:00aa:00bc::/64');
  expect(ipKey('::1')).toBe('0000:0000:0000:0000::/64');
});

test('a limiter lets `points` through per window, then refuses with the time to wait', async () => {
  const limit = limiter('test', 2, 10);
  expect(await limit.take('a')).toEqual({ ok: true });
  expect(await limit.take('a')).toEqual({ ok: true });
  const refused = await limit.take('a');
  expect(refused.ok).toBe(false);
  expect(!refused.ok && refused.retryAfterMs).toBeGreaterThan(0);
  expect(await limit.take('b')).toEqual({ ok: true }); // each key has its own count
  vi.advanceTimersByTime(10_000);
  expect(await limit.take('a')).toEqual({ ok: true });
});

test('only the first refusal in a window is logged', async () => {
  const limit = limiter('test', 1, 10);
  for (let i = 0; i < 4; i++) await limit.take('a');
  expect(log.warn).toHaveBeenCalledTimes(1);
  expect(log.warn).toHaveBeenCalledWith('Rate limited', { limit: 'test', key: 'a' });
});

test('clientIp trusts X-Forwarded-For only as far as the number of proxies', () => {
  const socket = { remoteAddress: '127.0.0.1' };
  const req = { headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' }, connection: socket, socket } as unknown as IncomingMessage;
  expect(clientIp(req, 0)).toBe('127.0.0.1');
  expect(clientIp(req, 1)).toBe('203.0.113.9');
  expect(clientIp(req, 2)).toBe('198.51.100.1');
});
```

- [ ] **Step 3: Run them to see them fail**

Run (Postgres up): `cd apps/server && npx vitest run src/limits.test.ts`
Expected: FAIL, cannot find `./limits.ts`.

- [ ] **Step 4: Write `limits.ts`**

Create `apps/server/src/limits.ts`:
```ts
import type { IncomingMessage } from 'node:http';
import { isIPv6 } from 'node:net';
import type { RequestHandler } from 'express';
import proxyaddr from 'proxy-addr';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { log } from './log.ts';

// How much one IP or one account may ask of the server. Counts live in memory: the server is one instance.

export interface Limits {
  httpPerMinute: number; // per IP, every route but the health check
  authPer10Minutes: number; // per IP, starting and finishing a sign-in
  handshakesPerMinute: number; // per IP, Socket.IO handshakes
  maxConnections: number; // all players
  connectionsPerUser: number; // one account's open connections
  eventsPer10Seconds: number; // one account's game events
}

export const LIMITS: Limits = {
  httpPerMinute: 300,
  authPer10Minutes: 60,
  handshakesPerMinute: 60,
  maxConnections: 2000,
  connectionsPerUser: 5,
  eventsPer10Seconds: 20,
};

export type Verdict = { ok: true } | { ok: false; retryAfterMs: number };

export interface Limiter {
  take(key: string): Promise<Verdict>;
}

/** The key an address is counted under: an IPv4 address, or the /64 network of an IPv6 one. */
export function ipKey(address: string): string {
  if (address.startsWith('::ffff:') && address.includes('.')) return address.slice(7);
  if (!isIPv6(address)) return address;
  // One IPv6 host usually has a whole /64 to rotate through.
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros = Array<string>(8 - left.length - right.length).fill('0');
  const groups = address.includes('::') ? [...left, ...zeros, ...right] : left;
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().padStart(4, '0')).join(':')}::/64`;
}

/** `points` per `seconds` for each key. Logs the first refusal of each key in each window. */
export function limiter(name: string, points: number, seconds: number): Limiter {
  const store = new RateLimiterMemory({ keyPrefix: name, points, duration: seconds });
  return {
    async take(key) {
      try {
        await store.consume(key);
        return { ok: true };
      } catch (rejection) {
        if (!(rejection instanceof RateLimiterRes)) throw rejection;
        if (rejection.consumedPoints === points + 1) log.warn('Rate limited', { limit: name, key });
        return { ok: false, retryAfterMs: rejection.msBeforeNext };
      }
    },
  };
}

/** Express middleware: refuses a request past `limit`, counted per client IP (`req.ip`, after `trust proxy`). */
export function perIp(limit: Limiter): RequestHandler {
  return (req, res, next) => {
    limit.take(ipKey(req.ip ?? '')).then((verdict) => {
      if (verdict.ok) return next();
      res.set('Retry-After', String(Math.ceil(verdict.retryAfterMs / 1000)));
      res.status(429).json({ error: 'rate-limited' });
    }, next);
  };
}

/** The client's address behind `hops` proxies: the rule Express applies when `trust proxy` is a number. */
export const clientIp = (req: IncomingMessage, hops: number): string => proxyaddr(req, (_address, hop) => hop < hops);
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd apps/server && npx vitest run src/limits.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint -w @chess/server && npm run typecheck -w @chess/server`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/limits.ts apps/server/src/limits.test.ts apps/server/package.json package-lock.json
git commit -m "feat: add rate limiters for the server, counted per IP or per account

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Trust the proxy, and limit HTTP requests

**Files:**
- Modify: `apps/server/src/config.ts`, `apps/server/src/http.ts:8-30`, `apps/server/src/auth.ts:3,14-21,70-95`, `apps/server/src/app.ts`, `apps/server/src/index.ts`, `deploy/compose.yml`, `README.md`
- Test: `apps/server/src/config.test.ts`, create `apps/server/src/guards.test.ts`

**Interfaces:**
- Consumes: `LIMITS`, `limiter`, `perIp`, `type Limits` (Task 1).
- Produces: `Config.trustProxy: number`; `createApp` options `trustProxy?: number` and `limits?: Partial<Limits>`; `createHttpApp({ origins?, routes?, trustProxy?, limit? })`; `authRoutes` option `limit?: RequestHandler`. `guards.test.ts` with a `start(options)` helper that Task 4 extends.

- [ ] **Step 1: Write the failing config test**

In `apps/server/src/config.test.ts`, in the first test's expected object add `trustProxy: 0,` after `oauth: …,`. Then append:
```ts
test('TRUST_PROXY counts the proxies in front of the server: 0 unless set', () => {
  expect(loadConfig({}).trustProxy).toBe(0);
  expect(loadConfig({ TRUST_PROXY: '' }).trustProxy).toBe(0);
  expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
  for (const bad of ['-1', 'abc', '1.5', '11', ' ']) {
    expect(() => loadConfig({ TRUST_PROXY: bad }), bad).toThrow('TRUST_PROXY');
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/server && npx vitest run src/config.test.ts`
Expected: FAIL: the first test misses `trustProxy`, the new one gets `undefined`.

- [ ] **Step 3: Read `TRUST_PROXY`**

In `apps/server/src/config.ts`: add to the `Config` interface, after `port`:
```ts
  trustProxy: number; // proxies in front of the server (Caddy in production); 0: trust no X-Forwarded-For
```
Add `TRUST_PROXY,` to the list of variables in `loadConfig`'s doc comment. In the returned object, after `port,`, add `trustProxy: readTrustProxy(env.TRUST_PROXY),`. Add next to `readPort`:
```ts
function readTrustProxy(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const hops = Number(value);
  if (!/^\d+$/.test(value) || hops > 10) {
    throw new Error(`TRUST_PROXY must be the number of proxies in front of the server, 0 to 10, not "${value}"`);
  }
  return hops;
}
```
Run: `cd apps/server && npx vitest run src/config.test.ts` → PASS.

- [ ] **Step 4: Write the failing HTTP tests**

Create `apps/server/src/guards.test.ts`:
```ts
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from './app.ts';
import { log } from './log.ts';
import { users } from './schema.ts';
import { connectTest, truncate } from './test-db.ts';

// The limits from limits.ts seen from outside: real HTTP requests and Socket.IO connections, with small limits.

const { pool, db } = connectTest();
const apps: ReturnType<typeof createApp>[] = [];
let annId: string;

beforeEach(async () => {
  await truncate(pool);
  [{ id: annId }] = await db.insert(users).values({ displayName: 'Ann' }).returning({ id: users.id });
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});
afterAll(() => pool.end());

/** A server with these options on a free port. */
async function start(options: Omit<Parameters<typeof createApp>[0], 'db' | 'providers'> = {}) {
  const app = createApp({ db, providers: {}, ...options });
  apps.push(app);
  const port = await app.listen(0);
  return { app, port, base: `http://localhost:${port}` };
}

const status = async (url: string, headers: Record<string, string> = {}) => (await fetch(url, { headers })).status;

test('past the HTTP limit a client gets 429 with Retry-After; the health check is never counted', async () => {
  const { base } = await start({ limits: { httpPerMinute: 2 } });
  for (let i = 0; i < 5; i++) expect(await status(`${base}/health`)).toBe(200);
  expect(await status(`${base}/me`)).toBe(401);
  expect(await status(`${base}/me`)).toBe(401);
  const refused = await fetch(`${base}/me`);
  expect(refused.status).toBe(429);
  expect(await refused.json()).toEqual({ error: 'rate-limited' });
  expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
});

test('signing in has a stricter limit of its own, which the provider list is not part of', async () => {
  const { base } = await start({ limits: { authPer10Minutes: 1 } });
  for (let i = 0; i < 3; i++) expect(await status(`${base}/auth/providers`)).toBe(200);
  expect(await status(`${base}/auth/github`)).toBe(404); // no such provider on this server, but counted
  expect(await status(`${base}/auth/github/callback`)).toBe(429);
});

test('behind a trusted proxy each forwarded address is counted apart; with none, the header is ignored', async () => {
  const proxied = await start({ trustProxy: 1, limits: { httpPerMinute: 1 } });
  expect(await status(`${proxied.base}/me`, { 'x-forwarded-for': '203.0.113.1' })).toBe(401);
  expect(await status(`${proxied.base}/me`, { 'x-forwarded-for': '203.0.113.2' })).toBe(401);
  expect(await status(`${proxied.base}/me`, { 'x-forwarded-for': '203.0.113.1' })).toBe(429);

  const direct = await start({ limits: { httpPerMinute: 1 } });
  expect(await status(`${direct.base}/me`, { 'x-forwarded-for': '203.0.113.1' })).toBe(401);
  expect(await status(`${direct.base}/me`, { 'x-forwarded-for': '203.0.113.2' })).toBe(429);
});
```
(`annId` is used by Task 4's tests; ESLint may flag it as assigned but unused until then. If it does, add `void annId;` at the end of `beforeEach` in this task and remove that line in Task 4.)

- [ ] **Step 5: Run them to see them fail**

Run: `cd apps/server && npx vitest run src/guards.test.ts`
Expected: FAIL: TypeScript-unknown options are ignored at runtime, so the 429 never comes (`expected 401 to be 429`).

- [ ] **Step 6: Put the limiter into the HTTP app**

Replace `createHttpApp` in `apps/server/src/http.ts` (keep `sameSiteOnly` and `onError` as they are):
```ts
interface HttpOptions {
  origins?: string[] | true; // the sites allowed to call; any site when true
  routes?: Router[];
  trustProxy?: number; // proxies in front of the server, so req.ip is the client's address
  limit?: RequestHandler; // counts every request but the health check
}

/**
 * The HTTP side of the server: security headers, CORS for the site, small JSON bodies, a guard against
 * cross-site requests, a health check, a rate limit, the given routes, and JSON for everything else.
 */
export function createHttpApp({ origins = true, routes = [], trustProxy = 0, limit }: HttpOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true })); // credentials: the site's fetch sends the sid cookie
  app.use(express.json({ limit: '1kb' }));
  app.use(sameSiteOnly(origins));
  // A liveness check for the host's load balancer. It reads no state, and no limit applies to it.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  if (limit) app.use(limit);
  for (const router of routes) app.use(router);
  app.use((_req, res) => {
    res.status(404).json({ error: 'not-found' });
  });
  app.use(onError);
  return app;
}
```

In `apps/server/src/auth.ts`: change the express import to `import { Router, type RequestHandler } from 'express';`; add to `Options`:
```ts
  limit?: RequestHandler; // the stricter limit on starting and finishing a sign-in
```
Above `authRoutes`, add:
```ts
const pass: RequestHandler = (_req, _res, next) => next();
```
Change the signature to `export function authRoutes({ db, sessions, providers, webUrl, secure, onLogout, limit = pass }: Options)`, and add `limit,` as the first handler of the two sign-in routes:
```ts
  router.get('/auth/:provider', limit, (req, res, next) => {
```
```ts
  router.get('/auth/:provider/callback', limit, async (req, res, next) => {
```
(`/auth/providers` is declared first and answers itself, so it never reaches `limit`.)

In `apps/server/src/app.ts`: add `import { LIMITS, limiter, perIp, type Limits } from './limits.ts';` after the `./http.ts` import. Add to `Options`:
```ts
  trustProxy?: number; // proxies in front of the server; 0 in development
  limits?: Partial<Limits>; // tests pass small ones
```
Add `trustProxy = 0,` and `limits: overrides,` to the destructured parameters, and replace the lines from `const auth = …` to `const http = …` with:
```ts
  const limits = { ...LIMITS, ...overrides };
  const auth = authRoutes({
    db,
    sessions,
    providers,
    webUrl,
    secure,
    onLogout,
    limit: perIp(limiter('auth', limits.authPer10Minutes, 10 * 60)),
  });
  // Socket.IO answers /socket.io/ on this server before Express sees the request.
  const http = createServer(
    createHttpApp({
      origins,
      routes: [auth, apiRoutes({ db, sessions })],
      trustProxy,
      limit: perIp(limiter('http', limits.httpPerMinute, 60)),
    }),
  );
```

In `apps/server/src/index.ts`, add `trustProxy: config.trustProxy,` to the `createApp({ … })` call after `origins: config.origins,`.

- [ ] **Step 7: Run the HTTP tests and the whole server suite**

Run: `cd apps/server && npx vitest run src/guards.test.ts && cd ../.. && npm test -w @chess/server && npm run lint -w @chess/server && npm run typecheck -w @chess/server`
Expected: all pass, no lint or type errors.

- [ ] **Step 8: Set the proxy count in production and document it**

In `deploy/compose.yml`, under the `server` service's `environment:`, after `NODE_OPTIONS`, add:
```yaml
      TRUST_PROXY: '1' # Caddy is the one proxy in front of the server
```
In `README.md`'s variable table, after the `PUBLIC_URL` row, add:
```markdown
| `TRUST_PROXY` | server | How many proxies stand in front of the server, so rate limits count the client's own address. Default 0; `deploy/compose.yml` sets 1 (Caddy). More than the real number lets a client choose its own address. |
```
Run: `cp deploy/env.example deploy/.env && IMAGE_TAG=0000000000000000000000000000000000000000 POSTGRES_PASSWORD=ci API_DOMAIN=api.example.com docker compose -f deploy/compose.yml config -q && echo OK; rm deploy/.env`
Expected: `OK`.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src deploy/compose.yml README.md
git commit -m "feat: rate-limit HTTP requests per client IP, with a stricter limit on signing in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: At most five open rooms per player

**Files:**
- Modify: `apps/server/src/rooms.ts:1-10,79-99`, `apps/server/src/game.ts` (the `create` handler), `packages/shared/src/protocol.ts:26-29`
- Test: `apps/server/src/rooms.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `rooms.create(player, color, minutes): { roomId: string } | { error: 'busy' | 'too-many-rooms' }`. Protocol:
  ```ts
  export type CreateAck = { roomId: string } | { error: 'busy' | 'too-many-rooms' | 'rate-limited' | 'bad-request' };
  export type JoinAck = { ok: true } | { error: 'not-found' | 'full' | 'rate-limited' | 'bad-request' };
  export type MoveError = 'not-seated' | 'not-started' | 'over' | 'not-your-turn' | 'illegal' | 'rate-limited' | 'bad-request';
  ```

- [ ] **Step 1: Move the room tests to the new return shape and add the cap's tests**

In `apps/server/src/rooms.test.ts`:
- change `import { Chess } from 'chess.js';` to `import { Chess, type Color } from 'chess.js';` and `import { createRooms, timeoutResult, type Rooms } from './rooms.ts';` to `import { createRooms, timeoutResult, type Rooms, type SeatPlayer } from './rooms.ts';`
- add after the `beforeEach`:
  ```ts
  /** A five-minute room made by `player`. Fails the test if the server refuses it. */
  function newRoom(player: SeatPlayer, color: Color = 'w') {
    const made = rooms.create(player, color, 5);
    if ('error' in made) throw new Error(made.error);
    return made.roomId;
  }
  ```
- replace every `rooms.create(X, 'c', 5)!` with `newRoom(X, 'c')`:
  ```bash
  sed -i '' -E "s/rooms\.create\((ANN|BOB|CY), '([wb])', 5\)!/newRoom(\1, '\2')/g" apps/server/src/rooms.test.ts
  ```
- replace the test `'the server holds at most a thousand rooms'` with:
  ```ts
  test('the server holds at most a thousand rooms', () => {
    for (let i = 0; i < 1000; i++) expect(rooms.create({ ...CY, id: `player-${i}` }, 'w', 5)).toHaveProperty('roomId');
    expect(rooms.create(ANN, 'w', 5)).toEqual({ error: 'busy' });
  });

  test('one player holds at most five unfinished rooms, and others can still make theirs', () => {
    for (let i = 0; i < 5; i++) newRoom(ANN);
    expect(rooms.create(ANN, 'w', 5)).toEqual({ error: 'too-many-rooms' });
    expect(rooms.create(BOB, 'w', 5)).toHaveProperty('roomId');
  });

  test('a finished game frees its place among the five', () => {
    const first = started();
    for (let i = 0; i < 4; i++) newRoom(ANN);
    expect(rooms.create(ANN, 'w', 5)).toEqual({ error: 'too-many-rooms' });
    expect(rooms.resign(first, 'w')).toBeNull();
    expect(rooms.create(ANN, 'w', 5)).toHaveProperty('roomId');
  });
  ```

Run: `grep -n "rooms.create(.*)!" apps/server/src/rooms.test.ts`
Expected: no output.

- [ ] **Step 2: Run the room tests to see them fail**

Run: `cd apps/server && npx vitest run src/rooms.test.ts`
Expected: FAIL: `create` still returns a string, so `'error' in made` throws a TypeError, and the cap tests fail.

- [ ] **Step 3: Return the new shape and count open rooms**

In `apps/server/src/rooms.ts`, after `const MAX_ROOMS = 1000;` add:
```ts
const MAX_ROOMS_PER_PLAYER = 5; // unfinished rooms one account may hold, so nobody can take every room
```
Replace `create`'s doc comment, signature and first line with:
```ts
    /** Makes a room with `player` in the `color` seat, unless the server or this player holds too many already. */
    create(player: SeatPlayer, color: Color, minutes: number): { roomId: string } | { error: 'busy' | 'too-many-rooms' } {
      if (rooms.size >= MAX_ROOMS) return { error: 'busy' };
      let open = 0;
      for (const room of rooms.values()) {
        if (!room.result && (room.seats.w?.id === player.id || room.seats.b?.id === player.id)) open++;
      }
      if (open >= MAX_ROOMS_PER_PLAYER) return { error: 'too-many-rooms' };
```
and its last line `return id;` with `return { roomId: id };`.

In `apps/server/src/game.ts`, in the `create` handler, replace:
```ts
      const roomId = rooms.create(socket.data.user, color, minutes);
      ack(roomId ? { roomId } : { error: 'busy' });
```
with:
```ts
      ack(rooms.create(socket.data.user, color, minutes));
```

In `packages/shared/src/protocol.ts`, replace the three types with:
```ts
export type CreateAck = { roomId: string } | { error: 'busy' | 'too-many-rooms' | 'rate-limited' | 'bad-request' };
export type JoinAck = { ok: true } | { error: 'not-found' | 'full' | 'rate-limited' | 'bad-request' };
export type MoveError = 'not-seated' | 'not-started' | 'over' | 'not-your-turn' | 'illegal' | 'rate-limited' | 'bad-request';
```

- [ ] **Step 4: Run the tests, lint and typecheck everywhere**

Run: `npm test -w @chess/server && npm run typecheck && npm run lint`
Expected: all pass. (The site still typechecks: its `create` handler maps any error other than `busy` to `unreachable` until Task 5.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms.ts apps/server/src/rooms.test.ts apps/server/src/game.ts packages/shared/src/protocol.ts
git commit -m "feat: let one player hold at most five unfinished rooms, so nobody can fill the server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Guard the Socket.IO handshake and game events

**Files:**
- Modify: `apps/server/src/app.ts` (the `Server` options and the `attachGame` call), `apps/server/src/game.ts` (imports, `Options`, `io.use`, the `connection` handler)
- Test: `apps/server/src/guards.test.ts`

**Interfaces:**
- Consumes: `LIMITS`, `limiter`, `ipKey`, `clientIp`, `type Limits` (Task 1); `createApp({ trustProxy, limits })` and `start()` in `guards.test.ts` (Task 2); `CreateAck` with `'rate-limited'` (Task 3).
- Produces: `attachGame(io, { sessions, now, timeControls, limits, onGameOver })` where `limits: Pick<Limits, 'connectionsPerUser' | 'eventsPer10Seconds'>`.

- [ ] **Step 1: Write the failing socket tests**

In `apps/server/src/guards.test.ts`, change the first import line to:
```ts
import type { ClientEvents, CreateAck, ServerEvents } from '@chess/shared/protocol';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
```
Add after `const apps …`:
```ts
const sockets: Socket<ServerEvents, ClientEvents>[] = [];
const SITE = 'https://chess.example.com';
```
At the top of `afterEach`, add `for (const socket of sockets.splice(0)) socket.disconnect();`. (Remove `void annId;` if Task 2 added it.) Append:
```ts
/** A client on `port` whose handshake carries `cookie`, and `origin` when given, as a browser's would. */
function connect(port: number, cookie: string, origin?: string) {
  const socket: Socket<ServerEvents, ClientEvents> = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: origin ? { cookie, origin } : { cookie },
  });
  sockets.push(socket);
  return socket;
}

/** 'connected', or the message the refusal came with. */
const outcome = (socket: Socket<ServerEvents, ClientEvents>) =>
  new Promise<string>((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });

const annCookie = async (app: ReturnType<typeof createApp>) => `sid=${await app.sessions.create(annId)}`;

test('in production a handshake from another site, or from no site, is refused; the site connects', async () => {
  const { app, port } = await start({ origins: [SITE] });
  const cookie = await annCookie(app);
  expect(await outcome(connect(port, cookie, 'https://evil.example'))).not.toBe('connected');
  expect(await outcome(connect(port, cookie))).not.toBe('connected');
  expect(await outcome(connect(port, cookie, SITE))).toBe('connected');
});

test('in development a handshake from any origin connects', async () => {
  const { app, port } = await start();
  expect(await outcome(connect(port, await annCookie(app), 'https://evil.example'))).toBe('connected');
});

test('an account holds at most five connections; the sixth is told why', async () => {
  const { app, port } = await start();
  const cookie = await annCookie(app);
  const five = Array.from({ length: 5 }, () => connect(port, cookie));
  expect(await Promise.all(five.map(outcome))).toEqual(Array(5).fill('connected'));
  expect(await outcome(connect(port, cookie))).toBe('too-many-connections');
});

test('past the server-wide cap a new connection is refused', async () => {
  const { app, port } = await start({ limits: { maxConnections: 2 } });
  const cookie = await annCookie(app);
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).not.toBe('connected');
});

test('past the handshake limit an IP is refused', async () => {
  const { app, port } = await start({ limits: { handshakesPerMinute: 2 } });
  const cookie = await annCookie(app);
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).not.toBe('connected');
});

test('past the event limit an event is dropped, its ack says why, and one line is logged', async () => {
  const { app, port } = await start({ limits: { eventsPer10Seconds: 2 } });
  const ann = connect(port, await annCookie(app));
  expect(await outcome(ann)).toBe('connected');
  const create = () => new Promise<CreateAck>((resolve) => ann.emit('create', { color: 'w', minutes: 5 }, resolve));
  expect(await create()).toHaveProperty('roomId');
  expect(await create()).toHaveProperty('roomId');
  expect(await create()).toEqual({ error: 'rate-limited' });
  expect(await create()).toEqual({ error: 'rate-limited' });
  expect(log.warn).toHaveBeenCalledTimes(1); // once per window, not once per refusal
  expect(log.warn).toHaveBeenCalledWith('Rate limited', { limit: 'events', key: annId });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/server && npx vitest run src/guards.test.ts`
Expected: the three HTTP tests pass; the origin, sixth-connection, cap, handshake and event tests FAIL (every connection succeeds, every `create` gets a room).

- [ ] **Step 3: Check the handshake in `app.ts`**

Change the limits import to `import { clientIp, ipKey, LIMITS, limiter, perIp, type Limits } from './limits.ts';`. Replace the `new Server(…)` call with:
```ts
  const handshakes = limiter('handshake', limits.handshakesPerMinute, 60);
  const io: GameServer = new Server(http, {
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 10_000,
    // Browsers do not apply CORS to WebSocket, so the handshake's Origin is checked here.
    allowRequest(req, callback) {
      if (origins !== true && !origins.includes(req.headers.origin ?? '')) return callback('origin', false);
      if (io.engine.clientsCount >= limits.maxConnections) return callback('busy', false);
      handshakes.take(ipKey(clientIp(req, trustProxy))).then(
        (verdict) => callback(verdict.ok ? null : 'rate-limited', verdict.ok),
        (error) => {
          log.error('Handshake check failed', error);
          callback('unavailable', false);
        },
      );
    },
  });
```
Add `limits,` to the `attachGame(io, { … })` options, after `timeControls,`.

- [ ] **Step 4: Cap connections per account and limit events in `game.ts`**

Add `import { limiter, type Limits } from './limits.ts';` after the `./cookies.ts` import. Add to `Options`:
```ts
  limits: Pick<Limits, 'connectionsPerUser' | 'eventsPer10Seconds'>;
```
Add `limits` to `attachGame`'s destructured options, and after `const flags = …` add:
```ts
  const events = limiter('events', limits.eventsPer10Seconds, 10);
```
In `io.use`, between `if (!user) return next(new Error('unauthorized'));` and `socket.data.user = …`, add:
```ts
      // Soft: two handshakes arriving together can both pass.
      if ((io.sockets.adapter.rooms.get(userRoom(user.id))?.size ?? 0) >= limits.connectionsPerUser) {
        return next(new Error('too-many-connections'));
      }
```
In `io.on('connection', …)`, right after `void socket.join(userRoom(socket.data.user.id));`, add:
```ts
    // Every game event costs the account a point. Past the limit the event is dropped and its ack says why.
    socket.use(([, ...args], next) => {
      events.take(socket.data.user.id).then(
        (verdict) => {
          if (verdict.ok) return next();
          const ack = args.at(-1);
          if (typeof ack === 'function') ack({ error: 'rate-limited' });
        },
        (error) => log.error('Event check failed', error),
      );
    });
```

Run: `grep -rn "attachGame(" apps/server/src apps/web/src`
Expected: only `app.ts` calls it (so making `limits` required breaks nothing else).

- [ ] **Step 5: Run the socket tests and everything else**

Run: `cd apps/server && npx vitest run src/guards.test.ts && cd ../.. && npm test && npm run lint && npm run typecheck`
Expected: all pass. If an existing test file now trips a limit from `127.0.0.1` (for example `app.test.ts` opening many sockets in one minute), pass a higher value for that one limit in that file's `createApp({ … limits: { … } })` and note why in a one-line comment.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/game.ts apps/server/src/guards.test.ts
git commit -m "feat: refuse cross-site handshakes, cap connections, and rate-limit game events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tell players why they were refused

**Files:**
- Modify: `apps/web/src/net/online.ts:12,108-131`, `apps/web/src/ui/i18n.ts` (both `onlineError` blocks)
- Test: `apps/web/src/net/online.test.ts`

**Interfaces:**
- Consumes: the protocol types from Task 3; the server's refusals from Tasks 3-4.
- Produces: `OnlineError = 'not-found' | 'full' | 'busy' | 'unreachable' | 'replaced' | 'signed-out' | 'rate-limited' | 'too-many-rooms' | 'too-many-tabs'`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/net/online.test.ts`:
```ts
/** Sends `create` from a bare socket of this device's account, and waits for the answer. */
const createFrom = (client: Client) =>
  new Promise<CreateAck>((resolve) => client.emit('create', { color: 'w', minutes: 5 }, resolve));

test('a sixth unfinished room is refused, and the menu says why', async () => {
  const mine = connectAs(me.cookie);
  for (let i = 0; i < 5; i++) expect(await createFrom(mine)).toHaveProperty('roomId');
  online().create(5);
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', error: 'too-many-rooms' });
  mine.disconnect();
});

test('an account that sends too many events is told to slow down', async () => {
  const mine = connectAs(me.cookie);
  // The limit is 20 events in 10 seconds; resigning without a seat costs a point like any event.
  for (let i = 0; i < 20; i++) await new Promise((resolve) => mine.emit('resign', resolve));
  online().create(5);
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', error: 'rate-limited' });
  mine.disconnect();
});

test('a sixth tab of one account is told it has too many', async () => {
  const tabs = Array.from({ length: 5 }, () => connectAs(me.cookie));
  await until(() => tabs.every((tab) => tab.connected));
  online().create(5);
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', error: 'too-many-tabs' });
  for (const tab of tabs) tab.disconnect();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run src/net/online.test.ts`
Expected: the three new tests FAIL: the errors come out as `unreachable` (create) and `unreachable` (connection).

- [ ] **Step 3: Map the refusals in `online.ts`**

Replace the `OnlineError` type with:
```ts
export type OnlineError =
  | 'not-found'
  | 'full'
  | 'busy'
  | 'unreachable'
  | 'replaced'
  | 'signed-out'
  | 'rate-limited'
  | 'too-many-rooms'
  | 'too-many-tabs';
```
In `start`, replace the `join` ack's line with:
```ts
        if ('error' in reply) quit(reply.error === 'full' || reply.error === 'rate-limited' ? reply.error : 'not-found');
```
the `create` ack's error line with:
```ts
        if ('error' in reply) return quit(reply.error === 'bad-request' ? 'unreachable' : reply.error);
```
and, in `connect_error`, after the `unauthorized` block, add:
```ts
      // Too many tabs of this account: refused by the server's middleware, which socket.io does not retry either.
      if (error.message === 'too-many-connections') return quit('too-many-tabs');
```

- [ ] **Step 4: Add the sentences**

In `apps/web/src/ui/i18n.ts`, in the English `onlineError`, after `'signed-out'`, add:
```ts
    'rate-limited': "You're going too fast. Wait a moment and try again.",
    'too-many-rooms': 'You have 5 unfinished rooms. Finish one, or wait a few minutes, then create a new one.',
    'too-many-tabs': 'The game is open in too many tabs. Close some and try again.',
```
and in the Vietnamese `onlineError`, after `'signed-out'`:
```ts
    'rate-limited': 'Bạn thao tác quá nhanh. Đợi một chút rồi thử lại.',
    'too-many-rooms': 'Bạn đang có 5 phòng chưa xong. Hãy chơi hết hoặc đợi vài phút rồi tạo phòng mới.',
    'too-many-tabs': 'Bạn đang mở game ở quá nhiều tab. Hãy đóng bớt rồi thử lại.',
```
(`MainMenu.tsx` already shows `t.onlineError[error]`; `Strings = typeof en` makes a missing Vietnamese key a type error.)

- [ ] **Step 5: Run the site's tests, lint and typecheck**

Run: `npm test -w @chess/web && npm run lint -w @chess/web && npm run typecheck -w @chess/web`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/net/online.ts apps/web/src/net/online.test.ts apps/web/src/ui/i18n.ts
git commit -m "feat: tell players when they go too fast, hold too many rooms, or open too many tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Content-Security-Policy and security headers for the site

**Files:**
- Create: `apps/web/src/csp.ts`
- Test: `apps/web/src/csp.test.ts`
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_SENTRY_DSN` at build time.
- Produces: `contentSecurityPolicy(options: { serverUrl?: string; sentryDsn?: string }): string`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/csp.test.ts`:
```ts
import { expect, test } from 'vitest';
import { contentSecurityPolicy } from './csp';

const DSN = 'https://KEY@o1.ingest.us.sentry.io/2';

/** The policy as a map from directive to its sources. */
const directives = (policy: string) =>
  new Map(
    policy.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ');
      return [name, sources.join(' ')];
    }),
  );

test('the policy for a server on https, with Sentry', () => {
  expect(contentSecurityPolicy({ serverUrl: 'https://api.chess.example.com', sentryDsn: DSN }).split('; ')).toEqual([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com",
    "media-src 'self'",
    "font-src 'self'",
    "worker-src 'self'",
    "connect-src 'self' https://api.chess.example.com wss://api.chess.example.com https://o1.ingest.us.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
    'report-uri https://o1.ingest.us.sentry.io/api/2/security/?sentry_key=KEY',
  ]);
});

test('without a server address it allows the local development server, and leaves http alone', () => {
  const policy = directives(contentSecurityPolicy({}));
  expect(policy.get('connect-src')).toBe("'self' http://localhost:3001 ws://localhost:3001");
  expect(policy.has('upgrade-insecure-requests')).toBe(false);
  expect(policy.has('report-uri')).toBe(false);
});

test('a server on http is reached over ws, and a path after its origin is dropped', () => {
  const policy = directives(contentSecurityPolicy({ serverUrl: 'http://192.168.1.5:3001/' }));
  expect(policy.get('connect-src')).toBe("'self' http://192.168.1.5:3001 ws://192.168.1.5:3001");
});

test('a DSN that does not parse adds nothing', () => {
  for (const sentryDsn of ['', 'not a url', 'https://o1.ingest.sentry.io/2', 'https://KEY@o1.ingest.sentry.io/']) {
    const policy = directives(contentSecurityPolicy({ serverUrl: 'https://api.chess.example.com', sentryDsn }));
    expect(policy.get('connect-src'), sentryDsn).toBe("'self' https://api.chess.example.com wss://api.chess.example.com");
    expect(policy.has('report-uri'), sentryDsn).toBe(false);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run src/csp.test.ts`
Expected: FAIL, cannot find `./csp`.

- [ ] **Step 3: Write `csp.ts`**

Create `apps/web/src/csp.ts`:
```ts
// The site's Content-Security-Policy, built at build time by next.config.ts. Static, so the page stays static:
// 'unsafe-inline' covers Next's inline scripts; everything a page may load or call is named here.

const DEV_SERVER = 'http://localhost:3001'; // net/server.ts's fallback on localhost
const AVATARS = 'https://*.googleusercontent.com https://avatars.githubusercontent.com';

/** Sentry's ingest origin and security-report URL for a DSN such as https://KEY@o1.ingest.sentry.io/2. */
function sentry(dsn: string | undefined): { origin: string; reportUri: string } | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const project = url.pathname.slice(1);
    if (!url.username || !/^\d+$/.test(project)) return null;
    return { origin: url.origin, reportUri: `${url.origin}/api/${project}/security/?sentry_key=${url.username}` };
  } catch {
    return null; // a DSN that does not parse must not break the build
  }
}

/** The site's CSP, from the game server's address and Sentry's DSN as the build sees them. */
export function contentSecurityPolicy({ serverUrl, sentryDsn }: { serverUrl?: string; sentryDsn?: string }): string {
  const server = new URL(serverUrl || DEV_SERVER).origin;
  const report = sentry(sentryDsn);
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", // Stockfish compiles WebAssembly
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${AVATARS}`,
    "media-src 'self'",
    "font-src 'self'",
    "worker-src 'self'",
    ["connect-src 'self'", server, server.replace(/^http/, 'ws'), report?.origin].filter(Boolean).join(' '),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(server.startsWith('https:') ? ['upgrade-insecure-requests'] : []), // a local build on http keeps working
    ...(report ? [`report-uri ${report.reportUri}`] : []),
  ].join('; ');
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run src/csp.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Send the headers from production builds**

In `apps/web/next.config.ts`, add after the `NextConfig` import:
```ts
import { contentSecurityPolicy } from './src/csp.ts';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy({
      serverUrl: process.env.NEXT_PUBLIC_SERVER_URL,
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    }),
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];
```
and inside `nextConfig`, after `partialPrefetching: true,`:
```ts
  // Production only: `next dev` needs eval for React's error overlay, which this policy forbids.
  async headers() {
    return process.env.NODE_ENV === 'production' ? [{ source: '/:path*', headers: securityHeaders }] : [];
  },
```

- [ ] **Step 6: Lint, typecheck, test and build the site**

Run: `npm run lint -w @chess/web && npm run typecheck -w @chess/web && npm test -w @chess/web && npm run build -w @chess/web`
Expected: all pass; the build succeeds.

- [ ] **Step 7: Check the headers and the game under them in Chromium, Firefox and WebKit**

1. In one terminal, `npm run server` (the development server on 3001; any origin allowed). In another, `npm run start -w @chess/web` (the production build on 3000).
2. Headers:
   ```bash
   curl -sI http://localhost:3000 | grep -iE '^(content-security-policy|x-content-type-options|referrer-policy|permissions-policy|strict-transport-security):'
   ```
   Expected: five lines; the CSP's `connect-src` names `http://localhost:3001 ws://localhost:3001`.
3. Two signed-in test players in the development database (the command reads `apps/server/.env` itself; one has a public GitHub avatar, to exercise `img-src`):
   ```bash
   node --env-file=apps/server/.env --input-type=module -e "
   import { connect } from './apps/server/src/db.ts';
   import { createSessions } from './apps/server/src/sessions.ts';
   import { users } from './apps/server/src/schema.ts';
   const { pool, db } = connect(process.env.DATABASE_URL);
   const sessions = createSessions(db);
   for (const [name, avatarUrl] of [['CSP Ann', 'https://avatars.githubusercontent.com/u/9919?v=4'], ['CSP Bob', null]]) {
     const [{ id }] = await db.insert(users).values({ displayName: name, avatarUrl }).returning({ id: users.id });
     console.log(name, await sessions.create(id));
   }
   await pool.end();
   "
   ```
   Keep the two printed tokens.
4. In the scratchpad directory, `npm init -y && npm install playwright` (the browsers already in `~/Library/Caches/ms-playwright` are reused if the version matches; if Playwright asks to download browsers, ask the owner before running `npx playwright install firefox webkit`). Save as `csp-check.mjs` there and run `node csp-check.mjs <Ann's token> <Bob's token>`:
   ```js
   import { chromium, firefox, webkit } from 'playwright';

   const [annToken, bobToken] = process.argv.slice(2);
   const SITE = 'http://localhost:3000';
   let failed = false;
   for (const engine of [chromium, firefox, webkit]) {
     const browser = await engine.launch();
     const violations = [];
     const open = async (token) => {
       const context = await browser.newContext();
       await context.addCookies([{ name: 'sid', value: token, domain: 'localhost', path: '/' }]);
       await context.addInitScript(() =>
         document.addEventListener('securitypolicyviolation', (e) => console.log(`CSP ${e.effectiveDirective} ${e.blockedURI}`)),
       );
       const page = await context.newPage();
       page.on('console', (message) => message.text().startsWith('CSP ') && violations.push(message.text()));
       return page;
     };
     const ann = await open(annToken);
     await ann.goto(SITE);
     await ann.getByRole('button', { name: 'Play the computer' }).click();
     await ann.getByRole('button', { name: 'Start' }).click();
     await ann.waitForTimeout(3000); // the Stockfish worker and its WASM load
     await ann.goto(SITE);
     await ann.getByRole('button', { name: 'Play online' }).click();
     await ann.locator('img[src*="avatars.githubusercontent.com"]').waitFor(); // Ann's avatar (alt="", so no img role)
     await ann.waitForTimeout(1000); // let it load, or be blocked
     await ann.getByRole('button', { name: 'Create room' }).click();
     await ann.waitForURL(/\?room=/);
     const bob = await open(bobToken);
     await bob.goto(ann.url()); // the invite link
     await ann.getByText('CSP Bob').first().waitFor({ timeout: 10_000 }); // the opponent's name in the HUD
     console.log(engine.name(), violations.length ? violations : 'no CSP violations');
     failed ||= violations.length > 0;
     await browser.close();
   }
   process.exit(failed ? 1 : 0);
   ```
   Expected: `chromium no CSP violations`, `firefox no CSP violations`, `webkit no CSP violations`, exit 0. If two buttons match `Start`, scope the click to the computer panel. If a button name differs, read `apps/web/src/ui/MainMenu.tsx` and `i18n.ts` (`playComputer`, `start`, `playOnline`, `createRoom`) and fix the script, not the site. If a violation appears, widen only the directive it names, add a case to `csp.test.ts`, and run this step again.
5. Remove the test players: `docker compose -f apps/server/docker-compose.yml exec -T postgres psql -U chess -d chess -c "DELETE FROM users WHERE display_name LIKE 'CSP %'"`, then stop both servers.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/csp.ts apps/web/src/csp.test.ts apps/web/next.config.ts
git commit -m "feat: send a Content-Security-Policy and security headers from the site's production builds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

- Run the whole check once more from the root: `npm run lint && npm run typecheck && npm test && npm run build`.
- If the branch has a pull request, push and confirm CI's `check` and `image` jobs pass (ask the owner before pushing).
- Report what was verified (unit and integration tests, the three-browser CSP check, the headers) and what was not: behaviour behind the real Caddy on the VPS (`TRUST_PROXY: '1'`), which needs a deploy.
