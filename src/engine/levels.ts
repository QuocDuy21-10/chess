import { TIME_CONTROLS } from '@/net/protocol';

export const LEVELS = ['beginner', 'easy', 'medium', 'hard'] as const;
export type Level = (typeof LEVELS)[number];

/** Minutes a side against the computer. 0: no clock. */
export const COMPUTER_TIMES = [0, ...TIME_CONTROLS];

export interface Search {
  skill: number; // Stockfish's own weakening, 0 to 20
  depth?: number; // plies; none: the time limit alone stops the search
  movetime: number; // milliseconds
}

// Starting values, tuned by playing. This table is the only place a level's strength is set.
const SEARCH: Record<Level, Search> = {
  beginner: { skill: 0, depth: 1, movetime: 200 },
  easy: { skill: 3, depth: 4, movetime: 500 },
  medium: { skill: 8, depth: 8, movetime: 1000 },
  hard: { skill: 20, movetime: 1500 },
};

/** Every reply waits at least this long from the start of the machine's turn, so it never feels instant. */
export const MIN_THINK_MS = 400;

/** The search for `level`. With a clock it takes at most a twentieth of the time left, so the machine does not flag. */
export function searchFor(level: Level, timeLeft?: number): Search {
  const search = SEARCH[level];
  if (timeLeft === undefined) return search;
  return { ...search, movetime: Math.max(50, Math.min(search.movetime, Math.floor(timeLeft / 20))) };
}
