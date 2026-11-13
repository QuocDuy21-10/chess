# 3D Combat Chess — Securing the API and WebSocket

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

No single IP or account can wear the game server down or lock other players out, a page on another site
cannot open a game connection with a player's cookie, and the site tells the browser exactly where its
scripts, images and connections may come from. Players who play normally never notice any of it.

This is S2 of four sub-projects that carry out `roadmap-2.md` §4, Phase 5:

| | Sub-project | Builds on |
|---|---|---|
| S1 | CI/CD, deploy to the VPS, backups, logging and monitoring | — |
| **S2** | Securing the API and WebSocket (this spec) | S1 |
| S3 | Tests: chess-rule edge cases, the animation sequencer, Playwright E2E on Chromium, Firefox and WebKit | S1 |
| S4 | Assets: cache headers, music size, loading the engine only when needed, bundle size | S1 |

S2 needs S1 first: it logs through `log.ts`, adds a line to `deploy/compose.yml`, and relies on CI to run its
tests.

## Where things stand

- HTTP: helmet, CORS for `CLIENT_ORIGIN`, JSON bodies capped at 1 kB, POST/PATCH refused unless `Origin` is one
  of the site's origins (`sameSiteOnly`), cookies `HttpOnly; SameSite=Lax`. No rate limits.
- Socket.IO: every connection needs a live session (`io.use` in `game.ts`); every payload is checked against a
  pattern; `maxHttpBufferSize` is 10 kB. Socket.IO's `cors` option is set, but browsers do not apply CORS to
  WebSocket, and nothing checks the handshake's `Origin`. No limit on connections or event rates.
- `rooms.ts` caps the server at 1000 rooms (`MAX_ROOMS`), but not per player: one signed-in account can create
  all 1000, and everyone else gets "The server is full" until the rooms expire 10 minutes later.
- The server sits behind exactly one proxy in production (Caddy, from S1), so `req.ip` would be Caddy's address
  without a `trust proxy` setting.
- The site sends no Content-Security-Policy and no other security headers of its own.
- What the site loads: its own scripts and styles; the Stockfish worker and its WASM from `/engine/`; sounds
  through `fetch('/audio/…')` and music through `new Audio('/audio/music.mp3')`; avatars from
  `*.googleusercontent.com` and `avatars.githubusercontent.com` (`MainMenu.tsx`); the game server over HTTPS and
  WebSocket at `NEXT_PUBLIC_SERVER_URL`; Sentry (S1). No fonts from elsewhere, no iframes, no
  `dangerouslySetInnerHTML`.

## Decisions already made

| Question | Decision |
|---|---|
| CSP style | A static header from `next.config.ts`, with `'unsafe-inline'` for scripts and styles. The page stays static and CDN-cached. No nonces (they force dynamic rendering and clash with `cacheComponents`), no experimental SRI. |
| Rate-limit library | `rate-limiter-flexible`, `RateLimiterMemory`, pinned at exactly **11.2.3** (released 2026-10-17; the three newer releases are under two weeks old). Memory store: the server runs as one instance (S1). |
| Client IP | A new `TRUST_PROXY` setting (proxy hops, default 0); production sets 1. Express and the Socket.IO handshake both derive the IP with `proxy-addr`, which Express already installs; it becomes a direct dependency. |
| Limit values | See "Limits". Constants in code; tests pass smaller ones through `createApp({ limits })`. |
| Refusals | Logged with `log.warn` once per key per window. Never sent to Sentry. |

## Limits

All in one object, `LIMITS`, in `apps/server/src/limits.ts`, except the per-player room cap, which lives in
`rooms.ts` next to `MAX_ROOMS`.

| What | Counted per | Limit | Refusal |
|---|---|---|---|
| HTTP requests, every route except `GET /health` | IP | 300 a minute | `429 {"error":"rate-limited"}` with `Retry-After` (seconds) |
| `GET /auth/:provider` and `GET /auth/:provider/callback` | IP | 60 every 10 minutes, on top of the above | as above |
| Socket.IO handshake and WebSocket upgrade (`allowRequest`) | IP | 120 a minute (each connection makes up to two requests: about 60 connections) | HTTP 403 |
| Handshake `Origin` | — | Must be one of `CLIENT_ORIGIN` when it is set; anything when it is not (development) | HTTP 403 |
| Open connections, all players | — | 2000 (`io.engine.clientsCount`) | HTTP 403 |
| Open connections of one account | account | 5 | `connect_error` with message `too-many-connections` |
| Game events `create`, `join`, `move`, `resign` | account | 20 every 10 seconds | the event is dropped; its ack gets `{ error: 'rate-limited' }` |
| Open rooms of one account (seated, game not over) | account | 5 (`MAX_ROOMS_PER_PLAYER`) | `create` ack gets `{ error: 'too-many-rooms' }` |

