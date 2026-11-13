import type { PieceSymbol } from 'chess.js';

/** Animation names in a model's file, one for each pose the actor plays. */
export interface Clips {
  idle: string;
  walk: string;
  attack: string;
  die: string;
}

/** Piece types drawn from a .glb model. A type not listed here uses its model built in code. */
export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>> = {};

/** A model is scaled to this height, in squares. */
export const HEIGHT: Record<PieceSymbol, number> = { p: 0.9, n: 1.2, b: 1.25, r: 1.3, q: 1.4, k: 1.55 };
