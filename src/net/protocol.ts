import type { Color } from 'chess.js';
import type { Result } from '../game/types';

// Everything the browser and the game server say to each other. Both ends import this file.

export const TIME_CONTROLS = [5, 10, 30]; // minutes for each side

/** What one player is told about their room. Sent in full after every change. */
export interface RoomState {
  roomId: string;
  color: Color; // the seat of the player this copy is sent to
  moves: string[]; // every move so far, in coordinate form: "e2e4", "e7e8q"
  started: boolean; // both seats are taken
  clocks: Record<Color, number>; // milliseconds left, as of sending
  result: Result | null;
  opponentOnline: boolean;
}

export type CreateAck = { roomId: string } | { error: 'busy' | 'bad-request' };
export type JoinAck = { ok: true } | { error: 'not-found' | 'full' | 'bad-request' };
export type MoveError = 'not-seated' | 'not-started' | 'over' | 'not-your-turn' | 'illegal' | 'bad-request';
export type MoveAck = { ok: true } | { error: MoveError };

export interface ClientEvents {
  create(payload: { playerId: string; color: Color; minutes: number }, ack: (reply: CreateAck) => void): void;
  join(payload: { roomId: string; playerId: string }, ack: (reply: JoinAck) => void): void;
  move(move: string, ack: (reply: MoveAck) => void): void;
  resign(ack: (reply: MoveAck) => void): void;
}

export interface ServerEvents {
  state(state: RoomState): void;
}
