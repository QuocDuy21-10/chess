# 3D Combat Chess — Accounts, Match History and Ratings (PostgreSQL)

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

Online play needs an account. A player signs in with Google or GitHub, has a
display name and an Elo rating, and every finished online game is saved with
the rating change it caused. The menu shows the player's profile and their
match history; the HUD shows both players' names and ratings.

This is P2 of the three sub-projects in
`2026-11-13-separate-backend-design.md`, which carry out `roadmap-2.md` §4
Phase 4, part 3 ("accounts + matchmaking"):

| | Sub-project | State |
|---|---|---|
| P1 | Separate backend on Express | done |
| **P2** | PostgreSQL: accounts, match history, ratings (this spec) | — |
| P3 | Redis: rooms that survive a restart, several instances, matchmaking | builds on P2 |

Playing the computer and two players on one device are unchanged and need no
account.

## Where things stand

- The server (`apps/server`) keeps every room in memory (`rooms.ts`). A seat
  belongs to a `playerId`: a random string each browser makes and keeps in
  `localStorage` under `chess.player`, and sends with `create` and `join`.
  The server takes it on trust.
- There is no database, no HTTP route but `/health`, and no CORS for HTTP.
- `rooms.ts` carries a shortcut: a flag is always a win, even when the winner
  cannot mate, "Upgrade when games are rated". This spec rates games.

## Decisions already made

| Question | Decision |
|---|---|
| Order | P2 now, P3 after. |
| Sign-in | OAuth with Google and GitHub. No passwords. |
| Guests online | No. Online play needs an account. The computer and local play do not. |
| In scope | Sign-in and sign-out, profile (name, avatar, rename), saved match history with a list in the menu, Elo rating. |
| Where auth lives | In the Express server. It owns the OAuth routes, the sessions and the database. The site never touches the database. |
| Database access | Drizzle ORM on `pg`. Schema in plain TypeScript, migrations generated as SQL by `drizzle-kit`. |
| Rating | Elo, start 1500, K = 40 for a player's first 30 games, 20 after. |
| Linking accounts | None. A Google sign-in and a GitHub sign-in are two users, even with the same email. Linking by email would let whoever controls an email at one provider take the other account. |

Checked before writing this spec (scratch project, Node 22.23.2, Docker
Postgres 17.12):

- Versions: `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, `pg@8.23.1`,
  `@types/pg@8.23.1`, `arctic@3.7.0`, `cookie@2.0.2`, `cors@2.8.6`.
  `drizzle-orm@1.0.0-rc.5` exists; this spec stays on 0.45.
- `node schema.ts` loads a Drizzle schema through type stripping: Drizzle
  uses no decorators and no build step.
- `drizzle-kit generate` writes `CHECK` constraints, composite primary keys,
  `DESC` index columns and a `bytea` custom type into the SQL.
- `migrate()` from `drizzle-orm/node-postgres/migrator`, run inside
  `pg_advisory_lock`, applies the migration once; a second run is a no-op.
  The `CHECK` on a blank display name rejects the row.
- Arctic: `new Google(id, secret, redirectUri).createAuthorizationURL(state,
  codeVerifier, scopes)` and `new GitHub(id, secret, redirectUri)
  .createAuthorizationURL(state, scopes)` build the provider URLs.
- `cookie@2` exports `parseCookie` (no more `parse`). Express's own
  `res.cookie()` sets cookies, so only parsing needs the package.

## Deployment constraint

The sign-in cookie is set by the server's host and sent by the browser to that
host only (no `Domain` attribute). With `SameSite=Lax`, the browser sends it
on the site's `fetch` and WebSocket calls only when the site and the server
are **the same site**: the same registrable domain, such as
`chess.example.com` and `api.chess.example.com`. In development
`localhost:3000` and `localhost:3001` are the same site.

`*.vercel.app` and `*.onrender.com` are on the Public Suffix List, so a site
on one and a server on the other are two sites and sign-in will not work. A
custom domain for both is a requirement of this sub-project; the README says
so.

## Layout

```
apps/server/
├── drizzle/                 generated migrations (SQL + meta), committed
├── drizzle.config.ts
├── docker-compose.yml       Postgres 17 for development and tests
└── src/
    ├── index.ts             + migrate, then listen
    ├── config.ts            + DATABASE_URL, PUBLIC_URL, OAuth ids and secrets
    ├── app.ts               + db, providers; mounts auth and api; socket auth
    ├── http.ts              + json, cors, origin check
    ├── db.ts                new: pool, Drizzle client, migrate under a lock
    ├── schema.ts            new: the four tables
    ├── sessions.ts          new: create, look up, delete, sweep
    ├── auth.ts              new: OAuth routes, returnTo
    ├── providers.ts         new: Google and GitHub behind one interface
    ├── api.ts               new: /me, /me/games
    ├── games.ts             new: save a finished game, read a player's history
    ├── elo.ts               new: the rating change
    ├── game.ts              seats by user; calls onGameOver once per game
    └── rooms.ts             seats hold a player; startedAt; timeout draw
