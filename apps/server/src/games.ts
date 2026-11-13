import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db.ts';
import { eloDelta } from './elo.ts';
import type { GameRecord } from './rooms.ts';
import { games, users } from './schema.ts';

/** Saves a finished game and moves both players' ratings by it, all or nothing. */
export async function saveGame(db: Db, game: GameRecord): Promise<void> {
  await db.transaction(async (tx) => {
    // Locked in id order, so two games ending at once for overlapping players wait for each other instead of
    // deadlocking, and neither rating update is lost.
    const rows = await tx
      .select({ id: users.id, rating: users.rating, gamesPlayed: users.gamesPlayed })
      .from(users)
      .where(inArray(users.id, [game.white.id, game.black.id]))
      .orderBy(users.id)
      .for('update');
    const white = rows.find((row) => row.id === game.white.id);
    const black = rows.find((row) => row.id === game.black.id);
    if (!white || !black) throw new Error(`room ${game.roomId}: a player no longer exists`);

    const { result } = game;
    const winner = 'winner' in result ? result.winner : null;
    const score = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
    const whiteDelta = eloDelta(white.rating, black.rating, white.gamesPlayed, score);
    const blackDelta = eloDelta(black.rating, white.rating, black.gamesPlayed, winner === 'b' ? 1 : winner === 'w' ? 0 : 0.5);

    await tx.insert(games).values({
      whiteId: white.id,
      blackId: black.id,
      minutes: game.minutes,
      winner,
      reason: result.reason,
      moves: game.moves,
      whiteRating: white.rating,
      blackRating: black.rating,
      whiteDelta,
      blackDelta,
      startedAt: new Date(game.startedAt),
      endedAt: new Date(game.endedAt), // millisecond precision: history's keyset relies on it
    });
    for (const [row, delta] of [[white, whiteDelta], [black, blackDelta]] as const) {
      await tx
        .update(users)
        .set({ rating: row.rating + delta, gamesPlayed: row.gamesPlayed + 1 })
        .where(eq(users.id, row.id));
    }
  });
}
