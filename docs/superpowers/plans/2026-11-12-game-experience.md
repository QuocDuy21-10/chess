# Game Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game opens on a main menu, can be paused, restarted and taken back one move at a time, has sound settings and an English/Vietnamese interface, and lays itself out for desktop, tablet and phone.

**Architecture:** The 3D scene stays mounted on the one existing page; the main menu, pause menu and settings are DOM layers above it, switched by a `screen` value held in `Game.tsx`. A second, persisted Zustand store holds the settings and pushes sound levels into `audio.ts`. The game store gains `undo()` backed by per-move snapshots of `pieces`, and reports a structured `result` that the interface translates.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, three.js, React Three Fiber, drei, chess.js, Zustand (with its `persist` middleware), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-game-experience-design.md`

## Global Constraints

- Installed versions, unchanged: `next@16.4.6`, `react@19.3.0`, `chess.js@1.4.0`, `zustand@5.1.0`, `three@0.187.0`, `@react-three/fiber@9.8.2`, `@react-three/drei@10.7.9`, `vitest@5.1.0`, `tailwindcss@4.3.3`.
- No new dependencies. No i18n library, no audio library, no router.
- `AGENTS.md`: this Next.js differs from older ones. Before writing any Next.js-specific code that is not copied from this plan, read the matching guide in `node_modules/next/dist/docs/`.
- `chess.js` decides every rule. Never re-implement move legality.
- Two players on one screen only. Amber (`chess.js` white) always moves first. No computer opponent and no placeholder for one.
- Every string a player can read goes through `useT()` from `src/ui/i18n.ts`. Move notation stays standard SAN (`Nf3`, `O-O`) in both languages.
- Game title: "Combat Chess". Team names: Amber / Teal in English, Cam / Lục in Vietnamese.
- Settings are saved under `localStorage['chess.settings']`. The old `chess.muted` key is dropped without migration.
- Layout rule: landscape shows the HUD as a side column, portrait shows a bar under the board plus a drawer. Buttons are at least 44 px in both directions.
- Chess rules, animation steps, the sequencer and the fight choreography are not changed by this plan.
- Run every command from the repository root (the folder that contains `docs/`).
- Work on the branch `feat/game-experience`. Commit only the paths each task names. Never commit `roadmap.md`, `roadmap-2.md`, `design-3D.md`, `3D-Stylized.md`, `chess.jpeg` or `.vitest/`.

## How to read the code blocks

- A block introduced by **Create** or **Replace … with** is the complete file.
- A `diff` block is the exact change to an existing file, produced by `git diff`. Apply it by hand, or save it to a file and run `git apply <file>`. The diffs apply cleanly when the tasks are done in order.

## What was checked while writing this plan

Every task below was written into a scratch clone of this branch, one commit per task, using this repository's `node_modules`.

- Checked, at each of the six task commits: `npx tsc --noEmit` (TypeScript 5.9.3), `npx eslint` and `npx vitest run` all pass. Test counts: 38 after Tasks 1 and 2, 46 from Task 3 on.
- Checked: the 31 code blocks in this plan were replayed in order on a fresh clone of the branch. Every diff applied cleanly, the result is identical to the scratch clone, and all three commands pass on it.
- Not checked: nothing was rendered in a browser. The layouts, the Tailwind variants (`portrait:`, `landscape:`, `aria-pressed:`, `aria-[current=step]:`), the `inert` attribute, the drawer, the camera behind the Teal army and all sound levels are untested. Each task has a browser step and Task 7 exists to catch the rest.
- Not checked: `npm run build`. It could not run in the scratch clone because Turbopack refuses a symlinked `node_modules`. Task 7 runs it.

One fact read from the installed code and relied on:

- `OrbitControls` in `three@0.187.0` accepts an azimuth range that crosses π (`node_modules/three/examples/jsm/controls/OrbitControls.js`, "restrict theta to be between desired limits"). Task 4 uses `5π/6 … 7π/6` for the Teal side.

## Deviations from the spec

- **Changing side:** the spec asks for a 400 ms glide to the new home. A straight glide from one side to the other passes directly above the board, where the view flips. Instead the camera jumps behind the other army and plays the opening descent. With `prefers-reduced-motion` it only jumps, as the spec says.
- **Side buttons** are disabled while a move is animating, because a fight is using the camera.
- **Game-over dialog:** the spec says it is "keyed". No key is needed: the dialog is unmounted whenever `result` is `null`, which happens between any two endings.
- **Settings test:** instead of passing a fake storage into the store, the test replaces `globalThis.localStorage` and tests `sanitize` directly.
- **Undo test:** instead of reading `chess.board()` (the `chess` instance is private to the store), the test checks that `pieces` equals the pieces before the move, ids included, and that replaying the move never triggers the store's resync.
- **Typed-move placeholder** changes from `Nf3 or g1f3` to `Nf3 / g1f3`, so it needs no translation.
- **Safe area:** the side column is also padded by `env(safe-area-inset-right)` in landscape.
- **Portrait bar** does not show the game title; the main menu does.

## File Structure

| File | Responsibility |
|---|---|
| `src/state/settings.ts` (new) | Persisted settings, `sanitize`, pushes sound settings into `audio` |
| `src/state/settings.test.ts` (new) | Defaults, clamping, save and load, blocked storage |
| `src/ui/i18n.ts` (new) | English and Vietnamese string tables, `useT()`, `resultText()` |
| `src/ui/MainMenu.tsx` (new) | Title, side choice, Start / Continue / New game, Settings |
| `src/ui/PauseMenu.tsx` (new) | Resume, Restart with confirmation, Settings, Main menu |
| `src/ui/Settings.tsx` (new) | Language, two volume sliders, mute |
| `src/ui/Game.tsx` | `screen` state, Escape key, rehydrates settings, `<html lang>` |
| `src/ui/Hud.tsx` | Status, move list, move input, Undo; side column or bar plus drawer |
| `src/ui/Modal.tsx` | Adds the bottom-sheet variant |
| `src/ui/PromotionChooser.tsx`, `src/ui/GameOverModal.tsx` | Translated |
| `src/state/store.ts` | `undo()`, `snapshots`, structured `result`; loses `muted` |
| `src/state/store.test.ts` | Updated result tests, new undo tests |
| `src/game/types.ts` | Adds `Result` |
| `src/audio/audio.ts` | Adds `setVolume`, `setPaused` |
| `src/scene/CameraRig.tsx`, `src/scene/Scene.tsx` | Camera home, orbit limits and key light follow `side` |
| `src/scene/theme.ts` | Loses `TEAM_NAME` (now in `i18n.ts`) |
| `src/app/layout.tsx` | Title, `viewport` export |

---

### Task 1: Settings store and volume controls

**Files:**
- Create: `src/state/settings.ts`, `src/state/settings.test.ts`
- Modify: `src/audio/audio.ts`, `src/state/store.ts`, `src/ui/Hud.tsx`, `src/ui/Game.tsx`

**Interfaces:**
- Consumes: `setMuted(value: boolean)` from `src/audio/audio.ts` (exists).
- Produces:
  - `useSettings` — a Zustand hook whose state is `{ lang: 'en' | 'vi'; side: 'w' | 'b'; musicVolume: number; sfxVolume: number; muted: boolean; update(patch): void }`. `update` takes any subset of the five values.
  - `useSettings.persist.rehydrate(): Promise<void>` — loads from `localStorage`.
  - `type Lang = 'en' | 'vi'` and `sanitize(stored: unknown)` from `src/state/settings.ts`.
  - `setVolume(channel: 'music' | 'sfx', value: number): void` and `setPaused(on: boolean): void` from `src/audio/audio.ts`.
  - `useGame` no longer has `muted` or `setMuted`.

- [ ] **Step 1: Write the failing test**

Create `src/state/settings.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sanitize, useSettings } from './settings';

const DEFAULTS = { lang: 'en', side: 'w', musicVolume: 1, sfxVolume: 1, muted: false } as const;
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/state/settings.test.ts`
Expected: FAIL — the import of `./settings` cannot be resolved.

- [ ] **Step 3: Add the two volume functions to the audio module**

`src/audio/audio.ts`:

```diff
diff --git a/src/audio/audio.ts b/src/audio/audio.ts
index dbac72a..917f66c 100644
--- a/src/audio/audio.ts
+++ b/src/audio/audio.ts
@@ -18,6 +18,7 @@ export type SoundName = keyof typeof FILES;
 
 const MUSIC_VOLUME = 0.35;
 const DUCKED = 0.35; // fraction of the music level left during a fight
