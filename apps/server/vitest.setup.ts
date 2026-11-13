import { connect, migrate } from './src/db.ts';
import { testDbUrl } from './src/test-db.ts';

// Global setup: brings the test database up to the latest migration once, before any test file runs.
export default async function setup() {
  const { pool } = connect(testDbUrl());
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
