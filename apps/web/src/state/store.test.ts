import { GAMES, playMoves, REFUSALS } from '@chess/shared/testing';
import { Chess, type Color } from 'chess.js';
import { beforeEach, expect, test, vi } from 'vitest';
import { matchesBoard } from '@/game/position';
import { moveList, pliesToUndo, useGame } from './store';

const game = () => useGame.getState();

beforeEach(() => {
  useGame.setState({ seat: null, send: null, mode: 'local' });
  game().newGame();
});

async function play(...moves: string[]) {
  for (const move of moves) {
    expect(game().submitText(move), move).toBe(true);
    await waitForIdle();
  }
}

async function waitForIdle() {
  while (game().phase === 'animating') await Promise.resolve();
}

test('selecting a piece lists its legal targets; selecting a target moves it', async () => {
  game().select('e2');
  expect(game().selected).toBe('e2');
  expect(game().targets.map((m) => m.to).sort()).toEqual(['e3', 'e4']);

  game().select('e4');
  expect(game().phase).toBe('animating'); // input is locked while the move plays
  game().select('d7');
  expect(game().selected).toBeNull();

  await waitForIdle();
  expect(game().phase).toBe('idle');
  expect(game().history).toEqual(['e4']);
  expect(game().lastMove).toEqual({ from: 'e2', to: 'e4' });
  expect(game().turn).toBe('b');
  expect(game().pieces.find((p) => p.id === 'w-p-e2')?.square).toBe('e4');
});

test('selecting an empty square or an opponent piece clears the selection', () => {
  game().select('e2');
  game().select('e7');
  expect(game().selected).toBeNull();
  game().select('e2');
  game().select('a5');
  expect(game().selected).toBeNull();
});

test('selecting another own piece moves the selection', () => {
  game().select('e2');
  game().select('g1');
  expect(game().selected).toBe('g1');
});

test('typed moves accept SAN and coordinates, and reject nonsense', async () => {
  await play('e4', 'e7e5', 'Nf3');
  expect(game().history).toEqual(['e4', 'e5', 'Nf3']);
  expect(game().submitText('Ke5')).toBe(false);
  expect(game().history).toHaveLength(3);
});

test('a promotion waits for the chooser', async () => {
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  game().select('b7');
  game().select('a8');
  expect(game().phase).toBe('promoting');
  expect(game().pendingPromotion).toEqual({ from: 'b7', to: 'a8' });

  game().select('e2'); // ignored while promoting
  expect(game().selected).toBeNull();

  game().choosePromotion('n');
  await waitForIdle();
  expect(game().history.at(-1)).toBe('bxa8=N');
  expect(game().pieces.find((p) => p.square === 'a8')).toMatchObject({ id: 'w-p-a2', type: 'n' });
});

test('cancelling a promotion returns to idle without moving', async () => {
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  game().select('b7');
  game().select('a8');
  game().cancelPromotion();
  expect(game().phase).toBe('idle');
  expect(game().history).toHaveLength(8);
});

test('checkmate ends the game and names the winner', async () => {
  await play('f3', 'e5', 'g4', 'Qh4#');
  expect(game().phase).toBe('gameOver');
  expect(game().result).toEqual({ reason: 'checkmate', winner: 'b' });
  expect(game().inCheck).toBe(true);
  game().select('e2'); // no input after the game ends
  expect(game().selected).toBeNull();
});

test('new game resets everything', async () => {
  await play('f3', 'e5', 'g4', 'Qh4');
  game().newGame();
  expect(game()).toMatchObject({ phase: 'idle', history: [], result: null, turn: 'w', lastMove: null });
  expect(game().pieces).toHaveLength(32);
});

test('stalemate is a draw', async () => {
  await play(
    'e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'h4', 'Rah6', 'Qxc7', 'f6',
    'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6',
  );
  expect(game().phase).toBe('gameOver');
  expect(game().result).toEqual({ reason: 'stalemate' });
});

test('the view never drifts from chess.js through castles, en passant and promotion', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await play(
    'e4', 'd5', 'e5', 'f5', 'exf6', 'Nc6', 'fxg7', 'Be6', 'gxh8=Q', 'Qd7',
    'Nf3', 'O-O-O', 'Be2', 'Nf6', 'O-O', 'Bg7', 'Qxd8+', 'Kxd8',
  );
  expect(error).not.toHaveBeenCalled(); // the store logs an error whenever it has to resync
  expect(game().pieces).toHaveLength(27);
  error.mockRestore();
});

