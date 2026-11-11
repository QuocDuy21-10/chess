import { RoundedBox } from '@react-three/drei';
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Steel, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Foot soldier with a spear and a round shield. Faces +z. */
export function Pawn({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.06;
      root.current.rotation.z = Math.sin(phase * Math.PI * 2) * 0.06;
    },
    attack(t) {
      // spear thrust: lower the spear forward, jab, recover
      arm.current.rotation.x = keys(t, 0, 1.3, 1.3, 0);
      arm.current.position.z = keys(t, 0, -0.1, 0.3, 0);
    },
    die(t) {
      // falls backward
      root.current.rotation.x = -t * (Math.PI / 2);
      root.current.position.y = t * 0.12;
    },
  }));

  return (
    <group ref={root}>
      <RoundedBox args={[0.34, 0.4, 0.24]} radius={0.05} position={[0, 0.36, 0]} castShadow>
        <Steel />
      </RoundedBox>
      <mesh position={[0, 0.7, 0]} castShadow>
        <sphereGeometry args={[0.17, 12, 10]} />
        <Steel />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <coneGeometry args={[0.06, 0.18, 6]} />
        <Team color={color} />
      </mesh>
      <mesh position={[-0.22, 0.38, 0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.04, 12]} />
        <Team color={color} />
      </mesh>
      <group ref={arm} position={[0.24, 0.4, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 1, 6]} />
          <Wood />
        </mesh>
        <mesh position={[0, 0.77, 0]} castShadow>
          <coneGeometry args={[0.05, 0.16, 4]} />
          <Steel />
        </mesh>
      </group>
    </group>
  );
}
