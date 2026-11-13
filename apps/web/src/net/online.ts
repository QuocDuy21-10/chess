import type { ClientEvents, RoomState, ServerEvents } from '@chess/shared/protocol';
import type { Color } from 'chess.js';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';

// The connection to the game server. The interface reads `useOnline`; the board is driven through `useGame`.

export type OnlineError = 'not-found' | 'full' | 'busy' | 'unreachable' | 'replaced' | 'signed-out';

interface OnlineState {
  status: 'off' | 'connecting' | 'waiting' | 'playing'; // waiting: in a room, the opponent has not arrived
  roomId: string | null;
  clocks: Record<Color, number>; // milliseconds left when the server last spoke
  clocksAt: number; // performance.now() at that moment
  running: Color | null; // whose clock is running, by the server's move list
  connected: boolean; // the server has spoken on the current connection
  opponentOnline: boolean;
  error: OnlineError | null; // why the last room was left, when it was not the player's choice
  create(minutes: number): void;
  join(roomId: string): void;
  resign(): void;
  leave(): void;
}

const ACK_MS = 5000; // how long a move waits for the server's answer before it counts as lost

const idle = {
  status: 'off' as const,
  roomId: null,
  clocks: { w: 0, b: 0 },
  clocksAt: 0,
  running: null,
  connected: false,
  opponentOnline: false,
};

let socket: Socket<ServerEvents, ClientEvents> | null = null;
let moves: string[] = []; // the server's latest list: where the board returns when a move is refused

/** NEXT_PUBLIC_SERVER_URL, or port 3001 on the page's own host so a phone can reach a development server. */
export const serverUrl = () => process.env.NEXT_PUBLIC_SERVER_URL ?? `${location.protocol}//${location.hostname}:3001`;

function hangUp() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

export const useOnline = create<OnlineState>((set, get) => {
  /** Leaves the room for a fresh local game. `error` says why, when the player did not choose to. */
  function quit(error: OnlineError | null) {
    hangUp();
    moves = [];
    useGame.setState({ seat: null, send: null, mode: 'local' });
    // newGame() alone does nothing while a move is animating; sync([]) waits for that move first.
    void useGame
      .getState()
      .sync([])
      .then(() => useGame.getState().newGame());
    history.replaceState(null, '', location.pathname);
    set({ ...idle, error });
  }

  /** Hands a move made here to the server. Refused or lost, the board returns to the server's list. */
  function send(move: string) {
    socket?.timeout(ACK_MS).emit('move', move, (lost, reply) => {
      if (lost || 'error' in reply) void useGame.getState().sync(moves);
    });
  }

  function onState(state: RoomState) {
    if (get().status === 'connecting') {
      // The first word from this room: start from a clean board and make the page's address the invite link.
      useGame.getState().newGame();
      history.replaceState(null, '', `?room=${state.roomId}`);
    }
    moves = state.moves;
    useGame.setState({ seat: state.color, send: state.started ? send : null, mode: 'online' });
    set({
      status: state.started ? 'playing' : 'waiting',
      roomId: state.roomId,
      clocks: state.clocks,
      clocksAt: performance.now(),
      running: state.started && !state.result ? (state.moves.length % 2 ? 'b' : 'w') : null,
      connected: true,
      opponentOnline: state.opponentOnline,
    });
    void useGame
      .getState()
      .sync(state.moves)
      .then(() => {
        // Checkmate and draws are found by chess.js on this side; a flag or a resignation is not.
        if (state.result && get().roomId === state.roomId) useGame.getState().finish(state.result);
      });
  }

  /** Connects and enters `roomId`, or a new room with `minutes` a side when there is none yet. */
  function start(roomId: string | null, minutes: number) {
    hangUp();
    set({ ...idle, status: 'connecting', roomId, error: null });
    // withCredentials: the handshake carries the sid cookie, which is who this player is to the server.
    const opened: Socket<ServerEvents, ClientEvents> = io(serverUrl(), { withCredentials: true });
    socket = opened;
    const enter = (id: string) =>
      opened.emit('join', { roomId: id }, (reply) => {
        if ('error' in reply) quit(reply.error === 'full' ? 'full' : 'not-found');
      });
    // Runs on the first connection and again on every reconnection: joining is how a seat is reclaimed.
    opened.on('connect', () => {
      const id = get().roomId;
      if (id) return void enter(id);
      const color = useSettings.getState().side;
      opened.emit('create', { color, minutes }, (reply) => {
        if ('error' in reply) return quit(reply.error === 'busy' ? 'busy' : 'unreachable');
        set({ roomId: reply.roomId });
        enter(reply.roomId);
      });
    });
    opened.on('connect_error', (error) => {
      // No session (never signed in, signed out, or expired): socket.io does not retry this one.
      if (error.message === 'unauthorized') return quit('signed-out');
      if (get().status === 'connecting') quit('unreachable'); // mid-game, socket.io keeps trying by itself
    });
    opened.on('disconnect', (reason) => {
      set({ connected: false });
      useGame.setState({ send: null }); // locks the board until the server speaks again
      if (reason === 'io server disconnect') quit('replaced'); // the same player joined from another tab
    });
    opened.on('state', onState);
  }

  return {
    ...idle,
    error: null,
    create: (minutes) => start(null, minutes),
    join: (roomId) => start(roomId, 0),
    resign: () => void socket?.emit('resign', () => {}),
    leave: () => quit(null),
  };
});
