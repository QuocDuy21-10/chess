'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { play } from '@/audio/audio';
import { useComputer } from '@/engine/computer';
import { useOnline } from '@/net/online';
import { TEAM } from '@/scene/theme';
import { isLocked, undoPlies, useGame } from '@/state/store';
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
  const online = useGame((s) => s.mode === 'online');
  const [drawer, setDrawer] = useState(false);
  const pause = (
    <button onClick={onPause} className={button}>
      {online ? t.menu : t.pause /* an online game cannot be paused: the clocks keep running */}
    </button>
  );

  return (
    <aside className="flex shrink-0 gap-2 bg-stone-900 text-stone-100 portrait:items-center portrait:px-3 portrait:pt-2 portrait:pb-[max(0.5rem,env(safe-area-inset-bottom))] landscape:min-h-0 landscape:w-60 landscape:flex-col landscape:gap-4 landscape:p-4 landscape:pr-[max(1rem,env(safe-area-inset-right))] landscape:lg:w-72">
      <div className="flex items-center justify-between gap-2 portrait:hidden">
        <h1 className="text-lg font-bold whitespace-nowrap lg:text-xl">{t.title}</h1>
        {pause}
      </div>
      <Status />
      <Clocks />
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
  const online = useGame((s) => s.mode === 'online');
  const connected = useOnline((s) => s.connected);
  const opponentOnline = useOnline((s) => s.opponentOnline);
  const thinking = useComputer((s) => s.thinking);
  const mover = t.team[turn === 'w' ? 'b' : 'w']; // who made the latest move
  const outcome = result && resultText(t, result);
  // Online, while the game is live: say so when either player has lost the server.
  const trouble = !online || result ? null : !connected ? t.reconnecting : !opponentOnline ? t.opponentOffline : null;

  return (
    <>
      <p className="portrait:min-w-0 portrait:flex-1 landscape:text-lg">
        {outcome ?? t.toMove(t.team[turn])}
        {!result && inCheck && <span className="ml-2 font-semibold text-red-400">{t.check}</span>}
        {!result && thinking && (
          <span role="status" className="block text-sm text-stone-300">
            {t.thinking}
          </span>
        )}
        {trouble && (
          <span role="status" className="block text-sm text-amber-300">
            {trouble}
          </span>
        )}
      </p>
      <p aria-live="polite" className="sr-only">
        {latest && t.played(mover, latest)} {outcome}
      </p>
    </>
  );
}

/** Both clocks, online or against the computer. A time is known when something happens; in between, this counts down. */
function Clocks() {
  const t = useT();
  const seat = useGame((s) => s.seat);
  const mode = useGame((s) => s.mode);
  const online = useOnline((s) => s);
  const computer = useComputer((s) => s);
  const { clocks, clocksAt, running } = mode === 'computer' ? computer : online;
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  if (mode === 'local' || (mode === 'computer' && !computer.minutes)) return null;

  return (
    <div className="flex flex-col gap-1 font-mono portrait:text-sm">
      {(['w', 'b'] as const).map((color) => {
        // `now` is older than `clocksAt` until the first tick after a change, hence the floor at zero
        const elapsed = color === running ? Math.max(0, now - clocksAt) : 0;
        const seconds = Math.ceil(Math.max(0, clocks[color] - elapsed) / 1000);
        const who = color === seat ? t.you : mode === 'computer' ? t.computer : null;
        const player = mode === 'online' ? online.players[color] : null; // online: the account in that seat
        return (
          <p
            key={color}
            data-running={color === running}
            className="flex items-center gap-2 rounded px-2 data-[running=true]:bg-amber-600/40 landscape:py-1"
          >
            <span aria-hidden className="size-3 rounded-full" style={{ background: TEAM[color] }} />
            <span className="flex-1 font-sans portrait:sr-only">
              {player ? `${player.name} · ${player.rating}` : t.team[color]}
              {who && ` (${who})`}
            </span>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </p>
        );
      })}
    </div>
  );
}

function UndoButton() {
  const t = useT();
  const undo = useGame((s) => s.undo);
  const possible = useGame((s) => undoPlies(s) > 0);
  const online = useGame((s) => s.mode === 'online');
  if (online) return null; // a move made online cannot be taken back
  return (
    <button onClick={undo} disabled={!possible} className={button}>
      {t.undo}
    </button>
  );
}

function MoveInput() {
  const t = useT();
  const id = useId(); // the column and the drawer can both be in the page
  const locked = useGame((s) => s.phase !== 'idle' || isLocked(s)); // online: also when it is not this device's turn
  const submitText = useGame((s) => s.submitText);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
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
          readOnly={locked} // not disabled: that would drop keyboard focus after every move
          autoComplete="off"
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          placeholder="Nf3 / g1f3"
          className="min-h-11 min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 read-only:opacity-50"
        />
        <button
          disabled={locked}
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
