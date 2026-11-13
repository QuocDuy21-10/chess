import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Group, Vector3 } from 'three';
import { squareToWorld } from '@/game/squares';
import type { Piece } from '@/game/types';
import { useGame } from '@/state/store';
import { actors, type ActorHandle } from './actors';
import { Bishop } from './pieces/Bishop';
import { King } from './pieces/King';
import { Knight } from './pieces/Knight';
import { Pawn } from './pieces/Pawn';
import { Queen } from './pieces/Queen';
import type { Rig } from './pieces/rig';
import { Rook } from './pieces/Rook';
import { TEAM, TIMING, walkMs } from './theme';
import { tween } from './tween';

const MODELS = { p: Pawn, n: Knight, b: Bishop, r: Rook, q: Queen, k: King };

/** One piece on the board. Owns its position and facing, and registers itself as an actor. */
export function PieceActor({ piece }: { piece: Piece }) {
  const group = useRef<Group>(null!); // position and facing
  const model = useRef<Group>(null!); // promotion pop and idle breathing
  const rig = useRef<Rig>(null!);
  const select = useGame((s) => s.select);
  const home = piece.color === 'w' ? Math.PI : 0; // models face +z; the first army faces -z

  // The refs are null once the piece is unmounted, so every tween callback guards against that.
  const turnTo = (angle: number) => {
    const from = group.current.rotation.y;
    const delta = Math.atan2(Math.sin(angle - from), Math.cos(angle - from)); // shortest way round
    void tween(TIMING.turnMs, (t) => {
      if (group.current) group.current.rotation.y = from + delta * t;
    });
  };
  const angleTo = (point: Vector3) =>
    Math.atan2(point.x - group.current.position.x, point.z - group.current.position.z);

  useEffect(() => {
    const handle: ActorHandle = {
      face: (point) => turnTo(angleTo(point)),
      async moveTo(point, mode) {
        const from = group.current.position.clone();
        const distance = from.distanceTo(point);
        if (distance < 1e-3) return;
        turnTo(angleTo(point));
        const ms = mode === 'hop' ? TIMING.hopMs : walkMs(distance);
        await tween(ms, (t) => {
          if (!group.current) return;
          group.current.position.lerpVectors(from, point, t);
          if (mode === 'hop') group.current.position.y = Math.sin(t * Math.PI) * TIMING.hopHeight;
          rig.current?.stride(t === 1 ? 0 : t * distance);
        });
      },
      play: (clip) =>
        tween(clip === 'attack' ? TIMING.attackMs : TIMING.dieMs, (t) => rig.current?.[clip](t)),
    };
    actors.set(piece.id, handle);
    return () => void actors.delete(piece.id);
  }, [piece.id]);

  // Snap to the square whenever it changes. After an animated move the piece is already there,
  // so this only shows on a new game or a resync. Then turn back to the home facing.
  useLayoutEffect(() => {
    group.current.position.copy(squareToWorld(piece.square));
    turnTo(home);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.square]);

  // Promotion: pop when the type changes (not on first mount).
  const shownType = useRef(piece.type);
  useEffect(() => {
    if (shownType.current === piece.type) return;
    shownType.current = piece.type;
    void tween(TIMING.promoteMs, (t) => model.current?.scale.setScalar(0.4 + 0.6 * t));
  }, [piece.type]);

  // Idle: a slight breathing motion, offset per piece so the ranks do not move in unison.
  const offset = piece.id.charCodeAt(4) * 1.7 + piece.id.charCodeAt(5);
  useFrame(({ clock }) => {
    const m = model.current;
    m.scale.y = m.scale.x * (1 + Math.sin(clock.elapsedTime * 2 + offset) * 0.015);
  });

  const Model = MODELS[piece.type];
  return (
    <group
      ref={group}
      rotation-y={home}
      onClick={(event) => {
        event.stopPropagation();
        select(piece.square);
      }}
    >
      <group ref={model}>
        <Model ref={rig} color={TEAM[piece.color]} />
      </group>
    </group>
  );
}
