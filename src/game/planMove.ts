import type { Move, Square } from 'chess.js';
import type { Piece, PieceId, PromotionPiece, Step } from './types';

/** Turns a chess.js move into animation steps. `pieces` is the position before the move. */
export function planMove(move: Move, pieces: Piece[]): Step[] {
  const at = (square: Square): PieceId => {
    const piece = pieces.find((p) => p.square === square);
    if (!piece) throw new Error(`planMove: no piece on ${square}`);
    return piece.id;
  };
  const mover = at(move.from);
  const rank = move.from[1];

  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    const [rookFrom, rookTo] = move.isKingsideCastle() ? ['h', 'f'] : ['a', 'd'];
    return [
      { kind: 'walk', piece: mover, to: move.to },
      // the rook hops because a straight walk would pass through the king
      { kind: 'hop', piece: at(`${rookFrom}${rank}` as Square), to: `${rookTo}${rank}` as Square },
    ];
  }

  const steps: Step[] = [];
  // `captured` rather than isCapture(): chess.js 1.4 reports isCapture() === false for en passant
  if (move.captured) {
    // en passant: the victim stands beside the target square, on the mover's rank
    const victim = move.isEnPassant() ? (`${move.to[0]}${rank}` as Square) : move.to;
    steps.push({ kind: 'combat', attacker: mover, defender: at(victim) });
    steps.push({ kind: 'walk', piece: mover, to: move.to });
  } else {
    steps.push(
      move.piece === 'n'
        ? { kind: 'hop', piece: mover, to: move.to }
        : { kind: 'walk', piece: mover, to: move.to },
    );
  }
  if (move.promotion) steps.push({ kind: 'promote', piece: mover, to: move.promotion as PromotionPiece });
  return steps;
}
