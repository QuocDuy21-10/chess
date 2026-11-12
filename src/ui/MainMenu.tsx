'use client';

import { TEAM } from '@/scene/theme';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useT } from './i18n';

const primary = 'min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500 disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';

/** The opening screen: a layer over the dimmed scene. `onPlay` shows the board. */
export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  const t = useT();
  const side = useSettings((s) => s.side);
  const update = useSettings((s) => s.update);
  const inProgress = useGame((s) => s.history.length > 0 || s.result !== null);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);

  function start() {
    newGame(); // also plays the fade from black and the camera descent
    onPlay();
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl">
        <h1 className="text-center text-3xl font-bold">{t.title}</h1>
        <p className="text-center text-stone-300">
          {t.mode}: {t.twoPlayers}
        </p>

        <div role="group" aria-labelledby="side-label" className="flex flex-col gap-2">
          <span id="side-label" className="text-sm text-stone-300">
            {t.sideLabel}
          </span>
          <div className="flex gap-2">
            {(['w', 'b'] as const).map((color) => (
              <button
                key={color}
                aria-pressed={side === color}
                disabled={animating} // a fight is using the camera
                onClick={() => update({ side: color })}
                className={`${secondary} flex flex-1 items-center justify-center gap-2 aria-pressed:border-amber-500 aria-pressed:bg-stone-800`}
              >
                <span aria-hidden className="size-3 rounded-full" style={{ background: TEAM[color] }} />
                {t.team[color]}
              </button>
            ))}
          </div>
        </div>

        {inProgress ? (
          <>
            <button autoFocus onClick={onPlay} className={primary}>
              {t.resume}
            </button>
            <button onClick={start} disabled={animating} className={secondary}>
              {t.newGame}
            </button>
          </>
        ) : (
          <button autoFocus onClick={start} className={primary}>
            {t.start}
          </button>
        )}
        <button onClick={onSettings} className={secondary}>
          {t.settings}
        </button>
      </div>
    </div>
  );
}
