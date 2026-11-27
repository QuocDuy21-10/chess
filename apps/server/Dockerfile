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
