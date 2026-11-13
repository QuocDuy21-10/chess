import type { ClientEvents, CreateAck, JoinAck, MoveAck, RoomState, ServerEvents } from '@chess/shared/protocol';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from './app.ts';
import { users } from './schema.ts';
import { connectTest, truncate } from './test-db.ts';

// The real server on a free port, talked to by real clients signed in as Ann, Bob and Cy.

type Client = Socket<ServerEvents, ClientEvents>;

const SHORT = 0.002; // minutes: a clock of 120 ms, to watch a flag fall
let app: ReturnType<typeof createApp>;
let port: number;
let skew: number; // milliseconds added to the server's clock
const clients: Client[] = [];
const { pool, db } = connectTest();
let ANN: string; // each player's sid cookie
let BOB: string;
let CY: string;

beforeEach(async () => {
  skew = 0;
  await truncate(pool);
  app = createApp({ db, providers: {}, now: () => Date.now() + skew, timeControls: [5, SHORT] });
  port = await app.listen(0);
  const ids = await db
    .insert(users)
    .values([{ displayName: 'Ann' }, { displayName: 'Bob', rating: 1620 }, { displayName: 'Cy' }])
    .returning({ id: users.id });
  [ANN, BOB, CY] = await Promise.all(ids.map(async ({ id }) => `sid=${await app.sessions.create(id)}`));
});
afterAll(() => pool.end());

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await app.close();
});

/** A client whose handshake carries `cookie`, as a signed-in browser's would. */
function connect(cookie: string): Client {
  const client: Client = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { cookie },
  });
  clients.push(client);
  return client;
}

/** Why the server refused this client's connection. */
const refusal = (client: Client) => new Promise<string>((resolve) => client.once('connect_error', (e) => resolve(e.message)));

/** The next `state` this client is sent. Ask for it before causing it. */
const nextState = (client: Client) => new Promise<RoomState>((resolve) => client.once('state', resolve));
const create = (client: Client, minutes = 5) =>
  new Promise<CreateAck>((resolve) => client.emit('create', { color: 'w', minutes }, resolve));
const join = (client: Client, roomId: string) =>
  new Promise<JoinAck>((resolve) => client.emit('join', { roomId }, resolve));
const move = (client: Client, text: string) =>
  new Promise<MoveAck>((resolve) => client.emit('move', text, resolve));

/** Ann creates a room and plays the first army; Bob joins it. Resolves once both have been told. */
async function startGame(minutes = 5) {
  const ann = connect(ANN);
  const bob = connect(BOB);
  const made = await create(ann, minutes);
  if ('error' in made) throw new Error(made.error);
  await Promise.all([nextState(ann), join(ann, made.roomId)]);
  const [annState, bobState] = await Promise.all([nextState(ann), nextState(bob), join(bob, made.roomId)]);
  return { ann, bob, roomId: made.roomId, annState, bobState };
}

test('two players create a room, join it and trade moves', async () => {
  const { ann, bob, roomId, annState, bobState } = await startGame();
  expect(annState).toMatchObject({ roomId, color: 'w', started: true, opponentOnline: true, moves: [] });
  expect(bobState).toMatchObject({ roomId, color: 'b', started: true, opponentOnline: true, moves: [] });
  expect(bobState.players).toEqual({ w: { name: 'Ann', rating: 1500 }, b: { name: 'Bob', rating: 1620 } });

  const [ack, seenByAnn, seenByBob] = await Promise.all([move(ann, 'e2e4'), nextState(ann), nextState(bob)]);
  expect(ack).toEqual({ ok: true });
  expect(seenByAnn.moves).toEqual(['e2e4']);
  expect(seenByBob.moves).toEqual(['e2e4']);

  const [, afterReply] = await Promise.all([move(bob, 'e7e5'), nextState(ann)]);
  expect(afterReply.moves).toEqual(['e2e4', 'e7e5']);
  expect(afterReply.clocks.w).toBeLessThanOrEqual(5 * 60_000);
});

test('a move is refused from the wrong seat, from an outsider, and when it is illegal or malformed', async () => {
  const { ann, bob, roomId } = await startGame();
  expect(await move(bob, 'e7e5')).toEqual({ error: 'not-your-turn' });
  expect(await move(ann, 'e2e5')).toEqual({ error: 'illegal' });
  expect(await move(ann, 'castle, please')).toEqual({ error: 'bad-request' });

  const cy = connect(CY);
  expect(await move(cy, 'e2e4')).toEqual({ error: 'not-seated' });
  expect(await join(cy, roomId)).toEqual({ error: 'full' });
  expect(await move(cy, 'e2e4')).toEqual({ error: 'not-seated' });
});

test('malformed requests get an answer and change nothing', async () => {
  const ann = connect(ANN);
  expect(await create(ann, 7)).toEqual({ error: 'bad-request' }); // not a time control
  expect(await join(ann, 'not a room')).toEqual({ error: 'bad-request' });
  expect(await join(ann, 'abcdefgh')).toEqual({ error: 'not-found' });
  const nothing = await new Promise((resolve) => ann.emit('join', null as never, resolve));
  expect(nothing).toEqual({ error: 'bad-request' });
});

