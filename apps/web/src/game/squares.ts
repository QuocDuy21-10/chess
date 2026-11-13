import type { Square } from 'chess.js';
import type { Point } from './types';

// a1 is nearest the camera on the left: x = file - 3.5, z = 3.5 - rank (0-7 indices)
export const squareToWorld = (square: Square): Point => ({
  x: square.charCodeAt(0) - 97 - 3.5,
  y: 0,
  z: 3.5 - (Number(square[1]) - 1),
});

export const SQUARES = Array.from(
  { length: 64 },
  (_, i) => `${'abcdefgh'[i % 8]}${Math.floor(i / 8) + 1}` as Square,
);

// a1 is dark
export const isDark = (square: Square) => (square.charCodeAt(0) - 97 + Number(square[1]) - 1) % 2 === 0;