packages/shared/src/
    ├── protocol.ts          payloads lose playerId; RoomState gains players
    ├── result.ts            + 'timeout-insufficient'
    └── account.ts           new: User, HistoryEntry, HistoryPage (REST shapes)
apps/web/src/
    ├── net/account.ts       new: useAccount store
    ├── net/online.ts        cookie instead of playerId; 'signed-out' error
    └── ui/                  MainMenu (sign-in, profile, history), Hud (names), i18n
```

New server dependencies: `drizzle-orm`, `pg`, `arctic`, `cookie`, `cors`.
New dev dependencies: `drizzle-kit`, `@types/pg`, `@types/cors`.
`@chess/shared` exports `./account` beside `./protocol` and `./result`.

## Data

Four tables. Postgres 13 or later (`gen_random_uuid()` is built in).

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `display_name` | `varchar(32) not null` | `CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 32)` |
| `avatar_url` | `text` | null when the provider gave none |
| `rating` | `integer not null default 1500` | |
| `games_played` | `integer not null default 0` | rated games; picks K |
| `created_at` | `timestamptz not null default now()` | |

### `accounts`

| Column | Type | Notes |
|---|---|---|
| `provider` | `text not null` | `CHECK (provider IN ('google', 'github'))` |
| `provider_user_id` | `text not null` | Google's `sub`; GitHub's numeric `id` as text. Never the email or login, which change. |
| `user_id` | `uuid not null` | FK `users(id) ON DELETE CASCADE`; index |

Primary key `(provider, provider_user_id)`.

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `token_hash` | `bytea` PK | SHA-256 of the cookie's token. A copy of the table opens no session. |
| `user_id` | `uuid not null` | FK `users(id) ON DELETE CASCADE`; index |
| `expires_at` | `timestamptz not null` | `created_at` + 30 days; fixed, not sliding |
| `created_at` | `timestamptz not null default now()` | |

### `games`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `white_id`, `black_id` | `uuid not null` | FK `users(id)`, no cascade (users are never deleted in P2) |
| `minutes` | `smallint not null` | the time control |
| `winner` | `char(1)` | `CHECK (winner IN ('w', 'b'))`; null is a draw |
| `reason` | `text not null` | `CHECK` against every `Result['reason']` |
| `moves` | `text[] not null` | coordinate form, as the protocol sends them |
| `white_rating`, `black_rating` | `integer not null` | each player's rating before the game |
| `white_delta`, `black_delta` | `smallint not null` | the change the game caused |
| `started_at`, `ended_at` | `timestamptz not null` | both seats taken; result reached |

Indexes `(white_id, ended_at DESC, id DESC)` and
`(black_id, ended_at DESC, id DESC)`. A `CHECK (white_id <> black_id)` keeps
a player from playing themself (two tabs of one account cannot take both
seats: see `rooms.ts` below).

### Migrations

- `drizzle-kit generate` writes them into `apps/server/drizzle/`. Each file is
  read before it is committed; anything `drizzle-kit` cannot express is added
  by hand in the same file.
- `index.ts` runs `migrate()` before `listen`, on one pooled client holding
  `pg_advisory_lock(<fixed key>)`, so two instances starting together apply
  it once. The lock is released in `finally`.
- The first migration only creates tables. Rolling back is
  `DROP TABLE games, sessions, accounts, users` and the
  `drizzle.__drizzle_migrations` row.

## Sign-in

### Routes (`auth.ts`)

| Route | Does |
|---|---|
| `GET /auth/:provider?returnTo=/path` | `provider` is `google` or `github`, else 404. Makes a `state` and (Google) a PKCE `code_verifier`, stores them with the checked `returnTo` in an `oauth` cookie, redirects to the provider. |
| `GET /auth/:provider/callback?code&state` | Reads and clears the `oauth` cookie. On a missing cookie, a provider mismatch, `state` ≠ cookie's state, an `error` parameter or a failed code exchange: redirect to `<web>/?login=failed`. Otherwise finds or creates the user, opens a session, sets `sid`, redirects to `<web><returnTo>`. |
| `POST /auth/logout` | Deletes the session, clears `sid`, disconnects the user's sockets. 204. |
| `GET /auth/providers` | `["google", "github"]`, or whichever are configured. The menu shows a button for each. |

`<web>` is the first `CLIENT_ORIGIN` entry, or `http://localhost:3000` when
none is set (development).

