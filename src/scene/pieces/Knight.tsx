import { RoundedBox } from '@react-three/drei';
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Steel, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Mounted lancer. Faces +z. */
export function Knight({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const lance = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      // the actor supplies the hop arc; the horse pitches up, then down
      root.current.rotation.x = -Math.sin(phase * Math.PI * 2) * 0.2;
    },
    attack(t) {
      // lance lunge: couch the lance, charge half a step, pull back
      lance.current.rotation.x = keys(t, 0, 1.45, 1.45, 0);
      root.current.position.z = keys(t, 0, -0.1, 0.3, 0);
    },
    die(t) {
      // the horse rears, then topples sideways
      root.current.rotation.x = -keys(t, 0, 0.6, 0.3, 0);
      root.current.rotation.z = keys(t, 0, 0, 0.8, Math.PI / 2);
      root.current.position.y = keys(t, 0, 0.1, 0.15, 0.2);
    },
  }));

  const legs: [number, number][] = [
    [-0.1, 0.22],
    [0.1, 0.22],
    [-0.1, -0.22],
    [0.1, -0.22],
  ];

  return (
    <group ref={root}>
      {legs.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.14, z]} castShadow>
          <boxGeometry args={[0.07, 0.28, 0.07]} />
          <Wood />
        </mesh>
      ))}
      <RoundedBox args={[0.28, 0.26, 0.66]} radius={0.06} position={[0, 0.4, 0]} castShadow>
        <Wood />
      </RoundedBox>
      <RoundedBox args={[0.3, 0.1, 0.4]} radius={0.03} position={[0, 0.52, -0.02]} castShadow>
        <Team color={color} />
      </RoundedBox>
      <RoundedBox args={[0.14, 0.34, 0.16]} radius={0.04} position={[0, 0.62, 0.32]} rotation={[0.5, 0, 0]} castShadow>
        <Wood />
      </RoundedBox>
      <RoundedBox args={[0.13, 0.14, 0.3]} radius={0.04} position={[0, 0.78, 0.46]} castShadow>
        <Wood />
      </RoundedBox>
      <RoundedBox args={[0.26, 0.32, 0.2]} radius={0.05} position={[0, 0.74, -0.04]} castShadow>
        <Steel />
      </RoundedBox>
      <mesh position={[0, 1.02, -0.04]} castShadow>
        <sphereGeometry args={[0.14, 12, 10]} />
        <Steel />
      </mesh>
      <mesh position={[0, 1.2, -0.04]} castShadow>
        <coneGeometry args={[0.05, 0.16, 6]} />
        <Team color={color} />
      </mesh>
      <group ref={lance} position={[0.2, 0.72, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.03, 1.3, 6]} />
          <Team color={color} />
        </mesh>
        <mesh position={[0, 1, 0]} castShadow>
          <coneGeometry args={[0.035, 0.14, 6]} />
          <Steel />
        </mesh>
      </group>
    </group>
  );
}
