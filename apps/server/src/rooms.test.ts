import { Chess } from 'chess.js';
import { beforeEach, expect, test } from 'vitest';
import { createRooms, timeoutResult, type Rooms } from './rooms.ts';

const MINUTE = 60_000;
const ANN = { id: 'ann-id', name: 'Ann', rating: 1500 };
const BOB = { id: 'bob-id', name: 'Bob', rating: 1620 };
const CY = { id: 'cy-id', name: 'Cy', rating: 1400 };
let time: number; // the server's clock, moved by hand
let rooms: Rooms;

beforeEach(() => {
  time = 1_000_000;
  rooms = createRooms(() => time);
});

/** A five-minute room with both players in it. Ann made it and plays the first army. */
function started() {
  const id = rooms.create(ANN, 'w', 5)!;
  rooms.join(id, ANN);
  rooms.join(id, BOB);
  return id;
}

test('the creator holds the seat they chose and the guest gets the other', () => {
  const id = rooms.create(ANN, 'b', 5)!;
  expect(id).toMatch(/^[\w-]{8}$/);
  expect(rooms.join(id, ANN)).toEqual({ color: 'b' });
  expect(rooms.state(id, 'b')).toMatchObject({ roomId: id, color: 'b', started: false, moves: [], opponentOnline: false });
  expect(rooms.join(id, BOB)).toEqual({ color: 'w' });
  expect(rooms.state(id, 'b')).toMatchObject({
    started: true,
    opponentOnline: true,
    players: { w: { name: 'Bob', rating: 1620 }, b: { name: 'Ann', rating: 1500 } }, // no user ids
  });
});

test('an empty seat has no player, and one account never takes both seats', () => {
  const id = rooms.create(ANN, 'w', 5)!;
  expect(rooms.state(id, 'w')?.players).toEqual({ w: { name: 'Ann', rating: 1500 }, b: null });
  expect(rooms.join(id, { ...ANN, name: 'Ann in another tab' })).toEqual({ color: 'w' });
  expect(rooms.state(id, 'w')?.started).toBe(false);
});

test('a third player is refused, and a returning player gets their own seat back', () => {
  const id = started();
  expect(rooms.join(id, CY)).toEqual({ error: 'full' });
  expect(rooms.join(id, BOB)).toEqual({ color: 'b' });
  expect(rooms.join('nowhere1', ANN)).toEqual({ error: 'not-found' });
});

test('a move is refused before the guest arrives, out of turn, and when chess.js rejects it', () => {
  const id = rooms.create(ANN, 'w', 5)!;
  rooms.join(id, ANN);
  expect(rooms.move(id, 'w', 'e2e4')).toBe('not-started');
  rooms.join(id, BOB);
  expect(rooms.move(id, 'b', 'e7e5')).toBe('not-your-turn');
  expect(rooms.move(id, 'w', 'e2e5')).toBe('illegal');
  expect(rooms.move('nowhere1', 'w', 'e2e4')).toBe('not-seated');
  expect(rooms.state(id, 'w')?.moves).toEqual([]);
});

test('legal moves are recorded as chess.js spells them', () => {
  const id = started();
  expect(rooms.move(id, 'w', 'e2e4q')).toBeNull(); // the stray promotion letter is dropped
  expect(rooms.move(id, 'b', 'e7e5')).toBeNull();
  expect(rooms.state(id, 'b')?.moves).toEqual(['e2e4', 'e7e5']);
});

test('no clock runs before the guest arrives', () => {
  const id = rooms.create(ANN, 'w', 5)!;
  rooms.join(id, ANN);
  time += MINUTE;
  expect(rooms.deadline(id)).toBeNull();
  rooms.join(id, BOB);
  expect(rooms.state(id, 'w')?.clocks).toEqual({ w: 5 * MINUTE, b: 5 * MINUTE });
  expect(rooms.deadline(id)).toBe(5 * MINUTE);
});

test('the time a move took is charged to the mover, and then the other clock runs', () => {
  const id = started();
  time += 7_000;
  rooms.move(id, 'w', 'e2e4');
  expect(rooms.state(id, 'w')?.clocks).toEqual({ w: 5 * MINUTE - 7_000, b: 5 * MINUTE });
  time += 3_000;
  expect(rooms.state(id, 'w')?.clocks).toEqual({ w: 5 * MINUTE - 7_000, b: 5 * MINUTE - 3_000 });
  expect(rooms.deadline(id)).toBe(5 * MINUTE - 3_000);
});

