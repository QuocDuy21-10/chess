import { gameResult, type Result } from '@chess/shared/result';
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { create } from 'zustand';
import { duck, fadeMusic, play } from '@/audio/audio';
import { planMove } from '@/game/planMove';
import { applyStep, matchesBoard, piecesFromBoard } from '@/game/position';
import { squareToWorld } from '@/game/squares';
import type { Piece, PromotionPiece } from '@/game/types';
import { actors } from '@/scene/actors';
import { cameraRig } from '@/scene/cameraHandle';
import { runSteps } from '@/scene/sequencer';
import { CAMERA } from '@/scene/theme';

type Phase = 'idle' | 'animating' | 'promoting' | 'gameOver';

/** Who plays the other army: this device too, the server, or the computer. */
export type Mode = 'local' | 'online' | 'computer';

interface GameState {
  pieces: Piece[];
  selected: Square | null;
  targets: Move[]; // legal moves from the selected square
  phase: Phase;
  pendingPromotion: { from: Square; to: Square } | null;
  history: string[]; // SAN
  snapshots: Piece[][]; // `pieces` as they stood before each move; same length as `history`
  lastMove: { from: Square; to: Square } | null;
  turn: Color;
  inCheck: boolean;
  result: Result | null;
  cinematic: boolean; // letterbox bars are showing
  gameId: number; // changes on every new game
  seat: Color | null; // online: the army played on this device. null: both armies are played here
  send: ((move: string) => void) | null; // online: hands a move made here to the server; null while it is out of reach
  mode: Mode; // set together with `seat` by whoever drives the other army
  select(square: Square | null): void;
  /** `remote` marks a move that came from the server, which is not sent back to it. */
  submitMove(from: Square, to: Square, promotion?: PromotionPiece, remote?: boolean): Promise<void>;
  submitText(text: string): boolean;
  choosePromotion(piece: PromotionPiece): void;
  cancelPromotion(): void;
  /** Takes back `undoPlies` moves at once. The board jumps to the earlier position; nothing is animated. */
  undo(): void;
  newGame(): void;
  /** Online: brings the board to the server's move list, given in coordinate form ("e2e4"). */
  sync(moves: string[]): Promise<void>;
  /** Online: ends the game with a result only the server can know, a flag or a resignation. */
  finish(result: Result): void;
}

/** Online, a device plays one army: on its turn, and only while the server can be reached. */
export const isLocked = (s: Pick<GameState, 'seat' | 'send' | 'turn'>) =>
  s.seat !== null && (!s.send || s.turn !== s.seat);

/** Against the computer: how many moves one Undo takes back, so that it is the player's turn again in the
 *  position before their last move. 0 when the player has not moved yet. */
export function pliesToUndo(length: number, turn: Color, seat: Color): number {
  if (turn !== seat) return Math.min(length, 1); // the machine is to move only after the player ended the game
  return length >= 2 ? 2 : 0;
}

/** How many moves Undo would take back now; 0 when it is not available. */
export function undoPlies(s: Pick<GameState, 'mode' | 'phase' | 'snapshots' | 'turn' | 'seat' | 'result'>): number {
  if (s.mode === 'online' || (s.phase !== 'idle' && s.phase !== 'gameOver')) return 0; // a move made online stands
  if (s.mode === 'local' || !s.seat) return Math.min(s.snapshots.length, 1);
  if (s.result?.reason === 'timeout') return 0; // the clock is at zero: taking moves back would not restart it
  if (s.phase === 'idle' && s.turn !== s.seat) return 0; // the machine is thinking
  return pliesToUndo(s.snapshots.length, s.turn, s.seat);
}

// chess.js is the single source of truth for rules and position.
const chess = new Chess();

/** The moves so far in coordinate form ("e2e4", "e7e8q"), as the server and the engine speak them. */
export const moveList = () => chess.history({ verbose: true }).map((m) => m.lan);

let inFlight: Promise<void> = Promise.resolve(); // the move being animated; already settled when there is none
let latest: string[] = []; // the newest move list the server has sent
let syncing: Promise<void> | null = null; // the sync that is running, if any

const fresh = () => ({
  pieces: piecesFromBoard(chess),
  selected: null,
  targets: [],
  phase: 'idle' as Phase,
  pendingPromotion: null,
  history: [],
  snapshots: [] as Piece[][],
  lastMove: null,
  turn: 'w' as Color,
  inCheck: false,
  result: null as Result | null,
  cinematic: false,
});

