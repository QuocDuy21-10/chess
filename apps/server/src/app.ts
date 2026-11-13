import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TIME_CONTROLS } from '@chess/shared/protocol';
import { Server } from 'socket.io';
import { apiRoutes } from './api.ts';
import { authRoutes } from './auth.ts';
import type { Db } from './db.ts';
import { attachGame, userRoom, type GameServer } from './game.ts';
import { saveGame } from './games.ts';
import { createHttpApp } from './http.ts';
import type { Provider, ProviderName } from './providers.ts';
import { createSessions } from './sessions.ts';

const SESSION_SWEEP_MS = 60 * 60_000;

interface Options {
  db: Db;
  providers: Partial<Record<ProviderName, Provider>>;
  origins?: string[] | true; // the sites allowed to connect; any site when unset
  webUrl?: string; // where a sign-in returns to
  secure?: boolean; // Secure cookies; true in production
  now?: () => number;
  timeControls?: number[]; // minutes; tests pass a very short one to watch a flag fall
}

/** The game server: Express for HTTP, Socket.IO on the same port for the game. Call `listen` to start it. */
export function createApp({
  db,
  providers,
  origins = true,
  webUrl = 'http://localhost:3000',
  secure = false,
  now,
  timeControls = TIME_CONTROLS,
}: Options) {
  const sessions = createSessions(db, now);
  // Signing out closes every game connection of that account; `io` exists by the time anyone signs out.
  const onLogout = (userId: string) => io.in(userRoom(userId)).disconnectSockets(true);
  const auth = authRoutes({ db, sessions, providers, webUrl, secure, onLogout });
  // Socket.IO answers /socket.io/ on this server before Express sees the request.
  const http = createServer(createHttpApp(origins, [auth, apiRoutes({ db, sessions })]));
  const io: GameServer = new Server(http, {
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 10_000,
  });
  const saving = new Set<Promise<void>>(); // games being written; close() waits for them
  const game = attachGame(io, {
    sessions,
    now,
    timeControls,
    // Not awaited by the game: both players already have the result, whatever the database does.
    onGameOver(record) {
      const write = saveGame(db, record)
        .catch((error) => console.error(`Could not save the game in room ${record.roomId}:`, error))
        .finally(() => saving.delete(write));
      saving.add(write);
    },
  });
  const sweeper = setInterval(() => {
    sessions.sweep().catch((error) => console.error('Session sweep failed:', error));
  }, SESSION_SWEEP_MS);

  return {
    io,
    sessions,
    /** Starts listening. Resolves with the port, which matters when `port` is 0; rejects when it is taken. */
    listen: (port: number) =>
      new Promise<number>((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, () => {
          http.off('error', reject);
          resolve((http.address() as AddressInfo).port);
        });
      }),
    /**
     * Stops the timers, closes every connection and the HTTP server, and waits for games still being saved.
     * The database pool is the caller's, to end after this.
     */
    async close() {
      clearInterval(sweeper);
      game.close();
      await io.close();
      await Promise.all(saving);
    },
  };
}
