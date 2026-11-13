This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Online play

Two players on two devices need the game server as well as the site, and an account each: online play
signs in with Google or GitHub. The server keeps accounts, sessions, match history and ratings in
PostgreSQL. The repository is an npm workspace: the site is `apps/web`, the server is `apps/server`, and
the code both ends share is `packages/shared`.

1. Register an OAuth app with GitHub (Settings → Developer settings → OAuth Apps) with the callback URL
   `http://localhost:3001/auth/github/callback`, and/or a Google OAuth client (Google Cloud console →
   Credentials, type "Web application") with `http://localhost:3001/auth/google/callback`. One is enough.
2. Copy `apps/server/.env.example` to `apps/server/.env` and fill in that app's id and secret.
3. Install, start Postgres (Docker), and run both sides from the root:

```bash
npm install
npm run db:up -w @chess/server   # Postgres 17 on 127.0.0.1:5432, with a chess_test database for the tests
npm run dev                      # the site, on port 3000
npm run server                   # the game server, on port 3001; applies new migrations as it starts
```

From the root, `npm test`, `npm run lint` and `npm run typecheck` run in every workspace. The tests need
Postgres up and `TEST_DATABASE_URL` (in `.env`); they empty the tables of that database.

`npm run e2e` runs the browser tests (Postgres up, as for `npm test`, but not at the same time: both empty
`chess_test`). It needs a production build of the site first:
`NEXT_PUBLIC_SERVER_URL=http://localhost:3001 npm run build -w @chess/web`. Pick one browser with
`npm run e2e -- --project=webkit`; `npm run report -w @chess/e2e` opens the last report.

After changing `apps/server/src/schema.ts`, run `npm run db:generate -w @chess/server`, read the new file
in `apps/server/drizzle/`, and commit it with the change.

| Variable | Read by | Meaning |
|---|---|---|
| `PORT` | server | Port to listen on. Default 3001. |
| `CLIENT_ORIGIN` | server | The site's origin, such as `https://chess.example.com`; separate several with commas. Unset: any origin, except in production, where the server refuses to start. |
| `NODE_ENV` | server | `production` when deployed. The Docker image sets it. |
| `DATABASE_URL` | server | Required. `postgres://user:password@host:5432/chess`. |
| `PUBLIC_URL` | server | The server's own origin, for the OAuth callback URLs. Required in production; unset: `http://localhost:<PORT>`. |
| `TRUST_PROXY` | server | How many proxies stand in front of the server, so rate limits count the client's own address. Default 0; `deploy/compose.yml` sets 1 (Caddy). More than the real number lets a client choose its own address. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | server | A GitHub OAuth app. Set both or neither. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server | A Google OAuth client. Set both or neither; at least one provider is required. |
| `TEST_DATABASE_URL` | tests | The database the tests use and empty. |
| `NEXT_PUBLIC_SERVER_URL` | site, at build time | The server's address. Unset: port 3001 on the page's own host. |
| `SENTRY_DSN` | server | Optional. A Sentry project's DSN; unset or empty: no error reports. |
| `NEXT_PUBLIC_SENTRY_DSN` | site, at build time | Optional. A Sentry project's DSN for the browser. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | site build | Optional. Upload source maps, for readable stack traces. |

To try both sides on one computer, sign the second player in with another account in a private window or
another browser. Two tabs of one account are the same player, and the newer tab takes the seat.

A phone on the same network also needs the computer's address in `allowedDevOrigins` in
`apps/web/next.config.ts`, or the development site refuses it.

### Deploying

The server ships as a Docker image, built from the repository root:

```bash
docker build -f apps/server/Dockerfile -t chess-server .
docker run -p 3001:3001 --env-file apps/server/.env -e CLIENT_ORIGIN=http://localhost:3000 \
  -e PUBLIC_URL=http://localhost:3001 -e DATABASE_URL=postgres://chess:chess@host.docker.internal:5432/chess \
  chess-server
```

