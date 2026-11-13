'use client';

import { useRef, useState } from 'react';
import { useOnline } from '@/net/online';
import { TIME_CONTROLS } from '@/net/protocol';
import { TEAM } from '@/scene/theme';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useT } from './i18n';

const primary = 'min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500 disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';
const pressed = 'aria-pressed:border-amber-500 aria-pressed:bg-stone-800';

/** The opening screen: a layer over the dimmed scene. `onPlay` shows the board. */
export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  const t = useT();
  const side = useSettings((s) => s.side);
  const update = useSettings((s) => s.update);
  const inProgress = useGame((s) => s.history.length > 0 || s.result !== null);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const status = useOnline((s) => s.status);
  const failed = useOnline((s) => s.error !== null);
  const [chosen, setChosen] = useState(false); // the player pressed "Play online"
  // The online panel also shows while a room is being set up, and to say why the last one ended.
  const online = chosen || status !== 'off' || failed;

  function start() {
    newGame(); // also plays the fade from black and the camera descent
    onPlay();
  }

  function back() {
    setChosen(false);
    useOnline.setState({ error: null });
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl">
        <h1 className="text-center text-3xl font-bold">{t.title}</h1>
        <p className="text-center text-stone-300">
          {t.mode}: {online ? t.playOnline : t.twoPlayers}
        </p>

        {/* Once a room exists the seat is fixed, so the choice is hidden. */}
        {status === 'off' && (
          <div role="group" aria-labelledby="side-label" className="flex flex-col gap-2">
            <span id="side-label" className="text-sm text-stone-300">
              {t.sideLabel}
            </span>
            <div className="flex gap-2">
              {(['w', 'b'] as const).map((color) => (
                <button
                  key={color}
                  aria-pressed={side === color}
                  disabled={animating} // a fight is using the camera
                  onClick={() => update({ side: color })}
                  className={`${secondary} ${pressed} flex flex-1 items-center justify-center gap-2`}
                >
                  <span aria-hidden className="size-3 rounded-full" style={{ background: TEAM[color] }} />
                  {t.team[color]}
                </button>
              ))}
            </div>
          </div>
        )}

        {online ? (
          <OnlinePanel onBack={back} />
        ) : (
          <>
            {inProgress ? (
              <>
                <button autoFocus onClick={onPlay} className={primary}>
                  {t.resume}
                </button>
                <button onClick={start} disabled={animating} className={secondary}>
                  {t.newGame}
                </button>
              </>
            ) : (
              <button autoFocus onClick={start} className={primary}>
                {t.start}
              </button>
            )}
            <button onClick={() => setChosen(true)} className={secondary}>
              {t.playOnline}
            </button>
            <button onClick={onSettings} className={secondary}>
              {t.settings}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Choosing a time and creating a room, then waiting in it with the invite link. */
function OnlinePanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const status = useOnline((s) => s.status);
  const roomId = useOnline((s) => s.roomId);
  const error = useOnline((s) => s.error);
  const create = useOnline((s) => s.create);
  const leave = useOnline((s) => s.leave);
  const animating = useGame((s) => s.phase === 'animating');
  const [minutes, setMinutes] = useState(10);
  const [copied, setCopied] = useState(false);
  const link = useRef<HTMLInputElement>(null);

  if (status === 'connecting') {
    return (
      <>
        <p role="status" className="text-center text-stone-300">
          {t.connecting}
        </p>
        <button autoFocus onClick={leave} className={secondary}>
          {t.cancel}
        </button>
      </>
    );
  }

  if (status === 'waiting' && roomId) {
    const url = `${location.origin}${location.pathname}?room=${roomId}`;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        link.current?.select(); // no clipboard here (an http page, or permission refused): copy by hand
      }
    };
    return (
      <>
        <p role="status" className="text-center text-stone-300">
          {t.waitingOpponent}
        </p>
        <label className="flex flex-col gap-2 text-sm text-stone-300">
          {t.inviteLink}
          <input
            ref={link}
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            className="min-h-11 rounded-lg bg-stone-800 px-3 py-2 text-stone-100"
          />
        </label>
        <button autoFocus onClick={copy} className={primary}>
          {copied ? t.copied : t.copyLink}
        </button>
        <button onClick={leave} className={secondary}>
          {t.cancel}
        </button>
      </>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {t.onlineError[error]}
        </p>
      )}
      <div role="group" aria-labelledby="time-label" className="flex flex-col gap-2">
        <span id="time-label" className="text-sm text-stone-300">
          {t.timeControl}
        </span>
        <div className="flex gap-2">
          {TIME_CONTROLS.map((value) => (
            <button
              key={value}
              aria-pressed={minutes === value}
              onClick={() => setMinutes(value)}
              className={`${secondary} ${pressed} flex-1`}
            >
              {t.minutes(value)}
            </button>
          ))}
        </div>
      </div>
      <button autoFocus onClick={() => create(minutes)} disabled={animating} className={primary}>
        {t.createRoom}
      </button>
      <button onClick={onBack} className={secondary}>
        {t.back}
      </button>
    </>
  );
}
