import type { Chess, Color } from 'chess.js';

/** How a game ended. The interface turns it into words in the player's language. */
export type Result =
  | { reason: 'checkmate' | 'timeout' | 'resign'; winner: Color }
  | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' | 'timeout-insufficient' };

/** How the position on the board ended the game, or null while it goes on. */
export function gameResult(chess: Chess): Result | null {
  if (chess.isCheckmate()) return { reason: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isStalemate()) return { reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty' };
  return null;
}
