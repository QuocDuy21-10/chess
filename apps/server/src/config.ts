import type { ProviderName } from './providers.ts';

/** The server's settings, read from the environment. */
export interface Config {
  port: number;
  origins: string[] | true; // the sites allowed to connect; true: any site
  databaseUrl: string;
  production: boolean;
  publicUrl: string; // this server's own origin, for the OAuth callback URLs
  webUrl: string; // where a sign-in sends the browser back to
  oauth: Partial<Record<ProviderName, OAuthApp>>; // only the providers that are configured
  sentryDsn?: string; // unset: no error reports
}

export interface OAuthApp {
  clientId: string;
  clientSecret: string;
}

const DEFAULT_PORT = 3001;
const DEV_WEB_URL = 'http://localhost:3000';

/**
 * Reads PORT, CLIENT_ORIGIN, DATABASE_URL, PUBLIC_URL, GOOGLE_CLIENT_ID and _SECRET, GITHUB_CLIENT_ID and _SECRET, SENTRY_DSN,
 * and NODE_ENV. Throws, naming the variable, when one is wrong, so a misconfigured server stops at startup
 * instead of refusing every player later.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const port = readPort(env.PORT);
  const origins = readOrigins(env.CLIENT_ORIGIN, production);
  return {
    port,
    origins,
    databaseUrl: readDatabaseUrl(env.DATABASE_URL),
    production,
    publicUrl: readPublicUrl(env.PUBLIC_URL, production, port),
    webUrl: origins === true ? DEV_WEB_URL : origins[0],
    oauth: readOAuth(env),
    sentryDsn: env.SENTRY_DSN || undefined,
  };
}

function readPublicUrl(value: string | undefined, production: boolean, port: number): string {
  if (!value) {
    if (production) throw new Error("PUBLIC_URL must name this server's origin when NODE_ENV is production");
    return `http://localhost:${port}`;
  }
  if (!isOrigin(value)) throw new Error(`PUBLIC_URL "${value}" is not an origin such as https://api.chess.example.com`);
  return value;
}

function readOAuth(env: NodeJS.ProcessEnv): Config['oauth'] {
  const oauth: Config['oauth'] = {};
  for (const [name, prefix] of [['google', 'GOOGLE'], ['github', 'GITHUB']] as const) {
    const clientId = env[`${prefix}_CLIENT_ID`];
    const clientSecret = env[`${prefix}_CLIENT_SECRET`];
    if (!clientId && !clientSecret) continue;
    if (!clientId || !clientSecret) {
      throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be set together`);
    }
    oauth[name] = { clientId, clientSecret };
  }
  if (Object.keys(oauth).length === 0) {
    throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or both');
  }
  return oauth;
}

function readDatabaseUrl(value: string | undefined): string {
  if (!value || !/^postgres(ql)?:\/\//.test(value)) {
    throw new Error('DATABASE_URL must be a Postgres URL such as postgres://user:password@host:5432/chess');
  }
  return value;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, not "${value}"`);
  }
  return port;
}

function readOrigins(value: string | undefined, production: boolean): string[] | true {
  const origins = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    if (production) throw new Error("CLIENT_ORIGIN must name the site's origin when NODE_ENV is production");
    return true; // development: any page may connect
  }
  const bad = origins.find((origin) => !isOrigin(origin));
  if (bad) throw new Error(`CLIENT_ORIGIN entry "${bad}" is not an origin such as https://chess.example.com`);
  return origins;
}

/** True for a bare origin. A trailing slash or a path would never match the browser's Origin header. */
function isOrigin(text: string): boolean {
  try {
    return new URL(text).origin === text;
  } catch {
    return false;
  }
}
