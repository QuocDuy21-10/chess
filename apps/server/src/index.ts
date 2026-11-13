import { createApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';
import { connect, migrate } from './db.ts';
import { log } from './log.ts';
import { createProviders } from './providers.ts';

// The only file with side effects on the process: environment, port, signals. See config.ts for the variables.

const CLOSE_MS = 10_000; // how long closing may take before the process ends anyway

/** Logs why the server cannot run and ends the process. */
function fail(error: unknown, msg = 'Cannot start'): never {
  log.error(msg, error);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  fail(error);
}

const { pool, db } = connect(config.databaseUrl);
// An unreachable database stops the server here; the host restarts it. The logged error carries ECONNREFUSED's code.
await migrate(pool).catch((error) => fail(error, 'Cannot migrate the database'));

const app = createApp({
  db,
  providers: createProviders(config.oauth, config.publicUrl),
  origins: config.origins,
  webUrl: config.webUrl,
  secure: config.production,
});
const port = await app.listen(config.port).catch((error) => fail(error));
log.info('Listening', { port });

/** Hosts send SIGTERM before they stop or replace the server: close every connection, then exit. */
function shutdown() {
  log.info('Shutting down');
  setTimeout(() => process.exit(1), CLOSE_MS).unref();
  void app
    .close()
    .then(() => pool.end())
    .then(() => process.exit(0));
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
