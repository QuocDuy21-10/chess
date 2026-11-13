import type { PieceId, Point } from '@/game/types';

export interface ActorHandle {
  moveTo(point: Point, mode: 'walk' | 'hop'): Promise<void>;
  face(point: Point): void;
  play(clip: 'attack' | 'die'): Promise<void>;
}

/** Every mounted piece registers itself here so the sequencer can drive it. */
export const actors = new Map<PieceId, ActorHandle>();
