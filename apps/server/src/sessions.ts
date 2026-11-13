import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@chess/shared/account';
import { and, eq, gt, lte } from 'drizzle-orm';
import type { Db } from './db.ts';
import { sessions, users } from './schema.ts';

export const SESSION_MS = 30 * 24 * 60 * 60_000; // fixed from sign-in, not sliding

/** The table keeps only this, so a copy of it opens no session. */
const hash = (token: string) => createHash('sha256').update(token).digest();

/** Signed-in sessions. The token lives in the `sid` cookie; `now` is passed in so tests can move the clock. */
export function createSessions(db: Db, now: () => number = Date.now) {
  return {
    /** Opens a session for `userId`. Returns the token for the cookie. */
    async create(userId: string): Promise<string> {
      const token = randomBytes(32).toString('base64url');
      await db.insert(sessions).values({ tokenHash: hash(token), userId, expiresAt: new Date(now() + SESSION_MS) });
      return token;
    },

    /** The user a token belongs to, or null when it is unknown or expired. */
    async find(token: string): Promise<User | null> {
      const [user] = await db
        .select({
          id: users.id,
          name: users.displayName,
          avatar: users.avatarUrl,
          rating: users.rating,
          gamesPlayed: users.gamesPlayed,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, new Date(now()))));
      return user ?? null;
    },

    async remove(token: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, hash(token)));
    },

    /** Deletes every expired session. */
    async sweep(): Promise<void> {
      await db.delete(sessions).where(lte(sessions.expiresAt, new Date(now())));
    },
  };
}

export type Sessions = ReturnType<typeof createSessions>;
