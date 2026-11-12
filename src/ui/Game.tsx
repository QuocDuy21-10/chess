'use client';

import dynamic from 'next/dynamic';
import { Cinematic } from './Cinematic';
import { GameOverModal } from './GameOverModal';
import { Hud } from './Hud';
import { PromotionChooser } from './PromotionChooser';

// The 3D scene needs the browser, so it is never rendered on the server.
const Scene = dynamic(() => import('@/scene/Scene'), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-stone-400">Loading the board…</p>,
});

export function Game() {
  return (
    <main className="flex h-dvh flex-col bg-stone-950 md:flex-row">
      <div className="relative min-h-0 flex-1">
        <Scene />
        <Cinematic />
      </div>
      <Hud />
      <PromotionChooser />
      <GameOverModal />
    </main>
  );
}
