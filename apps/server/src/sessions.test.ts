import { afterAll, beforeEach, expect, test } from 'vitest';
import { users } from './schema.ts';
import { createSessions, SESSION_MS } from './sessions.ts';
import { connectTest, truncate } from './test-db.ts';

const { pool, db } = connectTest();
let time: number;
const sessions = createSessions(db, () => time);
let ann: string;

beforeEach(async () => {
  await truncate(pool);
  time = Date.now();
  [{ id: ann }] = await db.insert(users).values({ displayName: 'Ann' }).returning({ id: users.id });
});
afterAll(() => pool.end());

test('a token opens its session, and only the hash of it is stored', async () => {
  const token = await sessions.create(ann);
  expect(token).toMatch(/^[\w-]{43}$/);
  expect(await sessions.find(token)).toEqual({ id: ann, name: 'Ann', avatar: null, rating: 1500, gamesPlayed: 0 });
  const { rows } = await pool.query('SELECT token_hash FROM sessions');
  expect(rows[0].token_hash.toString('base64url')).not.toBe(token);
  expect(await sessions.find('not-a-token')).toBeNull();
});

test('a session ends after thirty days, and the sweep deletes it', async () => {
  const token = await sessions.create(ann);
  time += SESSION_MS - 1;
  expect(await sessions.find(token)).not.toBeNull();
  await sessions.sweep();
  expect(await sessions.find(token)).not.toBeNull();
  time += 1;
  expect(await sessions.find(token)).toBeNull();
  await sessions.sweep();
  expect((await pool.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n).toBe(0);
});

test('signing out ends that session only', async () => {
  const phone = await sessions.create(ann);
  const laptop = await sessions.create(ann);
  await sessions.remove(phone);
  expect(await sessions.find(phone)).toBeNull();
  expect(await sessions.find(laptop)).not.toBeNull();
});
