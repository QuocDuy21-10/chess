/** The server's settings, read from the environment. */
export interface Config {
  port: number;
  origins: string[] | true; // the sites allowed to connect; true: any site
}

const DEFAULT_PORT = 3001;

/**
 * Reads PORT, CLIENT_ORIGIN and NODE_ENV. Throws, naming the variable, when one is wrong, so a
 * misconfigured server stops at startup instead of refusing every player later.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: readPort(env.PORT),
    origins: readOrigins(env.CLIENT_ORIGIN, env.NODE_ENV === 'production'),
  };
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
