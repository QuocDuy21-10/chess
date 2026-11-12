'use client';

import { play } from '@/audio/audio';
import { useSettings, type Lang } from '@/state/settings';
import { useT } from './i18n';
import { Modal } from './Modal';

const LANGUAGES: [Lang, string][] = [
  ['en', 'English'],
  ['vi', 'Tiếng Việt'],
];
const toggle =
  'min-h-11 flex-1 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 aria-pressed:border-amber-500 aria-pressed:bg-stone-800';

export function Settings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang, musicVolume, sfxVolume, muted, update } = useSettings();
  const sample = () => play('select'); // lets the player hear the new effects level

  return (
    <Modal label={t.settings} onCancel={onClose}>
      <h2 className="mb-4 text-lg font-semibold">{t.settings}</h2>
      <div className="flex min-w-64 flex-col gap-4">
        <div role="group" aria-labelledby="language-label" className="flex flex-col gap-2">
          <span id="language-label" className="text-sm text-stone-300">
            {t.language}
          </span>
          <div className="flex gap-2">
            {LANGUAGES.map(([code, name]) => (
              <button
                key={code}
                lang={code}
                aria-pressed={lang === code}
                onClick={() => update({ lang: code })}
                className={toggle}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm text-stone-300">
          {t.musicVolume}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(musicVolume * 100)}
            onChange={(event) => update({ musicVolume: Number(event.target.value) / 100 })}
            className="h-11 accent-amber-500"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-stone-300">
          {t.sfxVolume}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sfxVolume * 100)}
            onChange={(event) => update({ sfxVolume: Number(event.target.value) / 100 })}
            onPointerUp={sample}
            onKeyUp={(event) => event.key !== 'Tab' && sample()}
            className="h-11 accent-amber-500"
          />
        </label>

        <button aria-pressed={muted} onClick={() => update({ muted: !muted })} className={toggle}>
          {t.mute}
        </button>

        <button
          autoFocus
          onClick={onClose}
          className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
        >
          {t.done}
        </button>
      </div>
    </Modal>
  );
}
