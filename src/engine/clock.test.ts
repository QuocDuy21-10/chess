import { expect, test } from 'vitest';
import { flagged, newClocks, runClock, timeLeft } from './clock';

const MINUTE = 60_000;

test('new clocks are full and stopped', () => {
  const clocks = newClocks(5 * MINUTE, 100);
  expect(clocks).toEqual({ clocks: { w: 5 * MINUTE, b: 5 * MINUTE }, clocksAt: 100, running: null });
  expect(timeLeft(clocks, 'w', 9_999)).toBe(5 * MINUTE);
});

test('the running clock is charged the time it ran, and only that clock', () => {
  let clocks = runClock(newClocks(5 * MINUTE, 0), 'w', 1_000);
  expect(timeLeft(clocks, 'w', 8_000)).toBe(5 * MINUTE - 7_000);
  expect(timeLeft(clocks, 'b', 8_000)).toBe(5 * MINUTE);

  clocks = runClock(clocks, 'b', 8_000);
  expect(clocks).toEqual({ clocks: { w: 5 * MINUTE - 7_000, b: 5 * MINUTE }, clocksAt: 8_000, running: 'b' });

  clocks = runClock(clocks, null, 11_000);
  expect(clocks.clocks).toEqual({ w: 5 * MINUTE - 7_000, b: 5 * MINUTE - 3_000 });
  expect(timeLeft(clocks, 'b', 99_000)).toBe(5 * MINUTE - 3_000); // stopped: no longer charged
});

test('time left never goes below zero, and only a running clock at zero has flagged', () => {
  const clocks = runClock(newClocks(1_000, 0), 'b', 0);
  expect(flagged(clocks, 999)).toBeNull();
  expect(flagged(clocks, 1_000)).toBe('b');
  expect(timeLeft(clocks, 'b', 5_000)).toBe(0);
  expect(flagged(runClock(clocks, null, 5_000), 6_000)).toBeNull();
});
