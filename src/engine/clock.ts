import type { Color } from 'chess.js';

// The clocks of a game against the computer. Pure: the time is passed in, so tests need no waiting.
// The shape is the one the HUD already reads from the online connection.

export interface ClockState {
  clocks: Record<Color, number>; // milliseconds left as of `clocksAt`
  clocksAt: number; // performance.now() when `clocks` was last brought up to date
  running: Color | null;
}

export const newClocks = (ms: number, now: number): ClockState => ({
  clocks: { w: ms, b: ms },
  clocksAt: now,
  running: null,
});

export function timeLeft(state: ClockState, color: Color, now: number): number {
  const used = color === state.running ? now - state.clocksAt : 0;
  return Math.max(0, state.clocks[color] - used);
}

/** Charges the running clock up to `now`, then lets `color` run, or none. */
export function runClock(state: ClockState, color: Color | null, now: number): ClockState {
  return { clocks: { w: timeLeft(state, 'w', now), b: timeLeft(state, 'b', now) }, clocksAt: now, running: color };
}

/** The army whose running clock has reached zero, if any. */
export const flagged = (state: ClockState, now: number): Color | null =>
  state.running && timeLeft(state, state.running, now) === 0 ? state.running : null;
