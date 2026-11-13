# The game server. Build it from the repository root, which holds the lockfile and packages/shared:
#   docker build -f apps/server/Dockerfile -t chess-server .
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Manifests first: this layer is reused until a dependency changes. npm ci wants every workspace's
# package.json to match the lockfile, so the web app's comes too, but only the server's tree is installed.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @chess/server --omit=dev

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/

USER node
EXPOSE 3001
# Node strips the TypeScript types itself; there is no build step.
CMD ["node", "apps/server/src/index.ts"]
