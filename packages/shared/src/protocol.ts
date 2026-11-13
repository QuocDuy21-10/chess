import type { Color } from 'chess.js';
import type { Result } from './result.ts';

// Everything the browser and the game server say to each other. Both ends import this file.

export const TIME_CONTROLS = [5, 10, 30]; // minutes for each side

/** A seated player, as both players see them. */
export interface Player {
  name: string;
  rating: number;
}

/** What one player is told about their room. Sent in full after every change. */
export interface RoomState {
  roomId: string;
  color: Color; // the seat of the player this copy is sent to
  moves: string[]; // every move so far, in coordinate form: "e2e4", "e7e8q"
  started: boolean; // both seats are taken
  clocks: Record<Color, number>; // milliseconds left, as of sending
  result: Result | null;
  opponentOnline: boolean;
  players: Record<Color, Player | null>; // null while a seat is empty
}

export type CreateAck = { roomId: string } | { error: 'busy' | 'too-many-rooms' | 'rate-limited' | 'bad-request' };
export type JoinAck = { ok: true } | { error: 'not-found' | 'full' | 'rate-limited' | 'bad-request' };
export type MoveError = 'not-seated' | 'not-started' | 'over' | 'not-your-turn' | 'illegal' | 'rate-limited' | 'bad-request';
export type MoveAck = { ok: true } | { error: MoveError };

// Who sends an event is the account behind the connection's sid cookie, checked when it connects.
export interface ClientEvents {
  create(payload: { color: Color; minutes: number }, ack: (reply: CreateAck) => void): void;
  join(payload: { roomId: string }, ack: (reply: JoinAck) => void): void;
  move(move: string, ack: (reply: MoveAck) => void): void;
  resign(ack: (reply: MoveAck) => void): void;
}

export interface ServerEvents {
  state(state: RoomState): void;
}
