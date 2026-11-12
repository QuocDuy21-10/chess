import type { Color } from 'chess.js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { setMuted, setVolume } from '@/audio/audio';

export type Lang = 'en' | 'vi';

interface Values {
  lang: Lang;
  side: Color; // the army nearest the camera
  musicVolume: number; // 0 to 1
  sfxVolume: number; // 0 to 1
  muted: boolean;
}

interface Settings extends Values {
  update(patch: Partial<Values>): void;
}

const detectLang = (): Lang =>
  typeof navigator !== 'undefined' && navigator.language?.startsWith('vi') ? 'vi' : 'en';

/** Turns whatever was in storage into valid settings. Anything missing or out of range becomes the default. */
export function sanitize(stored: unknown): Values {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const volume = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  return {
    lang: s.lang === 'en' || s.lang === 'vi' ? s.lang : detectLang(),
    side: s.side === 'b' ? 'b' : 'w',
    musicVolume: volume(s.musicVolume),
    sfxVolume: volume(s.sfxVolume),
    muted: s.muted === true,
  };
}

// localStorage is missing on the server and can throw in the browser when storage is blocked.
// Then the settings simply last for the visit.
const storage = createJSONStorage<Settings>(() => ({
  getItem(name) {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value);
    } catch {
      // not saved
    }
  },
  removeItem(name) {
    try {
      localStorage.removeItem(name);
    } catch {
      // nothing to remove
    }
  },
}));

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      lang: 'en',
      side: 'w',
      musicVolume: 1,
      sfxVolume: 1,
      muted: false,
      update: (patch) => set(patch),
    }),
    {
      name: 'chess.settings',
      storage,
      // Rehydrated from Game.tsx after mount, so the server and first client render agree.
      skipHydration: true,
      merge: (stored, current) => ({ ...current, ...sanitize(stored) }),
    },
  ),
);

useSettings.subscribe((s) => {
  setMuted(s.muted);
  setVolume('music', s.musicVolume);
  setVolume('sfx', s.sfxVolume);
});
