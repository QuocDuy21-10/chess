import type { ClientEvents, ServerEvents } from '@chess/shared/protocol';
import type { Color } from 'chess.js';
import type { Server, Socket } from 'socket.io';
import { readCookie, SID } from './cookies.ts';
import { log } from './log.ts';
import { createRooms, type GameRecord, type SeatPlayer } from './rooms.ts';
import type { Sessions } from './sessions.ts';

// What a well-formed request looks like. Nothing a client sends is used before it passes one of these.
const ROOM = /^[\w-]{8}$/;
const MOVE = /^[a-h][1-8][a-h][1-8][nbrq]?$/;
const SWEEP_MS = 60_000;

/** Who is on a connection, set when it connects, and the seat it holds: empty until it joins a room. */
interface SocketData {
  user: SeatPlayer;
  roomId?: string;
  color?: Color;
}
export type GameServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

interface Options {
  sessions: Sessions;
  now?: () => number;
  timeControls: number[]; // minutes
  onGameOver?: (game: GameRecord) => void; // once per game, after both players have been told
}

/** The Socket.IO room every connection of one account is in, so signing out can close them all. */
export const userRoom = (userId: string) => `user:${userId}`;

const matches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === 'string' && pattern.test(value);

/** Puts the rooms behind `io`: answers every game event and keeps the flag timers. Call `close` to stop the timers. */
export function attachGame(io: GameServer, { sessions, now, timeControls, onGameOver }: Options) {
  const rooms = createRooms(now);
  const reported = new Set<string>(); // rooms whose finished game has gone to onGameOver
  const seated = new Map<string, GameSocket>(); // "roomId:color" → the connection in that seat
  const flags = new Map<string, NodeJS.Timeout>(); // roomId → the timer that ends the game on time

  /** Tells both players where the room stands, and re-arms the timer for the running clock. */
  function broadcast(roomId: string) {
    for (const color of ['w', 'b'] as const) {
      const state = rooms.state(roomId, color);
      if (state) seated.get(`${roomId}:${color}`)?.emit('state', state);
    }
    // A result reaches this point once, from a move, a resignation or the flag timer, whichever ended the game.
    const record = reported.has(roomId) ? null : rooms.record(roomId);
    if (record) {
      reported.add(roomId);
      onGameOver?.(record);
    }
    clearTimeout(flags.get(roomId));
    flags.delete(roomId);
    const ms = rooms.deadline(roomId);
    if (ms === null) return;
    flags.set(
      roomId,
      setTimeout(() => {
        rooms.flag(roomId);
        broadcast(roomId);
      }, ms),
    );
  }

  /** Takes a connection out of its seat. The player keeps the seat and can come back to it. */
  function vacate(socket: GameSocket) {
    const { roomId, color } = socket.data;
    socket.data.roomId = socket.data.color = undefined;
    if (!roomId || !color || seated.get(`${roomId}:${color}`) !== socket) return;
    seated.delete(`${roomId}:${color}`);
    rooms.leave(roomId, color);
    broadcast(roomId);
  }

  // A connection without a live session is refused before any event: online play needs an account.
  io.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, SID);
    try {
      const user = token ? await sessions.find(token) : null;
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = { id: user.id, name: user.name, rating: user.rating }; // as of connecting
      next();
    } catch (error) {
      log.error('Socket sign-in check failed', error);
      next(new Error('unavailable'));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(userRoom(socket.data.user.id));

    socket.on('create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const { color, minutes } = Object(payload) as Record<string, unknown>;
      if ((color !== 'w' && color !== 'b') || typeof minutes !== 'number' || !timeControls.includes(minutes)) {
        return ack({ error: 'bad-request' });
      }
      ack(rooms.create(socket.data.user, color, minutes));
    });

    socket.on('join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const { roomId } = Object(payload) as Record<string, unknown>;
      if (!matches(roomId, ROOM)) return ack({ error: 'bad-request' });
      vacate(socket); // a connection sits in one room at a time
      const seat = rooms.join(roomId, socket.data.user);
      if ('error' in seat) return ack(seat);
      const key = `${roomId}:${seat.color}`;
      const earlier = seated.get(key);
      if (earlier) {
        // The same account in a second tab: the newer connection takes the seat, which never goes offline.
        earlier.data.roomId = earlier.data.color = undefined;
        earlier.disconnect(true);
      }
      seated.set(key, socket);
      socket.data.roomId = roomId;
      socket.data.color = seat.color;
      ack({ ok: true });
      broadcast(roomId);
    });

    socket.on('move', (move, ack) => {
      if (typeof ack !== 'function') return;
      const { roomId, color } = socket.data;
      if (!roomId || !color) return ack({ error: 'not-seated' });
      if (!matches(move, MOVE)) return ack({ error: 'bad-request' });
      const error = rooms.move(roomId, color, move);
      ack(error ? { error } : { ok: true });
      broadcast(roomId); // also after a refusal: the refusal may be the flag falling
    });

    socket.on('resign', (ack) => {
      if (typeof ack !== 'function') return;
      const { roomId, color } = socket.data;
      if (!roomId || !color) return ack({ error: 'not-seated' });
      const error = rooms.resign(roomId, color);
      ack(error ? { error } : { ok: true });
      broadcast(roomId);
    });

    socket.on('disconnect', () => vacate(socket));
  });

  const sweeper = setInterval(() => {
    for (const roomId of rooms.sweep()) {
      clearTimeout(flags.get(roomId));
      flags.delete(roomId);
      reported.delete(roomId);
    }
  }, SWEEP_MS);

  return {
    /** Stops the timers. The connections are `io`'s to close. */
    close() {
      clearInterval(sweeper);
      for (const timer of flags.values()) clearTimeout(timer);
    },
  };
}
