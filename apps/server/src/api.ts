import type { HistoryEntry, HistoryPage, User } from '@chess/shared/account';
import type { Result } from '@chess/shared/result';
import type { Color } from 'chess.js';
import { eq, sql } from 'drizzle-orm';
import { Router, type RequestHandler } from 'express';
import { readCookie, SID } from './cookies.ts';
import type { Db } from './db.ts';
import { users } from './schema.ts';
import type { Sessions } from './sessions.ts';

const PAGE = 20;
const NAME_LENGTH = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Puts the signed-in user in `res.locals.user`, or answers 401. */
function signedIn(sessions: Sessions): RequestHandler {
  return async (req, res, next) => {
    const token = readCookie(req.headers.cookie, SID);
    const user = token ? await sessions.find(token) : null;
    if (!user) return void res.status(401).json({ error: 'unauthorized' });
    res.locals.user = user;
    next();
  };
}

/** `before=<endedAt ISO>,<id>` from the previous page, or null for the first page. Undefined when malformed. */
function readCursor(value: unknown): { endedAt: Date; id: string } | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const comma = value.lastIndexOf(',');
  const endedAt = new Date(value.slice(0, comma));
  const id = value.slice(comma + 1);
  return comma > 0 && !Number.isNaN(endedAt.getTime()) && UUID.test(id) ? { endedAt, id } : undefined;
}

interface HistoryRow {
  id: string;
  color: Color;
  opponent_name: string;
  opponent_avatar: string | null;
  minutes: number;
  winner: Color | null;
  reason: Result['reason'];
  rating_before: number;
  delta: number;
  ended_at: Date;
}

/**
 * One page of a player's games, newest first. Each half of the UNION reads its own index, already in order;
 * `ended_at` always has millisecond precision (it is written from a JS Date), so the keyset is exact.
 */
export async function history(db: Db, userId: string, before: { endedAt: Date; id: string } | null): Promise<HistoryPage> {
  const after = before ? sql`AND (ended_at, id) < (${before.endedAt.toISOString()}::timestamptz, ${before.id}::uuid)` : sql``;
  const { rows } = await db.execute<HistoryRow & Record<string, unknown>>(sql`
    SELECT g.id, g.color, u.display_name AS opponent_name, u.avatar_url AS opponent_avatar, g.minutes, g.winner,
           g.reason, g.rating_before, g.delta, g.ended_at
    FROM (
      (SELECT id, 'w' AS color, black_id AS opponent_id, minutes, winner, reason,
              white_rating AS rating_before, white_delta AS delta, ended_at
       FROM games WHERE white_id = ${userId} ${after}
       ORDER BY ended_at DESC, id DESC LIMIT ${PAGE + 1})
      UNION ALL
      (SELECT id, 'b', white_id, minutes, winner, reason, black_rating, black_delta, ended_at
       FROM games WHERE black_id = ${userId} ${after}
       ORDER BY ended_at DESC, id DESC LIMIT ${PAGE + 1})
    ) g
    JOIN users u ON u.id = g.opponent_id
    ORDER BY g.ended_at DESC, g.id DESC
    LIMIT ${PAGE + 1}`);
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  return {
    games: page.map(
      (row): HistoryEntry => ({
        id: row.id,
        color: row.color,
        opponent: { name: row.opponent_name, avatar: row.opponent_avatar },
        minutes: row.minutes,
        result: (row.winner ? { reason: row.reason, winner: row.winner } : { reason: row.reason }) as Result,
        ratingBefore: row.rating_before,
        delta: row.delta,
        endedAt: new Date(row.ended_at).toISOString(),
      }),
    ),
    next: rows.length > PAGE && last ? `${new Date(last.ended_at).toISOString()},${last.id}` : null,
  };
}

/** /me: the signed-in player's profile and games. */
export function apiRoutes({ db, sessions }: { db: Db; sessions: Sessions }) {
  const router = Router();
  router.use('/me', signedIn(sessions));

  router.get('/me', (_req, res) => {
    res.json(res.locals.user satisfies User);
  });

  router.patch('/me', async (req, res) => {
    const raw: unknown = req.body?.name;
    const name = typeof raw === 'string' ? raw.trim() : '';
    const length = Array.from(name).length; // characters, as Postgres counts them
    if (length < 1 || length > NAME_LENGTH) return void res.status(400).json({ error: 'bad-request' });
    const user = res.locals.user as User;
    await db.update(users).set({ displayName: name }).where(eq(users.id, user.id));
    res.json({ ...user, name } satisfies User);
  });

  router.get('/me/games', async (req, res) => {
    const before = readCursor(req.query.before);
    if (before === undefined) return void res.status(400).json({ error: 'bad-request' });
    res.json(await history(db, (res.locals.user as User).id, before));
  });

  return router;
}
