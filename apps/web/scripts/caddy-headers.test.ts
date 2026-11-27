import { expect, test } from 'vitest';
import { contentSecurityPolicy } from '../src/csp';
import { caddyHeaders } from './caddy-headers';

const build = { serverUrl: 'https://chess.example.com', sentryDsn: 'https://KEY@o1.ingest.us.sentry.io/2' };
const lines = caddyHeaders(build).split('\n');

test('static files get the security headers, with the CSP of csp.ts', () => {
  expect(lines).toContain(`\tContent-Security-Policy "${contentSecurityPolicy(build)}"`);
  expect(lines).toContain('\tX-Content-Type-Options "nosniff"');
  expect(lines).toContain('\tReferrer-Policy "strict-origin-when-cross-origin"');
  expect(lines).toContain('\tPermissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"');
  expect(lines).toContain('\tStrict-Transport-Security "max-age=63072000"');
});

test('versioned files are cached for a year, sounds for a week, and the rest is revalidated', () => {
  for (const path of ['/_next/static/*', '/engine/*', '/models/*']) {
    expect(lines).toContain(`header ${path} Cache-Control "public, max-age=31536000, immutable"`);
  }
  expect(lines).toContain('header /audio/* Cache-Control "public, max-age=604800, stale-while-revalidate=86400"');
  expect(lines).toContain('@revalidated not path /_next/static/* /engine/* /models/* /audio/*');
  expect(lines).toContain('header @revalidated Cache-Control "no-cache"');
});

test('no value closes its quotes early', () => {
  for (const line of lines.filter((line) => line.includes('"'))) expect(line.split('"'), line).toHaveLength(3);
});
