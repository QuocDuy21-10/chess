import { createApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';

// The only file with side effects on the process: environment, port, signals. See config.ts for the variables.

const CLOSE_MS = 10_000; // how long closing may take before the process ends anyway

/** Prints why the server cannot run and ends the process. */
function fail(error: unknown): never {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  fail(error);
}

const app = createApp({ origins: config.origins });
const port = await app.listen(config.port).catch(fail);
console.log(`Game server listening on port ${port}`);

/** Hosts send SIGTERM before they stop or replace the server: close every connection, then exit. */
function shutdown() {
  setTimeout(() => process.exit(1), CLOSE_MS).unref();
  void app.close().then(() => process.exit(0));
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
