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

After changing `apps/server/src/schema.ts`, run `npm run db:generate -w @chess/server`, read the new file
in `apps/server/drizzle/`, and commit it with the change.

| Variable | Read by | Meaning |
|---|---|---|
| `PORT` | server | Port to listen on. Default 3001. |
| `CLIENT_ORIGIN` | server | The site's origin, such as `https://chess.example.com`; separate several with commas. Unset: any origin, except in production, where the server refuses to start. |
| `NODE_ENV` | server | `production` when deployed. The Docker image sets it. |
| `DATABASE_URL` | server | Required. `postgres://user:password@host:5432/chess`. |
| `PUBLIC_URL` | server | The server's own origin, for the OAuth callback URLs. Required in production; unset: `http://localhost:<PORT>`. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | server | A GitHub OAuth app. Set both or neither. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server | A Google OAuth client. Set both or neither; at least one provider is required. |
| `TEST_DATABASE_URL` | tests | The database the tests use and empty. |
| `NEXT_PUBLIC_SERVER_URL` | site, at build time | The server's address. Unset: port 3001 on the page's own host. |

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