`GET /auth/providers` is not in the stricter auth limit: every page load asks it.

The numbers leave room for many players behind one NAT or carrier-grade NAT, and for every client reconnecting
at once after a deploy, while keeping one account from taking every room and one IP from flooding the database
with handshakes that carry made-up cookies (each costs a session lookup). The per-account connection cap is soft:
two handshakes arriving together can both pass.

## Server

### `limits.ts` (new)

```ts
export interface Limits {
  httpPerMinute: number;          // 300
  authPer10Minutes: number;       // 60
  handshakesPerMinute: number;    // 120
  maxConnections: number;         // 2000
  connectionsPerUser: number;     // 5
  eventsPer10Seconds: number;     // 20
}
export const LIMITS: Limits;

/** The key an IP address is counted under: an IPv4 address, or the /64 network of an IPv6 one. */
export function ipKey(address: string): string;

/** A RateLimiterMemory for `points` per `seconds`, logging the first refusal of each key in each window. */
export function limiter(name: string, points: number, seconds: number): Limiter;

export interface Limiter {
  /** `{ ok: true }` when `key` may go on; `{ ok: false, retryAfterMs }` when it is over its limit. */
  take(key: string): Promise<{ ok: true } | { ok: false; retryAfterMs: number }>;
}
```

- `ipKey`: `::ffff:1.2.3.4` becomes `1.2.3.4`; an IPv6 address is expanded and cut to its first four groups,
  because one IPv6 host usually has a whole /64 to rotate through.
- `limiter` wraps `RateLimiterMemory({ points, duration: seconds, keyPrefix: name })`. A rejection carrying
  `consumedPoints === points + 1` is the first refusal in the window: that one is logged as
  `log.warn('Rate limited', { limit: name, key })`. A rejection that is an `Error` (the memory store does not
  throw, but the type allows it) is rethrown.

### Configuration (`config.ts`)

`TRUST_PROXY`: a whole number from 0 to 10, default 0. Anything else throws, naming the variable, like `PORT`.
`Config.trustProxy: number`.

0 is the safe default: trusting a proxy that is not there would let any client choose its own IP with
`X-Forwarded-For` and walk around every per-IP limit.

`deploy/compose.yml` (from S1) adds `TRUST_PROXY: 1` to the `server` service's `environment`.

### HTTP (`http.ts`, `auth.ts`, `app.ts`)

- `createHttpApp` takes the hop count and the limits along with the origins and routes. It calls
  `app.set('trust proxy', trustProxy)` and puts a middleware after `/health` and before the routes:
  `take(ipKey(req.ip))` on the HTTP limiter; refused → `429 {"error":"rate-limited"}` and `Retry-After`.
- `authRoutes` puts a second middleware, on the auth limiter, on `GET /auth/:provider` and
  `GET /auth/:provider/callback` only.
- One shared helper turns a limiter into Express middleware, so both use the same 429 response.

### Socket.IO (`app.ts`, `game.ts`)

`new Server(http, { …, allowRequest })`, where `allowRequest(req, callback)`, in order:

1. When `origins` is a list and `req.headers.origin` is not in it: `callback('origin', false)`.
2. When `io.engine.clientsCount >= maxConnections`: `callback('busy', false)`.
3. `take(ipKey(clientIp(req)))` on the handshake limiter; refused → `callback('rate-limited', false)`.
4. Otherwise `callback(null, true)`.

`clientIp(req)` is `proxyaddr(req, (_address, hop) => hop < trustProxy)`, the same rule Express applies with
`trust proxy` set to a number. Engine.io answers a refusal with HTTP 403; the client sees a transport error and
retries with its usual back-off, which is fine for traffic that should not be there.

In `io.use`, after the session check and before `next()`: when the account's room `user:<id>` already holds
`connectionsPerUser` connections, `next(new Error('too-many-connections'))`.

On each connection, `socket.use(([event, ...args], next) => …)` takes one point from the events limiter keyed by
the account id. Refused: the last argument, when it is a function, is called with `{ error: 'rate-limited' }`, and
`next` is not called, so the handler never runs.

