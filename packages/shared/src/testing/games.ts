import type { Chess } from 'chess.js';
import type { Result } from '../result.ts';

// Named games and refused moves that every layer replays: the shared rules, the server, the store and the
// sequencer. For tests only. Moves are in coordinate form from the starting position.

export interface CatalogGame {
  name: string;
  moves: string[];
  result: Result | null; // how the game stands after the last move; null while it goes on
}

export interface Refusal {
  name: string;
  moves: string[]; // all legal, played first
  refused: string; // then this one, which must be refused
}

const list = (moves: string) => moves.split(' ');

export const GAMES: CatalogGame[] = [
  { name: 'fools-mate', moves: list('f2f3 e7e5 g2g4 d8h4'), result: { reason: 'checkmate', winner: 'b' } },
  {
    name: 'scholars-mate',
    moves: list('e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7'),
    result: { reason: 'checkmate', winner: 'w' },
  },
  { name: 'castles', moves: list('e2e4 d7d5 g1f3 b8c6 f1e2 c8f5 e1g1 d8d6 d2d3 e8c8'), result: null },
  { name: 'en-passant', moves: list('e2e4 a7a6 e4e5 d7d5 e5d6 h7h5 a2a3 h5h4 g2g4 h4g3'), result: null },
  { name: 'underpromotion', moves: list('h2h4 g7g5 h4g5 h7h6 g5h6 e7e6 h6h7 d8e7 h7g8n'), result: null },
  { name: 'promotion', moves: list('h2h4 g7g5 h4g5 g8f6 g5g6 e7e6 g6g7 d8e7 g7g8q'), result: null },
  {
    name: 'stalemate',
    moves: list('e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6'),
    result: { reason: 'stalemate' },
  },
  { name: 'threefold', moves: list('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8'), result: { reason: 'threefold' } },
];

export const REFUSALS: Refusal[] = [
  { name: 'castling out of check', moves: list('e2e4 d7d5 e4d5 d8d5 g1f3 d5e5 f1e2 e5e2'), refused: 'e1g1' },
  { name: 'castling through an attacked square', moves: list('e2e4 b7b6 g2g3 c8a6 f1g2 e7e6 g1f3 d7d6'), refused: 'e1g1' },
  { name: 'castling after the king has moved', moves: list('e2e4 e7e5 g1f3 g8f6 f1e2 f8e7 e1f1 e8f8 f1e1 f8e8'), refused: 'e1g1' },
  { name: 'en passant one move late', moves: list('e2e4 a7a6 e4e5 d7d5 a2a3 a6a5'), refused: 'e5d6' },
  { name: 'moving a pinned piece', moves: list('e2e4 e7e5 b1c3 f8b4 d2d3 g8f6'), refused: 'c3d5' },
  { name: 'a pawn on the last rank without a piece', moves: list('h2h4 g7g5 h4g5 g8f6 g5g6 e7e6 g6g7 d8e7'), refused: 'g7g8' },
];

/** Plays coordinate-form moves on `chess`. Throws on an illegal one, as chess.js does. */
export function playMoves(chess: Chess, moves: string[]): void {
  for (const move of moves) chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
}
