import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from './app.ts';
import { log } from './log.ts';
import { users } from './schema.ts';
import { connectTest, truncate } from './test-db.ts';

// The limits from limits.ts seen from outside: real HTTP requests and Socket.IO connections, with small limits.

const { pool, db } = connectTest();
const apps: ReturnType<typeof createApp>[] = [];
let annId: string;

beforeEach(async () => {
  await truncate(pool);
  [{ id: annId }] = await db.insert(users).values({ displayName: 'Ann' }).returning({ id: users.id });
  vi.spyOn(log, 'warn').mockImplementation(() => {});
  void annId;
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});
afterAll(() => pool.end());

/** A server with these options on a free port. */
async function start(options: Omit<Parameters<typeof createApp>[0], 'db' | 'providers'> = {}) {
  const app = createApp({ db, providers: {}, ...options });
  apps.push(app);
  const port = await app.listen(0);
  return { app, port, base: `http://localhost:${port}` };
}

const status = async (url: string, headers: Record<string, string> = {}) => (await fetch(url, { headers })).status;

test('past the HTTP limit a client gets 429 with Retry-After; the health check is never counted', async () => {
  const { base } = await start({ limits: { httpPerMinute: 2 } });
  for (let i = 0; i < 5; i++) expect(await status(`${base}/health`)).toBe(200);
  expect(await status(`${base}/me`)).toBe(401);
  expect(await status(`${base}/me`)).toBe(401);
  const refused = await fetch(`${base}/me`);
  expect(refused.status).toBe(429);
  expect(await refused.json()).toEqual({ error: 'rate-limited' });
  expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
});

test('signing in has a stricter limit of its own, which the provider list is not part of', async () => {
  const { base } = await start({ limits: { authPer10Minutes: 1 } });
  for (let i = 0; i < 3; i++) expect(await status(`${base}/auth/providers`)).toBe(200);
  expect(await status(`${base}/auth/github`)).toBe(404); // no such provider on this server, but counted
  expect(await status(`${base}/auth/github/callback`)).toBe(429);
});

test('behind a trusted proxy each forwarded address is counted apart; with none, the header is ignored', async () => {
  const proxied = await start({ trustProxy: 1, limits: { httpPerMinute: 1 } });
  expect(await status(`${proxied.base}/me`, { 'x-forwarded-for': '203.0.113.1' })).toBe(401);
  expect(await status(`${proxied.base}/me`, { 'x-forwarded-for': '203.0.113.2' })).toBe(401);
  expect(await status(`${proxied.base}/me`, { 'x-forwarded-for': '203.0.113.1' })).toBe(429);

  const direct = await start({ limits: { httpPerMinute: 1 } });
  expect(await status(`${direct.base}/me`, { 'x-forwarded-for': '203.0.113.1' })).toBe(401);
  expect(await status(`${direct.base}/me`, { 'x-forwarded-for': '203.0.113.2' })).toBe(429);
});
