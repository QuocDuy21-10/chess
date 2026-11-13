import type { Chess } from 'chess.js';
import type { Result } from './types';

/** How the position on the board ended the game, or null while it goes on. */
export function gameResult(chess: Chess): Result | null {
  if (chess.isCheckmate()) return { reason: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isStalemate()) return { reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty' };
  return null;
}
