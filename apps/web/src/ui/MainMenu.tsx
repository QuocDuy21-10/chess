'use client';

import { TIME_CONTROLS } from '@chess/shared/protocol';
import { useEffect, useRef, useState } from 'react';
import { useComputer } from '@/engine/computer';
import { COMPUTER_TIMES, LEVELS } from '@/engine/levels';
import { prefetchEngine } from '@/engine/prefetch';
import { useAccount } from '@/net/account';
import { useOnline } from '@/net/online';
import { serverUrl } from '@/net/server';
import { TEAM } from '@/scene/theme';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useT } from './i18n';
import { ProfilePanel } from './Profile';

const primary = 'min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500 disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';
const pressed = 'aria-pressed:border-amber-500 aria-pressed:bg-stone-800';

/** The opening screen: a layer over the dimmed scene. `onPlay` shows the board. */
export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  const t = useT();
  const side = useSettings((s) => s.side);
  const update = useSettings((s) => s.update);
  const computerOn = useComputer((s) => s.active);
  const computerFailed = useComputer((s) => s.error !== null);
  const stopComputer = useComputer((s) => s.stop);
  // A game against the computer can be resumed even before its first move.
  const inProgress = useGame((s) => s.history.length > 0 || s.result !== null) || computerOn;
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const status = useOnline((s) => s.status);
  const failed = useOnline((s) => s.error !== null);
  const [panel, setPanel] = useState<'main' | 'online' | 'computer' | 'profile'>('main');
  // Each time the menu opens: the rating may have moved since.
  useEffect(() => void useAccount.getState().load(), []);
  const profile = panel === 'profile' && status === 'off';
  // The online panel also shows while a room is being set up, and to say why the last one ended.
  const online = !profile && (panel === 'online' || status !== 'off' || failed);
  // The computer panel also shows to say why the last game against the computer ended.
  const computer = !online && !profile && (panel === 'computer' || computerFailed);
  const mode = online || profile ? t.playOnline : computer || computerOn ? t.playComputer : t.twoPlayers;

  /** A new game in the current mode. Also plays the fade from black and the camera descent. */
  function again() {
    newGame();
    onPlay();
  }

  /** A two-player game. Leaving the computer resets the board by itself. */
  function twoPlayers() {
    if (computerOn) stopComputer();
    else newGame();
    onPlay();
  }

  function back() {
    setPanel('main');
    useOnline.setState({ error: null });
    useComputer.setState({ error: null });
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl">
        <h1 className="text-center text-3xl font-bold">{t.title}</h1>
        <p className="text-center text-stone-300">
          {t.mode}: {mode}
        </p>

        {/* Once a room exists the seat is fixed, so the choice is hidden. */}
        {status === 'off' && !profile && (
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

        {profile ? (
          <ProfilePanel onBack={() => setPanel('online')} />
        ) : online ? (
          <OnlinePanel
            onBack={back}
            onProfile={() => {
              useOnline.setState({ error: null });
              setPanel('profile');
            }}
          />
        ) : computer ? (
          <ComputerPanel onBack={back} onPlay={onPlay} />
        ) : (
          <>
            {inProgress ? (
              <>
                <button autoFocus onClick={onPlay} className={primary}>
                  {t.resume}
                </button>
                <button onClick={again} disabled={animating} className={secondary}>
                  {t.newGame}
                </button>
              </>
            ) : (
              <button autoFocus onClick={twoPlayers} className={primary}>
                {t.start}
              </button>
            )}
            {computerOn && (
              <button onClick={twoPlayers} disabled={animating} className={secondary}>
                {t.twoPlayers}
              </button>
            )}
            <button
              onClick={() => {
                prefetchEngine();
                setPanel('computer');
              }}
              className={secondary}
            >
              {t.playComputer}
            </button>
            <button onClick={() => setPanel('online')} className={secondary}>
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

/** Signing in; then choosing a time and creating a room, then waiting in it with the invite link. */
function OnlinePanel({ onBack, onProfile }: { onBack: () => void; onProfile: () => void }) {
  const t = useT();
  const account = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const providers = useAccount((s) => s.providers);
  const loginFailed = useAccount((s) => s.loginFailed);
  const logout = useAccount((s) => s.logout);
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

  if (account !== 'signed-in' || !user) {
    // An invite link's ?room= rides along, so the sign-in comes back to the same room.
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return (
      <>
        {account === 'loading' && (
          <p role="status" className="text-center text-stone-300">
            {t.loadingAccount}
          </p>
        )}
        {account === 'unreachable' && (
          <p role="alert" className="text-sm text-red-400">
            {t.onlineError.unreachable}
          </p>
        )}
        {account === 'signed-out' && (
          <>
            <p role={loginFailed ? 'alert' : undefined} className={`text-sm ${loginFailed ? 'text-red-400' : 'text-stone-300'}`}>
              {loginFailed ? t.loginFailed : t.onlineError['signed-out']}
            </p>
            {providers.map((name, index) => (
              <a
                key={name}
                autoFocus={index === 0}
                href={`${serverUrl()}/auth/${name}?returnTo=${returnTo}`}
                className={`${index === 0 ? primary : secondary} flex items-center justify-center`}
              >
                {t.signInWith(t.provider[name] ?? name)}
              </a>
            ))}
          </>
        )}
        <button autoFocus={account !== 'signed-out'} onClick={onBack} className={secondary}>
          {t.back}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {user.avatar && (
          // eslint-disable-next-line @next/next/no-img-element -- any provider's host; next/image would need each one listed
          <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full" />
        )}
        <p className="min-w-0 flex-1">
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block text-sm text-stone-300">{t.rating(user.rating)}</span>
        </p>
      </div>
      {error && error !== 'signed-out' && (
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
      <button
        autoFocus
        onClick={() => {
          useComputer.getState().stop();
          create(minutes);
        }}
        disabled={animating}
        className={primary}
      >
        {t.createRoom}
      </button>
      <div className="flex gap-2">
        <button onClick={onProfile} className={`${secondary} flex-1`}>
          {t.profile}
        </button>
        <button onClick={() => void logout()} className={`${secondary} flex-1`}>
          {t.signOut}
        </button>
      </div>
      <button onClick={onBack} className={secondary}>
        {t.back}
      </button>
    </>
  );
}

/** Choosing the computer's strength and the time, then starting. */
function ComputerPanel({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const t = useT();
  const level = useSettings((s) => s.computerLevel);
  const minutes = useSettings((s) => s.computerMinutes);
  const update = useSettings((s) => s.update);
  const failed = useComputer((s) => s.error !== null);
  const start = useComputer((s) => s.start);
  const animating = useGame((s) => s.phase === 'animating');

  function begin() {
    void start(); // the engine loads behind the camera's descent; the machine moves once it is ready
    onPlay();
  }

  return (
    <>
      {failed && (
        <p role="alert" className="text-sm text-red-400">
          {t.engineError}
        </p>
      )}
      <div role="group" aria-labelledby="level-label" className="flex flex-col gap-2">
        <span id="level-label" className="text-sm text-stone-300">
          {t.strength}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {LEVELS.map((value) => (
            <button
              key={value}
              aria-pressed={level === value}
              onClick={() => update({ computerLevel: value })}
              className={`${secondary} ${pressed}`}
            >
              {t.level[value]}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-labelledby="computer-time-label" className="flex flex-col gap-2">
        <span id="computer-time-label" className="text-sm text-stone-300">
          {t.timeControl}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {COMPUTER_TIMES.map((value) => (
            <button
              key={value}
              aria-pressed={minutes === value}
              onClick={() => update({ computerMinutes: value })}
              className={`${secondary} ${pressed}`}
            >
              {value ? t.minutes(value) : t.unlimited}
            </button>
          ))}
        </div>
      </div>
      <button autoFocus onClick={begin} disabled={animating} className={primary}>
        {t.start}
      </button>
      <button onClick={onBack} className={secondary}>
        {t.back}
      </button>
    </>
  );
}
