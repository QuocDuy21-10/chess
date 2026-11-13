import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sanitize, useSettings } from './settings';

const DEFAULTS = {
  lang: 'en',
  side: 'w',
  musicVolume: 1,
  sfxVolume: 1,
  muted: false,
  computerLevel: 'easy',
  computerMinutes: 0,
} as const;
const stored = new Map<string, string>();

beforeEach(() => {
  stored.clear();
  vi.stubGlobal('navigator', { language: 'en-US' });
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => stored.get(name) ?? null,
    setItem: (name: string, value: string) => void stored.set(name, value),
    removeItem: (name: string) => void stored.delete(name),
  });
  useSettings.setState(DEFAULTS);
  stored.clear();
});

afterEach(() => vi.unstubAllGlobals());

test('nothing stored gives the defaults', () => {
  expect(sanitize(undefined)).toEqual(DEFAULTS);
});

test('a Vietnamese browser starts in Vietnamese', () => {
  vi.stubGlobal('navigator', { language: 'vi-VN' });
  expect(sanitize(undefined).lang).toBe('vi');
});

test('values outside the allowed set fall back to the defaults, and volumes are clamped', () => {
  expect(sanitize({ lang: 'fr', side: 'x', musicVolume: 7, sfxVolume: -1, muted: 'yes' })).toEqual({
    ...DEFAULTS,
    musicVolume: 1,
    sfxVolume: 0,
  });
  expect(sanitize({ musicVolume: 'loud', sfxVolume: NaN })).toEqual(DEFAULTS);
  expect(sanitize('garbage')).toEqual(DEFAULTS);
});

test('a change is saved, and loaded again on rehydrate', async () => {
  useSettings.getState().update({ lang: 'vi', side: 'b', musicVolume: 0.4, muted: true });
  expect(JSON.parse(stored.get('chess.settings')!).state).toMatchObject({ lang: 'vi', side: 'b', musicVolume: 0.4 });

  useSettings.setState(DEFAULTS); // also writes the defaults, so put the saved values back
  stored.set('chess.settings', JSON.stringify({ state: { side: 'b', sfxVolume: 0.25 }, version: 0 }));
  await useSettings.persist.rehydrate();
  expect(useSettings.getState()).toMatchObject({ ...DEFAULTS, side: 'b', sfxVolume: 0.25 });
});

test('blocked storage does not break the settings', async () => {
  const blocked = () => {
    throw new Error('blocked');
  };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
  useSettings.getState().update({ muted: true });
  expect(useSettings.getState().muted).toBe(true);
  await useSettings.persist.rehydrate();
  expect(useSettings.getState()).toMatchObject(DEFAULTS);
});

test("the computer's level and time are kept when valid, and fall back otherwise", () => {
  expect(sanitize({ computerLevel: 'hard', computerMinutes: 10 })).toMatchObject({
    computerLevel: 'hard',
    computerMinutes: 10,
  });
  expect(sanitize({ computerLevel: 'grandmaster', computerMinutes: 7 })).toMatchObject({
    computerLevel: 'easy',
    computerMinutes: 0,
  });
});
