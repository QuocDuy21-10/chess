import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Gold, Robed, Team } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Robed queen with a sceptre. Faces +z. */
export function Queen({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.03;
    },
    attack(t) {
      // sceptre sweep: wind up to one side, sweep across, recover
      arm.current.rotation.x = keys(t, 0, 1.2, 1.2, 0);
      arm.current.rotation.y = keys(t, 0, -1.1, 1.1, 0);
    },
    die(t) {
      // crumples
      root.current.scale.y = 1 - t * 0.75;
      root.current.rotation.z = t * 0.35;
    },
  }));

  return (
    <Robed
      color={color}
      rootRef={root}
      armRef={arm}
      height={1.15}
      hat={
        <mesh position={[0, 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.1, 0.12, 8]} />
          <Gold />
        </mesh>
      }
      held={
        <>
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
            <Gold />
          </mesh>
          <mesh position={[0, 0.56, 0]} castShadow>
            <octahedronGeometry args={[0.09]} />
            <Team color={color} />
          </mesh>
        </>
      }
    />
  );
}
