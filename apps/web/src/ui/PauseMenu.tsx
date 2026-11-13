'use client';

import { useState } from 'react';
import { useOnline } from '@/net/online';
import { useGame } from '@/state/store';
import { useT } from './i18n';
import { Modal } from './Modal';

const button = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';

/**
 * Local game: Resume, Restart, Settings, Main menu. Online the clocks keep running behind it, Restart
 * becomes Resign, and the main menu is offered only once the game is over, where it leaves the room.
 */
export function PauseMenu(props: { onResume: () => void; onSettings: () => void; onMenu: () => void }) {
  const t = useT();
  const hasMoves = useGame((s) => s.history.length > 0);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const online = useGame((s) => s.mode === 'online');
  const over = useGame((s) => s.result !== null);
  const resign = useOnline((s) => s.resign);
  const leave = useOnline((s) => s.leave);
  const [confirming, setConfirming] = useState(false);
  const title = online ? t.menu : t.paused;
  const question = online ? t.resignConfirm : t.restartConfirm;

  function restart() {
    newGame();
    props.onResume();
  }

  function giveUp() {
    resign(); // the server tells both players, and the game-over dialog follows
    props.onResume();
  }

  return (
    <Modal label={title} onCancel={props.onResume}>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="flex min-w-56 flex-col gap-2">
        <button
          autoFocus
          onClick={props.onResume}
          className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
        >
          {t.resume}
        </button>
        {online && over ? null : confirming ? (
          // Neither can be undone, so both ask first: a restart loses the game, a resignation ends it.
          <div role="group" aria-label={question} className="flex items-center gap-2">
            <span className="flex-1">{question}</span>
            <button autoFocus onClick={online ? giveUp : restart} disabled={!online && animating} className={button}>
              {t.yes}
            </button>
            <button onClick={() => setConfirming(false)} className={button}>
              {t.no}
            </button>
          </div>
        ) : online ? (
          <button onClick={() => setConfirming(true)} className={button}>
            {t.resign}
          </button>
        ) : (
          <button onClick={hasMoves ? () => setConfirming(true) : restart} disabled={animating} className={button}>
            {t.restart}
          </button>
        )}
        <button onClick={props.onSettings} className={button}>
          {t.settings}
        </button>
        {(!online || over) && (
          <button onClick={online ? leave : props.onMenu} className={button}>
            {t.mainMenu}
          </button>
        )}
      </div>
    </Modal>
  );
}
