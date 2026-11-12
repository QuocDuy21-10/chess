'use client';

import { useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from './i18n';
import { Modal } from './Modal';

const button = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';

export function PauseMenu(props: { onResume: () => void; onSettings: () => void; onMenu: () => void }) {
  const t = useT();
  const hasMoves = useGame((s) => s.history.length > 0);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const [confirming, setConfirming] = useState(false);

  function restart() {
    newGame();
    props.onResume();
  }

  return (
    <Modal label={t.paused} onCancel={props.onResume}>
      <h2 className="mb-4 text-lg font-semibold">{t.paused}</h2>
      <div className="flex min-w-56 flex-col gap-2">
        <button
          autoFocus
          onClick={props.onResume}
          className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
        >
          {t.resume}
        </button>
        {confirming ? (
          // Undo cannot bring a restarted game back, so a game with moves asks first.
          <div role="group" aria-label={t.restartConfirm} className="flex items-center gap-2">
            <span className="flex-1">{t.restartConfirm}</span>
            <button autoFocus onClick={restart} disabled={animating} className={button}>
              {t.yes}
            </button>
            <button onClick={() => setConfirming(false)} className={button}>
              {t.no}
            </button>
          </div>
        ) : (
          <button onClick={hasMoves ? () => setConfirming(true) : restart} disabled={animating} className={button}>
            {t.restart}
          </button>
        )}
        <button onClick={props.onSettings} className={button}>
          {t.settings}
        </button>
        <button onClick={props.onMenu} className={button}>
          {t.mainMenu}
        </button>
      </div>
    </Modal>
  );
}