+const PAUSED = 0.35; // and while the pause menu is open
 
 let ctx: AudioContext | null = null;
 let master: GainNode;
@@ -26,7 +27,12 @@ let music: GainNode;
 const buffers = new Map<string, AudioBuffer>();
 let muted = false;
 let ducked = false;
+let paused = false;
 let level = 1;
+const volume = { music: 1, sfx: 1 }; // the player's settings, 0 to 1
+
+const musicGain = () =>
+  MUSIC_VOLUME * level * (ducked ? DUCKED : 1) * (paused ? PAUSED : 1) * volume.music;
 
 /** Plays a sound `delayMs` from now, on the audio clock. One of several files is picked at random. */
 export function play(name: SoundName, delayMs = 0): void {
@@ -48,7 +54,7 @@ export function setMuted(value: boolean): void {
 function rampMusic(ms: number) {
   if (!ctx) return;
   // setTargetAtTime approaches its target exponentially; a third of `ms` as the time constant gets ~95% there
-  music.gain.setTargetAtTime(MUSIC_VOLUME * level * (ducked ? DUCKED : 1), ctx.currentTime, ms / 3000);
+  music.gain.setTargetAtTime(musicGain(), ctx.currentTime, ms / 3000);
 }
 
 /** Lowers the music under a fight, and brings it back. */
@@ -57,6 +63,19 @@ export function duck(on: boolean): void {
   rampMusic(300);
 }
 
+/** Lowers the music while the pause menu is open. Separate from `duck`, so a fight ending behind the menu does not raise it. */
+export function setPaused(on: boolean): void {
+  paused = on;
+  rampMusic(300);
+}
+
+/** Sets the player's volume for one channel, 0 to 1. Remembered until the audio is unlocked. */
+export function setVolume(channel: 'music' | 'sfx', value: number): void {
+  volume[channel] = value;
+  if (channel === 'music') rampMusic(50);
+  else if (ctx) sfx.gain.value = value;
+}
+
 /** Fades the music to `to` (0 to 1) of its normal level. */
 export function fadeMusic(to: number, ms: number): void {
   level = to;
@@ -80,7 +99,8 @@ function unlock() {
   sfx = ctx.createGain();
   music = ctx.createGain();
   master.gain.value = muted ? 0 : 1;
-  music.gain.value = MUSIC_VOLUME * level * (ducked ? DUCKED : 1);
+  sfx.gain.value = volume.sfx;
+  music.gain.value = musicGain();
   sfx.connect(master);
   music.connect(master);
   master.connect(ctx.destination);
```

- [ ] **Step 4: Write the settings store**

Create `src/state/settings.ts`:

```ts
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
```

The storage wrapper matters: with zustand's default storage, a browser that blocks `localStorage` leaves `useSettings.persist` undefined and `rehydrate()` would throw.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/state/settings.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Move mute out of the game store**

`src/state/store.ts`:

```diff
diff --git a/src/state/store.ts b/src/state/store.ts
index 2df4633..db806c5 100644
--- a/src/state/store.ts
+++ b/src/state/store.ts
@@ -1,6 +1,6 @@
 import { Chess, type Color, type Move, type Square } from 'chess.js';
 import { create } from 'zustand';
-import { duck, fadeMusic, play, setMuted } from '@/audio/audio';
+import { duck, fadeMusic, play } from '@/audio/audio';
 import { planMove } from '@/game/planMove';
 import { matchesBoard, piecesFromBoard } from '@/game/position';
 import { squareToWorld } from '@/game/squares';
@@ -25,8 +25,6 @@ interface GameState {
   result: string | null;
   cinematic: boolean; // letterbox bars are showing
   gameId: number; // changes on every new game
-  muted: boolean;
-  setMuted(muted: boolean): void;
   select(square: Square | null): void;
   submitMove(from: Square, to: Square, promotion?: PromotionPiece): Promise<void>;
   submitText(text: string): boolean;
@@ -64,17 +62,6 @@ const fresh = () => ({
 export const useGame = create<GameState>((set, get) => ({
   ...fresh(),
   gameId: 0,
-  muted: false,
-
-  setMuted(muted) {
-    setMuted(muted);
-    try {
-      localStorage.setItem('chess.muted', muted ? '1' : '0');
-    } catch {
-      // storage is blocked: the choice lasts for this visit only
-    }
-    set({ muted });
-  },
 
   select(square) {
     if (get().phase !== 'idle') return;
```

`src/ui/Hud.tsx` (the button stays here until Task 5 moves it into Settings):

```diff
diff --git a/src/ui/Hud.tsx b/src/ui/Hud.tsx
index a9951e4..4115672 100644
--- a/src/ui/Hud.tsx
+++ b/src/ui/Hud.tsx
@@ -1,8 +1,9 @@
 'use client';
 
-import { useEffect, useState, type FormEvent } from 'react';
+import { useState, type FormEvent } from 'react';
 import { play } from '@/audio/audio';
 import { TEAM_NAME } from '@/scene/theme';
+import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
 
 export function Hud() {
@@ -13,18 +14,9 @@ export function Hud() {
   const result = useGame((s) => s.result);
   const submitText = useGame((s) => s.submitText);
   const newGame = useGame((s) => s.newGame);
-  const muted = useGame((s) => s.muted);
-  const setMuted = useGame((s) => s.setMuted);
+  const muted = useSettings((s) => s.muted);
+  const update = useSettings((s) => s.update);
   const [text, setText] = useState('');
-
-  // Read after mount, not at store creation, so the server and first client render agree.
-  useEffect(() => {
-    try {
-      if (localStorage.getItem('chess.muted') === '1') setMuted(true);
-    } catch {
-      // storage is blocked: start with sound on
-    }
-  }, [setMuted]);
   const [error, setError] = useState('');
 
   function onSubmit(event: FormEvent) {
@@ -48,7 +40,7 @@ export function Hud() {
       <div className="flex items-center justify-between">
         <h1 className="text-xl font-bold">Chess</h1>
         <button
-          onClick={() => setMuted(!muted)}
+          onClick={() => update({ muted: !muted })}
           aria-pressed={!muted}
           className="rounded-lg border border-stone-600 px-3 py-1 text-sm hover:bg-stone-800"
         >
```

`src/ui/Game.tsx`:

```diff
diff --git a/src/ui/Game.tsx b/src/ui/Game.tsx
index 4893f52..d488491 100644
--- a/src/ui/Game.tsx
+++ b/src/ui/Game.tsx
@@ -1,6 +1,8 @@
 'use client';
 
 import dynamic from 'next/dynamic';
+import { useEffect } from 'react';
+import { useSettings } from '@/state/settings';
 import { Cinematic } from './Cinematic';
 import { GameOverModal } from './GameOverModal';
 import { Hud } from './Hud';
@@ -13,6 +15,9 @@ const Scene = dynamic(() => import('@/scene/Scene'), {
 });
 
 export function Game() {
+  // After mount, not at store creation, so the server and first client render agree.
+  useEffect(() => void useSettings.persist.rehydrate(), []);
+
   return (
     <main className="flex h-dvh flex-col bg-stone-950 md:flex-row">
       <div className="relative min-h-0 flex-1">
```

- [ ] **Step 7: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors; 38 tests pass in 8 files.

- [ ] **Step 8: Check in the browser**

Start the `chess-dev` server from `.claude/launch.json` and open `http://localhost:3000`.
- Click "Sound on": it reads "Sound off". Reload: it still reads "Sound off".
- `localStorage.getItem('chess.settings')` in the console holds `"muted":true`.
- The console shows no hydration warning.

- [ ] **Step 9: Commit**

```bash
git add src/state/settings.ts src/state/settings.test.ts src/audio/audio.ts src/state/store.ts src/ui/Hud.tsx src/ui/Game.tsx
git commit -m "feat: add the persisted settings store and volume controls"
```

---

### Task 2: Two languages and a structured result

**Files:**
- Create: `src/ui/i18n.ts`
- Modify: `src/game/types.ts`, `src/state/store.ts`, `src/state/store.test.ts`, `src/scene/theme.ts`, `src/scene/Scene.tsx`, `src/ui/Hud.tsx`, `src/ui/PromotionChooser.tsx`, `src/ui/GameOverModal.tsx`, `src/ui/Game.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: `useSettings` (Task 1) — reads `lang`.
- Produces:
  - `type Result = { reason: 'checkmate'; winner: 'w' | 'b' } | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' }` from `src/game/types.ts`.
  - `useGame` state `result: Result | null` (was `string | null`).
  - `useT(): Strings` and `resultText(t: Strings, result: Result): string` from `src/ui/i18n.ts`. Keys that later tasks use: `title`, `team.w`, `team.b`, `mode`, `twoPlayers`, `sideLabel`, `start`, `resume`, `newGame`, `settings`, `paused`, `restart`, `restartConfirm`, `yes`, `no`, `mainMenu`, `language`, `musicVolume`, `sfxVolume`, `mute`, `done`, `moves`, `undo`, `pause`, `close`.
  - `TEAM_NAME` no longer exists in `src/scene/theme.ts`.

- [ ] **Step 1: Change the two result assertions**

`src/state/store.test.ts`:

```diff
diff --git a/src/state/store.test.ts b/src/state/store.test.ts
index 4a79c4c..fa99c38 100644
--- a/src/state/store.test.ts
+++ b/src/state/store.test.ts
@@ -84,7 +84,7 @@ test('cancelling a promotion returns to idle without moving', async () => {
 test('checkmate ends the game and names the winner', async () => {
   await play('f3', 'e5', 'g4', 'Qh4#');
   expect(game().phase).toBe('gameOver');
-  expect(game().result).toBe('Checkmate — Teal wins');
+  expect(game().result).toEqual({ reason: 'checkmate', winner: 'b' });
   expect(game().inCheck).toBe(true);
   game().select('e2'); // no input after the game ends
   expect(game().selected).toBeNull();
@@ -103,7 +103,7 @@ test('stalemate is a draw', async () => {
     'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6',
   );
   expect(game().phase).toBe('gameOver');
-  expect(game().result).toBe('Draw — stalemate');
+  expect(game().result).toEqual({ reason: 'stalemate' });
 });
 
 test('the view never drifts from chess.js through castles, en passant and promotion', async () => {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/store.test.ts`
Expected: FAIL in "checkmate ends the game and names the winner" and "stalemate is a draw" — a string was received where an object was expected.

- [ ] **Step 3: Make the result structured**

`src/game/types.ts`:

```diff
diff --git a/src/game/types.ts b/src/game/types.ts
index 5ef019f..49776e2 100644
--- a/src/game/types.ts
+++ b/src/game/types.ts
@@ -16,3 +16,8 @@ export type Step =
   | { kind: 'hop'; piece: PieceId; to: Square }
   | { kind: 'combat'; attacker: PieceId; defender: PieceId }
   | { kind: 'promote'; piece: PieceId; to: PromotionPiece };
+
+/** How a game ended. The interface turns it into words in the player's language. */
+export type Result =
+  | { reason: 'checkmate'; winner: Color }
+  | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' };
```

`src/state/store.ts`:

```diff
diff --git a/src/state/store.ts b/src/state/store.ts
index db806c5..c7df40d 100644
--- a/src/state/store.ts
+++ b/src/state/store.ts
@@ -4,11 +4,11 @@ import { duck, fadeMusic, play } from '@/audio/audio';
 import { planMove } from '@/game/planMove';
 import { matchesBoard, piecesFromBoard } from '@/game/position';
 import { squareToWorld } from '@/game/squares';
-import type { Piece, PromotionPiece } from '@/game/types';
+import type { Piece, PromotionPiece, Result } from '@/game/types';
 import { actors } from '@/scene/actors';
 import { cameraRig } from '@/scene/cameraHandle';
 import { runSteps } from '@/scene/sequencer';
-import { CAMERA, TEAM_NAME } from '@/scene/theme';
+import { CAMERA } from '@/scene/theme';
 
 type Phase = 'idle' | 'animating' | 'promoting' | 'gameOver';
 
@@ -22,7 +22,7 @@ interface GameState {
   lastMove: { from: Square; to: Square } | null;
   turn: Color;
   inCheck: boolean;
-  result: string | null;
+  result: Result | null;
   cinematic: boolean; // letterbox bars are showing
   gameId: number; // changes on every new game
   select(square: Square | null): void;
@@ -36,12 +36,12 @@ interface GameState {
 // chess.js is the single source of truth for rules and position.
 const chess = new Chess();
 
-function gameResult(): string | null {
-  if (chess.isCheckmate()) return `Checkmate — ${TEAM_NAME[chess.turn() === 'w' ? 'b' : 'w']} wins`;
-  if (chess.isStalemate()) return 'Draw — stalemate';
-  if (chess.isInsufficientMaterial()) return 'Draw — insufficient material';
-  if (chess.isThreefoldRepetition()) return 'Draw — threefold repetition';
-  if (chess.isDrawByFiftyMoves()) return 'Draw — fifty-move rule';
+function gameResult(): Result | null {
+  if (chess.isCheckmate()) return { reason: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
+  if (chess.isStalemate()) return { reason: 'stalemate' };
+  if (chess.isInsufficientMaterial()) return { reason: 'insufficient' };
+  if (chess.isThreefoldRepetition()) return { reason: 'threefold' };
+  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty' };
   return null;
 }
 
@@ -55,7 +55,7 @@ const fresh = () => ({
   lastMove: null,
   turn: 'w' as Color,
   inCheck: false,
-  result: null,
+  result: null as Result | null,
   cinematic: false,
 });
 
```

`src/scene/theme.ts`:

```diff
diff --git a/src/scene/theme.ts b/src/scene/theme.ts
index 4dc0fa7..075c6ce 100644
--- a/src/scene/theme.ts
+++ b/src/scene/theme.ts
@@ -17,7 +17,6 @@ export const PALETTE = {
 } as const;
 
 export const TEAM = { w: PALETTE.amber, b: PALETTE.teal } as const;
-export const TEAM_NAME = { w: 'Amber', b: 'Teal' } as const;
 
 // Starting values, tuned by eye.
 export const TIMING = {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/state/store.test.ts`
Expected: PASS, 10 tests. (`npx tsc --noEmit` still fails at this point, in `Hud.tsx` and `GameOverModal.tsx`; the next steps fix that.)

- [ ] **Step 5: Write the string tables**

Create `src/ui/i18n.ts`:

```ts
import type { Result } from '@/game/types';
import { useSettings } from '@/state/settings';

const en = {
  title: 'Combat Chess',
  team: { w: 'Amber', b: 'Teal' },
  toMove: (team: string) => `${team} to move`,
  check: 'Check',
  played: (team: string, san: string) => `${team} played ${san}.`,
  checkmate: (team: string) => `Checkmate — ${team} wins`,
  draw: {
    stalemate: 'Draw — stalemate',
    insufficient: 'Draw — insufficient material',
    threefold: 'Draw — threefold repetition',
    fifty: 'Draw — fifty-move rule',
  },
  typeMove: 'Type a move',
  move: 'Move',
  illegal: (text: string) => `"${text}" is not a legal move here. Try a move like Nf3 or g1f3.`,
  moves: 'Moves',
  undo: 'Undo',
  pause: 'Pause',
  close: 'Close',
  promoteLabel: 'Choose a piece to promote to',
  promoteTo: 'Promote to',
  piece: { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' },
  cancel: 'Cancel',
  gameOver: 'Game over',
  newGame: 'New game',
  viewBoard: 'View board',
  loading: 'Loading the board…',
  noWebGL:
    'This game needs WebGL 2, which this browser or device does not provide. You can still follow and enter moves in the panel.',
  mode: 'Mode',
  twoPlayers: 'Two players',
  sideLabel: 'Army nearest you',
  start: 'Start',
  resume: 'Continue',
  settings: 'Settings',
  paused: 'Paused',
  restart: 'Restart',
  restartConfirm: 'Restart from the first move?',
  yes: 'Yes',
  no: 'No',
  mainMenu: 'Main menu',
  language: 'Language',
  musicVolume: 'Music volume',
  sfxVolume: 'Effects volume',
  mute: 'Mute all sound',
  done: 'Done',
};

export type Strings = typeof en;

// `Strings` makes a missing or misspelt key a type error.
const vi: Strings = {
  title: 'Combat Chess',
  team: { w: 'Cam', b: 'Lục' },
  toMove: (team) => `Lượt của ${team}`,
  check: 'Chiếu',
  played: (team, san) => `${team} đi ${san}.`,
  checkmate: (team) => `Chiếu hết — ${team} thắng`,
  draw: {
    stalemate: 'Hòa — hết nước đi',
    insufficient: 'Hòa — không đủ quân để chiếu hết',
    threefold: 'Hòa — lặp lại ba lần',
    fifty: 'Hòa — luật 50 nước',
  },
  typeMove: 'Nhập nước đi',
  move: 'Đi',
  illegal: (text) => `"${text}" không phải nước đi hợp lệ. Hãy thử kiểu Nf3 hoặc g1f3.`,
  moves: 'Nước đi',
  undo: 'Đi lại',
  pause: 'Tạm dừng',
  close: 'Đóng',
  promoteLabel: 'Chọn quân để phong cấp',
  promoteTo: 'Phong cấp thành',
  piece: { q: 'Hậu', r: 'Xe', b: 'Tượng', n: 'Mã' },
  cancel: 'Hủy',
  gameOver: 'Kết thúc ván',
  newGame: 'Ván mới',
  viewBoard: 'Xem bàn cờ',
  loading: 'Đang tải bàn cờ…',
  noWebGL:
    'Trò chơi cần WebGL 2 mà trình duyệt hoặc thiết bị này không hỗ trợ. Bạn vẫn có thể theo dõi và nhập nước đi ở bảng bên cạnh.',
  mode: 'Chế độ',
  twoPlayers: 'Hai người chơi',
  sideLabel: 'Phe đứng gần bạn',
  start: 'Bắt đầu',
  resume: 'Tiếp tục',
  settings: 'Cài đặt',
  paused: 'Tạm dừng',
  restart: 'Chơi lại',
  restartConfirm: 'Chơi lại từ nước đầu tiên?',
  yes: 'Có',
  no: 'Không',
  mainMenu: 'Menu chính',
  language: 'Ngôn ngữ',
  musicVolume: 'Âm lượng nhạc',
  sfxVolume: 'Âm lượng hiệu ứng',
  mute: 'Tắt toàn bộ âm thanh',
  done: 'Xong',
};

const STRINGS = { en, vi };

/** The string table for the language chosen in Settings. */
export function useT(): Strings {
  return STRINGS[useSettings((s) => s.lang)];
}

export function resultText(t: Strings, result: Result): string {
  return result.reason === 'checkmate' ? t.checkmate(t.team[result.winner]) : t.draw[result.reason];
}
```

- [ ] **Step 6: Translate the existing interface**

`src/ui/Hud.tsx`:

```diff
diff --git a/src/ui/Hud.tsx b/src/ui/Hud.tsx
index 4115672..6e2d1d9 100644
--- a/src/ui/Hud.tsx
+++ b/src/ui/Hud.tsx
@@ -2,11 +2,12 @@
 
 import { useState, type FormEvent } from 'react';
 import { play } from '@/audio/audio';
-import { TEAM_NAME } from '@/scene/theme';
 import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
+import { resultText, useT } from './i18n';
 
 export function Hud() {
+  const t = useT();
   const turn = useGame((s) => s.turn);
   const inCheck = useGame((s) => s.inCheck);
   const history = useGame((s) => s.history);
@@ -27,18 +28,19 @@ export function Hud() {
       setError('');
     } else {
       play('error');
-      setError(`"${text}" is not a legal move here. Try a move like Nf3 or g1f3.`);
+      setError(t.illegal(text));
     }
   }
 
   const rows = [];
   for (let i = 0; i < history.length; i += 2) rows.push(history.slice(i, i + 2));
-  const mover = TEAM_NAME[turn === 'w' ? 'b' : 'w']; // who made the latest move
+  const mover = t.team[turn === 'w' ? 'b' : 'w']; // who made the latest move
+  const outcome = result && resultText(t, result);
 
   return (
     <aside className="flex w-full flex-col gap-4 bg-stone-900 p-4 text-stone-100 md:w-72">
       <div className="flex items-center justify-between">
-        <h1 className="text-xl font-bold">Chess</h1>
+        <h1 className="text-xl font-bold">{t.title}</h1>
         <button
           onClick={() => update({ muted: !muted })}
           aria-pressed={!muted}
@@ -49,17 +51,17 @@ export function Hud() {
       </div>
 
       <p className="text-lg">
-        {result ?? `${TEAM_NAME[turn]} to move`}
-        {!result && inCheck && <span className="ml-2 font-semibold text-red-400">Check</span>}
+        {outcome ?? t.toMove(t.team[turn])}
+        {!result && inCheck && <span className="ml-2 font-semibold text-red-400">{t.check}</span>}
       </p>
 
       <p aria-live="polite" className="sr-only">
-        {history.length > 0 && `${mover} played ${history.at(-1)}.`} {result}
+        {history.length > 0 && t.played(mover, history.at(-1)!)} {outcome}
       </p>
 
       <form onSubmit={onSubmit} className="flex flex-col gap-1">
         <label htmlFor="move" className="text-sm text-stone-300">
-          Type a move
+          {t.typeMove}
         </label>
         <div className="flex gap-2">
           <input
@@ -77,7 +79,7 @@ export function Hud() {
             disabled={phase !== 'idle'}
             className="rounded-lg bg-amber-600 px-3 py-2 font-medium hover:bg-amber-500 disabled:opacity-50"
           >
-            Move
+            {t.move}
           </button>
         </div>
         {error && (
@@ -87,7 +89,7 @@ export function Hud() {
         )}
       </form>
 
-      <ol aria-label="Moves" className="min-h-24 flex-1 overflow-y-auto font-mono text-sm">
+      <ol aria-label={t.moves} className="min-h-24 flex-1 overflow-y-auto font-mono text-sm">
         {rows.map(([first, second], i) => (
           <li key={i} className="grid grid-cols-[2rem_1fr_1fr] gap-2 py-0.5">
             <span className="text-stone-500">{i + 1}.</span>
@@ -102,7 +104,7 @@ export function Hud() {
         disabled={phase === 'animating'}
         className="rounded-lg border border-stone-600 px-3 py-2 hover:bg-stone-800 disabled:opacity-50"
       >
-        New game
+        {t.newGame}
       </button>
     </aside>
   );
```

Replace `src/ui/PromotionChooser.tsx` with:

```tsx
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
```

Replace `src/ui/GameOverModal.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useGame } from '@/state/store';
import { resultText, useT } from './i18n';
import { Modal } from './Modal';

export function GameOverModal() {
  const over = useGame((s) => s.result !== null);
  // Unmounted whenever there is no result, so `closed` starts fresh each time a game ends,
  // including a second ending after an undo.
  return over ? <Dialog /> : null;
}

function Dialog() {
  const t = useT();
  const result = useGame((s) => s.result);
  const newGame = useGame((s) => s.newGame);
  // Closing only hides the dialog so the final position can be studied.
  const [closed, setClosed] = useState(false);
  if (closed || !result) return null;
  return (
    <Modal label={t.gameOver} onCancel={() => setClosed(true)}>
      <h2 className="mb-4 text-lg font-semibold">{resultText(t, result)}</h2>
      <div className="flex flex-wrap gap-2">
        <button
          autoFocus
          onClick={newGame}
          className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
        >
          {t.newGame}
        </button>
        <button
          onClick={() => setClosed(true)}
          className="min-h-11 rounded-lg px-4 py-2 text-stone-300 hover:bg-stone-800"
        >
          {t.viewBoard}
        </button>
      </div>
    </Modal>
  );
}
```

`src/scene/Scene.tsx`:

```diff
diff --git a/src/scene/Scene.tsx b/src/scene/Scene.tsx
index e9325bf..0176496 100644
--- a/src/scene/Scene.tsx
+++ b/src/scene/Scene.tsx
@@ -3,6 +3,7 @@
 import { Canvas, useFrame } from '@react-three/fiber';
 import { useState } from 'react';
 import { useGame } from '@/state/store';
+import { useT } from '@/ui/i18n';
 import { Board } from './Board';
 import { CameraRig } from './CameraRig';
 import { PieceActor } from './Piece';
@@ -27,12 +28,12 @@ export default function Scene() {
   const pieces = useGame((s) => s.pieces);
   const select = useGame((s) => s.select);
   const [webgl] = useState(hasWebGL);
+  const t = useT();
 
   if (!webgl) {
     return (
       <p role="alert" className="p-8 text-center text-stone-200">
-        This game needs WebGL 2, which this browser or device does not provide. You can still follow and
-        enter moves in the panel.
+        {t.noWebGL}
       </p>
     );
   }
```

`src/ui/Game.tsx`:

```diff
diff --git a/src/ui/Game.tsx b/src/ui/Game.tsx
index d488491..157e8a2 100644
--- a/src/ui/Game.tsx
+++ b/src/ui/Game.tsx
@@ -6,18 +6,28 @@ import { useSettings } from '@/state/settings';
 import { Cinematic } from './Cinematic';
 import { GameOverModal } from './GameOverModal';
 import { Hud } from './Hud';
+import { useT } from './i18n';
 import { PromotionChooser } from './PromotionChooser';
 
 // The 3D scene needs the browser, so it is never rendered on the server.
 const Scene = dynamic(() => import('@/scene/Scene'), {
   ssr: false,
-  loading: () => <p className="p-8 text-center text-stone-400">Loading the board…</p>,
+  loading: () => <Loading />,
 });
 
+function Loading() {
+  return <p className="p-8 text-center text-stone-400">{useT().loading}</p>;
+}
+
 export function Game() {
   // After mount, not at store creation, so the server and first client render agree.
   useEffect(() => void useSettings.persist.rehydrate(), []);
 
+  const lang = useSettings((s) => s.lang);
+  useEffect(() => {
+    document.documentElement.lang = lang;
+  }, [lang]);
+
   return (
     <main className="flex h-dvh flex-col bg-stone-950 md:flex-row">
       <div className="relative min-h-0 flex-1">
```

`src/app/layout.tsx`:

```diff
diff --git a/src/app/layout.tsx b/src/app/layout.tsx
index f18c2d5..64cdba7 100644
--- a/src/app/layout.tsx
+++ b/src/app/layout.tsx
@@ -3,7 +3,7 @@ import type { ReactNode } from 'react';
 import './globals.css';
 
 export const metadata: Metadata = {
-  title: 'Chess',
+  title: 'Combat Chess',
   description: 'Chess where every capture is a fight.',
 };
 
```

- [ ] **Step 7: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors; 38 tests pass.

- [ ] **Step 8: Check in the browser**

With `http://localhost:3000` open:
- The page is in English and the tab title is "Combat Chess".
- Run in the console: `localStorage.setItem('chess.settings', JSON.stringify({ state: { lang: 'vi' }, version: 0 })); location.reload()`
- The HUD now reads "Lượt của Cam", "Nhập nước đi", "Ván mới". `document.documentElement.lang` is `vi`.
- Type `f3`, `e5`, `g4`, `Qh4` in the move field: the dialog reads "Chiếu hết — Lục thắng", and the move list still shows `Qh4#`.
- Type `xyz`: the error is in Vietnamese.
- Run `localStorage.removeItem('chess.settings'); location.reload()` to go back to the browser's language.

- [ ] **Step 9: Commit**

```bash
git add src/ui/i18n.ts src/game/types.ts src/state/store.ts src/state/store.test.ts src/scene/theme.ts src/scene/Scene.tsx src/ui/Hud.tsx src/ui/PromotionChooser.tsx src/ui/GameOverModal.tsx src/ui/Game.tsx src/app/layout.tsx
git commit -m "feat: add English and Vietnamese strings and a structured game result"
```

---

### Task 3: Undo and the move list

**Files:**
- Modify: `src/state/store.ts`, `src/state/store.test.ts`, `src/ui/Hud.tsx`

**Interfaces:**
- Consumes: `useT()` key `undo` (Task 2).
- Produces: `useGame` state `snapshots: Piece[][]` (the pieces before each move; same length as `history`) and action `undo(): void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/state/store.test.ts`:

```diff
diff --git a/src/state/store.test.ts b/src/state/store.test.ts
index fa99c38..3bd4a90 100644
--- a/src/state/store.test.ts
+++ b/src/state/store.test.ts
@@ -116,3 +116,65 @@ test('the view never drifts from chess.js through castles, en passant and promot
   expect(game().pieces).toHaveLength(27);
   error.mockRestore();
 });
+
+// Undo must leave exactly the pieces that stood before the move, ids included, and chess.js must agree:
+// the same move is legal again, and replaying it never triggers the store's resync.
+test.each([
+  ['a quiet move', ['e4']],
+  ['a capture', ['e4', 'd5', 'exd5']],
+  ['a castle', ['e4', 'e5', 'Nf3', 'Nc6', 'Be2', 'Nf6', 'O-O']],
+  ['en passant', ['e4', 'a6', 'e5', 'd5', 'exd6']],
+  ['a promotion', ['a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6', 'bxa8=Q']],
+])('undo takes back %s', async (_name, moves) => {
+  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
+  const last = moves.at(-1)!;
+  await play(...moves.slice(0, -1));
+  const before = { pieces: game().pieces, history: game().history, turn: game().turn, lastMove: game().lastMove };
+  await play(last);
+
+  game().undo();
+  expect(game()).toMatchObject({ ...before, phase: 'idle', selected: null, result: null });
+  expect(game().snapshots).toHaveLength(moves.length - 1);
+
+  await play(last);
+  expect(game().history).toEqual(moves);
+  expect(error).not.toHaveBeenCalled();
+  error.mockRestore();
+});
+
+test('undo reopens a finished game', async () => {
+  await play('f3', 'e5', 'g4', 'Qh4#');
+  game().undo();
+  expect(game()).toMatchObject({ phase: 'idle', result: null, turn: 'b', inCheck: false });
+  expect(game().history).toEqual(['f3', 'e5', 'g4']);
+  await play('Qh4#');
+  expect(game().phase).toBe('gameOver');
+});
+
+test('undo walks back to the start, then does nothing', async () => {
+  await play('e4', 'e5');
+  game().undo();
+  expect(game().lastMove).toEqual({ from: 'e2', to: 'e4' });
+  game().undo();
+  expect(game()).toMatchObject({ history: [], lastMove: null, turn: 'w' });
+  expect(game().pieces).toHaveLength(32);
+  game().undo();
+  expect(game()).toMatchObject({ history: [], phase: 'idle' });
+});
+
+test('undo is ignored while a move is animating or a promotion is being chosen', async () => {
+  game().select('e2');
+  game().select('e4');
+  expect(game().phase).toBe('animating');
+  game().undo();
+  await waitForIdle();
+  expect(game().history).toEqual(['e4']);
+
+  game().newGame();
+  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
+  game().select('b7');
+  game().select('a8');
+  game().undo();
+  expect(game().phase).toBe('promoting');
+  expect(game().history).toHaveLength(8);
+});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/store.test.ts`
Expected: FAIL in the eight new tests — `game().undo is not a function`.

- [ ] **Step 3: Implement undo**

`src/state/store.ts`:

```diff
diff --git a/src/state/store.ts b/src/state/store.ts
index c7df40d..1c70abe 100644
--- a/src/state/store.ts
+++ b/src/state/store.ts
@@ -19,6 +19,7 @@ interface GameState {
   phase: Phase;
   pendingPromotion: { from: Square; to: Square } | null;
   history: string[]; // SAN
+  snapshots: Piece[][]; // `pieces` as they stood before each move; same length as `history`
   lastMove: { from: Square; to: Square } | null;
   turn: Color;
   inCheck: boolean;
@@ -30,6 +31,7 @@ interface GameState {
   submitText(text: string): boolean;
   choosePromotion(piece: PromotionPiece): void;
   cancelPromotion(): void;
+  undo(): void;
   newGame(): void;
 }
 
@@ -52,6 +54,7 @@ const fresh = () => ({
   phase: 'idle' as Phase,
   pendingPromotion: null,
   history: [],
+  snapshots: [] as Piece[][],
   lastMove: null,
   turn: 'w' as Color,
   inCheck: false,
@@ -90,7 +93,13 @@ export const useGame = create<GameState>((set, get) => ({
       return; // illegal move: ignore
     }
     const steps = planMove(move, get().pieces);
-    set({ phase: 'animating', selected: null, targets: [], pendingPromotion: null });
+    set({
+      phase: 'animating',
+      selected: null,
+      targets: [],
+      pendingPromotion: null,
+      snapshots: [...get().snapshots, get().pieces],
+    });
     await runSteps(steps, {
       actors,
       getPieces: () => get().pieces,
@@ -160,6 +169,28 @@ export const useGame = create<GameState>((set, get) => ({
     if (get().phase === 'promoting') set({ phase: 'idle', pendingPromotion: null });
   },
 
+  /** Takes back one move by one side. The board jumps to the earlier position; nothing is animated. */
+  undo() {
+    const { phase, snapshots } = get();
+    if ((phase !== 'idle' && phase !== 'gameOver') || !snapshots.length) return;
+    chess.undo();
+    if (phase === 'gameOver') fadeMusic(1, 800);
+    play('select');
+    const last = chess.history({ verbose: true }).at(-1);
+    set({
+      pieces: snapshots.at(-1)!, // the snapshot keeps every piece id, so no actor is rebuilt needlessly
+      snapshots: snapshots.slice(0, -1),
+      selected: null,
+      targets: [],
+      phase: 'idle',
+      history: chess.history(),
+      lastMove: last ? { from: last.from, to: last.to } : null,
+      turn: chess.turn(),
+      inCheck: chess.inCheck(),
+      result: null,
+    });
+  },
+
   newGame() {
     if (get().phase === 'animating') return;
     chess.reset();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/state/store.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Add the Undo button and polish the move list**

`src/ui/Hud.tsx`:

```diff
diff --git a/src/ui/Hud.tsx b/src/ui/Hud.tsx
index 6e2d1d9..831a337 100644
--- a/src/ui/Hud.tsx
+++ b/src/ui/Hud.tsx
@@ -1,6 +1,6 @@
 'use client';
 
-import { useState, type FormEvent } from 'react';
+import { useEffect, useRef, useState, type FormEvent } from 'react';
 import { play } from '@/audio/audio';
 import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
@@ -15,11 +15,16 @@ export function Hud() {
   const result = useGame((s) => s.result);
   const submitText = useGame((s) => s.submitText);
   const newGame = useGame((s) => s.newGame);
+  const undo = useGame((s) => s.undo);
   const muted = useSettings((s) => s.muted);
   const update = useSettings((s) => s.update);
   const [text, setText] = useState('');
   const [error, setError] = useState('');
 
+  // Keep the latest move in view.
+  const latest = useRef<HTMLLIElement>(null);
+  useEffect(() => latest.current?.scrollIntoView({ block: 'nearest' }), [history.length]);
+
   function onSubmit(event: FormEvent) {
     event.preventDefault();
     if (phase !== 'idle') return;
@@ -91,14 +96,36 @@ export function Hud() {
 
       <ol aria-label={t.moves} className="min-h-24 flex-1 overflow-y-auto font-mono text-sm">
         {rows.map(([first, second], i) => (
-          <li key={i} className="grid grid-cols-[2rem_1fr_1fr] gap-2 py-0.5">
+          <li
+            key={i}
+            ref={i === rows.length - 1 ? latest : undefined}
+            className="grid grid-cols-[2rem_1fr_1fr] gap-2 py-0.5"
+          >
             <span className="text-stone-500">{i + 1}.</span>
-            <span>{first}</span>
-            <span>{second}</span>
+            {[first, second].map(
+              (san, j) =>
+                san && (
+                  <span
+                    key={j}
+                    aria-current={i * 2 + j === history.length - 1 ? 'step' : undefined}
+                    className="rounded px-1 aria-[current=step]:bg-amber-600/40"
+                  >
+                    {san}
+                  </span>
+                ),
+            )}
           </li>
         ))}
       </ol>
 
+      <button
+        onClick={undo}
+        disabled={(phase !== 'idle' && phase !== 'gameOver') || history.length === 0}
+        className="rounded-lg border border-stone-600 px-3 py-2 hover:bg-stone-800 disabled:opacity-50"
+      >
+        {t.undo}
+      </button>
+
       <button
         onClick={newGame}
         disabled={phase === 'animating'}
```

- [ ] **Step 6: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors; 46 tests pass.

- [ ] **Step 7: Check in the browser**

- Play `e4`, `d5`, `exd5`. Click Undo: the teal pawn is back on d5, the amber pawn is back on e4, the move list ends at `d5` and it is Amber's turn.
- Undo twice more: the board is the starting position and Undo is disabled.
- Play `f3`, `e5`, `g4`, `Qh4`, choose "View board", click Undo: the game is live again and the music comes back up.
- The latest move in the list has a tinted background. After more than a screenful of moves the list has scrolled to the last one.
- Undo is disabled while a piece is walking.

- [ ] **Step 8: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts src/ui/Hud.tsx
git commit -m "feat: add undo, and keep the latest move in view"
```

---

### Task 4: The camera follows the chosen side

**Files:**
- Modify: `src/scene/CameraRig.tsx`, `src/scene/Scene.tsx`

**Interfaces:**
- Consumes: `useSettings` state `side: 'w' | 'b'` (Task 1); `cameraRig.intro()` from `src/scene/cameraHandle.ts` (exists).
- Produces: no new exports. With `side === 'b'` the camera home is `[0, 10, -9]`, the azimuth limits are `5π/6 … 7π/6` and the key light is at `[5, 10, -6]`.

There is no unit test: the camera needs a WebGL context. The check is in the browser.

- [ ] **Step 1: Make the camera home and orbit limits depend on the side**

`src/scene/CameraRig.tsx`:

```diff
diff --git a/src/scene/CameraRig.tsx b/src/scene/CameraRig.tsx
index 1062404..35d35a2 100644
--- a/src/scene/CameraRig.tsx
+++ b/src/scene/CameraRig.tsx
@@ -2,6 +2,7 @@ import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
 import { useThree } from '@react-three/fiber';
 import { useEffect, useRef, type ComponentRef } from 'react';
 import { Vector3 } from 'three';
+import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
 import { cameraRig, setCameraRig } from './cameraHandle';
 import { CAMERA } from './theme';
@@ -15,9 +16,13 @@ export function CameraRig() {
   const camera = useRef<ComponentRef<typeof PerspectiveCamera>>(null!);
   const controls = useRef<ComponentRef<typeof OrbitControls>>(null!);
   const gameId = useGame((s) => s.gameId);
+  // The camera sits behind the army the player chose: on +z for the first army, on -z for the second.
+  const sign = useSettings((s) => (s.side === 'w' ? 1 : -1));
+  const settled = useRef(false); // false until the first placement
 
   useEffect(() => {
-    const home = new Vector3(...CAMERA.position);
+    const [x, y, z] = CAMERA.position;
+    const home = new Vector3(x, y, z * sign);
     const centre = new Vector3();
     // While gliding the controls are disabled, so their distance and angle limits do not clamp the path.
     const glide = (position: Vector3, target: Vector3, ms: number) => {
@@ -53,8 +58,15 @@ export function CameraRig() {
         unlock();
       },
     });
+    // Stand behind this side's army. A straight glide to the far side would pass directly over the
+    // board, where the view flips, so a change of side jumps across and descends as a new game does.
+    camera.current.position.copy(home);
+    controls.current.target.copy(centre);
+    camera.current.lookAt(centre);
+    if (settled.current) void cameraRig.intro();
+    settled.current = true;
     return () => setCameraRig(null);
-  }, []);
+  }, [sign]);
 
   // Runs after the effect above, so the handle is already in place on first mount.
   useEffect(() => {
@@ -71,8 +83,9 @@ export function CameraRig() {
         maxDistance={14}
         minPolarAngle={Math.PI / 6}
         maxPolarAngle={Math.PI / 2.6}
-        minAzimuthAngle={-Math.PI / 6}
-        maxAzimuthAngle={Math.PI / 6}
+        // Behind the second army the range is centred on π. OrbitControls accepts a range that crosses π.
+        minAzimuthAngle={(sign === 1 ? 0 : Math.PI) - Math.PI / 6}
+        maxAzimuthAngle={(sign === 1 ? 0 : Math.PI) + Math.PI / 6}
       />
     </>
   );
```

- [ ] **Step 2: Keep the key light on the camera's side**

`src/scene/Scene.tsx`:

```diff
diff --git a/src/scene/Scene.tsx b/src/scene/Scene.tsx
index 0176496..de943a8 100644
--- a/src/scene/Scene.tsx
+++ b/src/scene/Scene.tsx
@@ -2,6 +2,7 @@
 
 import { Canvas, useFrame } from '@react-three/fiber';
 import { useState } from 'react';
+import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
 import { useT } from '@/ui/i18n';
 import { Board } from './Board';
@@ -27,6 +28,7 @@ function hasWebGL() {
 export default function Scene() {
   const pieces = useGame((s) => s.pieces);
   const select = useGame((s) => s.select);
+  const lightZ = useSettings((s) => (s.side === 'w' ? 6 : -6)); // the key light stays on the camera's side
   const [webgl] = useState(hasWebGL);
   const t = useT();
 
@@ -42,7 +44,7 @@ export default function Scene() {
     <Canvas shadows onPointerMissed={() => select(null)}>
       <color attach="background" args={[PALETTE.background]} />
       <ambientLight intensity={0.7} />
-      <directionalLight position={[5, 10, 6]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
+      <directionalLight position={[5, 10, lightZ]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
       <TweenTicker />
       <CameraRig />
       <Board />
```

- [ ] **Step 3: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors; 46 tests pass.

- [ ] **Step 4: Check in the browser**

- With no stored settings the view is unchanged: amber pieces nearest, the opening descent plays.
- Run in the console: `localStorage.setItem('chess.settings', JSON.stringify({ state: { side: 'b' }, version: 0 })); location.reload()`
- The teal army is now nearest the camera, lit from the front, and the opening descent ends behind it.
- Drag to orbit: the view swings about 30° either way and cannot be spun round to the amber side.
- Play `e4`, `d5`, `exd5`: the fight is framed with the letterbox bars and the camera returns behind the teal army.
- Run `localStorage.removeItem('chess.settings'); location.reload()`.

If the orbit limits misbehave behind the teal army, read "restrict theta" in `node_modules/three/examples/jsm/controls/OrbitControls.js` and express the same range in the form it accepts. Do not rotate the board or the pieces instead.

- [ ] **Step 5: Commit**

```bash
git add src/scene/CameraRig.tsx src/scene/Scene.tsx
git commit -m "feat: place the camera behind the chosen army"
```

---

### Task 5: Main menu, pause menu and settings

**Files:**
- Create: `src/ui/MainMenu.tsx`, `src/ui/PauseMenu.tsx`, `src/ui/Settings.tsx`
- Modify: `src/ui/Game.tsx`, `src/ui/Hud.tsx`

**Interfaces:**
- Consumes: `useSettings` and `type Lang` (Task 1); `setPaused` (Task 1); `useT()` (Task 2); `useGame` state `history`, `result`, `phase` and action `newGame()`; `Modal` from `src/ui/Modal.tsx` with props `{ label: string; onCancel: () => void; children }`; `TEAM` from `src/scene/theme.ts`; `play('select')` from `src/audio/audio.ts`.
- Produces:
  - `MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void })`
  - `PauseMenu({ onResume, onSettings, onMenu })`, all three `() => void`
  - `Settings({ onClose }: { onClose: () => void })`
  - `Hud` now takes `{ onPause: () => void }`. It no longer has a mute button or a "New game" button.

These are thin components over state that Tasks 1–3 already test, so the check is in the browser.

- [ ] **Step 1: Write the main menu**

Create `src/ui/MainMenu.tsx`:

```tsx
'use client';

import { TEAM } from '@/scene/theme';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useT } from './i18n';

const primary = 'min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500 disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';

/** The opening screen: a layer over the dimmed scene. `onPlay` shows the board. */
export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  const t = useT();
  const side = useSettings((s) => s.side);
  const update = useSettings((s) => s.update);
  const inProgress = useGame((s) => s.history.length > 0 || s.result !== null);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);

  function start() {
    newGame(); // also plays the fade from black and the camera descent
    onPlay();
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl">
        <h1 className="text-center text-3xl font-bold">{t.title}</h1>
        <p className="text-center text-stone-300">
          {t.mode}: {t.twoPlayers}
        </p>

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
                className={`${secondary} flex flex-1 items-center justify-center gap-2 aria-pressed:border-amber-500 aria-pressed:bg-stone-800`}
              >
                <span aria-hidden className="size-3 rounded-full" style={{ background: TEAM[color] }} />
                {t.team[color]}
              </button>
            ))}
          </div>
        </div>

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
        <button onClick={onSettings} className={secondary}>
          {t.settings}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the pause menu**

Create `src/ui/PauseMenu.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from './i18n';
import { Modal } from './Modal';

const button = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';

export function PauseMenu(props: { onResume: () => void; onSettings: () => void; onMenu: () => void }) {
  const t = useT();
  const hasMoves = useGame((s) => s.history.length > 0);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const [confirming, setConfirming] = useState(false);

  function restart() {
    newGame();
    props.onResume();
  }

  return (
    <Modal label={t.paused} onCancel={props.onResume}>
      <h2 className="mb-4 text-lg font-semibold">{t.paused}</h2>
      <div className="flex min-w-56 flex-col gap-2">
        <button
          autoFocus
          onClick={props.onResume}
          className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
        >
          {t.resume}
        </button>
        {confirming ? (
          // Undo cannot bring a restarted game back, so a game with moves asks first.
          <div role="group" aria-label={t.restartConfirm} className="flex items-center gap-2">
            <span className="flex-1">{t.restartConfirm}</span>
            <button autoFocus onClick={restart} disabled={animating} className={button}>
              {t.yes}
            </button>
            <button onClick={() => setConfirming(false)} className={button}>
              {t.no}
            </button>
          </div>
        ) : (
          <button onClick={hasMoves ? () => setConfirming(true) : restart} disabled={animating} className={button}>
            {t.restart}
          </button>
        )}
        <button onClick={props.onSettings} className={button}>
          {t.settings}
        </button>
        <button onClick={props.onMenu} className={button}>
          {t.mainMenu}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Write the settings dialog**

Create `src/ui/Settings.tsx`:

```tsx
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
```

- [ ] **Step 4: Give `Game.tsx` the screens**

Replace `src/ui/Game.tsx` with:

```tsx
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { setPaused } from '@/audio/audio';
import { useSettings } from '@/state/settings';
import { Cinematic } from './Cinematic';
import { GameOverModal } from './GameOverModal';
import { Hud } from './Hud';
import { useT } from './i18n';
import { MainMenu } from './MainMenu';
import { PauseMenu } from './PauseMenu';
import { PromotionChooser } from './PromotionChooser';
import { Settings } from './Settings';

// The 3D scene needs the browser, so it is never rendered on the server.
const Scene = dynamic(() => import('@/scene/Scene'), {
  ssr: false,
  loading: () => <Loading />,
});

function Loading() {
  return <p className="p-8 text-center text-stone-400">{useT().loading}</p>;
}

export function Game() {
  // The scene stays mounted behind every screen, so switching screens never rebuilds it or loses a game.
  const [screen, setScreen] = useState<'menu' | 'playing' | 'paused'>('menu');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // After mount, not at store creation, so the server and first client render agree.
  useEffect(() => void useSettings.persist.rehydrate(), []);

  const lang = useSettings((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => setPaused(screen === 'paused'), [screen]);

  // Escape pauses. An open dialog (promotion, game over, the pause menu itself) handles its own Escape.
  useEffect(() => {
    if (screen !== 'playing') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setScreen('paused');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  return (
    <main className="relative h-dvh bg-stone-950">
      <div inert={screen === 'menu'} className="flex h-full flex-col md:flex-row">
        <div className="relative min-h-0 flex-1">
          <Scene />
          <Cinematic />
        </div>
        <Hud onPause={() => setScreen('paused')} />
      </div>
      {screen === 'menu' && <MainMenu onPlay={() => setScreen('playing')} onSettings={() => setSettingsOpen(true)} />}
      {screen === 'paused' && (
        <PauseMenu
          onResume={() => setScreen('playing')}
          onSettings={() => setSettingsOpen(true)}
          onMenu={() => setScreen('menu')}
        />
      )}
      {/* Rendered after the pause menu so its dialog opens on top of it. */}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      <PromotionChooser />
      <GameOverModal />
    </main>
  );
}
```

- [ ] **Step 5: Swap the HUD's mute and New game buttons for Pause**

`src/ui/Hud.tsx`:

```diff
diff --git a/src/ui/Hud.tsx b/src/ui/Hud.tsx
index 831a337..cf7fbf4 100644
--- a/src/ui/Hud.tsx
+++ b/src/ui/Hud.tsx
@@ -2,11 +2,10 @@
 
 import { useEffect, useRef, useState, type FormEvent } from 'react';
 import { play } from '@/audio/audio';
-import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
 import { resultText, useT } from './i18n';
 
-export function Hud() {
+export function Hud({ onPause }: { onPause: () => void }) {
   const t = useT();
   const turn = useGame((s) => s.turn);
   const inCheck = useGame((s) => s.inCheck);
@@ -14,10 +13,7 @@ export function Hud() {
   const phase = useGame((s) => s.phase);
   const result = useGame((s) => s.result);
   const submitText = useGame((s) => s.submitText);
-  const newGame = useGame((s) => s.newGame);
   const undo = useGame((s) => s.undo);
-  const muted = useSettings((s) => s.muted);
-  const update = useSettings((s) => s.update);
   const [text, setText] = useState('');
   const [error, setError] = useState('');
 
@@ -46,12 +42,8 @@ export function Hud() {
     <aside className="flex w-full flex-col gap-4 bg-stone-900 p-4 text-stone-100 md:w-72">
       <div className="flex items-center justify-between">
         <h1 className="text-xl font-bold">{t.title}</h1>
-        <button
-          onClick={() => update({ muted: !muted })}
-          aria-pressed={!muted}
-          className="rounded-lg border border-stone-600 px-3 py-1 text-sm hover:bg-stone-800"
-        >
-          {muted ? 'Sound off' : 'Sound on'}
+        <button onClick={onPause} className="rounded-lg border border-stone-600 px-3 py-1 text-sm hover:bg-stone-800">
+          {t.pause}
         </button>
       </div>
 
@@ -125,14 +117,6 @@ export function Hud() {
       >
         {t.undo}
       </button>
-
-      <button
-        onClick={newGame}
-        disabled={phase === 'animating'}
-        className="rounded-lg border border-stone-600 px-3 py-2 hover:bg-stone-800 disabled:opacity-50"
-      >
-        {t.newGame}
-      </button>
     </aside>
   );
 }
```

- [ ] **Step 6: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors; 46 tests pass.

- [ ] **Step 7: Check in the browser**

- The page opens on the menu over a dimmed board. Clicking the board does nothing. There is one "Start" button.
- Start: the screen fades from black, the camera descends, the board takes clicks.
- Play `e4`. Press Escape: the pause menu opens and the music drops. Escape again: it closes and the music returns.
- Pause → Restart: it asks "Restart from the first move?". No keeps the game; Yes starts a new one. With no moves made, Restart does not ask.
- Pause → Settings: change the language and every visible string changes, including the pause menu underneath. Drag the music slider and the music follows. Release the effects slider and one click sound plays. Mute silences everything. Done returns to the pause menu.
- Reload: language, volumes and mute are as they were left.
- Pause → Main menu: the menu shows "Continue" and "New game". Choose Teal: the camera jumps behind the teal army and descends. Continue: the same game is on the board.
- Reach a promotion (`a4 b5 axb5 a6 bxa6 Bb7 axb7 Nc6`, then click b7 and a8) and press Escape: the promotion chooser closes and the pause menu does not open.
- Do the whole list once with the keyboard only (Tab, Enter, Space, Escape, arrow keys on the sliders).

- [ ] **Step 8: Commit**

```bash
git add src/ui/MainMenu.tsx src/ui/PauseMenu.tsx src/ui/Settings.tsx src/ui/Game.tsx src/ui/Hud.tsx
git commit -m "feat: add the main menu, pause menu and settings"
```

---

### Task 6: Layout for desktop, tablet and phone

**Files:**
- Modify: `src/ui/Hud.tsx`, `src/ui/Modal.tsx`, `src/ui/Game.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: everything `Hud` already uses; `useGame` action `undo()` (Task 3).
- Produces: `Modal` gains an optional prop `sheet?: boolean`. `Hud`'s props are unchanged: `{ onPause: () => void }`.

Before Step 4, read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` and confirm that a static `viewport` export from `layout.tsx` is still how this Next.js declares a viewport, as `AGENTS.md` requires. The `Viewport` type in `node_modules/next/dist/lib/metadata/types/extra-types.d.ts` has `viewportFit?: 'auto' | 'cover' | 'contain'`.

- [ ] **Step 1: Add the bottom-sheet variant to `Modal`**

Replace `src/ui/Modal.tsx` with:

```tsx
'use client';

import type { ReactNode } from 'react';

/**
 * A native modal <dialog>: the browser traps focus and reports Escape through onCancel.
 * `sheet` anchors it to the bottom edge as a drawer, and lets a tap on the backdrop close it.
 */
export function Modal(props: { label: string; onCancel: () => void; sheet?: boolean; children: ReactNode }) {
  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }}
      aria-label={props.label}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      // A click on the backdrop lands on the dialog itself. The padding is on the inner box,
      // so a click anywhere inside lands on a child instead.
      onClick={(event) => {
        if (props.sheet && event.target === event.currentTarget) props.onCancel();
      }}
      className={`bg-stone-900 text-stone-100 shadow-2xl backdrop:bg-black/50 ${
        props.sheet ? 'mx-0 mt-auto mb-0 w-full max-w-none rounded-t-xl' : 'm-auto rounded-xl'
      }`}
    >
      <div className={props.sheet ? 'p-4 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'p-6'}>{props.children}</div>
    </dialog>
  );
}
```

- [ ] **Step 2: Rebuild the HUD as a column or a bar plus drawer**

Replace `src/ui/Hud.tsx` with:

```tsx
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
        <h1 className="text-xl font-bold">{t.title}</h1>
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
  useEffect(() => latest.current?.scrollIntoView({ block: 'nearest' }), [history.length]);

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
```

- [ ] **Step 3: Switch the page layout from width to orientation**

`src/ui/Game.tsx`:

```diff
diff --git a/src/ui/Game.tsx b/src/ui/Game.tsx
index 5c33983..d83e870 100644
--- a/src/ui/Game.tsx
+++ b/src/ui/Game.tsx
@@ -50,7 +50,7 @@ export function Game() {
 
   return (
     <main className="relative h-dvh bg-stone-950">
-      <div inert={screen === 'menu'} className="flex h-full flex-col md:flex-row">
+      <div inert={screen === 'menu'} className="flex h-full flex-col landscape:flex-row">
         <div className="relative min-h-0 flex-1">
           <Scene />
           <Cinematic />
```

- [ ] **Step 4: Declare the viewport**

`src/app/layout.tsx`:

```diff
diff --git a/src/app/layout.tsx b/src/app/layout.tsx
index 64cdba7..614b9b9 100644
--- a/src/app/layout.tsx
+++ b/src/app/layout.tsx
@@ -1,4 +1,4 @@
-import type { Metadata } from 'next';
+import type { Metadata, Viewport } from 'next';
 import type { ReactNode } from 'react';
 import './globals.css';
 
@@ -7,6 +7,9 @@ export const metadata: Metadata = {
   description: 'Chess where every capture is a fight.',
 };
 
+// `cover` lets the page reach under a phone's notch and home bar; the HUD pads itself with env(safe-area-inset-*).
+export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
+
 export default function RootLayout({ children }: { children: ReactNode }) {
   return (
     <html lang="en">
```

- [ ] **Step 5: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors; 46 tests pass.

- [ ] **Step 6: Check in the browser at five sizes**

Resize the preview to each size, reload, start a game and play `e4 d5 exd5`.

| Size | Expect |
|---|---|
| 375×812 | Bar under the board: status, Undo, Moves, Pause. No side column. |
| 768×1024 | Same bar layout. |
| 844×390 | Side column 15rem wide; the move list scrolls inside it; nothing is cut off at the bottom. |
| 1024×768 | Side column 18rem wide. |
| 1440×900 | Side column 18rem wide. |

At every size: the whole board is in view, the page does not scroll sideways, and every button is at least 44 px high (`getBoundingClientRect()` in the console).

In portrait: "Moves" opens a drawer from the bottom edge holding the move field and the list. A move typed there is played. A tap on the dark area above the drawer closes it, a tap inside it does not, and Escape closes it.

The main menu, pause menu and settings fit at 375×812 without being cut off.

If a `portrait:` or `landscape:` class has no effect, read the Tailwind 4 variant list in `node_modules/tailwindcss/` before changing the approach; the rule itself (side column in landscape, bar in portrait) must stay.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Hud.tsx src/ui/Modal.tsx src/ui/Game.tsx src/app/layout.tsx
git commit -m "feat: lay the HUD out as a side column or a bar with a drawer"
```

---

### Task 7: Full verification

**Files:**
- Modify: only what a failed check below requires.

**Interfaces:**
- Consumes: the finished game.
- Produces: a build that passes every check in the spec's "Done when" list.

- [ ] **Step 1: Run every automated check, including the build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: no type or lint errors; 46 tests pass; the build completes with `/` listed as a route.

- [ ] **Step 2: Walk the spec's browser list**

From the "Testing" section of the spec, in the browser preview:
- Menu → Start → Pause → Settings → Resume → Main menu → Continue.
- Restart with and without moves made.
- Switching language changes every visible string, including an open dialog. Search the page for leftover English while in Vietnamese: only the title "Combat Chess", move notation and "English" on its language button may remain.
- Switching side moves the camera, and a fight still frames correctly from the far side.
- The five sizes from Task 6, once more, now with a game of twenty moves or more.
- One full pass with the keyboard only.
- With the operating system's "reduce motion" setting on: starting a game, changing side and capturing all work, with no camera travel.
- The browser console shows no error or warning through all of the above.

- [ ] **Step 3: Fix what failed**

For each failure: find the cause, fix it in the file named in the File Structure table, and re-run Step 1 and the failed check. Commit each fix on its own:

```bash
git add <the files changed>
git commit -m "fix: <what was wrong>"
```

- [ ] **Step 4: Hand over what cannot be automated**

Report to the user, without claiming it was checked: how the music and effects sliders sound, whether 35% is the right music level while paused, and how the game feels on a real phone.
