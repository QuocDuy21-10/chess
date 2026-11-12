# 3D Combat Chess — Game Experience

Date: 2026-11-12
Status: design approved in chat; spec awaiting review

## Goal

The game opens on a main menu, can be paused, restarted and taken back one move
at a time, has sound settings and an English/Vietnamese interface, and lays
itself out for desktop, tablet and phone. Chess rules, animation steps and the
fight choreography are unchanged.

This is Phase 3 of `roadmap-2.md`. It builds on the playable core and on the
audio and transitions work.

## Decisions already made

| Question | Decision |
|---|---|
| Game modes | Two players on one screen only. No computer opponent until Phase 4, and no placeholder for it in the menu. |
| Choosing a side | Chooses which army stands nearest the camera. Amber always moves first. |
| Pause | A pause menu. There is no clock to stop; an animation in flight finishes behind the menu. |
| Move history | The existing list, polished, plus Undo. No browsing of earlier positions. |
| Language | English and Vietnamese, switchable in Settings. |
| Phone layout | A thin bar under the board and a drawer for the move list and move input. |
| Screens | DOM overlays on the one existing page. No routes, no in-canvas menu. |
| Game title | "Combat Chess", from the package name. |

## Architecture

```
ui/Game.tsx            screen: 'menu' | 'playing' | 'paused', settingsOpen
   │
   ├─ MainMenu ─┐
   ├─ PauseMenu ├─ read and write ──► state/settings.ts (persisted)
   ├─ Settings ─┘                         │  subscribe
   │                                      ├──► audio.setMuted / setVolume
   │                                      └──► CameraRig (side)
   └─ Hud ── undo, history ──► state/store.ts ──► chess.js
```

The 3D scene stays mounted the whole time. Every new screen is a layer above
it, so switching screens never rebuilds the scene and never loses a game.

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `state/settings.ts` (new) | Persisted settings; pushes sound settings into `audio` | zustand `persist`, audio |
| `ui/i18n.ts` (new) | The two string tables and `useT()` | settings |
| `ui/MainMenu.tsx` (new) | Title, side choice, Start / Continue / New game, Settings | settings, store, i18n |
| `ui/PauseMenu.tsx` (new) | Resume, Restart, Settings, Main menu | store, i18n, `Modal` |
| `ui/Settings.tsx` (new) | Language, two volume sliders, mute | settings, i18n, `Modal` |
| `ui/Game.tsx` | Owns `screen` and `settingsOpen`; Escape key; rehydrates settings | all of the above |
| `ui/Hud.tsx` | Split into status, move list and move input, laid out as a side column or as a bar plus drawer | store, i18n |
| `ui/Modal.tsx` | Gains a bottom-sheet variant for the drawer | — |
| `state/store.ts` | `undo()`, `snapshots`, structured `result`; `muted` moves out | chess.js |
| `audio/audio.ts` | `setVolume`, `setPaused` | — |
| `scene/CameraRig.tsx` | Home position and orbit limits follow `side` | settings |

## Screens and flow

`Game.tsx` holds `screen` in `useState`. The store does not know about screens.

```
          Start / New game / Continue
  menu ───────────────────────────────► playing ◄──── Resume / Esc ────┐
   ▲                                       │                           │
   │                                       └──── Pause button / Esc ──► paused
   └────────────── Main menu ──────────────────────────────────────────┘
```

### Main menu

A full-screen layer over the dimmed scene. The game area beneath it is `inert`.

- Title "Combat Chess".
- Mode: one entry, "Two players", always selected. It is shown so the menu
  states what will start; it is not a control.
- Side: two buttons, "Amber near you" and "Teal near you". Writes `side` to
  settings.
- No game in progress (no moves made and no result): one "Start" button.
- A game in progress: "Continue" and "New game".
- "Settings".

"Start" and "New game" call `newGame()`, which already triggers the fade from
black and the camera descent. "Continue" only changes the screen.

### Pause menu

A `Modal`, opened by the Pause button or by Escape while `screen` is
`playing` and no other dialog is open. Escape or "Resume" closes it.

- **Resume**
- **Restart** — starts a new game and resumes. If any move has been made, the
  button first turns into "Restart? Yes / No", because Undo cannot bring a
  restarted game back. Disabled while a move is animating, as "New game" is
  today.
