'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { play } from '@/audio/audio';
import { useGame } from '@/state/store';
import { resultText, useT } from './i18n';

export function Hud({ onPause }: { onPause: () => void }) {
  const t = useT();
  const turn = useGame((s) => s.turn);
  const inCheck = useGame((s) => s.inCheck);
  const history = useGame((s) => s.history);
  const phase = useGame((s) => s.phase);
  const result = useGame((s) => s.result);
  const submitText = useGame((s) => s.submitText);
  const undo = useGame((s) => s.undo);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  // Keep the latest move in view.
  const latest = useRef<HTMLLIElement>(null);
  useEffect(() => void latest.current?.scrollIntoView({ block: 'nearest' }), [history.length]);

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

  const rows = [];
  for (let i = 0; i < history.length; i += 2) rows.push(history.slice(i, i + 2));
  const mover = t.team[turn === 'w' ? 'b' : 'w']; // who made the latest move
  const outcome = result && resultText(t, result);

  return (
    <aside className="flex w-full flex-col gap-4 bg-stone-900 p-4 text-stone-100 md:w-72">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <button onClick={onPause} className="rounded-lg border border-stone-600 px-3 py-1 text-sm hover:bg-stone-800">
          {t.pause}
        </button>
      </div>

      <p className="text-lg">
        {outcome ?? t.toMove(t.team[turn])}
        {!result && inCheck && <span className="ml-2 font-semibold text-red-400">{t.check}</span>}
      </p>

      <p aria-live="polite" className="sr-only">
        {history.length > 0 && t.played(mover, history.at(-1)!)} {outcome}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-1">
        <label htmlFor="move" className="text-sm text-stone-300">
          {t.typeMove}
        </label>
        <div className="flex gap-2">
          <input
            id="move"
            value={text}
            onChange={(event) => setText(event.target.value)}
            readOnly={phase !== 'idle'} // not disabled: that would drop keyboard focus after every move
            autoComplete="off"
            aria-describedby={error ? 'move-error' : undefined}
            aria-invalid={error ? true : undefined}
            placeholder="Nf3 or g1f3"
            className="min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 read-only:opacity-50"
          />
          <button
            disabled={phase !== 'idle'}
            className="rounded-lg bg-amber-600 px-3 py-2 font-medium hover:bg-amber-500 disabled:opacity-50"
          >
            {t.move}
          </button>
        </div>
        {error && (
          <p id="move-error" role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      <ol aria-label={t.moves} className="min-h-24 flex-1 overflow-y-auto font-mono text-sm">
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

      <button
        onClick={undo}
        disabled={(phase !== 'idle' && phase !== 'gameOver') || history.length === 0}
        className="rounded-lg border border-stone-600 px-3 py-2 hover:bg-stone-800 disabled:opacity-50"
      >
        {t.undo}
      </button>
    </aside>
  );
}
