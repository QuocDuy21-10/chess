import { applyStep } from '@/game/position';
import { squareToWorld } from '@/game/squares';
import type { Piece, PieceId, Step } from '@/game/types';
import type { ActorHandle } from './actors';
import { STAND_OFF, TIMING } from './theme';
import { tween } from './tween';

export interface SequencerDeps {
  actors: Map<PieceId, ActorHandle>;
  getPieces: () => Piece[];
  setPieces: (pieces: Piece[]) => void;
  wait?: (ms: number) => Promise<void>;
}

/** Plays steps one after another. Each step's effect lands after its animation ends. */
export async function runSteps(steps: Step[], deps: SequencerDeps): Promise<void> {
  for (const step of steps) {
    await animate(step, deps);
    deps.setPieces(applyStep(deps.getPieces(), step));
  }
}

async function animate(step: Step, { actors, getPieces, wait = (ms) => tween(ms, () => {}) }: SequencerDeps) {
  if (step.kind === 'walk' || step.kind === 'hop') {
    await actors.get(step.piece)?.moveTo(squareToWorld(step.to), step.kind);
    return;
  }
  if (step.kind === 'combat') {
    const attacker = actors.get(step.attacker);
    const defender = actors.get(step.defender);
    const attackerPiece = getPieces().find((p) => p.id === step.attacker);
    const defenderPiece = getPieces().find((p) => p.id === step.defender);
    if (!attacker || !defender || !attackerPiece || !defenderPiece) return;

    const origin = squareToWorld(attackerPiece.square);
    const target = squareToWorld(defenderPiece.square);
    const standOff = target.clone().add(origin.sub(target).normalize().multiplyScalar(STAND_OFF));

    await attacker.moveTo(standOff, attackerPiece.type === 'n' ? 'hop' : 'walk');
    attacker.face(target);
    defender.face(standOff);
    const attack = attacker.play('attack');
    await wait(TIMING.attackMs * TIMING.impactAt);
    await Promise.all([attack, defender.play('die')]);
  }
  // 'promote' has no sequenced animation: the piece pops when its type changes
}
