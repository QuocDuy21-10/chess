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
