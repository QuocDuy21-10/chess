import type { ClientEvents, CreateAck, JoinAck, MoveAck, RoomState, ServerEvents } from '@chess/shared/protocol';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from './app.ts';

// The real server on a free port, talked to by real clients.

type Client = Socket<ServerEvents, ClientEvents>;

const ANN = 'ann-player-id';
const BOB = 'bob-player-id';
const SHORT = 0.002; // minutes: a clock of 120 ms, to watch a flag fall
let app: ReturnType<typeof createApp>;
let port: number;
let skew: number; // milliseconds added to the server's clock
const clients: Client[] = [];

beforeEach(async () => {
  skew = 0;
  app = createApp({ now: () => Date.now() + skew, timeControls: [5, SHORT] });
  port = await app.listen(0);
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await app.close();
});

function connect(): Client {
  const client: Client = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  return client;
}

/** The next `state` this client is sent. Ask for it before causing it. */
const nextState = (client: Client) => new Promise<RoomState>((resolve) => client.once('state', resolve));
const create = (client: Client, playerId: string, minutes = 5) =>
  new Promise<CreateAck>((resolve) => client.emit('create', { playerId, color: 'w', minutes }, resolve));
const join = (client: Client, roomId: string, playerId: string) =>
  new Promise<JoinAck>((resolve) => client.emit('join', { roomId, playerId }, resolve));
const move = (client: Client, text: string) =>
  new Promise<MoveAck>((resolve) => client.emit('move', text, resolve));

/** Ann creates a room and plays the first army; Bob joins it. Resolves once both have been told. */
async function startGame(minutes = 5) {
  const ann = connect();
  const bob = connect();
  const made = await create(ann, ANN, minutes);
  if ('error' in made) throw new Error(made.error);
  await Promise.all([nextState(ann), join(ann, made.roomId, ANN)]);
  const [annState, bobState] = await Promise.all([nextState(ann), nextState(bob), join(bob, made.roomId, BOB)]);
  return { ann, bob, roomId: made.roomId, annState, bobState };
}

test('two players create a room, join it and trade moves', async () => {
  const { ann, bob, roomId, annState, bobState } = await startGame();
  expect(annState).toMatchObject({ roomId, color: 'w', started: true, opponentOnline: true, moves: [] });
  expect(bobState).toMatchObject({ roomId, color: 'b', started: true, opponentOnline: true, moves: [] });

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

  const cy = connect();
  expect(await move(cy, 'e2e4')).toEqual({ error: 'not-seated' });
  expect(await join(cy, roomId, 'cy-player-id')).toEqual({ error: 'full' });
  expect(await move(cy, 'e2e4')).toEqual({ error: 'not-seated' });
});

test('malformed requests get an answer and change nothing', async () => {
  const ann = connect();
  expect(await create(ann, ANN, 7)).toEqual({ error: 'bad-request' }); // not a time control
  expect(await create(ann, 'short')).toEqual({ error: 'bad-request' });
  expect(await join(ann, 'not a room', ANN)).toEqual({ error: 'bad-request' });
  expect(await join(ann, 'abcdefgh', ANN)).toEqual({ error: 'not-found' });
  const nothing = await new Promise((resolve) => ann.emit('join', null as never, resolve));
  expect(nothing).toEqual({ error: 'bad-request' });
});

test('a player who drops is reported, and gets the game back on returning', async () => {
  const { ann, bob, roomId } = await startGame();
  await Promise.all([move(ann, 'e2e4'), nextState(ann), nextState(bob)]);

  const dropped = nextState(ann);
  bob.disconnect();
  expect((await dropped).opponentOnline).toBe(false);

  const bobAgain = connect();
  const [back, seenByAnn] = await Promise.all([nextState(bobAgain), nextState(ann), join(bobAgain, roomId, BOB)]);
  expect(back).toMatchObject({ color: 'b', moves: ['e2e4'], started: true });
  expect(seenByAnn.opponentOnline).toBe(true);
});

test('a second tab takes the seat and the first is disconnected', async () => {
  const { ann, bob, roomId } = await startGame();
  const kicked = new Promise<string>((resolve) => ann.once('disconnect', resolve));
  const tab = connect();
  const [state, seenByBob] = await Promise.all([nextState(tab), nextState(bob), join(tab, roomId, ANN)]);
  expect(state.color).toBe('w');
  expect(seenByBob.opponentOnline).toBe(true); // the seat never went offline
  expect(await kicked).toBe('io server disconnect');

  const [ack, afterMove] = await Promise.all([move(tab, 'e2e4'), nextState(bob)]);
  expect(ack).toEqual({ ok: true });
  expect(afterMove.moves).toEqual(['e2e4']);
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
