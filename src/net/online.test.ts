import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useGame } from '@/state/store';
import { createApp } from '../../server/app.ts';
import { useOnline } from './online';
import type { ClientEvents, CreateAck, RoomState, ServerEvents } from './protocol';

// This device's side of an online game, against the real server. The opponent is a bare socket.

type Client = Socket<ServerEvents, ClientEvents>;

const BOB = 'bob-player-id';
const online = () => useOnline.getState();
const game = () => useGame.getState();
const stored = new Map<string, string>();
const replaceState = vi.fn();
let app: ReturnType<typeof createApp>;
let port: number;
let skew: number; // milliseconds added to the server's clock
let bob: Client;

beforeEach(async () => {
  skew = 0;
  app = createApp({ now: () => Date.now() + skew });
  port = await app.listen(0);
  stored.clear();
  replaceState.mockClear();
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', `http://localhost:${port}`);
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', pathname: '/' });
  vi.stubGlobal('history', { replaceState });
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => stored.get(name) ?? null,
    setItem: (name: string, value: string) => void stored.set(name, value),
  });
  bob = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
});

afterEach(async () => {
  online().leave();
  bob.disconnect();
  await until(() => game().phase !== 'animating');
  await app.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function until(condition: () => boolean) {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 10));
}

const bobJoins = (roomId: string, playerId = BOB) =>
  new Promise((resolve) => bob.emit('join', { roomId, playerId }, resolve));
const bobMoves = (move: string) => new Promise((resolve) => bob.emit('move', move, resolve));

/** This device creates a room and plays the first army; Bob joins it. */
async function startGame() {
  online().create(5);
  await until(() => online().status === 'waiting');
  const roomId = online().roomId!;
  await bobJoins(roomId);
  await until(() => online().status === 'playing');
  return roomId;
}

test('a created room waits for an opponent, then both sides play', async () => {
  online().create(5);
  expect(online().status).toBe('connecting');
  await until(() => online().status === 'waiting');
  const roomId = online().roomId!;
  expect(replaceState).toHaveBeenLastCalledWith(null, '', `?room=${roomId}`);
  expect(game().seat).toBe('w');
  expect(game().submitText('e4')).toBe(false); // nobody to play against yet

  await bobJoins(roomId);
  await until(() => online().status === 'playing');
  expect(online()).toMatchObject({ running: 'w', connected: true, opponentOnline: true });
  expect(online().clocks.w).toBeGreaterThan(299_000);

  // A move made here reaches the opponent.
  const seen = new Promise<RoomState>((resolve) => bob.on('state', (s) => s.moves.length === 1 && resolve(s)));
  expect(game().submitText('e4')).toBe(true);
  expect((await seen).moves).toEqual(['e2e4']);
  await until(() => game().phase === 'idle' && online().running === 'b');
  expect(game().submitText('d4')).toBe(false); // the turn has passed

  // A move made there is played here.
  await bobMoves('e7e5');
  await until(() => game().history.length === 2);
  expect(game().history).toEqual(['e4', 'e5']);
  expect(online().running).toBe('w');

  // A resignation is a result only the server knows.
  bob.emit('resign', () => {});
  await until(() => game().result !== null);
  expect(game().result).toEqual({ reason: 'resign', winner: 'w' });
  expect(online().running).toBeNull();

  online().leave();
  expect(online()).toMatchObject({ status: 'off', roomId: null, error: null });
  expect(game()).toMatchObject({ seat: null, send: null });
  expect(replaceState).toHaveBeenLastCalledWith(null, '', '/');
  await until(() => game().history.length === 0 && game().result === null);
});

test('a room joined from a link gives the free seat', async () => {
  const made = await new Promise<CreateAck>((resolve) =>
    bob.emit('create', { playerId: BOB, color: 'w', minutes: 5 }, resolve),
  );
  if ('error' in made) throw new Error(made.error);
  await bobJoins(made.roomId);

  online().join(made.roomId);
  await until(() => online().status === 'playing');
  expect(game().seat).toBe('b');
  expect(game().submitText('e5')).toBe(false); // the first army moves first

  await bobMoves('e2e4');
  await until(() => game().history.length === 1);
  expect(game().submitText('e5')).toBe(true);
});

test('a room that does not exist returns to the menu with the reason', async () => {
  online().join('abcdefgh');
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', roomId: null, error: 'not-found' });
  expect(game().seat).toBeNull();
});

test('a server that cannot be reached is reported', async () => {
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'http://localhost:9'); // nothing listens there
  online().create(5);
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', error: 'unreachable' });
});

test('a refused move puts the board back to what the server has', async () => {
  await startGame();
  skew = 5 * 60_000; // this side's clock has run out, though the server's timer has not fired
  expect(game().submitText('e4')).toBe(true);
  await until(() => game().result !== null);
  expect(game()).toMatchObject({ history: [], result: { reason: 'timeout', winner: 'b' } });
});

test('a dropped connection locks the board, then picks the game up where the server has it', async () => {
  await startGame();
  expect(game().submitText('e4')).toBe(true);
  await until(() => game().phase === 'idle' && online().running === 'b');

  for (const socket of app.io.sockets.sockets.values()) if (socket.data.color === 'w') socket.conn.close();
  await until(() => !online().connected);
  expect(game().send).toBeNull();

  await bobMoves('e7e5'); // played while this device was away
  await until(() => online().connected);
  await until(() => game().history.length === 2);
  expect(game().history).toEqual(['e4', 'e5']);
  expect(game().submitText('Nf3')).toBe(true);
});

test('when the same player joins from another tab, this one returns to the menu', async () => {
  const roomId = await startGame();
  bob.disconnect();
  const tab: Client = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
  tab.emit('join', { roomId, playerId: stored.get('chess.player')! }, () => {});
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', error: 'replaced' });
  tab.disconnect();
});
