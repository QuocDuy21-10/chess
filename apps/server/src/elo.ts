// Elo, as FIDE runs it: a new player's rating moves faster until it has settled.

const PROVISIONAL_GAMES = 30;
const NEW_K = 40;
const SETTLED_K = 20;

/** The points a player wins (or, negative, loses) in one game. `score`: 1 win, 0.5 draw, 0 loss. */
export function eloDelta(rating: number, opponent: number, gamesPlayed: number, score: 0 | 0.5 | 1): number {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  const k = gamesPlayed < PROVISIONAL_GAMES ? NEW_K : SETTLED_K;
  return Math.round(k * (score - expected));
}
