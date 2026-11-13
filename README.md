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

Two players on two devices need the game server as well as the site. The repository is an npm
workspace: the site is `apps/web`, the server is `apps/server`, and the code both ends share is
`packages/shared`. Install once, from the root:

```bash
npm install
npm run dev      # the site, on port 3000
npm run server   # the game server, on port 3001
```

From the root, `npm test`, `npm run lint` and `npm run typecheck` run in every workspace.

| Variable | Read by | Meaning |
|---|---|---|
| `PORT` | server | Port to listen on. Default 3001. |
| `CLIENT_ORIGIN` | server | The site's origin, such as `https://chess.example.com`; separate several with commas. Unset: any origin, except in production, where the server refuses to start. |
| `NODE_ENV` | server | `production` when deployed. The Docker image sets it. |
| `NEXT_PUBLIC_SERVER_URL` | site, at build time | The server's address. Unset: port 3001 on the page's own host. |

To try both sides on one computer, open the second player at `http://b.localhost:3000`. That is a
different origin, so the browser keeps a different player id for it. Two tabs on the same origin are the
same player, and the newer tab takes the seat.

A phone on the same network also needs the computer's address in `allowedDevOrigins` in
`apps/web/next.config.ts`, or the development site refuses it.

### Deploying

The server ships as a Docker image, built from the repository root:

```bash
docker build -f apps/server/Dockerfile -t chess-server .
docker run -p 3001:3001 -e CLIENT_ORIGIN=http://localhost:3000 chess-server
```

Any host that runs a container will do: Render, Koyeb, Fly or a VPS. Hosts may set `PORT` themselves.
Point the host's health check at `GET /health`, which answers `{"status":"ok"}`. On `SIGTERM` the server
closes every connection and exits. Rooms are kept in memory, so a restart or a new deploy ends every
game. Without Docker, run `npm start -w @chess/server` on Node 22.18 or later.

On Vercel, set the project's Root Directory to `apps/web`, and `NEXT_PUBLIC_SERVER_URL` to the server's
public address.
