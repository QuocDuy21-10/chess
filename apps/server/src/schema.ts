import type { Result } from '@chess/shared/result';
import { sql } from 'drizzle-orm';
import {
  char,
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// The database, table by table. After changing this file, run `npm run db:generate` and read the new migration.

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const moment = (name: string) => timestamp(name, { withTimezone: true });

// A Record, so a reason added to `Result` and forgotten here is a type error.
const REASONS: Record<Result['reason'], true> = {
  checkmate: true,
  timeout: true,
  resign: true,
  stalemate: true,
  insufficient: true,
  threefold: true,
  fifty: true,
  'timeout-insufficient': true,
};
const reasonList = sql.raw(
  Object.keys(REASONS)
    .map((reason) => `'${reason}'`)
    .join(', '),
);

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    displayName: varchar('display_name', { length: 32 }).notNull(),
    avatarUrl: text('avatar_url'),
    rating: integer().notNull().default(1500),
    gamesPlayed: integer('games_played').notNull().default(0),
    createdAt: moment('created_at').notNull().defaultNow(),
  },
  (t) => [check('users_display_name_length', sql`char_length(btrim(${t.displayName})) BETWEEN 1 AND 32`)],
);

/** One row per provider account. Never matched by email: see the spec's "Linking accounts". */
export const accounts = pgTable(
  'accounts',
  {
    provider: text().notNull(),
    providerUserId: text('provider_user_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    index('accounts_user_id').on(t.userId),
    check('accounts_provider', sql`${t.provider} IN ('google', 'github')`),
  ],
);

/** The cookie's token is never stored, only its SHA-256. */
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: bytea('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: moment('expires_at').notNull(),
    createdAt: moment('created_at').notNull().defaultNow(),
  },
  (t) => [index('sessions_user_id').on(t.userId)],
);

export const games = pgTable(
  'games',
  {
    id: uuid().primaryKey().defaultRandom(),
    whiteId: uuid('white_id')
      .notNull()
      .references(() => users.id),
    blackId: uuid('black_id')
      .notNull()
      .references(() => users.id),
    minutes: smallint().notNull(),
    winner: char({ length: 1 }), // 'w' or 'b'; null is a draw
    reason: text().notNull(),
    moves: text().array().notNull(),
    whiteRating: integer('white_rating').notNull(), // before the game
    blackRating: integer('black_rating').notNull(),
    whiteDelta: smallint('white_delta').notNull(),
    blackDelta: smallint('black_delta').notNull(),
    startedAt: moment('started_at').notNull(),
    endedAt: moment('ended_at').notNull(),
  },
  (t) => [
    index('games_white_history').on(t.whiteId, t.endedAt.desc(), t.id.desc()),
    index('games_black_history').on(t.blackId, t.endedAt.desc(), t.id.desc()),
    check('games_winner', sql`${t.winner} IN ('w', 'b')`),
    check('games_reason', sql`${t.reason} IN (${reasonList})`),
    check('games_two_players', sql`${t.whiteId} <> ${t.blackId}`),
  ],
);
