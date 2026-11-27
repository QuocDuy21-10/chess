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