- **Settings**
- **Main menu** — goes to the menu and keeps the game, which the menu then
  offers as "Continue".

While the pause menu is open the music plays at 35% of its level. The board
takes no input, because a modal dialog makes the rest of the page inert.

### Settings

A `Modal` opened from the main menu or the pause menu; closing it returns to
whichever opened it.

| Control | Type |
|---|---|
| Language | Two buttons: English, Tiếng Việt |
| Music volume | Range input, 0–100 |
| Effects volume | Range input, 0–100. Releasing it plays `select` once as a sample. |
| Mute | Toggle with `aria-pressed` |

The mute button leaves the HUD. Muting is Pause → Settings → Mute.

## Settings store

```ts
interface Settings {
  lang: 'en' | 'vi';
  side: 'w' | 'b';        // the army nearest the camera
  musicVolume: number;    // 0 to 1
  sfxVolume: number;      // 0 to 1
  muted: boolean;
  update(patch: Partial<Omit<Settings, 'update'>>): void;
}
```

- Defaults: `en`, `w`, `1`, `1`, `false`.
- Saved under `localStorage['chess.settings']` with zustand's `persist`
  middleware. `skipHydration` is on and `Game.tsx` calls `rehydrate()` after
  mount, so the server render and the first client render agree.
- If nothing was stored, `lang` becomes `vi` when `navigator.language` starts
  with `vi`.
- Stored values outside the allowed set fall back to the defaults; volumes are
  clamped to 0–1.
- The store subscribes to itself and calls `audio.setMuted` and
  `audio.setVolume` on every change.
- `Game.tsx` keeps `<html lang>` in step with `lang`.
- The old `localStorage['chess.muted']` key is dropped without migration;
  nothing has been released.

## Audio

```ts
setVolume(channel: 'music' | 'sfx', value: number): void   // 0 to 1
setPaused(on: boolean): void                               // music at 35% while on
```

Music gain = base level × game-over fade × fight duck × pause × `musicVolume`.
Effects gain = `sfxVolume`. Both values are remembered before the first user
gesture and applied when the `AudioContext` is created, as `muted` is today.

`setPaused` is separate from `duck`, so a fight that ends behind the pause menu
does not bring the music back up.

## Language

```ts
const en = { start: 'Start', toMove: (team: string) => `${team} to move`, … };
const vi: typeof en = { start: 'Bắt đầu', toMove: (team) => `${team} đi`, … };
export function useT(): typeof en;   // the table for the current `lang`
```

- Every string a player can read goes through `useT()`: HUD, promotion
  chooser, game-over dialog, the new screens, the `aria-live` announcements,
  the loading line and the no-WebGL message.
- `vi: typeof en` makes a missing or misspelt key a type error.
- Team names move from `theme.ts` into the tables: Amber / Teal, Cam / Lục.
- Promotion pieces: Queen, Rook, Bishop, Knight / Hậu, Xe, Tượng, Mã.
- Move notation stays standard SAN (`Nf3`, `O-O`) in both languages, in the
  list and in the typed-move field.
- The page `<title>` becomes "Combat Chess"; the metadata description stays
  English.

### Structured result

`result` in the store stops being an English sentence:

```ts
type Result =
  | { reason: 'checkmate'; winner: 'w' | 'b' }
  | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' };
```

The HUD and the game-over dialog turn it into text with `useT()`. The
game-over dialog is keyed so that it opens again when a game ends a second
time after an undo.

## Choosing a side

| `side` | Camera home | Azimuth limits | Key light |
|---|---|---|---|
| `w` | `[0, 10, 9]` | −π/6 … π/6 | `[5, 10, 6]` |
| `b` | `[0, 10, −9]` | 5π/6 … 7π/6 | `[5, 10, −6]` |

`focus`, `reset` and `intro` use the home of the current side. When `side`
changes, the camera goes to the new home: a 400 ms glide, or an immediate jump
with `prefers-reduced-motion`. Square coordinates, piece facing and the
animation steps do not change.

The azimuth range for `b` crosses π. That `OrbitControls` in the installed
`three` accepts such a range is confirmed before the camera work starts; if it
does not, the scene's contents are not rotated instead — the limits are
expressed in whatever form that version accepts.

