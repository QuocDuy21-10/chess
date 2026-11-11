'use client';

import { useState } from 'react';
import { useGame } from '@/state/store';
import { Modal } from './Modal';

export function GameOverModal() {
  const result = useGame((s) => s.result);
  const newGame = useGame((s) => s.newGame);
  // Closing only hides the dialog so the final position can be studied. The key on the inner
  // component resets `closed` for the next game.
  return result ? <Dialog key={result} result={result} newGame={newGame} /> : null;
}

function Dialog({ result, newGame }: { result: string; newGame: () => void }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <Modal label="Game over" onCancel={() => setClosed(true)}>
      <h2 className="mb-4 text-lg font-semibold">{result}</h2>
      <div className="flex gap-2">
        <button autoFocus onClick={newGame} className="rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500">
          New game
        </button>
        <button onClick={() => setClosed(true)} className="rounded-lg px-4 py-2 text-stone-300 hover:bg-stone-800">
          View board
        </button>
      </div>
    </Modal>
  );
}
