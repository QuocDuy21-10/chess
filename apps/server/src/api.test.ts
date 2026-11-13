import type { HistoryPage, User } from '@chess/shared/account';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { createApp } from './app.ts';
import { games, users } from './schema.ts';
import { connectTest, truncate } from './test-db.ts';

const { pool, db } = connectTest();
let app: ReturnType<typeof createApp>;
let base: string;
let ann: string;
let bob: string;
let annCookie: string;

beforeEach(async () => {
  await truncate(pool);
  app = createApp({ db, providers: {} });
  base = `http://localhost:${await app.listen(0)}`;
  [{ id: ann }, { id: bob }] = await db
    .insert(users)
    .values([{ displayName: 'Ann' }, { displayName: 'Bob', avatarUrl: 'https://avatars.example/bob.png' }])
    .returning({ id: users.id });
  annCookie = `sid=${await app.sessions.create(ann)}`;
  return () => app.close();
});
afterAll(() => pool.end());

const call = (path: string, init: RequestInit = {}, cookie = annCookie) =>
  fetch(base + path, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } });

/** `count` games between Ann and Bob, one a minute, alternating colours; Ann wins the even ones. */
async function play(count: number) {
  const start = Date.UTC(2026, 10, 1);
  await db.insert(games).values(
    Array.from({ length: count }, (_, i) => ({
      whiteId: i % 2 ? bob : ann,
      blackId: i % 2 ? ann : bob,
      minutes: 5,
      winner: i % 2 ? ('b' as const) : ('w' as const),
      reason: 'resign',
      moves: ['e2e4'],
      whiteRating: 1500 + i,
      blackRating: 1500 - i,
      whiteDelta: 20,
      blackDelta: -20,
      startedAt: new Date(start + i * 60_000 - 30_000),
      endedAt: new Date(start + i * 60_000),
    })),
  );
}

test('/me needs a session', async () => {
  expect((await call('/me', {}, '')).status).toBe(401);
  expect((await call('/me', {}, 'sid=nonsense')).status).toBe(401);
  expect(await (await call('/me')).json()).toEqual({ id: ann, name: 'Ann', avatar: null, rating: 1500, gamesPlayed: 0 });
});

test('a player renames themself; a blank or long name is refused', async () => {
  const renamed = await call('/me', { method: 'PATCH', body: JSON.stringify({ name: '  Annie  ' }) });
  expect(await renamed.json()).toMatchObject({ id: ann, name: 'Annie' });
  expect(((await (await call('/me')).json()) as User).name).toBe('Annie');
  for (const body of [{ name: '   ' }, { name: 'x'.repeat(33) }, { name: 42 }, {}]) {
    expect((await call('/me', { method: 'PATCH', body: JSON.stringify(body) })).status, JSON.stringify(body)).toBe(400);
  }
  expect((await call('/me', { method: 'PATCH', body: JSON.stringify({ name: '😀'.repeat(32) }) })).status).toBe(200);
});

test('a body over 1 kB and malformed JSON are refused as the client\'s mistakes', async () => {
  const big = await call('/me', { method: 'PATCH', body: JSON.stringify({ name: 'x'.repeat(2000) }) });
  expect(big.status).toBe(413);
  expect((await call('/me', { method: 'PATCH', body: '{"name":' })).status).toBe(400);
});

test('history is newest first, from the player side, twenty a page', async () => {
  await play(25);
  const first = (await (await call('/me/games')).json()) as HistoryPage;
  expect(first.games).toHaveLength(20);
  expect(first.games[0]).toMatchObject({
    color: 'w', // game 24: Ann had white and won
    opponent: { name: 'Bob', avatar: 'https://avatars.example/bob.png' },
    minutes: 5,
    result: { reason: 'resign', winner: 'w' },
    ratingBefore: 1524,
    delta: 20,
    endedAt: new Date(Date.UTC(2026, 10, 1) + 24 * 60_000).toISOString(),
  });
  expect(first.games[1]).toMatchObject({ color: 'b', ratingBefore: 1477, delta: -20 });
  expect(first.next).not.toBeNull();

  const second = (await (await call(`/me/games?before=${encodeURIComponent(first.next!)}`)).json()) as HistoryPage;
  expect(second.games.map((g) => g.ratingBefore)).toEqual([1504, 1497, 1502, 1499, 1500]);
  expect(second.next).toBeNull();
  const ids = new Set([...first.games, ...second.games].map((g) => g.id));
  expect(ids.size).toBe(25);
});

test('a draw has no winner, an empty history is empty, and a bad cursor is a 400', async () => {
  expect(await (await call('/me/games')).json()).toEqual({ games: [], next: null });
  await play(1);
  await pool.query("UPDATE games SET winner = NULL, reason = 'stalemate'");
  expect(((await (await call('/me/games')).json()) as HistoryPage).games[0].result).toEqual({ reason: 'stalemate' });
  for (const bad of ['yesterday', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z,not-a-uuid', ',']) {
    expect((await call(`/me/games?before=${encodeURIComponent(bad)}`)).status, bad).toBe(400);
  }
});
