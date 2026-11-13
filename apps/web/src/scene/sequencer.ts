import type { Vector3 } from 'three';
import type { SoundName } from '@/audio/audio';
import { applyStep } from '@/game/position';
import { squareToWorld } from '@/game/squares';
import type { Piece, PieceId, Step } from '@/game/types';
import type { ActorHandle } from './actors';
import type { CameraRigHandle } from './cameraHandle';
import { STAND_OFF, TIMING, walkMs } from './theme';
import { tween } from './tween';

export interface SequencerDeps {
  actors: Map<PieceId, ActorHandle>;
  getPieces: () => Piece[];
  setPieces: (pieces: Piece[]) => void;
  wait?: (ms: number) => Promise<void>;
  sound?: (name: SoundName, delayMs?: number) => void;
  camera?: Pick<CameraRigHandle, 'focus' | 'reset'>;
}

/** Plays steps one after another. Each step's effect lands after its animation ends. */
export async function runSteps(steps: Step[], deps: SequencerDeps): Promise<void> {
  const offSquare = new Map<PieceId, Vector3>(); // where an attacker stands after a fight, short of its square
  for (const step of steps) {
    await animate(step, deps, offSquare);
    deps.setPieces(applyStep(deps.getPieces(), step));
  }
}

const STEPS_PER_SQUARE = 2;

/** Moves an actor and plays its footfalls, or its landing after a hop. */
async function move(
  actor: ActorHandle | undefined,
  from: Vector3,
  to: Vector3,
  mode: 'walk' | 'hop',
  sound: SequencerDeps['sound'],
) {
  if (mode === 'walk') {
    const distance = from.distanceTo(to);
    const count = Math.max(1, Math.round(distance * STEPS_PER_SQUARE));
    for (let i = 0; i < count; i++) sound?.('step', ((i + 0.5) / count) * walkMs(distance));
  }
  await actor?.moveTo(to, mode);
  if (mode === 'hop') sound?.('land');
}

async function animate(step: Step, deps: SequencerDeps, offSquare: Map<PieceId, Vector3>) {
  const { actors, getPieces, wait = (ms) => tween(ms, () => {}), sound, camera } = deps;
  const squareOf = (id: PieceId) => getPieces().find((p) => p.id === id)?.square;

  if (step.kind === 'walk' || step.kind === 'hop') {
    const square = squareOf(step.piece);
    const from = offSquare.get(step.piece) ?? (square && squareToWorld(square));
    offSquare.delete(step.piece);
    if (from) await move(actors.get(step.piece), from, squareToWorld(step.to), step.kind, sound);
    return;
  }
  if (step.kind === 'promote') {
    sound?.('promote'); // no sequenced animation: the piece pops when its type changes
    return;
  }

  const attacker = actors.get(step.attacker);
  const defender = actors.get(step.defender);
  const attackerPiece = getPieces().find((p) => p.id === step.attacker);
  const defenderPiece = getPieces().find((p) => p.id === step.defender);
  if (!attacker || !defender || !attackerPiece || !defenderPiece) return;

  const origin = squareToWorld(attackerPiece.square);
  const target = squareToWorld(defenderPiece.square);
  const standOff = target.clone().add(origin.clone().sub(target).normalize().multiplyScalar(STAND_OFF));

  offSquare.set(step.attacker, standOff);
  void camera?.focus(origin, target); // glides in while the attacker approaches
  await move(attacker, origin, standOff, attackerPiece.type === 'n' ? 'hop' : 'walk', sound);
  attacker.face(target);
  defender.face(standOff);
  sound?.('draw');
  const attack = attacker.play('attack');
  const impactMs = TIMING.attackMs * TIMING.impactAt;
  sound?.('hit', impactMs);
  await wait(impactMs);
  await Promise.all([attack, defender.play('die')]);
  sound?.('fall');
  void camera?.reset(); // glides out while the attacker steps in
}
