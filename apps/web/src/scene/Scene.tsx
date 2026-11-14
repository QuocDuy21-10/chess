'use client';

import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useT } from '@/ui/i18n';
import { Board } from './Board';
import { CameraRig } from './CameraRig';
import { Courtyard } from './Courtyard';
import { PieceActor } from './Piece';
import { MODELS } from './pieces/models';
import { probeWebGL } from './renderer';
import { PALETTE } from './theme';
import { tickTweens } from './tween';

// Fetched as soon as the scene's code loads, so the pieces swap during the opening camera descent.
for (const entry of Object.values(MODELS)) useGLTF.preload(entry.url, false, true);

function TweenTicker() {
  useFrame((_, delta) => tickTweens(delta * 1000));
  return null;
}

/** Loaded with ssr: false, so `document` is always available here. */
export default function Scene() {
  const pieces = useGame((s) => s.pieces);
  const select = useGame((s) => s.select);
  const side = useSettings((s) => s.side);
  const seat = useGame((s) => s.seat);
  const lightZ = (seat ?? side) === 'w' ? 6 : -6; // the key light stays on the camera's side
  const [{ webgl, software }] = useState(probeWebGL);
  const t = useT();

  if (!webgl) {
    return (
      <p role="alert" className="p-8 text-center text-stone-200">
        {t.noWebGL}
      </p>
    );
  }

  return (
    // On a CPU renderer every pixel is costly: draw at a lower resolution and without shadows, to stay playable.
    <Canvas shadows={!software} dpr={software ? 0.5 : [1, 2]} onPointerMissed={() => select(null)}>
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.background, 18, 45]} />
      <hemisphereLight args={[PALETTE.skyFill, PALETTE.earth, 0.8]} />
      <directionalLight
        position={[5, 10, lightZ]}
        color={PALETTE.sun}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        // the shadow map covers the board, not the courtyard, so the pieces' shadows stay sharp
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <TweenTicker />
      <CameraRig />
      <Courtyard />
      <Board />
      {pieces.map((piece) => (
        <PieceActor key={piece.id} piece={piece} />
      ))}
    </Canvas>
  );
}
