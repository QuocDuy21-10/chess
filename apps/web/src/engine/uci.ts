import type { Search } from './levels';

// One Stockfish worker, spoken to in UCI: text commands in, text lines out. Knows nothing about the game.

export type WorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;

export interface Engine {
  /** Loads the engine and waits until it is ready. Rejects after 15 seconds. */
  start(): Promise<void>;
  /** The engine's move after `moves` (coordinate form, from the first position), e.g. "e7e5" or "a7a8q". */
  bestMove(moves: string[], search: Search): Promise<string>;
  /** Terminates the worker. Anything pending rejects. */
  stop(): void;
}

const START_MS = 15_000; // a slow download of the 1.2 MB engine fits in this
const MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
// Under /engine/, which next.config.ts caches as immutable: a new engine needs new file names (files.test.ts).
export const ENGINE_SCRIPT = '/engine/stockfish-19-lite-single.js';
export const ENGINE_WASM = '/engine/stockfish-19-lite-single.wasm'; // loaded by the worker from beside itself

export function createEngine(makeWorker: () => WorkerLike = () => new Worker(ENGINE_SCRIPT)): Engine {
  let worker: WorkerLike | null = null;
  // One request at a time: the line it waits for, and how to settle it.
  let waiting: { prefix: string; resolve: (line: string) => void; reject: (error: Error) => void } | null = null;

  function fail(error: Error) {
    const request = waiting;
    waiting = null;
    request?.reject(error);
  }

  /** Sends `commands`, then resolves with the first line the engine prints that starts with `prefix`. */
  function request(prefix: string, ...commands: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!worker) return reject(new Error('engine stopped'));
      waiting = { prefix, resolve, reject };
      for (const command of commands) worker.postMessage(command);
    });
  }

  function open() {
    const opened = makeWorker();
    opened.onmessage = (event) => {
      for (const line of String(event.data).split('\n')) {
        if (!waiting || !line.startsWith(waiting.prefix)) continue;
        const request = waiting;
        waiting = null;
        request.resolve(line);
      }
    };
    opened.onerror = () => fail(new Error('engine error'));
    worker = opened;
  }

  return {
    async start() {
      open();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('engine timeout')), START_MS);
      });
      try {
        await Promise.race([request('uciok', 'uci').then(() => request('readyok', 'isready')), late]);
      } finally {
        clearTimeout(timer);
      }
    },

    async bestMove(moves, { skill, depth, movetime }) {
      const line = await request(
        'bestmove',
        `setoption name Skill Level value ${skill}`,
        moves.length ? `position startpos moves ${moves.join(' ')}` : 'position startpos',
        `go ${depth ? `depth ${depth} ` : ''}movetime ${movetime}`,
      );
      const move = line.split(' ')[1];
      if (!MOVE.test(move)) throw new Error(`no move in "${line}"`);
      return move;
    },

    stop() {
      worker?.terminate();
      worker = null;
      fail(new Error('engine stopped'));
    },
  };
}
