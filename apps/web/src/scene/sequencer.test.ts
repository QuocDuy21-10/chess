import { GAMES, playMoves } from '@chess/shared/testing';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { expect, test } from 'vitest';
import { planMove } from '@/game/planMove';
import { matchesBoard, piecesFromBoard } from '@/game/position';
import type { Piece, PieceId, Step } from '@/game/types';
import type { ActorHandle } from './actors';
import { runSteps } from './sequencer';
import { TIMING, walkMs } from './theme';

// Fake actors that record when each animation starts and ends.
function setup(fen: string) {
  const log: string[] = [];
  let pieces: Piece[] = piecesFromBoard(new Chess(fen));
  const actors = new Map<PieceId, ActorHandle>();
  for (const { id } of pieces) {
    const record = async (what: string) => {
      log.push(`${id} ${what} start`);
      await Promise.resolve();
      log.push(`${id} ${what} end`);
    };
    actors.set(id, {
      moveTo: (_point, mode) => record(mode),
      face: () => void log.push(`${id} face`),
      play: (clip) => record(clip),
    });
  }
  const deps = {
    actors,
    getPieces: () => pieces,
    setPieces: (next: Piece[]) => {
      pieces = next;
      log.push('effect');
    },
    wait: () => Promise.resolve(),
  };
  return { log, deps, pieces: () => pieces };
}

test('a capture runs approach, fight, removal, then step-in, in that order', async () => {
  const { log, deps, pieces } = setup('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const steps: Step[] = [
    { kind: 'combat', attacker: 'w-p-e4', defender: 'b-p-d5' },
    { kind: 'walk', piece: 'w-p-e4', to: 'd5' },
  ];

  await runSteps(steps, deps);

  const at = (entry: string) => log.indexOf(entry);
  const effects = log.flatMap((entry, i) => (entry === 'effect' ? [i] : []));
  expect(effects).toHaveLength(2);
  // approach, then face each other, then fight
  expect(log.slice(0, 5)).toEqual([
    'w-p-e4 walk start',
    'w-p-e4 walk end',
    'w-p-e4 face',
    'b-p-d5 face',
    'w-p-e4 attack start',
  ]);
  expect(at('b-p-d5 die start')).toBeGreaterThan(at('w-p-e4 attack start'));
  // the defender is removed only after both clips have ended
  expect(effects[0]).toBeGreaterThan(at('w-p-e4 attack end'));
  expect(effects[0]).toBeGreaterThan(at('b-p-d5 die end'));
  // then the attacker steps in, and its square updates last
  expect(log.slice(effects[0] + 1)).toEqual(['w-p-e4 walk start', 'w-p-e4 walk end', 'effect']);
  expect(pieces().some((p) => p.id === 'b-p-d5')).toBe(false);
  expect(pieces().find((p) => p.id === 'w-p-e4')?.square).toBe('d5');
});

test('a knight approaches its victim by hopping', async () => {
  const { log, deps } = setup('rnbqkbnr/ppp1pppp/8/3p4/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 2');
  await runSteps([{ kind: 'combat', attacker: 'w-n-c3', defender: 'b-p-d5' }], deps);
  expect(log[0]).toBe('w-n-c3 hop start');
});

test('steps still apply their effects when no actor is mounted', async () => {
  const { deps, pieces } = setup('8/P7/8/8/8/8/8/k6K w - - 0 1');
  deps.actors.clear();
  await runSteps(
    [
      { kind: 'walk', piece: 'w-p-a7', to: 'a8' },
      { kind: 'promote', piece: 'w-p-a7', to: 'q' },
    ],
    deps,
  );
  expect(pieces().find((p) => p.id === 'w-p-a7')).toMatchObject({ square: 'a8', type: 'q' });
});