test('a player who drops is reported, and gets the game back on returning', async () => {
  const { ann, bob, roomId } = await startGame();
  await Promise.all([move(ann, 'e2e4'), nextState(ann), nextState(bob)]);

  const dropped = nextState(ann);
  bob.disconnect();
  expect((await dropped).opponentOnline).toBe(false);

  const bobAgain = connect(BOB);
  const [back, seenByAnn] = await Promise.all([nextState(bobAgain), nextState(ann), join(bobAgain, roomId)]);
  expect(back).toMatchObject({ color: 'b', moves: ['e2e4'], started: true });
  expect(seenByAnn.opponentOnline).toBe(true);
});

test('a second tab takes the seat and the first is disconnected', async () => {
  const { ann, bob, roomId } = await startGame();
  const kicked = new Promise<string>((resolve) => ann.once('disconnect', resolve));
  const tab = connect(ANN);
  const [state, seenByBob] = await Promise.all([nextState(tab), nextState(bob), join(tab, roomId)]);
  expect(state.color).toBe('w');
  expect(seenByBob.opponentOnline).toBe(true); // the seat never went offline
  expect(await kicked).toBe('io server disconnect');

  const [ack, afterMove] = await Promise.all([move(tab, 'e2e4'), nextState(bob)]);
  expect(ack).toEqual({ ok: true });
  expect(afterMove.moves).toEqual(['e2e4']);
});

test('a connection without a live session is refused', async () => {
  expect(await refusal(connect(''))).toBe('unauthorized');
  expect(await refusal(connect('sid=forged'))).toBe('unauthorized');
});

test('signing out closes every connection of that account, and the opponent sees the seat empty', async () => {
  const { ann, bob } = await startGame();
  const annTwo = connect(ANN); // a second tab, not in the room
  await new Promise<void>((resolve) => annTwo.once('connect', resolve));
  const closed = Promise.all([ann, annTwo].map((c) => new Promise((resolve) => c.once('disconnect', resolve))));
  const seenByBob = nextState(bob);
  const out = await fetch(`http://localhost:${port}/auth/logout`, { method: 'POST', headers: { cookie: ANN } });
  expect(out.status).toBe(204);
  await closed;
  expect((await seenByBob).opponentOnline).toBe(false);
  expect(await refusal(connect(ANN))).toBe('unauthorized');
});

test('the flag falls by itself when a clock runs out', async () => {
  const { ann, bob } = await startGame(SHORT);
  const [seenByAnn, seenByBob] = await Promise.all([nextState(ann), nextState(bob)]);
  expect(seenByAnn.result).toEqual({ reason: 'timeout', winner: 'b' });
  expect(seenByBob).toMatchObject({ result: { reason: 'timeout', winner: 'b' }, clocks: { w: 0 } });
});

test('a move after the time ran out is refused, and both players are told the result', async () => {
  const { ann, bob } = await startGame();
  skew = 5 * 60_000; // the timer has not fired, but the clock has run out
  const [ack, seenByBob] = await Promise.all([move(ann, 'e2e4'), nextState(bob)]);
  expect(ack).toEqual({ error: 'over' });
  expect(seenByBob).toMatchObject({ moves: [], result: { reason: 'timeout', winner: 'b' } });
});

test('resigning ends the game for both players', async () => {
  const { ann, bob } = await startGame();
  const [ack, seenByAnn] = await Promise.all([
    new Promise<MoveAck>((resolve) => bob.emit('resign', resolve)),
    nextState(ann),
  ]);
  expect(ack).toEqual({ ok: true });
  expect(seenByAnn.result).toEqual({ reason: 'resign', winner: 'w' });
});

/** Polls until `check` passes: games are saved after both players are told. */
async function eventually(check: () => Promise<void>) {
  for (let tries = 0; ; tries++) {
    try {
      return await check();
    } catch (error) {
      if (tries > 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

test('a checkmate is saved once, and moves both ratings', async () => {
  const { ann, bob } = await startGame();
  for (const [player, text] of [[ann, 'f2f3'], [bob, 'e7e5'], [ann, 'g2g4']] as const) {
    await Promise.all([move(player, text), nextState(ann)]);
  }
  const [, over] = await Promise.all([move(bob, 'd8h4'), nextState(ann)]);
  expect(over.result).toEqual({ reason: 'checkmate', winner: 'b' });
  await expect(move(ann, 'e2e4')).resolves.toEqual({ error: 'over' }); // broadcasts again: must not save twice
  await eventually(async () => {
    const { rows } = await pool.query('SELECT winner, reason, moves, white_delta, black_delta FROM games');
    expect(rows).toEqual([
      { winner: 'b', reason: 'checkmate', moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], white_delta: -13, black_delta: 13 }, // 40 × 0.334: Bob was rated higher
    ]);
  });
  const { rows } = await pool.query('SELECT display_name, rating, games_played FROM users ORDER BY display_name');
  expect(rows.slice(0, 2)).toEqual([
    { display_name: 'Ann', rating: 1487, games_played: 1 },
    { display_name: 'Bob', rating: 1633, games_played: 1 },
  ]);
});

test('the health check answers, and any other path is a JSON 404', async () => {
  const health = await fetch(`http://localhost:${port}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });

  const missing = await fetch(`http://localhost:${port}/nowhere`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: 'not-found' });
});

test('HTTP answers carry the security headers and do not name Express', async () => {
  const { headers } = await fetch(`http://localhost:${port}/health`);
  expect(headers.get('x-content-type-options')).toBe('nosniff');
  expect(headers.get('x-powered-by')).toBeNull();
});

test('listening on a port that is taken fails instead of hanging', async () => {
  const second = createApp({ db, providers: {} });
  await expect(second.listen(port)).rejects.toThrow('EADDRINUSE');
  await second.close();
});
