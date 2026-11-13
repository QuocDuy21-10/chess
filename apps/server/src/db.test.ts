import { afterAll, beforeEach, expect, test } from 'vitest';
import { migrate } from './db.ts';
import { connectTest, truncate } from './test-db.ts';

const { pool } = connectTest();
beforeEach(() => truncate(pool));
afterAll(() => pool.end());

test('migrating again, twice at once, changes nothing', async () => {
  await Promise.all([migrate(pool), migrate(pool)]);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  expect(rows[0].n).toBe(1);
});

test('the database refuses a blank name, an unknown provider and a game against oneself', async () => {
  await expect(pool.query("INSERT INTO users (display_name) VALUES ('   ')")).rejects.toThrow(
    'users_display_name_length',
  );
  const { rows } = await pool.query("INSERT INTO users (display_name) VALUES ('Ann') RETURNING id, rating");
  expect(rows[0].rating).toBe(1500);
  const ann = rows[0].id;
  await expect(
    pool.query("INSERT INTO accounts VALUES ('facebook', '1', $1)", [ann]),
  ).rejects.toThrow('accounts_provider');
  await expect(
    pool.query(
      `INSERT INTO games (white_id, black_id, minutes, reason, moves, white_rating, black_rating,
         white_delta, black_delta, started_at, ended_at)
       VALUES ($1, $1, 5, 'resign', '{}', 1500, 1500, 0, 0, now(), now())`,
      [ann],
    ),
  ).rejects.toThrow('games_two_players');
});
