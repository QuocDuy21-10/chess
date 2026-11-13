import { mkdirSync, writeFileSync } from 'node:fs';
import { connectTest, truncate } from '@chess/server/test-db';
import { migrate } from '../apps/server/src/db.ts';
import { createSessions } from '../apps/server/src/sessions.ts';

// Run by Node before Playwright: an empty test database, two players with sessions, and a storage state each,
// so the browsers are signed in without OAuth.

const { pool, db } = connectTest(); // throws, naming TEST_DATABASE_URL, when it is not set
try {
  await migrate(pool); // CI starts from an empty database
  await truncate(pool);
  const sessions = createSessions(db);
  mkdirSync('.auth', { recursive: true });
  for (const [file, name] of [
    ['ann', 'E2E Ann'],
    ['bob', 'E2E Bob'],
  ]) {
    const { rows } = await pool.query('INSERT INTO users (display_name) VALUES ($1) RETURNING id', [name]);
    const token = await sessions.create(rows[0].id);
    const cookie = { name: 'sid', value: token, domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' };
    writeFileSync(`.auth/${file}.json`, JSON.stringify({ cookies: [cookie], origins: [] }));
  }
} finally {
  await pool.end();
}
