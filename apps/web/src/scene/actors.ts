import type { Vector3 } from 'three';
import type { PieceId } from '@/game/types';

export interface ActorHandle {
  moveTo(point: Vector3, mode: 'walk' | 'hop'): Promise<void>;
  face(point: Vector3): void;
  play(clip: 'attack' | 'die'): Promise<void>;
}

/** Every mounted piece registers itself here so the sequencer can drive it. */
export const actors = new Map<PieceId, ActorHandle>();
