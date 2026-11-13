import type { Chess } from 'chess.js';
import type { Piece, Step } from './types';

export function piecesFromBoard(chess: Chess): Piece[] {
  return chess
    .board()
    .flat()
    .filter((cell) => cell !== null)
    .map(({ square, type, color }) => ({ id: `${color}-${type}-${square}`, type, color, square }));
}

export function applyStep(pieces: Piece[], step: Step): Piece[] {
  switch (step.kind) {
    case 'walk':
    case 'hop':
      return pieces.map((p) => (p.id === step.piece ? { ...p, square: step.to } : p));
    case 'combat':
      return pieces.filter((p) => p.id !== step.defender);
    case 'promote':
      return pieces.map((p) => (p.id === step.piece ? { ...p, type: step.to } : p));
  }
}

const key = (p: Pick<Piece, 'square' | 'color' | 'type'>) => `${p.square}${p.color}${p.type}`;

export function matchesBoard(pieces: Piece[], chess: Chess): boolean {
  return pieces.map(key).sort().join() === piecesFromBoard(chess).map(key).sort().join();
}
