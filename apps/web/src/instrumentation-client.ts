import * as Sentry from '@sentry/nextjs';

// Runs in the browser before the game starts. Errors only (WebGL and browser quirks on players' machines):
// no tracing, no session replay. Without NEXT_PUBLIC_SENTRY_DSN, in development and tests, Sentry stays off.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) Sentry.init({ dsn });
