import type { Point } from '@/game/types';

export interface CameraRigHandle {
  /** Glide in on the midpoint of two points. Locks manual camera control. */
  focus(a: Point, b: Point, ms?: number): Promise<void>;
  /** Glide back to the home view and unlock manual control. */
  reset(): Promise<void>;
  /** Descend from above to the home view. */
  intro(): Promise<void>;
}

const idle = () => Promise.resolve();

/** Filled in by <CameraRig> while the scene is mounted; does nothing otherwise. */
export const cameraRig: CameraRigHandle = { focus: idle, reset: idle, intro: idle };

export function setCameraRig(handle: CameraRigHandle | null): void {
  Object.assign(cameraRig, handle ?? { focus: idle, reset: idle, intro: idle });
}
