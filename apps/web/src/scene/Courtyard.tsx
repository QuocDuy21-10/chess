import { RoundedBox } from '@react-three/drei';
import { useLayoutEffect, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import { flagstones, noRaycast, ring, type Placement } from './courtyardLayout';
import { COURTYARD, PALETTE } from './theme';

const { floorY, wallRadius: R, wallHeight: H, merlonHeight: M } = COURTYARD;
const SLABS = flagstones();
const WALL = ring(R, 32);
const MERLONS = ring(R, 64);
const TOWERS = ring(R, 4, Math.PI / 4);
const dummy = new Object3D();

function Flagstones() {
  const mesh = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    const color = new Color();
    SLABS.forEach((slab, i) => {
      dummy.position.set(slab.x, floorY + slab.y - 0.05, slab.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(slab.w, 1, slab.d);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
      mesh.current.setColorAt(i, color.set(PALETTE.stone).multiplyScalar(slab.shade));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.instanceColor!.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SLABS.length]} receiveShadow raycast={noRaycast}>
      <boxGeometry args={[1, 0.1, 1]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

/** One box per placement, laid along the wall's circle. */
function RingBoxes({ items, size, y }: { items: Placement[]; size: [number, number, number]; y: number }) {
  const mesh = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    items.forEach(({ x, z, angle }, i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [items, y]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} receiveShadow raycast={noRaycast}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={PALETTE.stone} roughness={0.95} />
    </instancedMesh>
  );
}

/** The castle courtyard around the board. Nothing here takes a click or casts a shadow. */
export function Courtyard() {
  return (
    <group>
      {/* the dais: two steps under the walnut base, whose bottom is at y = -0.5 */}
      <RoundedBox args={[11, 0.3, 11]} radius={0.06} position={[0, -0.65, 0]} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={PALETTE.stone} roughness={0.85} />
      </RoundedBox>
      <RoundedBox args={[13, 0.3, 13]} radius={0.06} position={[0, -0.95, 0]} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={PALETTE.stoneDark} roughness={0.9} />
      </RoundedBox>

      {/* grout between the flagstones, then earth beyond the wall that fades into the fog */}
      <mesh rotation-x={-Math.PI / 2} position={[0, floorY - 0.02, 0]} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[R, 48]} />
        <meshStandardMaterial color={PALETTE.stoneDark} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, floorY - 0.04, 0]} raycast={noRaycast}>
        <circleGeometry args={[80, 48]} />
        <meshStandardMaterial color={PALETTE.earth} roughness={1} />
      </mesh>
      <Flagstones />

      <RingBoxes items={WALL} size={[2.45, H, 0.8]} y={floorY + H / 2} />
      <RingBoxes items={MERLONS} size={[0.55, M, 0.8]} y={floorY + H + M / 2} />
      {TOWERS.map(({ x, z }) => (
        <group key={`${x},${z}`} position={[x, floorY, z]}>
          <mesh position={[0, 2.1, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[1.3, 1.4, 4.2, 16]} />
            <meshStandardMaterial color={PALETTE.stone} roughness={0.95} />
          </mesh>
          <mesh position={[0, 5.1, 0]} raycast={noRaycast}>
            <coneGeometry args={[1.65, 1.8, 16]} />
            <meshStandardMaterial color={PALETTE.roof} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
