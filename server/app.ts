import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Color } from 'chess.js';
import { Server, type Socket } from 'socket.io';
import { TIME_CONTROLS, type ClientEvents, type ServerEvents } from '../src/net/protocol.ts';
import { createRooms } from './rooms.ts';

// What a well-formed request looks like. Nothing a client sends is used before it passes one of these.
const PLAYER = /^[\w-]{8,64}$/;
const ROOM = /^[\w-]{8}$/;
const MOVE = /^[a-h][1-8][a-h][1-8][nbrq]?$/;
const SWEEP_MS = 60_000;

/** The seat a connection holds. Empty until it joins a room. */
interface Seat {
  roomId?: string;
  color?: Color;
}
type GameSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, Seat>;

interface Options {
  origin?: string; // the only origin allowed to connect; any origin when unset
  now?: () => number;
  timeControls?: number[]; // minutes; tests pass a very short one to watch a flag fall
}

const matches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === 'string' && pattern.test(value);

/** The game server: Socket.IO in front of the rooms. Call `listen` to start it. */
export function createApp({ origin, now, timeControls = TIME_CONTROLS }: Options = {}) {
  const http = createServer();
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, Seat>(http, {
    cors: { origin: origin ?? true },
    maxHttpBufferSize: 10_000,
  });
  const rooms = createRooms(now);
  const seated = new Map<string, GameSocket>(); // "roomId:color" → the connection in that seat
  const flags = new Map<string, NodeJS.Timeout>(); // roomId → the timer that ends the game on time

  /** Tells both players where the room stands, and re-arms the timer for the running clock. */
  function broadcast(roomId: string) {
    for (const color of ['w', 'b'] as const) {
      const state = rooms.state(roomId, color);
      if (state) seated.get(`${roomId}:${color}`)?.emit('state', state);
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
    socket.data = {};
    if (!roomId || !color || seated.get(`${roomId}:${color}`) !== socket) return;
    seated.delete(`${roomId}:${color}`);
    rooms.leave(roomId, color);
    broadcast(roomId);
  }

  io.on('connection', (socket) => {
    socket.on('create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const { playerId, color, minutes } = Object(payload) as Record<string, unknown>;
      if (
        !matches(playerId, PLAYER) ||
        (color !== 'w' && color !== 'b') ||
        typeof minutes !== 'number' ||
        !timeControls.includes(minutes)
      ) {
        return ack({ error: 'bad-request' });
      }
      const roomId = rooms.create(playerId, color, minutes);
      ack(roomId ? { roomId } : { error: 'busy' });
    });

    socket.on('join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const { roomId, playerId } = Object(payload) as Record<string, unknown>;
      if (!matches(roomId, ROOM) || !matches(playerId, PLAYER)) return ack({ error: 'bad-request' });
      vacate(socket); // a connection sits in one room at a time
      const seat = rooms.join(roomId, playerId);
      if ('error' in seat) return ack(seat);
      const key = `${roomId}:${seat.color}`;
      const earlier = seated.get(key);
      if (earlier) {
        // The same player in a second tab: the newer connection takes the seat, which never goes offline.
        earlier.data = {};
        earlier.disconnect(true);
      }
      seated.set(key, socket);
      socket.data = { roomId, color: seat.color };
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
    }
  }, SWEEP_MS);

  return {
    io,
    /** Starts listening. Resolves with the port, which matters when `port` is 0. */
    listen: (port: number) =>
      new Promise<number>((resolve) => http.listen(port, () => resolve((http.address() as AddressInfo).port))),
    /** Stops the timers and closes every connection. */
    close() {
      clearInterval(sweeper);
      for (const timer of flags.values()) clearTimeout(timer);
      return io.close();
    },
  };
}
