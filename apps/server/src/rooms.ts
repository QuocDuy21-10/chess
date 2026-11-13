import { randomBytes } from 'node:crypto';
import type { MoveError, RoomState } from '@chess/shared/protocol';
import { gameResult, type Result } from '@chess/shared/result';
import { Chess, type Color } from 'chess.js';

const MAX_ROOMS = 1000;
const IDLE_MS = 10 * 60_000; // how long a room lives with nobody connected to it

interface Room {
  chess: Chess; // the position the server trusts
  moves: string[]; // coordinate form, as chess.js spells them
  seats: Record<Color, string | null>; // the playerId in each seat
  online: Record<Color, boolean>;
  left: Record<Color, number>; // milliseconds on each clock, as of `since`
  since: number | null; // when the running clock started; null while no clock runs
  result: Result | null;
  emptySince: number | null; // when the last player disconnected; null while someone is connected
}

const COLORS: Color[] = ['w', 'b'];
const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** The result when `flagged` runs out of time: a win for the other side, unless that side cannot mate. */
export function timeoutResult(chess: Chess, flagged: Color): Result {
  const winner = other(flagged);
  const pieces = chess
    .board()
    .flat()
    .filter((square) => square?.color === winner)
    .map((square) => square!.type);
  // shortcut: a king, or a king and one minor piece, stands for FIDE's "no legal sequence can mate";
  // upgrade if players report a draw that should have been a win.
  const cannotMate = pieces.length === 1 || (pieces.length === 2 && pieces.some((type) => type === 'b' || type === 'n'));
  return cannotMate ? { reason: 'timeout-insufficient' } : { reason: 'timeout', winner };
}

/** Every room on this server. Knows nothing about sockets. `now` is passed in so tests can move the clock. */
export function createRooms(now: () => number = Date.now) {
  const rooms = new Map<string, Room>();

  /** Ends the game on time if the running clock has reached zero. */
  function checkFlag(room: Room, at: number) {
    const turn = room.chess.turn();
    if (room.since === null || at - room.since < room.left[turn]) return;
    room.left[turn] = 0;
    room.since = null;
    room.result = timeoutResult(room.chess, turn);
  }

  /** Why nobody can act in this room right now, or null when the game is live. Charges nothing. */
  function closed(room: Room | undefined, at: number): MoveError | null {
    if (!room) return 'not-seated';
    if (!room.seats.w || !room.seats.b) return 'not-started';
    checkFlag(room, at);
    return room.result ? 'over' : null;
  }

  return {
    /** Makes a room with `playerId` in the `color` seat. Returns its id, or null when the server is full. */
    create(playerId: string, color: Color, minutes: number): string | null {
      if (rooms.size >= MAX_ROOMS) return null;
      const id = randomBytes(6).toString('base64url'); // 8 URL-safe characters
      const seats: Room['seats'] = { w: null, b: null };
      seats[color] = playerId;
      const ms = minutes * 60_000;
      rooms.set(id, {
        chess: new Chess(),
        moves: [],
        seats,
        online: { w: false, b: false },
        left: { w: ms, b: ms },
        since: null,
        result: null,
        emptySince: now(),
      });
      return id;
    },

    /** Seats a player: in their own seat if they hold one, otherwise in the free one. Marks them connected. */
    join(roomId: string, playerId: string): { color: Color } | { error: 'not-found' | 'full' } {
      const room = rooms.get(roomId);
      if (!room) return { error: 'not-found' };
      let color = COLORS.find((c) => room.seats[c] === playerId);
      if (!color) {
        color = COLORS.find((c) => room.seats[c] === null);
        if (!color) return { error: 'full' };
        room.seats[color] = playerId;
        room.since = now(); // the second player has arrived: the first army's clock starts
      }
      room.online[color] = true;
      room.emptySince = null;
      return { color };
    },

    /** The player in this seat lost their connection. They keep the seat. */
    leave(roomId: string, color: Color): void {
      const room = rooms.get(roomId);
      if (!room) return;
      room.online[color] = false;
      if (!room.online[other(color)]) room.emptySince = now();
    },

    /** Plays a move for the seat `color`. Returns why it was refused, or null when it was played. */
    move(roomId: string, color: Color, move: string): MoveError | null {
      const room = rooms.get(roomId);
      const at = now();
      const refused = closed(room, at);
      if (!room || refused) return refused;
      if (room.chess.turn() !== color) return 'not-your-turn';
      let played;
      try {
        played = room.chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      } catch {
        return 'illegal';
      }
      room.moves.push(played.lan);
      room.left[color] -= at - room.since!; // a live game always has a running clock
      room.result = gameResult(room.chess);
      room.since = room.result ? null : at; // the other clock starts, unless the move ended the game
      return null;
    },

    /** The seat `color` gives up. */
    resign(roomId: string, color: Color): MoveError | null {
      const room = rooms.get(roomId);
      const at = now();
      const refused = closed(room, at);
      if (!room || refused) return refused;
      room.left[room.chess.turn()] -= at - room.since!;
      room.since = null;
      room.result = { reason: 'resign', winner: other(color) };
      return null;
    },

    /** Ends the game on time if the running clock has reached zero. Called by the server's timer. */
    flag(roomId: string): void {
      const room = rooms.get(roomId);
      if (room) checkFlag(room, now());
    },

    /** Milliseconds until the running clock reaches zero, or null while no clock runs. */
    deadline(roomId: string): number | null {
      const room = rooms.get(roomId);
      if (!room || room.since === null) return null;
      return Math.max(0, room.left[room.chess.turn()] - (now() - room.since));
    },

    /** What the player in the seat `color` is told. Null when the room is gone. */
    state(roomId: string, color: Color): RoomState | null {
      const room = rooms.get(roomId);
      if (!room) return null;
      const clocks = { ...room.left };
      if (room.since !== null) {
        const turn = room.chess.turn();
        clocks[turn] = Math.max(0, clocks[turn] - (now() - room.since));
      }
      return {
        roomId,
        color,
        moves: [...room.moves],
        started: room.seats.w !== null && room.seats.b !== null,
        clocks,
        result: room.result,
        opponentOnline: room.online[other(color)],
      };
    },

    /** Deletes every room nobody has been connected to for ten minutes. Returns their ids. */
    sweep(): string[] {
      const gone: string[] = [];
      for (const [id, room] of rooms) {
        if (room.emptySince === null || now() - room.emptySince < IDLE_MS) continue;
        rooms.delete(id);
        gone.push(id);
      }
      return gone;
    },
  };
}

export type Rooms = ReturnType<typeof createRooms>;
