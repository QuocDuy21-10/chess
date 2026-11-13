import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Mesh, type PlaneGeometry } from 'three';
import { noRaycast } from './courtyardLayout';
import { COURTYARD, PALETTE } from './theme';
import { reducedMotion } from './tween';

const WIDTH = 1.2;
const HEIGHT = 1.8;

/** The team's cloth with our own emblem: two crossed gold spears under a white inverted chevron. */
function emblem(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 192);
  g.strokeStyle = g.fillStyle = PALETTE.gold;
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath(); // the shafts
  g.moveTo(30, 170);
  g.lineTo(98, 48);
  g.moveTo(98, 170);
  g.lineTo(30, 48);
  g.stroke();
  for (const x of [30, 98]) {
    g.beginPath(); // a diamond spearhead on each top end
    g.moveTo(x, 22);
    g.lineTo(x + 9, 42);
    g.lineTo(x, 56);
    g.lineTo(x - 9, 42);
    g.fill();
  }
  g.fillStyle = PALETTE.cloth;
  g.beginPath(); // the chevron, point down (canvas y grows downward)
  g.moveTo(14, 112);
  g.lineTo(64, 150);
  g.lineTo(114, 112);
  g.lineTo(114, 134);
  g.lineTo(64, 172);
  g.lineTo(14, 134);
  g.closePath();
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A pole behind one army (side 1: +z, the first army) with its cloth facing the board. */
export function Banner({ color, side }: { color: string; side: 1 | -1 }) {
  const cloth = useRef<Mesh<PlaneGeometry>>(null!);
  const texture = useMemo(() => emblem(color), [color]);
  const flat = useRef<Float32Array | null>(null); // the cloth's resting positions, copied on the first frame
  const still = reducedMotion();

  useFrame(({ clock }) => {
    if (still) return;
    const position = cloth.current.geometry.attributes.position;
    flat.current ??= (position.array as Float32Array).slice();
    for (let i = 0; i < position.count; i++) {
      const x = flat.current[i * 3];
      const y = flat.current[i * 3 + 1];
      const free = (x + WIDTH / 2) / WIDTH; // 0 at the pole, 1 at the free edge
      position.setZ(i, Math.sin(clock.elapsedTime * 2.5 + x * 3 + y) * 0.12 * free);
    }
    position.needsUpdate = true;
    cloth.current.geometry.computeVertexNormals();
  });

  return (
    <group position={[0, COURTYARD.floorY, 8.5 * side]} rotation-y={side === 1 ? Math.PI : 0}>
      <mesh position={[-WIDTH / 2 - 0.05, 2, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.05, 0.06, 4, 8]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.9, 0]} rotation-z={Math.PI / 2} raycast={noRaycast}>
        <cylinderGeometry args={[0.035, 0.035, WIDTH + 0.2, 6]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
      </mesh>
      <mesh ref={cloth} position={[0, 2.95, 0]} raycast={noRaycast}>
        <planeGeometry args={[WIDTH, HEIGHT, 10, 16]} />
        <meshStandardMaterial map={texture} side={DoubleSide} roughness={0.9} />
      </mesh>
    </group>
  );
}