## Undo and the move list

```ts
snapshots: Piece[][];   // `pieces` as they stood before each move; same length as `history`
undo(): void;
```

- `submitMove` pushes the current `pieces` onto `snapshots` before it runs the
  steps. `newGame` clears it.
- `undo()` takes back one move by one side. It works when `phase` is `idle` or
  `gameOver` and there is a move to take back; otherwise it does nothing.
- It calls `chess.undo()`, restores `pieces` from the last snapshot, and
  recomputes `history`, `lastMove`, `turn` and `inCheck` from `chess.js`. It
  clears the selection and `result` and sets `phase` to `idle`. Piece ids are
  unchanged because the snapshot holds them.
- Leaving a finished game this way fades the music back to full.
- The board jumps to the earlier position. There is no reverse animation.
- It plays `select`.

Move list: the latest move is highlighted and marked `aria-current`, and the
list scrolls to keep it in view.

## Layout

One rule, by orientation.

| Viewport | Layout |
|---|---|
| Landscape | Scene on the left, HUD as a column on the right: 18rem at 1024 px wide and above, 15rem below |
| Portrait | Scene fills the screen above a bar: status, Undo, Moves, Pause |

**Side column (landscape):** title and Pause button, status line, move input,
move list, Undo.

**Bar and drawer (portrait):** "Moves" opens a drawer holding the move list
and the move input. The drawer is the bottom-sheet variant of `Modal`, so
Escape and focus trapping come from the native dialog. A tap on the backdrop
closes it through a click handler, since a native dialog does not do that by
itself in every browser.

- The status line, move list and move input are single components used by both
  layouts.
- Buttons are at least 44 px in both directions.
- The bar is padded by `env(safe-area-inset-bottom)`, and the viewport is
  declared with `viewport-fit=cover`. How the installed Next.js declares a
  viewport is read from `node_modules/next/dist/docs/` before that line is
  written, as `AGENTS.md` requires.
- The scene needs no change: `CameraRig` already widens the field of view on a
  narrow canvas.
- The "New game" button leaves the HUD; Restart in the pause menu replaces it.
  The game-over dialog keeps its own "New game".

## Error handling

- `localStorage` unavailable or blocked: settings work for the visit and are
  not saved.
- `undo()` with no move to take back, or during an animation or a promotion
  choice: no effect; the button is disabled.
- Restart and New game during an animation: disabled, as today.
- Escape while the promotion chooser or the game-over dialog is open: handled
  by that dialog, and does not open the pause menu.

## Testing

Automated, with `vitest`:

| What | How |
|---|---|
| Undo after a quiet move, a capture, a castle, en passant and a promotion | `store.test.ts`: after each, `pieces` matches `chess.board()` and the piece ids equal those before the move |
| Undo out of checkmate | `phase` is `idle`, `result` is `null`, the move can be played again |
| Undo with no moves, and while animating | No state change |
| Structured `result` | Existing checkmate and stalemate tests, updated |
| Settings defaults, clamping and bad stored values | `settings.test.ts` with a fake storage |

In the browser preview:

- Menu → Start → Pause → Settings → Resume → Main menu → Continue.
- Restart with and without moves made.
- Switching language changes every visible string, including an open dialog.
- Switching side moves the camera, and a fight still frames correctly from the
  far side.
- Layout at 375×812, 768×1024, 844×390, 1024×768 and 1440×900, with no
  horizontal scroll and the whole board in view.
- One full pass with the keyboard only.

By ear, by the user: the two sliders and the pause level.

## Done when

- The game opens on the main menu, and a game can be started, paused, resumed,
  restarted and returned to from the menu.
- Either army can be placed nearest the camera.
- Undo takes back any move, including the one that ended the game.
- Music and effects volumes and mute are adjustable and survive a reload.
- Every string appears in the chosen language, and the choice survives a
  reload.
- The five listed viewports show the whole board and a usable HUD.
- All automated tests, lint and the type check pass.

## Out of scope

Computer opponent, clocks, browsing earlier positions, redo, saving a game
across reloads, flipping the board every turn, a quick-mute button in the HUD,
languages beyond the two, per-pair fight animations.
