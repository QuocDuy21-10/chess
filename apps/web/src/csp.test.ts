import { expect, test } from 'vitest';
import { contentSecurityPolicy } from './csp';

const DSN = 'https://KEY@o1.ingest.us.sentry.io/2';

/** The policy as a map from directive to its sources. */
const directives = (policy: string) =>
  new Map(
    policy.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ');
      return [name, sources.join(' ')];
    }),
  );

test('the policy for a server on https, with Sentry', () => {
  expect(contentSecurityPolicy({ serverUrl: 'https://api.chess.example.com', sentryDsn: DSN }).split('; ')).toEqual([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com",
    "media-src 'self'",
    "font-src 'self'",
    "worker-src 'self'",
    "connect-src 'self' https://api.chess.example.com wss://api.chess.example.com https://o1.ingest.us.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
    'report-uri https://o1.ingest.us.sentry.io/api/2/security/?sentry_key=KEY',
  ]);
});

test('without a server address it allows the local development server, and leaves http alone', () => {
  const policy = directives(contentSecurityPolicy({}));
  expect(policy.get('connect-src')).toBe("'self' http://localhost:3001 ws://localhost:3001");
  expect(policy.has('upgrade-insecure-requests')).toBe(false);
  expect(policy.has('report-uri')).toBe(false);
});

test('a server on http is reached over ws, and a path after its origin is dropped', () => {
  const policy = directives(contentSecurityPolicy({ serverUrl: 'http://192.168.1.5:3001/' }));
  expect(policy.get('connect-src')).toBe("'self' http://192.168.1.5:3001 ws://192.168.1.5:3001");
});

test('a DSN that does not parse adds nothing', () => {
  for (const sentryDsn of ['', 'not a url', 'https://o1.ingest.sentry.io/2', 'https://KEY@o1.ingest.sentry.io/']) {
    const policy = directives(contentSecurityPolicy({ serverUrl: 'https://api.chess.example.com', sentryDsn }));
    expect(policy.get('connect-src'), sentryDsn).toBe("'self' https://api.chess.example.com wss://api.chess.example.com");
    expect(policy.has('report-uri'), sentryDsn).toBe(false);
  }
});
