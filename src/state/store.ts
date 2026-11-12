import { Chess, type Color, type Move, type Square } from 'chess.js';
import { create } from 'zustand';
import { duck, fadeMusic, play } from '@/audio/audio';
import { planMove } from '@/game/planMove';
import { matchesBoard, piecesFromBoard } from '@/game/position';
import { squareToWorld } from '@/game/squares';
import type { Piece, PromotionPiece, Result } from '@/game/types';
import { actors } from '@/scene/actors';
import { cameraRig } from '@/scene/cameraHandle';
import { runSteps } from '@/scene/sequencer';
import { CAMERA } from '@/scene/theme';

type Phase = 'idle' | 'animating' | 'promoting' | 'gameOver';

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
  select(square: Square | null): void;
  submitMove(from: Square, to: Square, promotion?: PromotionPiece): Promise<void>;
  submitText(text: string): boolean;
  choosePromotion(piece: PromotionPiece): void;
  cancelPromotion(): void;
  undo(): void;
  newGame(): void;
}

// chess.js is the single source of truth for rules and position.
const chess = new Chess();

function gameResult(): Result | null {
  if (chess.isCheckmate()) return { reason: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isStalemate()) return { reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty' };
  return null;
}

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

  select(square) {
    if (get().phase !== 'idle') return;
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

  async submitMove(from, to, promotion) {
    const { phase } = get();
    if (phase !== 'idle' && phase !== 'promoting') return;
    let move: Move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return; // illegal move: ignore
    }
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
    const result = gameResult();
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
      lastMove: { from, to },
      turn: chess.turn(),
      inCheck: chess.inCheck(),
      result,
    });
  },

  submitText(text) {
    if (get().phase !== 'idle') return false;
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
    if (pending) void get().submitMove(pending.from, pending.to, piece);
  },

  cancelPromotion() {
    if (get().phase === 'promoting') set({ phase: 'idle', pendingPromotion: null });
  },

  /** Takes back one move by one side. The board jumps to the earlier position; nothing is animated. */
  undo() {
    const { phase, snapshots } = get();
    if ((phase !== 'idle' && phase !== 'gameOver') || !snapshots.length) return;
    chess.undo();
    if (phase === 'gameOver') fadeMusic(1, 800);
    play('select');
    const last = chess.history({ verbose: true }).at(-1);
    set({
      pieces: snapshots.at(-1)!, // the snapshot keeps every piece id, so no actor is rebuilt needlessly
      snapshots: snapshots.slice(0, -1),
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
}));
