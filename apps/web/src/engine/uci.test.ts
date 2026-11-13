import { afterEach, expect, test, vi } from 'vitest';
import { createEngine, type WorkerLike } from './uci';

/** Stands in for the Stockfish worker: records what it is told and answers from a script. */
class FakeWorker {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  posted: string[] = [];
  terminated = false;
  constructor(private answer: (command: string) => string[] = stockfish) {}
  postMessage(command: string) {
    this.posted.push(command);
    for (const line of this.answer(command)) queueMicrotask(() => this.say(line));
  }
  terminate() {
    this.terminated = true;
  }
  say(line: string) {
    this.onmessage?.call(this as never, { data: line } as MessageEvent);
  }
  fail() {
    this.onerror?.call(this as never, {} as ErrorEvent);
  }
}

function stockfish(command: string): string[] {
  if (command === 'uci') return ['id name Stockfish 19', 'uciok'];
  if (command === 'isready') return ['readyok'];
  if (command.startsWith('go')) return ['info depth 1 score cp 20', 'bestmove e7e5 ponder g1f3'];
  return [];
}

function setup(answer?: (command: string) => string[]) {
  const worker = new FakeWorker(answer);
  return { worker, engine: createEngine(() => worker as unknown as WorkerLike) };
}

afterEach(() => void vi.useRealTimers());

test('start speaks UCI until the engine is ready', async () => {
  const { worker, engine } = setup();
  await engine.start();
  expect(worker.posted).toEqual(['uci', 'isready']);
});

test('a search sets the skill, the position and the limits, and answers with the best move', async () => {
  const { worker, engine } = setup();
  await engine.start();
  worker.posted = [];
  await expect(engine.bestMove(['e2e4'], { skill: 3, depth: 4, movetime: 500 })).resolves.toBe('e7e5');
  expect(worker.posted).toEqual([
    'setoption name Skill Level value 3',
    'position startpos moves e2e4',
    'go depth 4 movetime 500',
  ]);
});

test('from the first position there is no move list, and a level without a depth sends only the time', async () => {
  const { worker, engine } = setup();
  await engine.start();
  await engine.bestMove([], { skill: 20, movetime: 1500 });
  expect(worker.posted.slice(-2)).toEqual(['position startpos', 'go movetime 1500']);
});

test('a promotion comes back with its piece', async () => {
  const { engine } = setup((c) => (c.startsWith('go') ? ['bestmove a7a8q'] : stockfish(c)));
  await engine.start();
  await expect(engine.bestMove([], { skill: 0, movetime: 200 })).resolves.toBe('a7a8q');
});

test('an answer with no move rejects', async () => {
  const { engine } = setup((c) => (c.startsWith('go') ? ['bestmove (none)'] : stockfish(c)));
  await engine.start();
  await expect(engine.bestMove([], { skill: 0, movetime: 200 })).rejects.toThrow();
});

test('a worker error rejects what is pending', async () => {
  const { worker, engine } = setup((c) => (c.startsWith('go') ? [] : stockfish(c)));
  await engine.start();
  const search = engine.bestMove([], { skill: 0, movetime: 200 });
  worker.fail();
  await expect(search).rejects.toThrow();
});

test('an engine that never gets ready fails after 15 seconds', async () => {
  vi.useFakeTimers();
  const { engine } = setup(() => []);
  const started = expect(engine.start()).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(15_000);
  await started;
});

test('stop terminates the worker and rejects what is pending', async () => {
  const { worker, engine } = setup((c) => (c.startsWith('go') ? [] : stockfish(c)));
  await engine.start();
  const search = engine.bestMove([], { skill: 0, movetime: 200 });
  engine.stop();
  expect(worker.terminated).toBe(true);
  await expect(search).rejects.toThrow();
  await expect(engine.bestMove([], { skill: 0, movetime: 200 })).rejects.toThrow(); // and nothing after
});
