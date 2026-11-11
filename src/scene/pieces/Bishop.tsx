import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Gold, Robed, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Hooded cleric with a staff. Faces +z. */
export function Bishop({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      // gliding walk: a slow sway, no bounce
      root.current.rotation.z = Math.sin(phase * Math.PI * 2) * 0.04;
    },
    attack(t) {
      // overhead strike: swing the staff back, bring it down, recover
      arm.current.rotation.x = keys(t, 0, -0.9, 1.5, 0);
      arm.current.position.y = 0.45 + keys(t, 0, 0.25, 0, 0);
    },
    die(t) {
      // spins and collapses
      root.current.rotation.y = t * Math.PI * 3;
      root.current.scale.y = 1 - t * 0.8;
    },
  }));

  return (
    <Robed
      color={color}
      rootRef={root}
      armRef={arm}
      hat={
        <mesh position={[0, 0.02, -0.02]} castShadow>
          <coneGeometry args={[0.17, 0.3, 10]} />
          <Team color={color} />
        </mesh>
      }
      held={
        <>
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 1.1, 6]} />
            <Wood />
          </mesh>
          <mesh position={[0, 0.7, 0]} castShadow>
            <sphereGeometry args={[0.07, 10, 8]} />
            <Gold />
          </mesh>
        </>
      }
    />
  );
}
