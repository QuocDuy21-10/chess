import type { Ref } from 'react';

/** What every piece model exposes so the actor can animate it. Each method sets a pose. */
export interface Rig {
  /** Locomotion pose. `phase` grows by 1 per square travelled; 0 is the rest pose. */
  stride(phase: number): void;
  /** Attack pose at progress t (0..1). Must be back at rest when t = 1. */
  attack(t: number): void;
  /** Death pose at progress t (0..1). t = 1 is the final pose; the piece is then removed. */
  die(t: number): void;
}

export interface PieceModelProps {
  color: string;
  ref: Ref<Rig>;
}

/** Linear interpolation through equally spaced keyframes: keys(0.5, 0, 1, 0) === 1. */
export function keys(t: number, ...values: number[]): number {
  const x = Math.min(Math.max(t, 0), 1) * (values.length - 1);
  const i = Math.min(Math.floor(x), values.length - 2);
  return values[i] + (values[i + 1] - values[i]) * (x - i);
}
