import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { gameResult } from './result.ts';
import { GAMES, playMoves, REFUSALS } from './testing/games.ts';

test.each(GAMES)('$name ends as the catalog says, and not before its last move', ({ moves, result }) => {
  const chess = new Chess();
  playMoves(chess, moves.slice(0, -1));
  expect(gameResult(chess)).toBeNull();
  playMoves(chess, moves.slice(-1));
  expect(gameResult(chess)).toEqual(result);
});

test.each(REFUSALS)('$name: chess.js refuses the move after a legal start', ({ moves, refused }) => {
  const chess = new Chess();
  playMoves(chess, moves);
  expect(() => playMoves(chess, [refused])).toThrow();
});

/** The result once `move` (coordinate form, optional) is played on `fen`. */
function after(fen: string, move?: string) {
  const chess = new Chess(fen);
  if (move) playMoves(chess, [move]);
  return gameResult(chess);
}

test('the fifty-move rule draws on the hundredth half-move without a capture or a pawn move', () => {
  expect(after('8/8/8/8/8/5k2/8/R3K3 w - - 98 60', 'a1a2')).toBeNull();
  expect(after('8/8/8/8/8/5k2/8/R3K3 w - - 99 60', 'a1a2')).toEqual({ reason: 'fifty' });
});

test('a mate on the hundredth half-move is a checkmate, not a draw', () => {
  expect(after('6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 60', 'a1a8')).toEqual({ reason: 'checkmate', winner: 'w' });
});

test('insufficient material: a lone king, a knight or a bishop, or bishops on one colour', () => {
  expect(after('8/8/8/4k3/8/8/8/4K3 w - - 0 1')).toEqual({ reason: 'insufficient' });
  expect(after('8/8/8/4k3/8/8/8/3NK3 w - - 0 1')).toEqual({ reason: 'insufficient' });
  expect(after('8/8/8/4k3/8/8/8/3BK3 w - - 0 1')).toEqual({ reason: 'insufficient' });
  expect(after('4bk2/8/8/8/8/8/8/3BK3 w - - 0 1')).toEqual({ reason: 'insufficient' });
  expect(after('3b1k2/8/8/8/8/8/8/3BK3 w - - 0 1')).toBeNull(); // bishops on different colours can still mate
});

test('a check alone does not end the game', () => {
  const chess = new Chess();
  playMoves(chess, ['e2e4', 'f7f6', 'd1h5']);
  expect(chess.inCheck()).toBe(true);
  expect(gameResult(chess)).toBeNull();
});
