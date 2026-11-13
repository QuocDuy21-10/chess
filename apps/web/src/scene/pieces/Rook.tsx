import { RoundedBox } from '@react-three/drei';
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Steel, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

const WHEELS: [number, number][] = [
  [-0.3, 0.2],
  [0.3, 0.2],
  [-0.3, -0.2],
  [0.3, -0.2],
];
const CRENELS: [number, number][] = [
  [-0.17, 0.17],
  [0.17, 0.17],
  [-0.17, -0.17],
  [0.17, -0.17],
];

/** Wheeled siege tower. Faces +z. */
export function Rook({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const wheels = useRef<Group>(null!);
  const top = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      // rolls: the wheels turn with the distance covered
      for (const wheel of wheels.current.children) wheel.rotation.x = phase * Math.PI * 2;
    },
    attack(t) {
      // rams forward: rock back, slam, recover
      root.current.position.z = keys(t, 0, -0.15, 0.4, 0);
      root.current.rotation.x = keys(t, 0, -0.1, 0.18, 0);
    },
    die(t) {
      // tips over and the top section breaks off
      root.current.rotation.z = keys(t, 0, 0.3, Math.PI / 2);
      root.current.position.y = t * 0.25;
      top.current.position.set(t * 0.2, 0.92 + Math.sin(t * Math.PI) * 0.4, -t * 0.35);
      top.current.rotation.x = -t * 2;
    },
  }));

  return (
    <group ref={root}>
      <group ref={wheels}>
        {WHEELS.map(([x, z]) => (
          // rotation.z lays the cylinder's axis along x, so rotation.x then spins it like a wheel
          <mesh key={`${x},${z}`} position={[x, 0.12, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.06, 8]} />
            <Wood />
          </mesh>
        ))}
      </group>
      <RoundedBox args={[0.5, 0.62, 0.5]} radius={0.04} position={[0, 0.5, 0]} castShadow>
        <Wood />
      </RoundedBox>
      <mesh position={[0, 0.5, 0.26]} castShadow>
        <boxGeometry args={[0.22, 0.44, 0.02]} />
        <Team color={color} />
      </mesh>
      <group ref={top} position={[0, 0.92, 0]}>
        <RoundedBox args={[0.58, 0.14, 0.58]} radius={0.03} castShadow>
          <Team color={color} />
        </RoundedBox>
        {CRENELS.map(([x, z]) => (
          <mesh key={`${x},${z}`} position={[x, 0.13, z]} castShadow>
            <boxGeometry args={[0.16, 0.12, 0.16]} />
            <Steel />
          </mesh>
        ))}
      </group>
    </group>
  );
}
