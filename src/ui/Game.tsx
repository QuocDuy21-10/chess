'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { setPaused } from '@/audio/audio';
import { useSettings } from '@/state/settings';
import { Cinematic } from './Cinematic';
import { GameOverModal } from './GameOverModal';
import { Hud } from './Hud';
import { useT } from './i18n';
import { MainMenu } from './MainMenu';
import { PauseMenu } from './PauseMenu';
import { PromotionChooser } from './PromotionChooser';
import { Settings } from './Settings';

// The 3D scene needs the browser, so it is never rendered on the server.
const Scene = dynamic(() => import('@/scene/Scene'), {
  ssr: false,
  loading: () => <Loading />,
});

function Loading() {
  return <p className="p-8 text-center text-stone-400">{useT().loading}</p>;
}

export function Game() {
  // The scene stays mounted behind every screen, so switching screens never rebuilds it or loses a game.
  const [screen, setScreen] = useState<'menu' | 'playing' | 'paused'>('menu');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // After mount, not at store creation, so the server and first client render agree.
  useEffect(() => void useSettings.persist.rehydrate(), []);

  const lang = useSettings((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => setPaused(screen === 'paused'), [screen]);

  // Escape pauses. An open dialog (promotion, game over, the pause menu itself) handles its own Escape.
  useEffect(() => {
    if (screen !== 'playing') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault(); // or this same key press would close the pause menu it has just opened
      setScreen('paused');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  return (
    <main className="relative h-dvh bg-stone-950">
      <div inert={screen === 'menu'} className="flex h-full flex-col landscape:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1">
          <Scene />
          <Cinematic />
        </div>
        <Hud onPause={() => setScreen('paused')} />
      </div>
      {screen === 'menu' && <MainMenu onPlay={() => setScreen('playing')} onSettings={() => setSettingsOpen(true)} />}
      {screen === 'paused' && (
        <PauseMenu
          onResume={() => setScreen('playing')}
          onSettings={() => setSettingsOpen(true)}
          onMenu={() => setScreen('menu')}
        />
      )}
      {/* Rendered after the pause menu so its dialog opens on top of it. */}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      <PromotionChooser />
      <GameOverModal />
    </main>
  );
}
