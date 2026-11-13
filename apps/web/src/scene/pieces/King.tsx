import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Gold, Robed, Steel } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Robed king with a sword. Faces +z. */
export function King({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.03;
    },
    attack(t) {
      // sword slash: raise, cut down across the body, recover
      arm.current.rotation.x = keys(t, 0, -0.7, 1.5, 0);
      arm.current.rotation.z = keys(t, 0, -0.4, 0.5, 0);
    },
    die() {
      // a king is never captured
    },
  }));

  return (
    <Robed
      color={color}
      rootRef={root}
      armRef={arm}
      height={1.25}
      hat={
        <>
          <mesh position={[0, 0.04, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.13, 0.12, 6]} />
            <Gold />
          </mesh>
          <mesh position={[0, 0.16, 0]} castShadow>
            <sphereGeometry args={[0.06, 8, 6]} />
            <Gold />
          </mesh>
        </>
      }
      held={
        <>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.06, 0.7, 0.02]} />
            <Steel />
          </mesh>
          <mesh position={[0, -0.04, 0]} castShadow>
            <boxGeometry args={[0.2, 0.04, 0.04]} />
            <Gold />
          </mesh>
        </>
      }
    />
  );
}
