import type { ReactNode, Ref } from 'react';
import type { Group } from 'three';
import { PALETTE } from '../theme';

export const Team = ({ color }: { color: string }) => <meshStandardMaterial color={color} roughness={0.8} />;
export const Steel = () => <meshStandardMaterial color={PALETTE.steel} metalness={0.7} roughness={0.3} />;
export const Gold = () => <meshStandardMaterial color={PALETTE.gold} metalness={0.8} roughness={0.3} />;
export const Wood = () => <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />;
export const Cloth = () => <meshStandardMaterial color={PALETTE.cloth} roughness={0.9} />;
export const Skin = () => <meshStandardMaterial color={PALETTE.skin} roughness={0.8} />;

/** Shared body for bishop, queen and king: a robe, a collar, a head, a hat slot and one arm. */
export function Robed(props: {
  color: string;
  root: Ref<Group>;
  arm: Ref<Group>;
  height?: number;
  hat: ReactNode;
  held: ReactNode;
}) {
  const h = props.height ?? 1;
  return (
    <group ref={props.root}>
      <group scale={[1, h, 1]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <coneGeometry args={[0.28, 0.7, 10]} />
          <Team color={props.color} />
        </mesh>
        <mesh position={[0, 0.64, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.17, 0.08, 10]} />
          <Cloth />
        </mesh>
      </group>
      <mesh position={[0, 0.8 * h, 0]} castShadow>
        <sphereGeometry args={[0.15, 12, 10]} />
        <Skin />
      </mesh>
      <group position={[0, 0.8 * h + 0.13, 0]}>{props.hat}</group>
      <group ref={props.arm} position={[0.27, 0.45 * h, 0.05]}>
        {props.held}
      </group>
    </group>
  );
}
