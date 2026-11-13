'use client';

import { useState } from 'react';
import { useOnline } from '@/net/online';
import { useGame } from '@/state/store';
import { resultText, useT } from './i18n';
import { Modal } from './Modal';

export function GameOverModal() {
  const over = useGame((s) => s.result !== null);
  // Unmounted whenever there is no result, so `closed` starts fresh each time a game ends,
  // including a second ending after an undo.
  return over ? <Dialog /> : null;
}

function Dialog() {
  const t = useT();
  const result = useGame((s) => s.result);
  const newGame = useGame((s) => s.newGame);
  const online = useGame((s) => s.seat !== null);
  const leave = useOnline((s) => s.leave);
  // Closing only hides the dialog so the final position can be studied.
  const [closed, setClosed] = useState(false);
  if (closed || !result) return null;
  return (
    <Modal label={t.gameOver} onCancel={() => setClosed(true)}>
      <h2 className="mb-4 text-lg font-semibold">{resultText(t, result)}</h2>
      <div className="flex flex-wrap gap-2">
        <button
          autoFocus
          onClick={online ? leave : newGame} // online there is no rematch: the room is left
          className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
        >
          {online ? t.mainMenu : t.newGame}
        </button>
        <button
          onClick={() => setClosed(true)}
          className="min-h-11 rounded-lg px-4 py-2 text-stone-300 hover:bg-stone-800"
        >
          {t.viewBoard}
        </button>
      </div>
    </Modal>
  );
}
