'use client';

import type { PromotionPiece } from '@/game/types';
import { useGame } from '@/state/store';
import { useT } from './i18n';
import { Modal } from './Modal';

const CHOICES: PromotionPiece[] = ['q', 'r', 'b', 'n'];

export function PromotionChooser() {
  const t = useT();
  const promoting = useGame((s) => s.phase === 'promoting');
  const choose = useGame((s) => s.choosePromotion);
  const cancel = useGame((s) => s.cancelPromotion);
  if (!promoting) return null;

  return (
    <Modal label={t.promoteLabel} onCancel={cancel}>
      <h2 className="mb-4 text-lg font-semibold">{t.promoteTo}</h2>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((piece, i) => (
          <button
            key={piece}
            autoFocus={i === 0}
            onClick={() => choose(piece)}
            className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
          >
            {t.piece[piece]}
          </button>
        ))}
        <button onClick={cancel} className="min-h-11 rounded-lg px-4 py-2 text-stone-300 hover:bg-stone-800">
          {t.cancel}
        </button>
      </div>
    </Modal>
  );
}
