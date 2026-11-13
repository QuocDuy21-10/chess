import { beforeEach, expect, test } from 'vitest';
import { createRooms, type Rooms } from './rooms.ts';

const MINUTE = 60_000;
let time: number; // the server's clock, moved by hand
let rooms: Rooms;

beforeEach(() => {
  time = 1_000_000;
  rooms = createRooms(() => time);
});

/** A five-minute room with both players in it. `ann` made it and plays the first army. */
function started() {
  const id = rooms.create('ann', 'w', 5)!;
  rooms.join(id, 'ann');
  rooms.join(id, 'bob');
  return id;
}

test('the creator holds the seat they chose and the guest gets the other', () => {
  const id = rooms.create('ann', 'b', 5)!;
  expect(id).toMatch(/^[\w-]{8}$/);
  expect(rooms.join(id, 'ann')).toEqual({ color: 'b' });
  expect(rooms.state(id, 'b')).toMatchObject({ roomId: id, color: 'b', started: false, moves: [], opponentOnline: false });
  expect(rooms.join(id, 'bob')).toEqual({ color: 'w' });
  expect(rooms.state(id, 'b')).toMatchObject({ started: true, opponentOnline: true });
});

test('a third player is refused, and a returning player gets their own seat back', () => {
  const id = started();
  expect(rooms.join(id, 'cy')).toEqual({ error: 'full' });
  expect(rooms.join(id, 'bob')).toEqual({ color: 'b' });
  expect(rooms.join('nowhere1', 'ann')).toEqual({ error: 'not-found' });
});

test('a move is refused before the guest arrives, out of turn, and when chess.js rejects it', () => {
  const id = rooms.create('ann', 'w', 5)!;
  rooms.join(id, 'ann');
  expect(rooms.move(id, 'w', 'e2e4')).toBe('not-started');
  rooms.join(id, 'bob');
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
  const id = rooms.create('ann', 'w', 5)!;
  rooms.join(id, 'ann');
  time += MINUTE;
  expect(rooms.deadline(id)).toBeNull();
  rooms.join(id, 'bob');
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
  rooms.join(id, 'bob');
  expect(rooms.state(id, 'w')?.opponentOnline).toBe(true);
});

test('a room nobody is connected to is deleted after ten minutes', () => {
  const live = started();
  const abandoned = started();
  const neverEntered = rooms.create('ann', 'w', 5)!;
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
  for (let i = 0; i < 1000; i++) expect(rooms.create('ann', 'w', 5)).not.toBeNull();
  expect(rooms.create('ann', 'w', 5)).toBeNull();
});