### Rooms (`rooms.ts`)

`create(player, color, minutes)` returns `{ roomId: string } | { error: 'busy' | 'too-many-rooms' }` instead of
`string | null`:

- `busy` when `rooms.size >= MAX_ROOMS`, as today;
- `too-many-rooms` when `player.id` sits in `MAX_ROOMS_PER_PLAYER` (5) rooms whose game has no result yet.

`game.ts` passes the result straight to the ack. Counting walks at most 1000 rooms per `create`.

## Shared protocol (`@chess/shared/protocol`)

```ts
export type CreateAck = { roomId: string } | { error: 'busy' | 'too-many-rooms' | 'rate-limited' | 'bad-request' };
export type JoinAck = { ok: true } | { error: 'not-found' | 'full' | 'rate-limited' | 'bad-request' };
export type MoveError = 'not-seated' | 'not-started' | 'over' | 'not-your-turn' | 'illegal' | 'rate-limited' | 'bad-request';
```

## Site

### `net/online.ts`

`OnlineError` gains `'rate-limited' | 'too-many-rooms' | 'too-many-tabs'`.

- `create` ack: `busy` → `busy`, `too-many-rooms` → `too-many-rooms`, `rate-limited` → `rate-limited`, anything
  else → `unreachable`.
- `join` ack: `full` → `full`, `rate-limited` → `rate-limited`, anything else → `not-found` (today every error
  but `full` shows as `not-found`).
- `connect_error` with message `too-many-connections` → `too-many-tabs`. It comes from middleware, so Socket.IO
  does not retry it, the same as `unauthorized`.
- A refused `move` already sends the board back to the server's moves; `rate-limited` needs nothing more.

### Strings (`ui/i18n.ts`, under `onlineError`)

| Key | en | vi |
|---|---|---|
| `rate-limited` | You're going too fast. Wait a moment and try again. | Bạn thao tác quá nhanh. Đợi một chút rồi thử lại. |
| `too-many-rooms` | You have 5 unfinished rooms. Finish one, or wait a few minutes, then create a new one. | Bạn đang có 5 phòng chưa xong. Hãy chơi hết hoặc đợi vài phút rồi tạo phòng mới. |
| `too-many-tabs` | The game is open in too many tabs. Close some and try again. | Bạn đang mở game ở quá nhiều tab. Hãy đóng bớt rồi thử lại. |

### Content-Security-Policy (`apps/web/src/csp.ts`, new)

```ts
/** The site's CSP, from the server's address and Sentry's DSN as the build sees them. */
export function contentSecurityPolicy(options: { serverUrl?: string; sentryDsn?: string }): string;
```

A pure function, so it can be tested without a build. With `serverUrl = https://api.chess.example.com` and a DSN
`https://KEY@o1.ingest.us.sentry.io/2`, it returns these directives, joined with `; `:

```
default-src 'self'
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com
media-src 'self'
font-src 'self'
worker-src 'self'
connect-src 'self' https://api.chess.example.com wss://api.chess.example.com https://o1.ingest.us.sentry.io
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
report-uri https://o1.ingest.us.sentry.io/api/2/security/?sentry_key=KEY
```

- `'wasm-unsafe-eval'`: Stockfish compiles WebAssembly. Every supported browser (Chrome 111+, Firefox 111+,
  Safari 16.4+) knows it.
- `serverUrl` unset (a local production build): `http://localhost:3001 ws://localhost:3001`, matching
  `net/server.ts`'s fallback on `localhost`.
- The WebSocket origin is the server's origin with `https:` → `wss:` and `http:` → `ws:`.
- `upgrade-insecure-requests` only when the server's address is `https:`, so a local build on `http://localhost`
  keeps working.
- No DSN: no Sentry host in `connect-src`, no `report-uri`. With one, `report-uri` sends every violation to
  Sentry's security endpoint, so anything the policy blocks on a player's browser shows up there.
- A DSN that does not parse is ignored (no Sentry host, no `report-uri`) rather than breaking the build.

### Headers (`next.config.ts`)

`headers()` returns, for `source: '/:path*'`, **only when `NODE_ENV` is `production`** (so `next dev`, which needs
`'unsafe-eval'`, is untouched):