test('a clock that reaches zero ends the game for the other side', () => {
  const id = started();
  time += 5 * MINUTE - 1;
  rooms.flag(id);
  expect(rooms.state(id, 'w')?.result).toBeNull();
  time += 1;
  rooms.flag(id);
  expect(rooms.state(id, 'w')).toMatchObject({
    result: { reason: 'timeout', winner: 'b' },
    clocks: { w: 0, b: 5 * MINUTE },
  });
  expect(rooms.deadline(id)).toBeNull();
});

test('running out of time against a side that cannot mate is a draw', () => {
  const loneKing = new Chess('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  expect(timeoutResult(loneKing, 'w')).toEqual({ reason: 'timeout-insufficient' });
  const kingAndKnight = new Chess('4k3/8/2n5/8/8/8/4P3/4K3 w - - 0 1');
  expect(timeoutResult(kingAndKnight, 'w')).toEqual({ reason: 'timeout-insufficient' });
  const kingAndRook = new Chess('4k3/8/2r5/8/8/8/8/4K3 w - - 0 1');
  expect(timeoutResult(kingAndRook, 'w')).toEqual({ reason: 'timeout', winner: 'b' });
  const kingAndPawn = new Chess('4k3/4p3/8/8/8/8/8/4K3 w - - 0 1');
  expect(timeoutResult(kingAndPawn, 'w')).toEqual({ reason: 'timeout', winner: 'b' });
  const lonelyFlagger = new Chess('4k3/4p3/8/8/8/8/8/4K3 b - - 0 1'); // black flags with a pawn; white has only a king
  expect(timeoutResult(lonelyFlagger, 'b')).toEqual({ reason: 'timeout-insufficient' });
});

test('a move made after the flag fell is refused even if the timer never ran', () => {
  const id = started();
  time += 5 * MINUTE;
  expect(rooms.move(id, 'w', 'e2e4')).toBe('over');
  expect(rooms.state(id, 'b')).toMatchObject({ moves: [], result: { reason: 'timeout', winner: 'b' } });
});

test('resigning gives the game to the other side and stops the clocks', () => {
  const id = started();
  time += 2_000;
  expect(rooms.resign(id, 'b')).toBeNull();
  expect(rooms.state(id, 'w')).toMatchObject({
    result: { reason: 'resign', winner: 'w' },
    clocks: { w: 5 * MINUTE - 2_000, b: 5 * MINUTE },
  });
  time += MINUTE;
  expect(rooms.state(id, 'w')?.clocks.w).toBe(5 * MINUTE - 2_000);
  expect(rooms.resign(id, 'w')).toBe('over');
  expect(rooms.move(id, 'w', 'e2e4')).toBe('over');
});

test('checkmate ends the game and stops the clocks', () => {
  const id = started();
  const moves = [['w', 'f2f3'], ['b', 'e7e5'], ['w', 'g2g4'], ['b', 'd8h4']] as const;
  for (const [color, move] of moves) expect(rooms.move(id, color, move)).toBeNull();
  expect(rooms.state(id, 'w')?.result).toEqual({ reason: 'checkmate', winner: 'b' });
  expect(rooms.deadline(id)).toBeNull();
});

test('each player is told whether the other is connected', () => {
  const id = started();
  rooms.leave(id, 'b');
  expect(rooms.state(id, 'w')?.opponentOnline).toBe(false);
  expect(rooms.state(id, 'b')?.opponentOnline).toBe(true);
  rooms.join(id, BOB);
  expect(rooms.state(id, 'w')?.opponentOnline).toBe(true);
});

test('a room nobody is connected to is deleted after ten minutes', () => {
  const live = started();
  const abandoned = started();
  const neverEntered = rooms.create(ANN, 'w', 5)!;
  rooms.leave(abandoned, 'w');
  rooms.leave(abandoned, 'b');
  time += 10 * MINUTE - 1;
  expect(rooms.sweep()).toEqual([]);
  time += 1;
  expect(rooms.sweep().sort()).toEqual([abandoned, neverEntered].sort());
  expect(rooms.state(abandoned, 'w')).toBeNull();
  expect(rooms.state(live, 'w')).not.toBeNull();
});

test('the server holds at most a thousand rooms', () => {
  for (let i = 0; i < 1000; i++) expect(rooms.create(ANN, 'w', 5)).not.toBeNull();
  expect(rooms.create(ANN, 'w', 5)).toBeNull();
});
