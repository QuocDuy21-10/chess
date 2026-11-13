import { expect, test } from 'vitest';
import { COMPUTER_TIMES, LEVELS, searchFor } from './levels';

test('each level runs its own search, weakest first', () => {
  expect(LEVELS.map((level) => searchFor(level))).toEqual([
    { skill: 0, depth: 1, movetime: 200 },
    { skill: 3, depth: 4, movetime: 500 },
    { skill: 8, depth: 8, movetime: 1000 },
    { skill: 20, movetime: 1500 },
  ]);
});

test('with a clock the machine spends at most a twentieth of its time, and never under 50 ms', () => {
  expect(searchFor('hard', 10 * 60_000).movetime).toBe(1500);
  expect(searchFor('hard', 10_000).movetime).toBe(500);
  expect(searchFor('beginner', 100).movetime).toBe(50);
  expect(searchFor('medium', 10_000)).toMatchObject({ skill: 8, depth: 8 });
});

test('the time choices are no clock and the online ones', () => {
  expect(COMPUTER_TIMES).toEqual([0, 5, 10, 30]);
});