**`returnTo`** is kept only when it starts with `/` and not with `//` or
`/\`; otherwise it becomes `/`. The redirect is always `<web>` + that path,
so the server never sends a browser to another site.

**Find or create** runs in one transaction: look up `accounts` by
`(provider, provider_user_id)`; if absent, insert the `users` row and the
`accounts` row. Name and avatar come from the provider only on creation; a
later sign-in does not overwrite a name the player chose.

### Providers (`providers.ts`)

One interface, so tests pass a fake:

```ts
interface Provider {
  authorize(state: string, verifier: string): URL;
  identify(code: string, verifier: string): Promise<{ id: string; name: string; avatar: string | null }>;
}
```

- **Google**: scopes `openid profile`. `identify` validates the code with
  PKCE and reads `sub`, `name`, `picture` from the ID token (`decodeIdToken`;
  the token came straight from Google over TLS, so its signature is not
  checked again).
- **GitHub**: no scopes (public profile). Arctic's GitHub client takes no
  PKCE verifier, so `authorize` and `identify` ignore it; `state` still
  guards the callback. `identify` exchanges the code, then
  `GET https://api.github.com/user` with the access token: `id`,
  `name ?? login`, `avatar_url`.
- The name is trimmed and cut to 32 characters; an empty one becomes
  `Player`.

Redirect URIs are `<PUBLIC_URL>/auth/google/callback` and
`<PUBLIC_URL>/auth/github/callback`; the README says to register them.

### Cookies

| Cookie | Value | Attributes |
|---|---|---|
| `sid` | 32 random bytes, base64url | `HttpOnly; SameSite=Lax; Path=/; Max-Age=30 days`; `Secure` when `NODE_ENV=production` |
| `oauth` | JSON `{ provider, state, verifier, returnTo }` | `HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600`; `Secure` in production |

`Lax` lets the provider's top-level redirect to the callback carry `oauth`.
`Secure` is off in development because Safari drops `Secure` cookies on
`http://localhost`.

### Sessions (`sessions.ts`)

- `create(userId)` → token. Stores `sha256(token)`.
- `find(token)` → `{ id, name, avatar, rating } | null`, joining `users`,
  only where `expires_at > now()`.
- `remove(token)`.
- `sweep()` deletes expired rows. It runs every hour from `app.ts`, beside
  the room sweeper.

