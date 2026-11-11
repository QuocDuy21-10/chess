import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { planMove } from './planMove';
import { piecesFromBoard } from './position';

// Plans one move from a FEN. Piece ids come from the FEN squares, e.g. "w-p-e2".
function plan(fen: string, move: string) {
  const chess = new Chess(fen);
  const pieces = piecesFromBoard(chess);
  return planMove(chess.move(move), pieces);
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('quiet move walks', () => {
  expect(plan(START, 'e4')).toEqual([{ kind: 'walk', piece: 'w-p-e2', to: 'e4' }]);
});

test('quiet knight move hops', () => {
  expect(plan(START, 'Nf3')).toEqual([{ kind: 'hop', piece: 'w-n-g1', to: 'f3' }]);
});

test('capture fights, then walks in', () => {
  expect(plan('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'exd5')).toEqual([
    { kind: 'combat', attacker: 'w-p-e4', defender: 'b-p-d5' },
    { kind: 'walk', piece: 'w-p-e4', to: 'd5' },
  ]);
});

test('knight capture fights, then walks in', () => {
  expect(plan('rnbqkbnr/ppp1pppp/8/3p4/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 2', 'Nxd5')).toEqual([
    { kind: 'combat', attacker: 'w-n-c3', defender: 'b-p-d5' },
    { kind: 'walk', piece: 'w-n-c3', to: 'd5' },
  ]);
});

test('en passant fights the pawn beside the target square', () => {
  expect(plan('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', 'exf6')).toEqual([
    { kind: 'combat', attacker: 'w-p-e5', defender: 'b-p-f5' },
    { kind: 'walk', piece: 'w-p-e5', to: 'f6' },
  ]);
});

test('king-side castle: king walks, rook hops', () => {
  expect(plan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O')).toEqual([
    { kind: 'walk', piece: 'w-k-e1', to: 'g1' },
    { kind: 'hop', piece: 'w-r-h1', to: 'f1' },
  ]);
});

test('queen-side castle for black', () => {
  expect(plan('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O')).toEqual([
    { kind: 'walk', piece: 'b-k-e8', to: 'c8' },
    { kind: 'hop', piece: 'b-r-a8', to: 'd8' },
  ]);
});

test('promotion walks, then promotes', () => {
  expect(plan('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a8=N')).toEqual([
    { kind: 'walk', piece: 'w-p-a7', to: 'a8' },
    { kind: 'promote', piece: 'w-p-a7', to: 'n' },
  ]);
});

test('promotion with capture fights, walks, then promotes', () => {
  expect(plan('1r6/P7/8/8/8/8/8/k6K w - - 0 1', 'axb8=Q')).toEqual([
    { kind: 'combat', attacker: 'w-p-a7', defender: 'b-r-b8' },
    { kind: 'walk', piece: 'w-p-a7', to: 'b8' },
    { kind: 'promote', piece: 'w-p-a7', to: 'q' },
  ]);
});
