import type { Color, PieceSymbol, Square } from 'chess.js';

export type PieceId = string; // from the starting square, e.g. "w-p-e2"; never changes

export interface Piece {
  id: PieceId;
  type: PieceSymbol;
  color: Color;
  square: Square;
}

export type PromotionPiece = 'n' | 'b' | 'r' | 'q';

export type Step =
  | { kind: 'walk'; piece: PieceId; to: Square }
  | { kind: 'hop'; piece: PieceId; to: Square }
  | { kind: 'combat'; attacker: PieceId; defender: PieceId }
  | { kind: 'promote'; piece: PieceId; to: PromotionPiece };

/** How a game ended. The interface turns it into words in the player's language. */
export type Result =
  | { reason: 'checkmate' | 'timeout' | 'resign'; winner: Color }
  | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' };