### Socket.IO

`io.use` reads `sid` from the handshake's `cookie` header and calls
`sessions.find`. No user: `next(new Error('unauthorized'))`. Otherwise
`socket.data.user = { id, name, rating }` and the socket joins the Socket.IO
room `user:<id>`, which `POST /auth/logout` empties with
`io.in('user:<id>').disconnectSockets(true)`.

The user is read once per connection. A session that expires mid-game keeps
its socket; the next reconnection is refused.

## HTTP (`http.ts`, `api.ts`)

`createHttpApp` gains, in order: `cors({ origin: origins, credentials: true })`,
`express.json({ limit: '1kb' })`, and an origin check: a `POST`, `PATCH` or
`DELETE` whose `Origin` header is not in `CLIENT_ORIGIN` gets 403. With
`SameSite=Lax` this closes cross-site request forgery. In development (no
`CLIENT_ORIGIN`) every origin passes, as Socket.IO already allows.

Routes behind a session (`401 { error: 'unauthorized' }` without one):

| Route | Answer |
|---|---|
| `GET /me` | `User`: `{ id, name, avatar, rating, gamesPlayed }` |
| `PATCH /me` `{ name }` | `name` must be a string, 1–32 characters after trimming, else `400 { error: 'bad-request' }`. Returns the new `User`. |
| `GET /me/games?before=<endedAt>,<id>` | `HistoryPage`: `{ games: HistoryEntry[], next: string \| null }`, 20 per page, newest first |

`HistoryEntry` is `{ id, color, opponent: { name, avatar }, minutes, result:
Result, ratingBefore, delta, endedAt }`, from the player's side. The query is
a `UNION ALL` of the `white_id` and `black_id` halves, each using its index,
ordered by `(ended_at, id) DESC`, keyset on `before`. A malformed `before`
is a 400.

Not added (left to Phase 5, "secure the API and WebSocket"): rate limiting,
structured logging, `trust proxy`. Nothing here reads `req.ip` or
`req.secure`.

## The game

### Protocol (`@chess/shared/protocol`)

```ts
create(payload: { color: Color; minutes: number }, ack): void;   // playerId gone
join(payload: { roomId: string }, ack): void;                     // playerId gone

interface Player { name: string; rating: number }
interface RoomState {
  // …unchanged fields…
  players: Record<Color, Player | null>; // null while a seat is empty
}
```

### `rooms.ts`

- A seat holds `{ id, name, rating }` instead of a `playerId` string.
  `create` and `join` take that object; matching a returning player compares
  `id`.
- `join` refuses the other seat to the user already sitting in one: the same
  account in a second tab takes back its own seat, as today, and never plays
  itself.
- The room records `startedAt` when the second seat is taken.
- **Timeout with insufficient material.** When a flag falls and the side
  still on the clock has only a king, or a king and one bishop or knight, the
  result is `{ reason: 'timeout-insufficient' }`, a draw. Otherwise it stays
  `{ reason: 'timeout', winner }`. (FIDE's rule is "no legal sequence can
  mate", which this approximates; a code comment says so in the shortcut
  form.)
- `record(roomId)` returns `{ white, black, minutes, moves, result,
  startedAt }` once a result exists, for saving.

### `game.ts`

- Seats come from `socket.data.user`, not the payload.
- `attachGame` takes `onGameOver(record)`. `broadcast` calls it the first
  time it sees a room with a result (a `Set` of reported room ids, cleared
  when the room is swept), whether the result came from a move, a
  resignation or a flag timer.
- `onGameOver` is not awaited by the game: the result reaches both players
  at once whatever the database does.

### Saving (`games.ts`, `elo.ts`)

`saveGame(record)` runs one transaction:

1. `SELECT id, rating, games_played FROM users WHERE id IN (white, black)
   ORDER BY id FOR UPDATE`. Locking in id order means two games ending at the
   same moment for overlapping players cannot deadlock.
