import type { Color } from 'chess.js';
import type { Result } from './result.ts';

// What the server's REST routes answer. Both ends import this file.

/** The signed-in player, as GET /me answers. */
export interface User {
  id: string;
  name: string;
  avatar: string | null;
  rating: number;
  gamesPlayed: number; // rated games
}

/** One finished game, from the player's side. */
export interface HistoryEntry {
  id: string;
  color: Color; // the army this player had
  opponent: { name: string; avatar: string | null };
  minutes: number;
  result: Result;
  ratingBefore: number;
  delta: number;
  endedAt: string; // ISO 8601
}

/** A page of GET /me/games. `next` is the `before` value for the following page, or null at the end. */
export interface HistoryPage {
  games: HistoryEntry[];
  next: string | null;
}