// Undo must leave exactly the pieces that stood before the move, ids included, and chess.js must agree:
// the same move is legal again, and replaying it never triggers the store's resync.
test.each([
  ['a quiet move', ['e4']],
  ['a capture', ['e4', 'd5', 'exd5']],
  ['a castle', ['e4', 'e5', 'Nf3', 'Nc6', 'Be2', 'Nf6', 'O-O']],
  ['en passant', ['e4', 'a6', 'e5', 'd5', 'exd6']],
  ['a promotion', ['a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6', 'bxa8=Q']],
])('undo takes back %s', async (_name, moves) => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const last = moves.at(-1)!;
  await play(...moves.slice(0, -1));
  const before = { pieces: game().pieces, history: game().history, turn: game().turn, lastMove: game().lastMove };
  await play(last);

  game().undo();
  expect(game()).toMatchObject({ ...before, phase: 'idle', selected: null, result: null });
  expect(game().snapshots).toHaveLength(moves.length - 1);

  await play(last);
  expect(game().history).toEqual(moves);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test('undo reopens a finished game', async () => {
  await play('f3', 'e5', 'g4', 'Qh4#');
  game().undo();
  expect(game()).toMatchObject({ phase: 'idle', result: null, turn: 'b', inCheck: false });
  expect(game().history).toEqual(['f3', 'e5', 'g4']);
  await play('Qh4#');
  expect(game().phase).toBe('gameOver');
});

test('undo walks back to the start, then does nothing', async () => {
  await play('e4', 'e5');
  game().undo();
  expect(game().lastMove).toEqual({ from: 'e2', to: 'e4' });
  game().undo();
  expect(game()).toMatchObject({ history: [], lastMove: null, turn: 'w' });
  expect(game().pieces).toHaveLength(32);
  game().undo();
  expect(game()).toMatchObject({ history: [], phase: 'idle' });
});

test('undo is ignored while a move is animating or a promotion is being chosen', async () => {
  game().select('e2');
  game().select('e4');
  expect(game().phase).toBe('animating');
  game().undo();
  await waitForIdle();
  expect(game().history).toEqual(['e4']);

  game().newGame();
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  game().select('b7');
  game().select('a8');
  game().undo();
  expect(game().phase).toBe('promoting');
  expect(game().history).toHaveLength(8);
});

// Online: the device holds one seat, and the server's move list decides what the board shows.

test('with a seat, input is taken only on that seat\'s turn', async () => {
  const send = vi.fn();
  useGame.setState({ seat: 'b', send });
  game().select('e2');
  expect(game().selected).toBeNull();
  expect(game().submitText('e4')).toBe(false);

  await game().sync(['e2e4']); // the other player's move, from the server
  expect(game().history).toEqual(['e4']);
  expect(send).not.toHaveBeenCalled(); // a move from the server is not sent back to it

  expect(game().submitText('e5')).toBe(true);
  expect(send).toHaveBeenCalledWith('e7e5');
  await waitForIdle();
  expect(game().submitText('Nf6')).toBe(false); // the turn has passed
});

test('with a seat, input is locked while the server is out of reach', () => {
  useGame.setState({ seat: 'w', send: null });
  game().select('e2');
  expect(game().selected).toBeNull();
  expect(game().submitText('e4')).toBe(false);
});

test('a promotion made online is sent with its piece', async () => {
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  const send = vi.fn();
  useGame.setState({ seat: 'w', send });
  game().select('b7');
  game().select('a8');
  game().choosePromotion('n');
  await waitForIdle();
  expect(send).toHaveBeenCalledWith('b7a8n');
});

test('sync does nothing when the board already matches', async () => {
  await play('e4', 'e5');
  const before = game().pieces;
  await game().sync(['e2e4', 'e7e5']);
  expect(game().pieces).toBe(before);
});

test('sync waits for a move in flight, then plays the one new move', async () => {
  game().select('e2');
  game().select('e4');
  expect(game().phase).toBe('animating');
  await game().sync(['e2e4', 'e7e5']);
  expect(game().history).toEqual(['e4', 'e5']);
  expect(game().snapshots).toHaveLength(2); // it went through submitMove, not a rebuild
  expect(game().phase).toBe('idle');
});

test('sync rebuilds the board when the lists differ, and keeps every piece id', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await play('e4', 'e5');
  await game().sync(['d2d4', 'd7d5', 'c2c4', 'd5c4', 'e2e4', 'b7b5', 'f1c4']);
  expect(game().history).toEqual(['d4', 'd5', 'c4', 'dxc4', 'e4', 'b5', 'Bxc4']);
  expect(game().pieces).toHaveLength(30);
  expect(game().pieces.find((p) => p.square === 'c4')).toMatchObject({ id: 'w-b-f1' });
  expect(game()).toMatchObject({ phase: 'idle', turn: 'b', lastMove: { from: 'f1', to: 'c4' }, selected: null });
  // The rebuilt board is the one chess.js holds: the next move plays without the store's resync.
  await play('bxc4');
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test('sync rebuilds a finished game with its result', async () => {
  await game().sync(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  expect(game()).toMatchObject({ phase: 'gameOver', result: { reason: 'checkmate', winner: 'b' } });
});

test('the newest list wins while a sync is waiting', async () => {
  game().select('e2');
  game().select('e4');
  const first = game().sync(['e2e4', 'e7e5']);
  const second = game().sync(['e2e4', 'e7e5', 'g1f3']);
  await Promise.all([first, second]);
  expect(game().history).toEqual(['e4', 'e5', 'Nf3']);
});

test('a result only the server knows ends the game', () => {
  game().finish({ reason: 'timeout', winner: 'b' });
  expect(game()).toMatchObject({ phase: 'gameOver', result: { reason: 'timeout', winner: 'b' } });
  game().select('e2'); // no input after the game ends
  expect(game().selected).toBeNull();
  game().finish({ reason: 'resign', winner: 'w' }); // the first result stands
  expect(game().result).toEqual({ reason: 'timeout', winner: 'b' });
});

test('undo does nothing online', async () => {
  await play('e4');
  useGame.setState({ mode: 'online', seat: 'w', send: vi.fn() });
  game().undo();
  expect(game().history).toEqual(['e4']);
});

// Against the computer: the player holds one seat, and Undo takes back the machine's reply with the player's move.

test('the move list comes in coordinate form', async () => {
  await play('e4', 'e5', 'Nf3');
  expect(moveList()).toEqual(['e2e4', 'e7e5', 'g1f3']);
});

test.each([
  ['the player to move, after a pair', 4, 'w', 'w', 2],
  ['the player is Black and has not moved yet', 1, 'b', 'b', 0],
  ['nothing played', 0, 'w', 'w', 0],
  ['the machine to move, after the player mated it', 5, 'b', 'w', 1],
])('pliesToUndo: %s', (_name, length, turn, seat, expected) => {
  expect(pliesToUndo(length as number, turn as Color, seat as Color)).toBe(expected);
});

test("against the computer, undo takes back the machine's reply and the player's move", async () => {
  await play('e4', 'e5');
  const before = game().pieces;
  await play('Nf3', 'Nc6');
  useGame.setState({ mode: 'computer', seat: 'w', send: vi.fn() });
  game().undo();
  expect(game()).toMatchObject({ history: ['e4', 'e5'], turn: 'w', pieces: before, phase: 'idle' });
  expect(game().snapshots).toHaveLength(2);
});

test('against the computer, undo waits while the machine is to move, and is refused after a flag', async () => {
  await play('e4');
  useGame.setState({ mode: 'computer', seat: 'w', send: vi.fn() });
  game().undo(); // the machine is thinking
  expect(game().history).toEqual(['e4']);
  await game().sync(['e2e4', 'e7e5']); // its reply
  game().finish({ reason: 'timeout', winner: 'b' });
  game().undo();
  expect(game().history).toEqual(['e4', 'e5']);
});

test('against the computer, undo after the player mates the machine takes back that one move', async () => {
  await play('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6');
  useGame.setState({ mode: 'computer', seat: 'w', send: vi.fn() });
  await play('Qxf7#');
  expect(game().phase).toBe('gameOver');
  game().undo();
  expect(game()).toMatchObject({ phase: 'idle', turn: 'w', result: null });
  expect(game().history).toHaveLength(6);
});

test.each(GAMES)('$name typed into the store keeps the view equal to chess.js and ends as the catalog says', async ({ moves, result }) => {
  const chess = new Chess();
  for (const move of moves) {
    await play(move);
    playMoves(chess, [move]);
    expect(matchesBoard(game().pieces, chess), move).toBe(true);
  }
  expect(game().result).toEqual(result);
});

test.each(REFUSALS)('$name is refused when typed, and changes nothing', async ({ moves, refused }) => {
  await play(...moves);
  expect(game().submitText(refused)).toBe(false); // a bare g7g8 matches no move: chess.js spells it g7g8q
  expect(game().history).toHaveLength(moves.length);
  expect(game().phase).toBe('idle');
});
