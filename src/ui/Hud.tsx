'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { play } from '@/audio/audio';
import { useGame } from '@/state/store';
import { resultText, useT } from './i18n';
import { Modal } from './Modal';

// 44 px in both directions, for fingers
const button =
  'min-h-11 min-w-11 rounded-lg border border-stone-600 px-3 py-2 hover:bg-stone-800 disabled:opacity-50';

/**
 * Landscape: a column beside the board. Portrait: a bar under the board, with the move list and
 * the move input in a drawer.
 */
export function Hud({ onPause }: { onPause: () => void }) {
  const t = useT();
  const [drawer, setDrawer] = useState(false);
  const pause = (
    <button onClick={onPause} className={button}>
      {t.pause}
    </button>
  );

  return (
    <aside className="flex shrink-0 gap-2 bg-stone-900 text-stone-100 portrait:items-center portrait:px-3 portrait:pt-2 portrait:pb-[max(0.5rem,env(safe-area-inset-bottom))] landscape:min-h-0 landscape:w-60 landscape:flex-col landscape:gap-4 landscape:p-4 landscape:pr-[max(1rem,env(safe-area-inset-right))] landscape:lg:w-72">
      <div className="flex items-center justify-between gap-2 portrait:hidden">
        <h1 className="text-lg font-bold whitespace-nowrap lg:text-xl">{t.title}</h1>
        {pause}
      </div>
      <Status />
      <div className="flex min-h-0 flex-1 flex-col gap-4 portrait:hidden">
        <MoveInput />
        <MoveList />
      </div>
      <UndoButton />
      <div className="contents landscape:hidden">
        <button onClick={() => setDrawer(true)} className={button}>
          {t.moves}
        </button>
        {pause}
      </div>

      {drawer && (
        <Modal sheet label={t.moves} onCancel={() => setDrawer(false)}>
          <div className="flex max-h-[70dvh] flex-col gap-4">
            <MoveInput />
            <MoveList />
            <button onClick={() => setDrawer(false)} className={button}>
              {t.close}
            </button>
          </div>
        </Modal>
      )}
    </aside>
  );
}

function Status() {
  const t = useT();
  const turn = useGame((s) => s.turn);
  const inCheck = useGame((s) => s.inCheck);
  const latest = useGame((s) => s.history.at(-1));
  const result = useGame((s) => s.result);
  const mover = t.team[turn === 'w' ? 'b' : 'w']; // who made the latest move
  const outcome = result && resultText(t, result);

  return (
    <>
      <p className="portrait:min-w-0 portrait:flex-1 landscape:text-lg">
        {outcome ?? t.toMove(t.team[turn])}
        {!result && inCheck && <span className="ml-2 font-semibold text-red-400">{t.check}</span>}
      </p>
      <p aria-live="polite" className="sr-only">
        {latest && t.played(mover, latest)} {outcome}
      </p>
    </>
  );
}

function UndoButton() {
  const t = useT();
  const undo = useGame((s) => s.undo);
  const possible = useGame((s) => (s.phase === 'idle' || s.phase === 'gameOver') && s.history.length > 0);
  return (
    <button onClick={undo} disabled={!possible} className={button}>
      {t.undo}
    </button>
  );
}

function MoveInput() {
  const t = useT();
  const id = useId(); // the column and the drawer can both be in the page
  const phase = useGame((s) => s.phase);
  const submitText = useGame((s) => s.submitText);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase !== 'idle') return;
    if (submitText(text)) {
      setText('');
      setError('');
    } else {
      play('error');
      setError(t.illegal(text));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-stone-300">
        {t.typeMove}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly={phase !== 'idle'} // not disabled: that would drop keyboard focus after every move
          autoComplete="off"
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          placeholder="Nf3 / g1f3"
          className="min-h-11 min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 read-only:opacity-50"
        />
        <button
          disabled={phase !== 'idle'}
          className="min-h-11 rounded-lg bg-amber-600 px-3 py-2 font-medium hover:bg-amber-500 disabled:opacity-50"
        >
          {t.move}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

function MoveList() {
  const t = useT();
  const history = useGame((s) => s.history);
  const rows = [];
  for (let i = 0; i < history.length; i += 2) rows.push(history.slice(i, i + 2));

  // Keep the latest move in view.
  const latest = useRef<HTMLLIElement>(null);
  useEffect(() => void latest.current?.scrollIntoView({ block: 'nearest' }), [history.length]);

  return (
    <ol aria-label={t.moves} className="min-h-0 flex-1 overflow-y-auto font-mono text-sm">
      {rows.map(([first, second], i) => (
        <li
          key={i}
          ref={i === rows.length - 1 ? latest : undefined}
          className="grid grid-cols-[2rem_1fr_1fr] gap-2 py-0.5"
        >
          <span className="text-stone-500">{i + 1}.</span>
          {[first, second].map(
            (san, j) =>
              san && (
                <span
                  key={j}
                  aria-current={i * 2 + j === history.length - 1 ? 'step' : undefined}
                  className="rounded px-1 aria-[current=step]:bg-amber-600/40"
                >
                  {san}
                </span>
              ),
          )}
        </li>
      ))}
    </ol>
  );
}
