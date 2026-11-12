'use client';

import { useState, type FormEvent } from 'react';
import { play } from '@/audio/audio';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { resultText, useT } from './i18n';

export function Hud() {
  const t = useT();
  const turn = useGame((s) => s.turn);
  const inCheck = useGame((s) => s.inCheck);
  const history = useGame((s) => s.history);
  const phase = useGame((s) => s.phase);
  const result = useGame((s) => s.result);
  const submitText = useGame((s) => s.submitText);
  const newGame = useGame((s) => s.newGame);
  const muted = useSettings((s) => s.muted);
  const update = useSettings((s) => s.update);
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

  const rows = [];
  for (let i = 0; i < history.length; i += 2) rows.push(history.slice(i, i + 2));
  const mover = t.team[turn === 'w' ? 'b' : 'w']; // who made the latest move
  const outcome = result && resultText(t, result);

  return (
    <aside className="flex w-full flex-col gap-4 bg-stone-900 p-4 text-stone-100 md:w-72">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <button
          onClick={() => update({ muted: !muted })}
          aria-pressed={!muted}
          className="rounded-lg border border-stone-600 px-3 py-1 text-sm hover:bg-stone-800"
        >
          {muted ? 'Sound off' : 'Sound on'}
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
          <li key={i} className="grid grid-cols-[2rem_1fr_1fr] gap-2 py-0.5">
            <span className="text-stone-500">{i + 1}.</span>
            <span>{first}</span>
            <span>{second}</span>
          </li>
        ))}
      </ol>

      <button
        onClick={newGame}
        disabled={phase === 'animating'}
        className="rounded-lg border border-stone-600 px-3 py-2 hover:bg-stone-800 disabled:opacity-50"
      >
        {t.newGame}
      </button>
    </aside>
  );
}
