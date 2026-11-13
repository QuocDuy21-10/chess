import { afterAll, beforeEach, expect, test } from 'vitest';
import { saveGame } from './games.ts';
import type { GameRecord, SeatPlayer } from './rooms.ts';
import { users } from './schema.ts';
import { connectTest, truncate } from './test-db.ts';

const { pool, db } = connectTest();
let ann: SeatPlayer;
let bob: SeatPlayer;
let cy: SeatPlayer;

beforeEach(async () => {
  await truncate(pool);
  const rows = await db
    .insert(users)
    .values([{ displayName: 'Ann' }, { displayName: 'Bob', rating: 1700, gamesPlayed: 40 }, { displayName: 'Cy' }])
    .returning({ id: users.id, name: users.displayName, rating: users.rating });
  [ann, bob, cy] = rows;
});
afterAll(() => pool.end());

const game = (white: SeatPlayer, black: SeatPlayer, result: GameRecord['result']): GameRecord => ({
  roomId: 'abcdefgh',
  white,
  black,
  minutes: 5,
  moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
  result,
  startedAt: Date.UTC(2026, 10, 13, 9, 0, 0, 123),
  endedAt: Date.UTC(2026, 10, 13, 9, 1, 0, 456),
});
const ratings = async () =>
  Object.fromEntries(
    (await pool.query('SELECT display_name, rating, games_played FROM users')).rows.map((r) => [
      r.display_name,
      [r.rating, r.games_played],
    ]),
  );

test('a win is saved with the ratings before it, and moves both players by their own K', async () => {
  await saveGame(db, game(ann, bob, { reason: 'checkmate', winner: 'w' }));
  const { rows } = await pool.query('SELECT * FROM games');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    white_id: ann.id,
    black_id: bob.id,
    minutes: 5,
    winner: 'w',
    reason: 'checkmate',
    moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
    white_rating: 1500,
    black_rating: 1700,
    white_delta: 30, // K 40: 40 × (1 − 0.24)
    black_delta: -15, // K 20: 20 × (0 − 0.76)
  });
  expect(rows[0].ended_at.toISOString()).toBe('2026-11-13T09:01:00.456Z');
  expect(await ratings()).toMatchObject({ Ann: [1530, 1], Bob: [1685, 41] });
});

test('a draw, including a flag against a lone king, has no winner', async () => {
  await saveGame(db, game(ann, cy, { reason: 'timeout-insufficient' }));
  const { rows } = await pool.query('SELECT winner, reason, white_delta, black_delta FROM games');
  expect(rows[0]).toEqual({ winner: null, reason: 'timeout-insufficient', white_delta: 0, black_delta: 0 });
  expect(await ratings()).toMatchObject({ Ann: [1500, 1], Cy: [1500, 1] });
});

test('games ending at once for the same players all count, without a deadlock', async () => {
  await Promise.all([
    ...Array.from({ length: 5 }, () => saveGame(db, game(ann, bob, { reason: 'resign', winner: 'b' }))),
    ...Array.from({ length: 5 }, () => saveGame(db, game(bob, cy, { reason: 'resign', winner: 'w' }))),
  ]);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM games');
  expect(rows[0].n).toBe(10);
  const after = await ratings();
  expect(after.Bob[1]).toBe(50); // ten games added to forty
  expect(after.Ann[1]).toBe(5);
  expect(after.Cy[1]).toBe(5);
  const deltas = await pool.query(
    'SELECT sum(white_delta) FILTER (WHERE white_id = $1) + sum(black_delta) FILTER (WHERE black_id = $1) AS d FROM games',
    [bob.id],
  );
  expect(after.Bob[0]).toBe(1700 + Number(deltas.rows[0].d)); // no update was lost
});
