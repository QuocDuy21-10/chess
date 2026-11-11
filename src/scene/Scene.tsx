'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { PerspectiveCamera } from 'three';
import { useGame } from '@/state/store';
import { Board } from './Board';
import { PieceActor } from './Piece';
import { CAMERA, PALETTE } from './theme';
import { tickTweens } from './tween';

function TweenTicker() {
  useFrame((_, delta) => tickTweens(delta * 1000));
  return null;
}

/** Widens the field of view on narrow canvases so the whole board stays in frame. */
function FitCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    const half = Math.tan((CAMERA.fov * Math.PI) / 360);
    camera.fov = (Math.atan(half * Math.max(1, CAMERA.fitAspect / aspect)) * 360) / Math.PI;
    camera.updateProjectionMatrix();
  }, [camera, aspect]);
  return null;
}

function hasWebGL() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Loaded with ssr: false, so `document` is always available here. */
export default function Scene() {
  const pieces = useGame((s) => s.pieces);
  const select = useGame((s) => s.select);
  const [webgl] = useState(hasWebGL);

  if (!webgl) {
    return (
      <p role="alert" className="p-8 text-center text-stone-200">
        This game needs WebGL 2, which this browser or device does not provide. You can still follow and
        enter moves in the panel.
      </p>
    );
  }

  return (
    <Canvas shadows camera={{ position: CAMERA.position, fov: CAMERA.fov }} onPointerMissed={() => select(null)}>
      <color attach="background" args={[PALETTE.background]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 6]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
      <TweenTicker />
      <FitCamera />
      <Board />
      {pieces.map((piece) => (
        <PieceActor key={piece.id} piece={piece} />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={13}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        minAzimuthAngle={-Math.PI / 6}
        maxAzimuthAngle={Math.PI / 6}
      />
    </Canvas>
  );
}
