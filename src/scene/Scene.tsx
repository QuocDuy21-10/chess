'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { useGame } from '@/state/store';
import { Board } from './Board';
import { CameraRig } from './CameraRig';
import { PieceActor } from './Piece';
import { PALETTE } from './theme';
import { tickTweens } from './tween';

function TweenTicker() {
  useFrame((_, delta) => tickTweens(delta * 1000));
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
    <Canvas shadows onPointerMissed={() => select(null)}>
      <color attach="background" args={[PALETTE.background]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 6]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
      <TweenTicker />
      <CameraRig />
      <Board />
      {pieces.map((piece) => (
        <PieceActor key={piece.id} piece={piece} />
      ))}
    </Canvas>
  );
}
