import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as runMigrations } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.ts';

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));
const MIGRATION_LOCK = 7_421_001; // any fixed number; only this server takes this advisory lock

export type Db = NodePgDatabase<typeof schema>;

/** A connection pool and the Drizzle client over it. Nothing connects until the first query. */
export function connect(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  // An idle connection the database drops (a restart, a failover) must not end the process.
  pool.on('error', (error) => console.error('Postgres connection lost:', error.message));
  return { pool, db: drizzle({ client: pool, schema }) };
}

/** Applies the migrations in drizzle/ that have not run. Two servers starting together apply them once. */
export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    try {
      await runMigrations(drizzle({ client }), { migrationsFolder: MIGRATIONS });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    }
  } finally {
    client.release();
  }
}