| Header | Value |
|---|---|
| `Content-Security-Policy` | `contentSecurityPolicy({ serverUrl: NEXT_PUBLIC_SERVER_URL, sentryDsn: NEXT_PUBLIC_SENTRY_DSN })` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Strict-Transport-Security` | `max-age=63072000` |

The server's own responses keep helmet's defaults, CSP included.

## Error handling

- A limiter that rejects with an `Error` (not expected from the memory store) goes to Express's error handler
  (500, logged, Sentry) on HTTP, and refuses the handshake or event on Socket.IO, logging it with `log.error`.
- Refusals are logged once per key per window, so a flood costs a line a minute, not a line a request.
- Nothing about a refusal reaches Sentry.

## Testing

- `limits.test.ts`: `ipKey` for IPv4, IPv4-mapped IPv6, full and compressed IPv6 (same /64 → same key, another
  /64 → another key); `limiter` lets `points` through, refuses the next with a positive `retryAfterMs`, logs only
  the first refusal (`vi.spyOn(log, 'warn')`), and lets the key through again after the window (fake timers).
- `config.test.ts`: `TRUST_PROXY` default 0, `'1'` → 1, refusals for `'-1'`, `'abc'`, `'1.5'`, `'11'`.
- HTTP (`http.test.ts` or a new `limits` section in `api.test.ts`, through `createApp` with small limits): the
  request after the limit gets 429, `{"error":"rate-limited"}` and `Retry-After`; `/health` is never counted;
  `/auth/providers` does not use the auth limit; with `trustProxy: 1`, two different `X-Forwarded-For` values are
  counted apart; with `trustProxy: 0`, `X-Forwarded-For` is ignored.
- Socket.IO (`app.test.ts`, real connections, small limits): with `origins: [site]`, a client whose `Origin` is
  another site is refused and one with `site` connects; with `origins: true`, any `Origin` connects; the sixth
  connection of one account gets `too-many-connections`; past `maxConnections`, a new connection is refused; a
  burst of events past the limit gets `rate-limited` acks and the handler does not run (the room's moves do not
  change); past the handshake limit, a new connection is refused.
- `rooms.test.ts`: the sixth open room of one player is `too-many-rooms`, another player can still create; once
  one of the five games is over, the first player can create again; `busy` at `MAX_ROOMS` as before.
- `csp.test.ts`: the full policy for the example above; the `localhost` fallback; `ws:` for `http:`; no
  `upgrade-insecure-requests` for `http:`; no Sentry parts without a DSN or with a bad one.
- `online.test.ts`: the three new errors become the right `OnlineError`.
- Existing tests keep passing. Test files that open more connections from `127.0.0.1` than a real IP would raise
  that one limit through `createApp({ limits })`.
- By hand, during implementation: `next build && next start` against a local server, opened in Chromium, Firefox
  and WebKit (Playwright): a game against the computer, an online game between two accounts, music on, an
  avatar shown, and no CSP violation in any console; `curl -I` shows the headers. Automated cross-browser E2E is
  S3's.

## Done when

- Every limit in "Limits" is enforced and covered by a test.
- A handshake from another site's page is refused in production.
- The three new errors reach players as sentences, in English and Vietnamese.
- A production build of the site sends the CSP and the four other headers, and the game works under them in
  Chromium, Firefox and WebKit.
- `TRUST_PROXY` is documented in README's variable table and set in `deploy/compose.yml`.

## To verify during implementation

- Whether `stockfish-19-lite-single.js` calls `eval` or `new Function`. If it does, `/engine/:path*` gets its
  own CSP with `'unsafe-eval'` added; the rest of the site keeps the policy above.
- That `next.config.ts` can import `./src/csp.ts` in Next 16.4 (otherwise the function moves into
  `next.config.ts` and the test imports it from there).
- That `socket.use` sees the ack as the packet's last element in Socket.IO 4.8, and that `allowRequest`'s
  refusal reaches socket.io-client as a `connect_error`.
- Whether Socket.IO calls `allowRequest` for the WebSocket upgrade as well as the handshake (the handshake limit's
  numbers assume it does).

## Out of scope

- A shared store for limits across several instances (Redis): the same library takes a Redis store when needed.
- Stopping mass sign-ups through throwaway OAuth accounts.
- A WAF or Cloudflare in front of the VPS.
- A nonce-based CSP.
- CSRF tokens: `SameSite=Lax` and the `Origin` check on unsafe methods already cover it.
- Dependency auditing in CI (`npm audit`), which can be added to S1's `check` job later.
