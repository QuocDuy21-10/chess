'use client';

import { useGame } from '@/state/store';

/** Letterbox bars during a fight, and a fade from black at the start of every game. */
export function Cinematic() {
  const cinematic = useGame((s) => s.cinematic);
  const gameId = useGame((s) => s.gameId);
  const bar = 'absolute inset-x-0 h-[11%] bg-black transition-transform duration-300 ease-out';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={`${bar} top-0 ${cinematic ? '' : '-translate-y-full'}`} />
      <div className={`${bar} bottom-0 ${cinematic ? '' : 'translate-y-full'}`} />
      <div key={gameId} className="fade-from-black absolute inset-0 bg-black" />
    </div>
  );
}
