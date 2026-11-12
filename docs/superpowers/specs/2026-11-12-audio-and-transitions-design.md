# 3D Combat Chess — Audio and Scene Transitions

Date: 2026-11-12
Status: design approved in chat; spec awaiting review

## Goal

Every move is heard, a looped medieval track plays under the game, and the
camera frames each capture, the opening of a game and the final checkmate as
short cinematic moments. Chess rules and the animation steps are unchanged.

This pulls audio and camera zoom forward from sub-project 3 of the playable-core
spec. Per-pair fight timelines and particles stay there.

## Decisions already made

| Question | Decision |
|---|---|
| Audio source | CC0 files from opengameart.org, already in `public/audio/` with `CREDITS.md` |
| Playback | Web Audio API directly. No audio library. |
| Transitions | Combat close-up with letterbox, opening fade and camera descent, slow push-in on checkmate |
| Controls | One mute toggle in the HUD, saved in `localStorage`. Volume sliders wait for Settings (roadmap Phase 3). |

## Assets

`public/audio/`, 2.6 MB in total, 2.4 MB of it the music.

| Sound name | File | Played when |
|---|---|---|
| `select` | `select.ogg` | A piece with legal moves is selected |
| `error` | `error.ogg` | A typed move is rejected |
| `step` | `step0.ogg` – `step3.ogg`, one picked at random | Each footfall of a walk |
| `land` | `land.ogg` | End of a hop |
| `draw` | `draw.ogg` | Attacker reaches the stand-off point |
| `hit` | `hit.ogg` | The impact moment of the attack clip |
| `fall` | `fall.ogg` | End of the defender's die clip |
| `promote` | `promote.ogg` | Promotion step |
| `check` | `check.ogg` | A move leaves the opponent in check, game not over |
| `gameover` | `gameover.ogg` | Checkmate or any draw |
| — | `music.mp3` (105 s) | Looped background track |

The files were picked by name and size, not by ear. Swapping one is replacing a
file in `public/audio/`.

## Architecture

```
store.submitMove
   │
   ▼
sequencer.runSteps(steps, { actors, …, sound, camera })
   │                              │        │
   │                              ▼        ▼
   │                        audio.play   cameraRig.focus / reset
   ▼
store: check / game over → audio.play, cameraRig.focus, audio.fadeMusic
```

The sequencer stays free of the browser: `sound` and `camera` are optional
dependencies, like `wait`, and tests pass fakes.

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `audio/audio.ts` | Load, play, mute, duck and fade. The only file that touches `AudioContext`. | — |
| `scene/cameraHandle.ts` | Module-level handle `{ focus, reset, intro }`, filled in by the scene; no-ops until then | `tween` |
| `scene/CameraRig.tsx` | Owns the camera and `OrbitControls`; implements the handle | `cameraRig`, `tween`, theme |
| `scene/sequencer.ts` | Calls `sound` and `camera` at the right moments | — |
| `state/store.ts` | `muted`, `cinematic`, `gameId`; check and game-over sounds | audio, cameraRig |
| `ui/Cinematic.tsx` | Letterbox bars and the opening fade, DOM overlay over the canvas | store |
| `ui/Hud.tsx` | Mute button; `error` sound on a rejected move | store, audio |

### `audio/audio.ts`

```ts
type SoundName = 'select' | 'error' | 'step' | 'land' | 'draw' | 'hit' | 'fall' | 'promote' | 'check' | 'gameover';

play(name: SoundName, delayMs = 0): void   // no-op until unlocked or while loading
setMuted(muted: boolean): void             // master gain 0 or 1; persisted by the store
duck(on: boolean): void                    // music gain ramps to 35% and back over 300 ms
fadeMusic(to: number, ms: number): void    // game over: down to 20%; new game: back to 100%
```

- Graph: sources → `sfx` gain or `music` gain → `master` gain → destination.
- Browsers refuse to start audio without a user gesture. The module listens
  once for `pointerdown` and `keydown`, then creates the `AudioContext`, fetches
  and decodes every file in parallel, and starts the music loop.
- A file that fails to fetch or decode is logged once and skipped; `play` for it
  stays a no-op. The game never waits on audio.
- `delayMs` uses `AudioBufferSourceNode.start(when)`, so footsteps and the hit
  are scheduled on the audio clock and do not drift with frame rate.
- Known limit: the sound effects are Ogg Vorbis, which Safari decodes only from
  18.4. Older Safari plays the music and no effects. `ffmpeg` is not installed
  here; converting to MP3 later needs no code change beyond the extensions.

### Sequencer changes

| Step | Sound | Camera |
|---|---|---|
| `walk` | `step` every 0.5 square, scheduled with `delayMs` across the walk duration | — |
| `hop` | `land` at the end | — |
| `combat` | `draw` after the approach, `hit` at `impactAt`, `fall` when the die clip ends | `focus(attacker, defender)` before the approach, `reset()` after the die clip. Music ducks between the two. |
| `promote` | `promote` | — |

The walk duration formula moves from `Piece.tsx` into `theme.ts` as
`walkMs(distance)` so the sequencer and the actor share it.

### Camera

`CameraRig.tsx` replaces `FitCamera` and the inline `OrbitControls` in
`Scene.tsx`, keeping the existing field-of-view fit.

| Call | Motion |
|---|---|
| `focus(a, b)` | Over 400 ms, the orbit target moves to the midpoint of `a` and `b` and the camera moves 45% of the way from home toward that midpoint. `OrbitControls` is disabled. |
| `reset()` | Over 400 ms, back to home position and the board-centre target. `OrbitControls` is enabled again. |
| `intro()` | Camera starts at 1.6× the home position and eases to home over 1200 ms. |

Home is the fixed `CAMERA.position`, so a view the player rotated by hand is
returned to home after a fight. With `prefers-reduced-motion`, all three resolve
immediately without moving the camera.

### Store and UI

- `cinematic: boolean` is true from the start of a `combat` step to its camera
  reset, and during the checkmate push-in. `Cinematic.tsx` slides two black bars
  in from the top and bottom of the canvas area with a CSS transition.
- `gameId: number` increments in `newGame`. `Cinematic.tsx` keys a black overlay
  on it that fades out over 800 ms, and the scene calls `cameraRig.intro()` when
  it changes and on first mount.
- After the last step of a move:
  - check, game continues → `play('check')`
  - checkmate → `cinematic` on, `focus` on the mated king, `play('gameover')`,
    `fadeMusic(0.2)`, wait 1200 ms, then `phase = 'gameOver'` so the dialog opens
  - draw → `play('gameover')`, `fadeMusic(0.2)`, dialog opens at once
- `newGame` resets the camera, clears `cinematic` and calls `fadeMusic(1)`.
- `muted` starts from `localStorage['chess.muted']`; the HUD button toggles it,
  has `aria-pressed`, and reads "Sound on" / "Sound off".

## Testing

| What | How |
|---|---|
| Order of sound and camera calls for walk, hop, combat and promote | `sequencer.test.ts` with recording fakes |
| `walkMs` | Unit test beside the existing timing tests |
| Game still plays with no `sound` or `camera` dependency | Existing sequencer tests stay unchanged and pass |
| Files load, no console errors, camera moves in and out, bars and fade show | In the browser preview |
| How it sounds | By ear, by the user. Not covered by automated checks. |

## Out of scope

Volume sliders, per-piece or per-pair sounds, positional audio, particles,
depth of field, a title screen, music playlists.
