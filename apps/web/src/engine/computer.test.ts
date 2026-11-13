import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useComputer } from './computer';
import { MIN_THINK_MS, searchFor } from './levels';
import type { Engine } from './uci';

const game = () => useGame.getState();
const computer = () => useComputer.getState();

/** An engine whose searches wait until the test answers them. */
function fakeEngine() {
  const searches: { moves: string[]; resolve: (move: string) => void; reject: (error: Error) => void }[] = [];
  const engine = {
    start: vi.fn(() => Promise.resolve()),
    bestMove: vi.fn(
      (moves: string[]) => new Promise<string>((resolve, reject) => searches.push({ moves, resolve, reject })),
    ),
    stop: vi.fn(),
  } satisfies Engine;
  return { engine, searches };
}

/** Lets promises and the store's animations run until `condition` holds. */
async function until(condition: () => boolean) {
  for (let i = 0; i < 1000 && !condition(); i++) await Promise.resolve();
  expect(condition()).toBe(true);
}

/** The machine's latest search answers `move`; waits out the minimum think time and the animation. */
async function machinePlays(searches: ReturnType<typeof fakeEngine>['searches'], move: string) {
  const length = game().history.length;
  searches.at(-1)!.resolve(move);
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  await until(() => game().history.length === length + 1 && game().phase !== 'animating');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  useSettings.setState({ side: 'w', computerLevel: 'easy', computerMinutes: 0 });
  computer().setOnScreen(true);
});

afterEach(async () => {
  computer().stop();
  useComputer.setState({ error: null });
  await until(() => game().mode === 'local' && game().history.length === 0 && game().phase === 'idle');
  vi.useRealTimers();
});

test('the machine answers on its turn, and only then', async () => {
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  expect(game()).toMatchObject({ mode: 'computer', seat: 'w' });
  expect(engine.bestMove).not.toHaveBeenCalled(); // the player has White

  expect(game().submitText('e4')).toBe(true);
  await until(() => searches.length === 1);
  expect(engine.bestMove).toHaveBeenCalledWith(['e2e4'], searchFor('easy'));
  expect(computer().thinking).toBe(true);
  expect(game().submitText('d4')).toBe(false); // locked while the machine thinks

  searches[0].resolve('e7e5');
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS - 1);
  expect(game().history).toEqual(['e4']); // never an instant reply
  await vi.advanceTimersByTimeAsync(1);
  await until(() => game().history.length === 2 && game().phase === 'idle');
  expect(game().history).toEqual(['e4', 'e5']);
  expect(computer().thinking).toBe(false);
  expect(engine.bestMove).toHaveBeenCalledTimes(1);
});

test('as Black, the player waits for the machine to open', async () => {
  useSettings.setState({ side: 'b' });
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  await until(() => searches.length === 1);
  expect(searches[0].moves).toEqual([]);
  await machinePlays(searches, 'e2e4');
  expect(game().history).toEqual(['e4']);
});

test('an answer for a game that was restarted is dropped', async () => {
  useSettings.setState({ side: 'b' });
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  await until(() => searches.length === 1);
  game().newGame();
  searches[0].resolve('d2d4');
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  await until(() => searches.length === 2); // asked again, for the new game
  expect(game().history).toEqual([]);
  await machinePlays(searches, 'e2e4');
  expect(game().history).toEqual(['e4']);
});

test('nothing is searched or played while the board is off screen', async () => {
  useSettings.setState({ side: 'b' });
  const { engine, searches } = fakeEngine();
  computer().setOnScreen(false);
  await computer().start(engine);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(engine.bestMove).not.toHaveBeenCalled();

  computer().setOnScreen(true);
  await until(() => searches.length === 1);
  computer().setOnScreen(false); // paused while the machine thinks
  searches[0].resolve('e2e4');
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  expect(game().history).toEqual([]); // the answer waits

  computer().setOnScreen(true);
  await until(() => game().history.length === 1 && game().phase === 'idle');
  expect(game().history).toEqual(['e4']);
});

test('the clocks run for the side to move, and not during animations or pauses', async () => {
  useSettings.setState({ computerMinutes: 5 });
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  expect(computer()).toMatchObject({ running: 'w', clocks: { w: 300_000, b: 300_000 } });

  await vi.advanceTimersByTimeAsync(7_000);
  game().submitText('e4');
  expect(computer()).toMatchObject({ running: null, clocks: { w: 293_000, b: 300_000 } }); // the fight runs no clock

  await until(() => searches.length === 1);
  expect(computer().running).toBe('b');
  await vi.advanceTimersByTimeAsync(1_000);
  await machinePlays(searches, 'e7e5');
  // charged from the start of its turn to its move: the second waited, plus however far the fake timers ran on
  expect(computer().clocks.b).toBeLessThanOrEqual(299_000);
  expect(computer().clocks.b).toBeGreaterThanOrEqual(299_000 - MIN_THINK_MS);
  expect(computer().running).toBe('w');

  computer().setOnScreen(false);
  expect(computer().running).toBeNull();
  const paused = computer().clocks.w; // whatever ran before the pause; the pause itself charges nothing
  await vi.advanceTimersByTimeAsync(60_000);
  computer().setOnScreen(true);
  expect(computer()).toMatchObject({ running: 'w', clocks: { w: paused } });
});

test('a clock that runs out ends the game for the other side', async () => {
  useSettings.setState({ computerMinutes: 5 });
  const { engine } = fakeEngine();
  await computer().start(engine);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(game().result).toEqual({ reason: 'timeout', winner: 'b' });
  expect(computer()).toMatchObject({ running: null, clocks: { w: 0, b: 300_000 } });
});

test('with no clock, none runs', async () => {
  const { engine } = fakeEngine();
  await computer().start(engine);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(computer().running).toBeNull();
  expect(game().result).toBeNull();
});

test('an engine that will not start sends the player back with an error and a fresh local game', async () => {
  const { engine } = fakeEngine();
  engine.start.mockRejectedValue(new Error('no wasm'));
  await computer().start(engine);
  expect(computer()).toMatchObject({ active: false, error: 'engine' });
  expect(game()).toMatchObject({ mode: 'local', seat: null, send: null });
  expect(engine.stop).toHaveBeenCalled();
});

test('a move the board refuses counts as a broken engine', async () => {
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  game().submitText('e4');
  await until(() => searches.length === 1);
  searches[0].resolve('e2e4'); // e2 is empty now
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  await until(() => computer().error === 'engine');
  await until(() => game().history.length === 0);
});

test('stopping leaves the computer mode and shuts the engine down', async () => {
  const { engine } = fakeEngine();
  await computer().start(engine);
  computer().stop();
  expect(engine.stop).toHaveBeenCalled();
  expect(computer()).toMatchObject({ active: false, error: null, running: null });
  expect(game()).toMatchObject({ mode: 'local', seat: null });
});
