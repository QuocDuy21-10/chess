import type { PieceSymbol } from 'chess.js';

/** Animation names in a model's file, one for each pose the actor plays. */
export interface Clips {
  idle: string;
  walk: string;
  attack: string;
  hit?: string;
  die: string;
}

// scripts/blender/living_pieces.py names every model's clips the same way; character pieces (figure.py) add a hit.
const CLIPS: Clips = { idle: 'idle', walk: 'walk', attack: 'attack', die: 'die' };
export const CHARACTER: Clips = { ...CLIPS, hit: 'hit' };

/** Piece types drawn from a .glb model. A type not listed here uses its model built in code. */
export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>> = {
  p: { url: '/models/pawn-4.glb', clips: CHARACTER },
  n: { url: '/models/knight-2.glb', clips: CLIPS },
  b: { url: '/models/bishop-3.glb', clips: CLIPS },
  r: { url: '/models/rook-2.glb', clips: CLIPS },
  q: { url: '/models/queen-2.glb', clips: CLIPS },
  k: { url: '/models/king-3.glb', clips: CLIPS },
};

/** A model is scaled to this height, in squares. */
export const HEIGHT: Record<PieceSymbol, number> = { p: 0.9, n: 1.2, b: 1.25, r: 1.3, q: 1.4, k: 1.55 };
