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