test('a capture is framed by the camera and scored with sound', async () => {
  const { log, deps } = setup('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const cues: string[] = [];
  await runSteps(
    [
      { kind: 'combat', attacker: 'w-p-e4', defender: 'b-p-d5' },
      { kind: 'walk', piece: 'w-p-e4', to: 'd5' },
    ],
    {
      ...deps,
      sound: (name, delayMs = 0) => void cues.push(`${name}@${Math.round(delayMs)}`),
      camera: {
        focus: async () => void cues.push('focus'),
        reset: async () => void cues.push('reset'),
      },
    },
  );
  // the stand-off point is ~0.71 squares away: one footfall. The step-in is 0.7 squares: one more.
  expect(cues.map((c) => c.split('@')[0])).toEqual(['focus', 'step', 'draw', 'hit', 'fall', 'reset', 'step']);
  expect(cues).toContain(`hit@${Math.round(TIMING.attackMs * TIMING.impactAt)}`);
  expect(log).toContain('w-p-e4 attack start'); // the actors still ran
});

test('a long walk has two footfalls per square, a hop lands once, a promotion chimes', async () => {
  const { deps } = setup('8/P7/8/8/8/8/1N6/k6K w - - 0 1');
  const cues: string[] = [];
  await runSteps(
    [
      { kind: 'walk', piece: 'w-k-h1', to: 'h4' },
      { kind: 'hop', piece: 'w-n-b2', to: 'c4' },
      { kind: 'promote', piece: 'w-p-a7', to: 'q' },
    ],
    { ...deps, sound: (name) => void cues.push(name) },
  );
  expect(cues).toEqual([...Array(6).fill('step'), 'land', 'promote']);
});

test('walks take at least the minimum time and scale with distance', () => {
  expect(walkMs(0.1)).toBe(TIMING.walkMinMs);
  expect(walkMs(6)).toBe(2000);
});

/** Plays `moves` from the start through planMove and runSteps; returns the log of the last move and the pieces. */
async function replay(moves: string[]) {
  const chess = new Chess();
  const { log, deps, pieces } = setup(DEFAULT_POSITION);
  let last: string[] = [];
  for (const text of moves) {
    const move = chess.move({ from: text.slice(0, 2), to: text.slice(2, 4), promotion: text[4] });
    const start = log.length;
    await runSteps(planMove(move, pieces()), deps);
    last = log.slice(start);
    expect(matchesBoard(pieces(), chess), text).toBe(true);
  }
  return { last, pieces: pieces() };
}

test.each(GAMES)('$name animated move by move leaves the pieces where chess.js has them', async ({ moves }) => {
  const { pieces } = await replay(moves);
  const ids = pieces.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length); // no piece lost or duplicated its id
  const board = new Chess();
  playMoves(board, moves);
  expect(matchesBoard(pieces, board)).toBe(true);
});

test('a castle walks the king before the rook hops', async () => {
  const { last } = await replay(GAMES.find((g) => g.name === 'castles')!.moves.slice(0, 7)); // up to e1g1
  expect(last.indexOf('w-k-e1 walk end')).toBeLessThan(last.indexOf('w-r-h1 hop start'));
});

test('en passant fights the pawn beside the target square, then steps in', async () => {
  const { last, pieces } = await replay(GAMES.find((g) => g.name === 'en-passant')!.moves.slice(0, 5)); // up to e5d6
  expect(last.indexOf('b-p-d7 die start')).toBeGreaterThan(-1);
  expect(last.lastIndexOf('w-p-e2 walk start')).toBeGreaterThan(last.indexOf('b-p-d7 die end'));
  expect(pieces.find((p) => p.id === 'w-p-e2')?.square).toBe('d6');
});

test('a capture that promotes fights, walks, then promotes, and the piece keeps its id', async () => {
  const { last, pieces } = await replay(GAMES.find((g) => g.name === 'underpromotion')!.moves);
  expect(last.indexOf('w-p-h2 attack start')).toBeGreaterThan(-1);
  expect(last.lastIndexOf('w-p-h2 walk end')).toBeGreaterThan(last.indexOf('b-n-g8 die end'));
  expect(pieces.find((p) => p.id === 'w-p-h2')).toMatchObject({ type: 'n', square: 'g8' });
});