2. Compute each side's change with `elo.ts`.
3. Insert the `games` row with the ratings before and the deltas.
4. `UPDATE users SET rating = rating + delta, games_played = games_played + 1`
   for both.

A failure is logged with the room id and the game is lost from history; the
players already saw the result. (P3's Redis could queue retries; not here.)

`elo.ts`:

```
expected(a, b) = 1 / (1 + 10 ** ((b - a) / 400))
k(gamesPlayed) = gamesPlayed < 30 ? 40 : 20
delta = Math.round(k * (score - expected))   // score: 1 win, 0.5 draw, 0 loss
```

Each player uses their own K, so the two deltas need not cancel.

Every game with a result is saved and rated, however short. A game is
neither saved nor rated when both players leave and the room is swept before
a result.

## The site

### `net/account.ts`

A zustand store, beside `useOnline`:

```ts
interface AccountState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: User | null;
  load(): Promise<void>;          // GET /me; 401 → signed-out
  rename(name: string): Promise<void>;
  logout(): Promise<void>;
  history(before?: string): Promise<HistoryPage>;
}
```

Every `fetch` uses `credentials: 'include'` and the same server URL as
`online.ts`. `load()` runs once when the menu mounts. `?login=failed` in the
URL is read once, shown, and removed with `history.replaceState`.

### `net/online.ts`

- `playerId()` and the `chess.player` key go. `io(url, { withCredentials: true })`.
- `connect_error` with message `unauthorized` sets `error: 'signed-out'` and
  status `off`; `useAccount` is set to `signed-out`.
- `OnlineError` gains `'signed-out'`.

### Menu

- **Online panel, signed out**: "Sign in with Google" and "Sign in with
  GitHub", plain links to `<server>/auth/<provider>?returnTo=<path and query>`,
  so an invite link `/?room=abc` comes back to the same room after signing in.
  The time and colour choices are hidden.
- **Online panel, signed in**: avatar, name and rating above today's
  controls, with "Profile" and "Sign out".
- **Profile panel**: a name field (1–32 characters, saved on submit, the
  server's error shown), then the history list: opponent, win/loss/draw and
  the reason (existing result strings, plus one for `timeout-insufficient`),
  `+12` / `−8`, time control, date. "Load more" fetches the next page.
  Keyboard and focus follow the existing `Modal` and panel conventions.

### HUD

Online, each side's label shows the player's name and rating from
`RoomState.players` instead of "White" / "Black".

### Strings

English and Vietnamese for: both sign-in buttons, sign out, profile, rename,
the name rule, history, load more, no games yet, sign-in failed, signed out,
`timeout-insufficient`.

## Configuration

`config.ts` reads, failing at startup with the variable's name:

| Variable | Rule |
|---|---|
| `DATABASE_URL` | required |
| `PUBLIC_URL` | the server's own origin; required in production, `http://localhost:<PORT>` otherwise |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | required together |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | required together |

At least one provider must be configured. A provider with no ids is left out
of the routes and the menu, so development works with only GitHub.

`createApp` gains `db` and `providers` options; `index.ts` builds them from
the config.

## Development

- `apps/server/docker-compose.yml`: `postgres:17-alpine`, port 5432, a named
  volume, and an init script that also creates a `chess_test` database.
- `apps/server/.env.example` lists every variable with development values
  and blank secrets. `.env` stays ignored.
- Scripts: `db:up` (`docker compose up -d`), `db:generate`
  (`drizzle-kit generate`).
- The README gains: the custom-domain requirement, registering the two OAuth
  apps and their callback URLs, and the new variables.

## Error handling

| Situation | Behaviour |
|---|---|
| Database unreachable at startup | `migrate` throws; `index.ts` prints it and exits 1; the host restarts the server. |
| Database fails during a request | `onError` answers 500 `{ error: 'internal' }`. |
| Database fails during a socket handshake | `next(new Error('unavailable'))`; the client shows its existing "could not connect" message. |
| Database fails while saving a game | Logged; the game has already ended for both players. |
| OAuth refused, `state` mismatch, expired `oauth` cookie | Redirect to `<web>/?login=failed`. |
| Unknown provider in the path | 404 `{ error: 'not-found' }`. |
| `returnTo` pointing elsewhere | Replaced by `/`. |
| Socket without a valid session | Refused with `unauthorized`; the menu asks to sign in. |
| Sign-out with an open game | Sockets disconnected; the seat waits as for any dropped player. |
| Same account in two tabs | The newer tab takes the seat (today's rule, keyed by user id). |
| Bad `PATCH /me` body | 400; the name field shows the rule. |

## Testing

Server tests that touch sessions, sockets or games need Postgres:
`TEST_DATABASE_URL` (the compose file's `chess_test`). A missing variable
fails those tests with a message naming it; it does not skip them. The server
runs its test files one at a time (`fileParallelism: false` in a new
`apps/server/vitest.config.ts`), migrates once in a global setup, and
truncates the four tables before each test.

| What | Where |
|---|---|
| Elo: both K values, a draw, an upset | `elo.test.ts` (no database) |
| `returnTo` rules | `auth.test.ts` (no database) |
| Timeout with insufficient material is a draw; a lone king still loses on time; `record`; one account cannot take both seats | `rooms.test.ts` (no database) |
| New variables and their errors | `config.test.ts` (no database) |
| Sign-in with a fake provider: cookie set, `/me` answers, second sign-in reuses the user and keeps a changed name, bad `state` redirects to `login=failed` | `auth.test.ts` |
| `PATCH /me` rules; `/me/games` pages and keyset; origin check refuses a foreign `POST` | `api.test.ts` |
| The wire (existing cases, now with signed-in clients); a socket without a cookie is refused; sign-out disconnects; a fool's mate saves one `games` row and moves both ratings; a flag with a lone-king winner saves a draw | `app.test.ts` |
| Two games ending together for the same player both save | `games.test.ts` |
| `useAccount`: load, 401, rename error, logout, with `fetch` stubbed | `apps/web/src/net/account.test.ts` |
| The client against the real server, signed in | `apps/web/src/net/online.test.ts` (needs `TEST_DATABASE_URL` too) |

A test helper signs a user in by calling `sessions.create` and returns the
`cookie` header, so socket tests do not go through OAuth.

By hand, in the browser: sign in with real Google and GitHub apps on
`localhost`, play a game between two accounts in two browsers, see the
history and ratings, rename, sign out mid-game, open an invite link while
signed out.

## Done when

- A signed-out player cannot create or join a room and is offered sign-in;
  an invite link survives the sign-in.
- Signing in with Google or GitHub creates one user per provider account and
  reuses it after.
- A finished online game appears in both players' history with the right
  result and rating changes; the HUD showed both names and ratings.
- The name can be changed and stays changed across sign-ins.
- `npm test`, `npm run lint`, `npm run typecheck` pass with Postgres up;
  the Docker image builds and starts against a database.

## To verify during implementation

- Arctic's Google `validateAuthorizationCode(code, verifier)` and
  `decodeIdToken` names in 3.7.0, and GitHub's `validateAuthorizationCode(code)`.
- Socket.IO with `withCredentials: true` sends the cookie on the WebSocket
  upgrade from `localhost:3000` to `localhost:3001` in Chrome and Safari.
- The Docker image still runs `node src/index.ts` with `drizzle/` copied in.
- `drizzle-kit` writes the `reason` `CHECK` from a list built from the
  `Result` type, or the list is written by hand.

## Out of scope

Replaying a saved game, linking accounts, deleting an account, a
leaderboard, aborting very short games, Glicko-2, rate limiting and
structured logging (Phase 5), CI. Redis, several instances and matchmaking
(P3).
