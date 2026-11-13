import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import { Vector3 } from 'three';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { cameraRig, setCameraRig } from './cameraHandle';
import { CAMERA } from './theme';
import { reducedMotion, tween } from './tween';

/** The camera and its controls. Widens the field of view on narrow canvases so the whole board stays in frame. */
export function CameraRig() {
  const aspect = useThree((s) => s.size.width / s.size.height);
  const half = Math.tan((CAMERA.fov * Math.PI) / 360);
  const fov = (Math.atan(half * Math.max(1, CAMERA.fitAspect / aspect)) * 360) / Math.PI;
  const camera = useRef<ComponentRef<typeof PerspectiveCamera>>(null!);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null!);
  const gameId = useGame((s) => s.gameId);
  // The camera sits behind the player's army: their seat in an online game, otherwise the army chosen in
  // the menu. That is +z for the first army and -z for the second.
  const side = useSettings((s) => s.side);
  const seat = useGame((s) => s.seat);
  const sign = (seat ?? side) === 'w' ? 1 : -1;
  const settled = useRef(false); // false until the first placement

  useEffect(() => {
    const [x, y, z] = CAMERA.position;
    const home = new Vector3(x, y, z * sign);
    const centre = new Vector3();
    // While gliding the controls are disabled, so their distance and angle limits do not clamp the path.
    const glide = (position: Vector3, target: Vector3, ms: number) => {
      const fromPosition = camera.current.position.clone();
      const fromTarget = controls.current.target.clone();
      controls.current.enabled = false;
      return tween(ms, (t) => {
        if (!camera.current || !controls.current) return;
        const eased = t * t * (3 - 2 * t);
        camera.current.position.lerpVectors(fromPosition, position, eased);
        controls.current.target.lerpVectors(fromTarget, target, eased);
        camera.current.lookAt(controls.current.target);
      });
    };
    const unlock = () => {
      if (controls.current) controls.current.enabled = true;
    };
    setCameraRig({
      async focus(a, b, ms = CAMERA.focusMs) {
        if (reducedMotion()) return;
        const mid = new Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        await glide(home.clone().lerp(mid, CAMERA.focusAmount), mid, ms);
      },
      async reset() {
        if (reducedMotion()) return;
        await glide(home, centre, CAMERA.focusMs);
        unlock();
      },
      async intro() {
        if (reducedMotion()) return;
        camera.current.position.copy(home).multiplyScalar(CAMERA.introScale);
        await glide(home, centre, CAMERA.introMs);
        unlock();
      },
    });
    // Stand behind this side's army. A straight glide to the far side would pass directly over the
    // board, where the view flips, so a change of side jumps across and descends as a new game does.
    camera.current.position.copy(home);
    controls.current.target.copy(centre);
    camera.current.lookAt(centre);
    if (settled.current) void cameraRig.intro();
    settled.current = true;
    return () => setCameraRig(null);
  }, [sign]);

  // Runs after the effect above, so the handle is already in place on first mount.
  useEffect(() => {
    void cameraRig.intro();
  }, [gameId]);

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault position={CAMERA.position} fov={fov} />
      <OrbitControls
        ref={controls}
        enablePan={false}
        minDistance={5}
        maxDistance={14}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        // Behind the second army the range is centred on π. OrbitControls accepts a range that crosses π.
        minAzimuthAngle={(sign === 1 ? 0 : Math.PI) - Math.PI / 6}
        maxAzimuthAngle={(sign === 1 ? 0 : Math.PI) + Math.PI / 6}
      />
    </>
  );
}
