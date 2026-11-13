import type { ClientEvents, CreateAck, ServerEvents } from '@chess/shared/protocol';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from './app.ts';
import { log } from './log.ts';
import { users } from './schema.ts';
import { connectTest, truncate } from './test-db.ts';

// The limits from limits.ts seen from outside: real HTTP requests and Socket.IO connections, with small limits.

const { pool, db } = connectTest();
const apps: ReturnType<typeof createApp>[] = [];
const sockets: Socket<ServerEvents, ClientEvents>[] = [];
const SITE = 'https://chess.example.com';
let annId: string;

beforeEach(async () => {
  await truncate(pool);
  [{ id: annId }] = await db.insert(users).values({ displayName: 'Ann' }).returning({ id: users.id });
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
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

/** A client on `port` whose handshake carries `cookie`, and `origin` when given, as a browser's would. */
function connect(port: number, cookie: string, origin?: string) {
  const socket: Socket<ServerEvents, ClientEvents> = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: origin ? { cookie, origin } : { cookie },
  });
  sockets.push(socket);
  return socket;
}

/** 'connected', or the message the refusal came with. */
const outcome = (socket: Socket<ServerEvents, ClientEvents>) =>
  new Promise<string>((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });

const annCookie = async (app: ReturnType<typeof createApp>) => `sid=${await app.sessions.create(annId)}`;

test('in production a handshake from another site, or from no site, is refused; the site connects', async () => {
  const { app, port } = await start({ origins: [SITE] });
  const cookie = await annCookie(app);
  expect(await outcome(connect(port, cookie, 'https://evil.example'))).not.toBe('connected');
  expect(await outcome(connect(port, cookie))).not.toBe('connected');
  expect(await outcome(connect(port, cookie, SITE))).toBe('connected');
});

test('in development a handshake from any origin connects', async () => {
  const { app, port } = await start();
  expect(await outcome(connect(port, await annCookie(app), 'https://evil.example'))).toBe('connected');
});

test('an account holds at most five connections; the sixth is told why', async () => {
  const { app, port } = await start();
  const cookie = await annCookie(app);
  const five = Array.from({ length: 5 }, () => connect(port, cookie));
  expect(await Promise.all(five.map(outcome))).toEqual(Array(5).fill('connected'));
  expect(await outcome(connect(port, cookie))).toBe('too-many-connections');
});

test('past the server-wide cap a new connection is refused', async () => {
  const { app, port } = await start({ limits: { maxConnections: 2 } });
  const cookie = await annCookie(app);
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).not.toBe('connected');
});

test('past the handshake limit an IP is refused', async () => {
  const { app, port } = await start({ limits: { handshakesPerMinute: 2 } });
  const cookie = await annCookie(app);
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).toBe('connected');
  expect(await outcome(connect(port, cookie))).not.toBe('connected');
});

test('past the event limit an event is dropped, its ack says why, and one line is logged', async () => {
  const { app, port } = await start({ limits: { eventsPer10Seconds: 2 } });
  const ann = connect(port, await annCookie(app));
  expect(await outcome(ann)).toBe('connected');
  const create = () => new Promise<CreateAck>((resolve) => ann.emit('create', { color: 'w', minutes: 5 }, resolve));
  expect(await create()).toHaveProperty('roomId');
  expect(await create()).toHaveProperty('roomId');
  expect(await create()).toEqual({ error: 'rate-limited' });
  expect(await create()).toEqual({ error: 'rate-limited' });
  expect(log.warn).toHaveBeenCalledTimes(1); // once per window, not once per refusal
  expect(log.warn).toHaveBeenCalledWith('Rate limited', { limit: 'events', key: annId });
});