export const useGame = create<GameState>((set, get) => ({
  ...fresh(),
  gameId: 0,
  seat: null,
  send: null,
  mode: 'local',

  select(square) {
    if (get().phase !== 'idle' || isLocked(get())) return;
    const { selected, targets } = get();
    if (square && selected && targets.some((m) => m.to === square)) {
      if (targets.some((m) => m.to === square && m.promotion)) {
        set({ phase: 'promoting', pendingPromotion: { from: selected, to: square }, selected: null, targets: [] });
      } else {
        void get().submitMove(selected, square);
      }
      return;
    }
    // empty squares and the opponent's pieces have no legal moves, so they clear the selection
    const moves = square ? chess.moves({ square, verbose: true }) : [];
    if (moves.length) play('select');
    set(moves.length ? { selected: square, targets: moves } : { selected: null, targets: [] });
  },

  async submitMove(from, to, promotion, remote = false) {
    const { phase } = get();
    if (phase !== 'idle' && phase !== 'promoting') return;
    let move: Move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return; // illegal move: ignore
    }
    // The move is shown at once and sent at the same time; it does not wait for the server's answer.
    if (!remote) get().send?.(move.lan);
    inFlight = animate(move);
    await inFlight;
  },

  submitText(text) {
    if (get().phase !== 'idle' || isLocked(get())) return false;
    const typed = text.trim();
    const bare = (san: string) => san.replace(/[+#]/g, '');
    const move = chess
      .moves({ verbose: true })
      .find((m) => bare(m.san) === bare(typed) || m.lan === typed.toLowerCase());
    if (!move) return false;
    void get().submitMove(move.from, move.to, move.promotion as PromotionPiece | undefined);
    return true;
  },

  choosePromotion(piece) {
    const pending = get().pendingPromotion;
    if (pending && !isLocked(get())) void get().submitMove(pending.from, pending.to, piece);
  },

  cancelPromotion() {
    if (get().phase === 'promoting') set({ phase: 'idle', pendingPromotion: null });
  },

  undo() {
    const n = undoPlies(get());
    if (!n) return;
    const { phase, snapshots } = get();
    for (let i = 0; i < n; i++) chess.undo();
    if (phase === 'gameOver') fadeMusic(1, 800);
    play('select');
    const last = chess.history({ verbose: true }).at(-1);
    set({
      pieces: snapshots.at(-n)!, // the snapshot keeps every piece id, so no actor is rebuilt needlessly
      snapshots: snapshots.slice(0, -n),
      selected: null,
      targets: [],
      phase: 'idle',
      history: chess.history(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      turn: chess.turn(),
      inCheck: chess.inCheck(),
      result: null,
    });
  },

  newGame() {
    if (get().phase === 'animating') return;
    chess.reset();
    fadeMusic(1, 800);
    set({ ...fresh(), gameId: get().gameId + 1 });
  },

  sync(moves) {
    latest = moves;
    // One sync runs at a time. A list that arrives while it waits replaces the one it will use.
    syncing ??= (async () => {
      try {
        for (;;) {
          await inFlight;
          const local = moveList();
          const target = latest;
          const agrees = local.every((lan, i) => lan === target[i]);
          if (agrees && target.length === local.length) return;
          if (agrees && target.length === local.length + 1 && get().phase === 'idle') {
            const next = target[local.length];
            const [from, to] = [next.slice(0, 2), next.slice(2, 4)] as Square[];
            await get().submitMove(from, to, next[4] as PromotionPiece | undefined, true);
            if (chess.history().length > local.length) continue; // played; look again for a newer list
          }
          rebuild(target);
          return;
        }
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  },

  finish(result) {
    if (get().result) return;
    play('gameover');
    fadeMusic(0.2, 1500);
    set({ phase: 'gameOver', result, selected: null, targets: [], pendingPromotion: null });
  },
}));

const { getState: get, setState: set } = useGame;

/** Plays a move chess.js has already accepted: runs its steps, then publishes the new position. */
async function animate(move: Move) {
  const steps = planMove(move, get().pieces);
  set({
    phase: 'animating',
    selected: null,
    targets: [],
    pendingPromotion: null,
    snapshots: [...get().snapshots, get().pieces],
  });
  await runSteps(steps, {
    actors,
    getPieces: () => get().pieces,
    setPieces: (pieces) => set({ pieces }),
    sound: play,
    camera: {
      focus(a, b) {
        set({ cinematic: true });
        duck(true);
        return cameraRig.focus(a, b);
      },
      reset() {
        set({ cinematic: false });
        duck(false);
        return cameraRig.reset();
      },
    },
  });
  if (!matchesBoard(get().pieces, chess)) {
    console.error('View out of sync with chess.js after', move.san, '— resyncing');
    set({ pieces: piecesFromBoard(chess) });
  }
  const result = gameResult(chess);
  if (result) {
    play('gameover');
    fadeMusic(0.2, 1500);
    const king = get().pieces.find((p) => p.type === 'k' && p.color === chess.turn());
    if (chess.isCheckmate() && king) {
      // hold on the mated king before the result is announced
      const at = squareToWorld(king.square);
      set({ cinematic: true });
      await cameraRig.focus(at, at, CAMERA.checkmateMs);
      set({ cinematic: false });
      void cameraRig.reset();
    }
  } else if (chess.inCheck()) {
    play('check');
  }
  set({
    phase: result ? 'gameOver' : 'idle',
    history: chess.history(),
    lastMove: { from: move.from, to: move.to },
    turn: chess.turn(),
    inCheck: chess.inCheck(),
    result,
  });
}

/** Puts the board in the position after `moves`, with no animation. Replaying every move keeps each piece's id. */
function rebuild(moves: string[]) {
  chess.reset();
  let pieces = piecesFromBoard(chess);
  let last: Move | undefined;
  for (const lan of moves) {
    last = chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    for (const step of planMove(last, pieces)) pieces = applyStep(pieces, step);
  }
  const result = gameResult(chess);
  set({
    ...fresh(),
    pieces,
    phase: result ? 'gameOver' : 'idle',
    history: chess.history(),
    lastMove: last ? { from: last.from, to: last.to } : null,
    turn: chess.turn(),
    inCheck: chess.inCheck(),
    result,
  });
}