**The site and the server need one domain of your own**, such as `chess.example.com` for the site and
`api.chess.example.com` for the server. The sign-in cookie is the server's and is sent with the site's
requests only when both are the same site; `*.vercel.app` and `*.onrender.com` are each a public suffix,
so a site on one and a server on the other cannot keep anyone signed in. Register the production callback
URLs (`https://api.chess.example.com/auth/<provider>/callback`) with each OAuth app.

Any managed Postgres 13 or later will do (Neon, Supabase, the host's own). The server applies pending
migrations when it starts; two instances starting together apply them once.

Any host that runs a container will do: Render, Koyeb, Fly or a VPS. Hosts may set `PORT` themselves.
Point the host's health check at `GET /health`, which answers `{"status":"ok"}`. On `SIGTERM` the server
closes every connection, finishes saving any game that just ended, and exits. Rooms are kept in memory,
so a restart or a new deploy ends every game in progress. Without Docker, run `npm start -w @chess/server` on Node 22.18 or later.

On Vercel, set the project's Root Directory to `apps/web`, and `NEXT_PUBLIC_SERVER_URL` to the server's
public address.

The site caches `/engine/*` for a year (the files' names carry Stockfish's version: a new engine needs new names,
which `src/engine/files.test.ts` enforces) and `/audio/*` for a week.

The project's own setup, a VPS deployed by GitHub Actions, is described below.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. `check`: lint, typecheck, the tests against a Postgres service, the site's build and its size against
   `apps/web/bundle-budget.json` (`npm run size -w @chess/web` after a build; raise a budget only on purpose, in the
   same pull request), `shellcheck` on `deploy/*.sh`, and `docker compose config` on `deploy/compose.yml`.
2. `e2e`, one job per browser (Chromium, Firefox, WebKit) beside `check`: plays the production build against the
   real server and Postgres with Playwright: two players to checkmate, a move against the computer, the language
   setting, and an online game between two browsers. Any console error, CSP violation or missing WebGL fails it.
3. `image`: builds the server's image. On `main` it is pushed to `ghcr.io/quocduy21-10/chess-server`, tagged
   with the commit's SHA and `latest`.
4. `deploy`: on `main` only, ships that image to the VPS (below).

A red `check` or `e2e` stops `image` and `deploy`. The site still deploys through Vercel's Git integration; in the Vercel
project, Settings → Deployment Checks, add the GitHub check `check` so a production deployment waits for it
(see https://vercel.com/docs/deployment-checks).

## Production (VPS)

The server runs on one VPS with Docker Compose: the server, Postgres 17 and Caddy, which gets the HTTPS
certificate itself. `deploy/` holds the stack, and every deploy copies it to `/opt/chess`. The images are built
by GitHub Actions, never on the VPS. Memory limits (384 MB, 384 MB, 128 MB) fit a VPS with 1.5 GB of RAM.

### One-time setup

On the VPS, as root (Ubuntu or Debian):

1. Point a DNS `A` record for the server's name, such as `api.chess.example.com`, at the VPS. The site needs a
   name on the same domain (see "Deploying").
2. Allow only SSH, HTTP and HTTPS:
   `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`
3. Install Docker: `curl -fsSL https://get.docker.com | sh`
4. Create the deploy user and its directory:
   ```bash
   adduser --disabled-password --gecos '' deploy
   usermod -aG docker deploy
   install -d -o deploy -g deploy /opt/chess
   install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
   ```

On your own computer, make the key GitHub Actions will use, and install its public half:

```bash
ssh-keygen -t ed25519 -N '' -C chess-deploy -f chess-deploy
ssh root@<vps> 'cat >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys' < chess-deploy.pub
ssh-keyscan -t ed25519 <vps>
```

Compare the `ssh-keyscan` line with the VPS's own key (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the
VPS) before trusting it.

On the VPS, as `deploy`:

5. Copy `deploy/env.example` from this repository to `/opt/chess/.env`, fill it in, and `chmod 600 /opt/chess/.env`.
6. Set up backups (next part). The first deploy needs nothing in the database; every later one backs up first.

In GitHub, Settings → Environments → New environment `production`, add these secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | The VPS's IP address or name |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | The contents of `chess-deploy` (the private key) |
| `VPS_KNOWN_HOSTS` | The `ssh-keyscan` line you checked |

Register `https://<API_DOMAIN>/auth/<provider>/callback` with each OAuth app. Then push to `main`, or run the
workflow by hand: the first deploy starts Postgres, then the server, which creates the tables.

Until the secrets exist, the `deploy` job fails on every push to `main`; `check` and `image` are unaffected.

### Every deploy

`deploy.sh <sha>` backs up the database, pulls the new image, starts it, waits until `/health` answers, and
removes old images. If the new server never turns healthy, the job fails.

**Rollback:** Actions → CI → Run workflow, on `main`, with the full SHA of an earlier commit (its image is in
GHCR). The scripts and compose file come from the current `main`; only the image is the old one. On the VPS,
`/opt/chess/deploy.sh <sha>` does the same after `docker login ghcr.io` (needed only if the package is private).
Rolling back past a migration that removed or renamed something can leave the old code facing a newer schema:
restore the backup taken before that deploy too (see "Restore").

Useful commands in `/opt/chess`:

```bash
docker compose ps
docker compose logs -f server | jq    # one JSON line per event
docker compose logs caddy             # HTTP access log
```

### Backups

`backup.sh` dumps the database to one plain SQL file, `backups/chess.sql`, and pushes it to a private Git
repository: the Git history keeps every night. The `sessions` table is saved empty: after a restore, everyone
signs in again. It runs every night from cron and before every deploy.

The dump holds players' display names, avatar URLs and Google/GitHub account ids. **Keep the backup repository
private.** GitHub refuses files over 100 MB, far beyond this game's size for a long time.

One-time setup on the VPS, as `deploy`:

1. Create an empty private repository on GitHub, such as `chess-backups`.
2. Make a key that may write to that repository only, and add its public half there (repository → Settings →
   Deploy keys → Allow write access):
   ```bash
   ssh-keygen -t ed25519 -N '' -C chess-backup -f ~/.ssh/chess_backup
   cat ~/.ssh/chess_backup.pub
   ```
3. Clone it into place:
   ```bash
   ssh-keyscan github.com >> ~/.ssh/known_hosts
   GIT_SSH_COMMAND='ssh -i ~/.ssh/chess_backup -o IdentitiesOnly=yes' \
     git clone git@github.com:<you>/chess-backups.git /opt/chess/backups
   git -C /opt/chess/backups config core.sshCommand 'ssh -i ~/.ssh/chess_backup -o IdentitiesOnly=yes'
   ```
4. `crontab -e`, and add:
   ```
   0 3 * * * /opt/chess/backup.sh >> /opt/chess/backup.log 2>&1
   ```

### Restore

```bash
git -C /opt/chess/backups log --oneline   # the backups
/opt/chess/restore.sh                     # the latest
/opt/chess/restore.sh <commit>            # an earlier one
```

`restore.sh` saves the current database to `/opt/chess/before-restore.sql`, stops the server, restores in one
transaction (a failure changes nothing), and starts the server, which applies any newer migrations. To undo a
restore:

```bash
cd /opt/chess && docker compose stop server
docker compose exec -T postgres psql -U chess -d chess -v ON_ERROR_STOP=1 --single-transaction < before-restore.sql
docker compose start server
```

## Monitoring

- **Logs:** the server writes one JSON line per event (`Listening`, `Game over`, errors with their stack);
  Caddy writes the HTTP access log. Docker keeps 30 MB per service.
- **Errors:** create two projects on sentry.io, Node.js and Next.js. Put the first one's DSN in `SENTRY_DSN` in
  `/opt/chess/.env` and run `docker compose up -d` there. On Vercel, set `NEXT_PUBLIC_SENTRY_DSN`, and for readable
  stack traces `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`.
- **Uptime:** on a free plan of Better Stack or UptimeRobot, create an HTTP monitor on
  `https://<API_DOMAIN>/health` every minute, and a heartbeat monitor that expects a ping at least every 25 hours;
  put its URL in `BACKUP_HEARTBEAT_URL`. A missing ping means the nightly backup did not finish.
