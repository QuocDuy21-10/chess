import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { planMove } from './planMove';
import { applyStep, matchesBoard, piecesFromBoard } from './position';

test('starting position has 32 pieces with ids from their squares', () => {
  const pieces = piecesFromBoard(new Chess());
  expect(pieces).toHaveLength(32);
  expect(pieces).toContainEqual({ id: 'w-p-e2', type: 'p', color: 'w', square: 'e2' });
});

test('matchesBoard detects a difference', () => {
  const chess = new Chess();
  const pieces = piecesFromBoard(chess);
  expect(matchesBoard(pieces, chess)).toBe(true);
  expect(matchesBoard(pieces.slice(1), chess)).toBe(false);
});

// A game with both castles, en passant, captures and a capture-promotion.
const GAME =
  '1. e4 d5 2. e5 f5 3. exf6 Nc6 4. fxg7 Be6 5. gxh8=Q Qd7 6. Nf3 O-O-O 7. Be2 Nf6 8. O-O Bg7 9. Qxd8+ Kxd8';

test('step effects keep the pieces equal to chess.js through a whole game', () => {
  const chess = new Chess();
  let pieces = piecesFromBoard(chess);
  const sans = GAME.split(' ').filter((token) => !token.endsWith('.'));
  for (const san of sans) {
    const before = pieces;
    const move = chess.move(san);
    pieces = planMove(move, before).reduce(applyStep, before);
    expect(matchesBoard(pieces, chess), `after ${san}`).toBe(true);
  }
  // ids are stable: the e2 pawn promoted on h8 and was later captured on d8 by the king
  expect(pieces.some((p) => p.id === 'w-p-e2')).toBe(false);
  expect(pieces.find((p) => p.id === 'b-k-e8')?.square).toBe('d8');
});
