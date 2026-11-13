import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh, PointLight } from 'three';
import { noRaycast } from './courtyardLayout';
import { PALETTE } from './theme';
import { reducedMotion } from './tween';

const LIGHT = 6;

/** A stone bowl with a flame and a warm light, standing on the dais's top step (y = -0.5). */
export function Brazier({ x, z }: { x: number; z: number }) {
  const light = useRef<PointLight>(null!);
  const flame = useRef<Mesh>(null!);
  const still = reducedMotion();
  const phase = x * 3 + z; // so the four braziers do not flicker in step

  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime * 9 + phase;
    const f = 1 + 0.15 * Math.sin(t) + 0.1 * Math.sin(t * 2.3);
    light.current.intensity = LIGHT * f;
    flame.current.scale.y = f;
  });

  return (
    <group position={[x, -0.5, z]}>
      <mesh position={[0, 0.25, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.28, 0.12, 0.5, 10]} />
        <meshStandardMaterial color={PALETTE.iron} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh ref={flame} position={[0, 0.62, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.2, 0.5, 8]} />
        <meshStandardMaterial color={PALETTE.flame} emissive={PALETTE.flame} emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0.9, 0]} color={PALETTE.flame} intensity={LIGHT} distance={6} decay={2} />
    </group>
  );
}
