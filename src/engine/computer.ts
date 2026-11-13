import { Chess, type Color } from 'chess.js';
import { create } from 'zustand';
import { useSettings } from '@/state/settings';
import { moveList, useGame } from '@/state/store';
import { flagged, newClocks, runClock, timeLeft, type ClockState } from './clock';
import { MIN_THINK_MS, searchFor, type Level } from './levels';
import { createEngine, type Engine } from './uci';

// The computer opponent. Like the online connection, it plays the other army from outside the game store:
// it watches `useGame`, asks the engine on its turn, and plays the answer through `sync`. The interface
// reads `useComputer`.

interface ComputerState extends ClockState {
  active: boolean; // a game against the computer is on
  level: Level;
  minutes: number; // a side; 0: no clock
  thinking: boolean;
  onScreen: boolean; // the board is showing: not paused, not in the menu
  error: 'engine' | null; // why the last game against the computer ended, when the player did not choose to
  /** Starts a game against the computer with the level, time and army chosen in settings. */
  start(engine?: Engine): Promise<void>;
  /** Leaves it for a fresh local game. */
  stop(error?: 'engine'): void;
  setOnScreen(onScreen: boolean): void;
}

let engine: Engine | null = null;
let ready = false; // the engine has answered `isready`
let searchingOn: Engine | null = null; // the engine running a search; each runs one at a time
let reply: { gameId: number; moves: string[] } | null = null; // an answer waiting for the board to be on screen
let gameId = -1; // the store's game the clocks belong to
let flagTimer: ReturnType<typeof setTimeout> | undefined;

const off = { active: false, thinking: false, clocks: { w: 0, b: 0 }, clocksAt: 0, running: null };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when `moves` are legal from the first position. Keeps a broken engine from breaking the board. */
function legal(moves: string[]): boolean {
  const chess = new Chess();
  try {
    for (const lan of moves) chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    return true;
  } catch {
    return false;
  }
}

export const useComputer = create<ComputerState>((set, get) => {
  /** Whose clock should be running. Animations, pauses, the menu and the engine's download run none. */
  function clockFor(): Color | null {
    const { active, minutes, onScreen } = get();
    const g = useGame.getState();
    if (!active || !ready || !minutes || !onScreen || g.result) return null;
    return g.phase === 'idle' || g.phase === 'promoting' ? g.turn : null;
  }

  function armFlag() {
    clearTimeout(flagTimer);
    const { running } = get();
    if (running) flagTimer = setTimeout(checkFlag, timeLeft(get(), running, performance.now()));
  }

  function checkFlag() {
    const now = performance.now();
    const loser = flagged(get(), now);
    if (!loser) return armFlag();
    set(runClock(get(), null, now));
    useGame.getState().finish({ reason: 'timeout', winner: loser === 'w' ? 'b' : 'w' });
  }

  /** Brings everything up to date with the board: the clocks, a waiting answer, the machine's turn. */
  function update(): void {
    if (!get().active) return;
    const g = useGame.getState();
    const now = performance.now();
    if (g.gameId !== gameId) {
      gameId = g.gameId; // a new game: Start, Restart or New game
      reply = null;
      set(newClocks(get().minutes * 60_000, now));
    }
    const color = clockFor();
    if (color !== get().running) {
      set(runClock(get(), color, now));
      armFlag();
    }
    if (!get().onScreen) return;
    if (reply) return play();
    if (ready && searchingOn !== engine && g.phase === 'idle' && !g.result && g.turn !== g.seat) void think();
  }

  async function think() {
    const mine = engine!;
    const id = useGame.getState().gameId;
    const moves = moveList();
    const began = performance.now();
    const { level, minutes } = get();
    searchingOn = mine;
    set({ thinking: true });
    let move: string;
    try {
      const left = minutes ? timeLeft(get(), useGame.getState().turn, began) : undefined;
      move = await mine.bestMove(moves, searchFor(level, left));
      await wait(MIN_THINK_MS - (performance.now() - began));
    } catch {
      if (engine === mine) get().stop('engine');
      return;
    } finally {
      if (searchingOn === mine) searchingOn = null;
    }
    if (engine !== mine) return; // stopped meanwhile
    set({ thinking: false });
    reply = { gameId: id, moves: [...moves, move] };
    update();
  }

  function play(): void {
    const { gameId: id, moves } = reply!;
    reply = null;
    const g = useGame.getState();
    // An answer for a position that is gone (a new game, a flag) is dropped; update() asks again if needed.
    if (id !== g.gameId || g.result || moves.slice(0, -1).join() !== moveList().join()) return update();
    if (!legal(moves)) return get().stop('engine');
    void g.sync(moves);
  }

  /** Shuts the engine and the clocks down, without touching the board. */
  function halt() {
    engine?.stop();
    engine = null;
    ready = false;
    reply = null;
    gameId = -1;
    clearTimeout(flagTimer);
    set(off);
  }

  useGame.subscribe(update);

  return {
    ...off,
    level: 'easy',
    minutes: 0,
    onScreen: false,
    error: null,

    async start(next = createEngine()) {
      halt();
      const { computerLevel: level, computerMinutes: minutes, side } = useSettings.getState();
      engine = next;
      set({ active: true, level, minutes, error: null });
      // Nothing to send: the store's phase stops the player's clock. A function keeps `isLocked` open.
      useGame.setState({ mode: 'computer', seat: side, send: () => {} });
      useGame.getState().newGame(); // a new gameId: update() starts fresh clocks
      try {
        await next.start();
      } catch {
        if (engine === next) get().stop('engine');
        return;
      }
      if (engine !== next) return; // stopped while loading
      ready = true;
      update();
    },

    stop(error) {
      const wasActive = get().active;
      halt();
      set({ error: error ?? null });
      if (!wasActive) return;
      useGame.setState({ mode: 'local', seat: null, send: null });
      // newGame() alone does nothing while a move is animating; sync([]) waits for that move first.
      void useGame
        .getState()
        .sync([])
        .then(() => useGame.getState().newGame());
    },

    setOnScreen(onScreen) {
      set({ onScreen });
      update();
    },
  };
});
