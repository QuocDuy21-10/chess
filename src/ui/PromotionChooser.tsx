'use client';

import type { PromotionPiece } from '@/game/types';
import { useGame } from '@/state/store';
import { Modal } from './Modal';

const CHOICES: [PromotionPiece, string][] = [
  ['q', 'Queen'],
  ['r', 'Rook'],
  ['b', 'Bishop'],
  ['n', 'Knight'],
];

export function PromotionChooser() {
  const promoting = useGame((s) => s.phase === 'promoting');
  const choose = useGame((s) => s.choosePromotion);
  const cancel = useGame((s) => s.cancelPromotion);
  if (!promoting) return null;

  return (
    <Modal label="Choose a piece to promote to" onCancel={cancel}>
      <h2 className="mb-4 text-lg font-semibold">Promote to</h2>
      <div className="flex gap-2">
        {CHOICES.map(([piece, name], i) => (
          <button
            key={piece}
            autoFocus={i === 0}
            onClick={() => choose(piece)}
            className="rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
          >
            {name}
          </button>
        ))}
        <button onClick={cancel} className="rounded-lg px-4 py-2 text-stone-300 hover:bg-stone-800">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
