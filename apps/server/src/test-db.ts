import { connect } from './db.ts';

// For tests only: the database named by TEST_DATABASE_URL, migrated once by vitest.setup.ts.

export function testDbUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Start Postgres with `npm run db:up -w @chess/server` and copy apps/server/.env.example to apps/server/.env.',
    );
  }
  return url;
}

/** A pool on the test database. Close it with `pool.end()` in `afterAll`. */
export const connectTest = () => connect(testDbUrl());

/** Empties every table, so each test starts from nothing. */
export async function truncate(pool: ReturnType<typeof connect>['pool']): Promise<void> {
  await pool.query('TRUNCATE games, sessions, accounts, users');
}
