import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TIME_CONTROLS } from '@chess/shared/protocol';
import { Server } from 'socket.io';
import { attachGame, type GameServer } from './game.ts';
import { createHttpApp } from './http.ts';

interface Options {
  origin?: string; // the only origin allowed to connect; any origin when unset
  now?: () => number;
  timeControls?: number[]; // minutes; tests pass a very short one to watch a flag fall
}

/** The game server: Express for HTTP, Socket.IO on the same port for the game. Call `listen` to start it. */
export function createApp({ origin, now, timeControls = TIME_CONTROLS }: Options = {}) {
  // Socket.IO answers /socket.io/ on this server before Express sees the request.
  const http = createServer(createHttpApp());
  const io: GameServer = new Server(http, {
    cors: { origin: origin ?? true },
    maxHttpBufferSize: 10_000,
  });
  const game = attachGame(io, { now, timeControls });

  return {
    io,
    /** Starts listening. Resolves with the port, which matters when `port` is 0. */
    listen: (port: number) =>
      new Promise<number>((resolve) => http.listen(port, () => resolve((http.address() as AddressInfo).port))),
    /** Stops the timers and closes every connection and the HTTP server. */
    close() {
      game.close();
      return io.close();
    },
  };
}
