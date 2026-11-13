# 3D Combat Chess — Assets: Caching, Music Size, Loading the Engine Only When Needed, Bundle Size

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

A first visit downloads less, a return visit downloads almost nothing, and nobody downloads what they will not
use: the chess engine only for a game against the computer, the music only when it can be heard. A size budget in
CI keeps the JavaScript from quietly growing back.

This is S4 of four sub-projects that carry out `roadmap-2.md` §4, Phase 5:

| | Sub-project | Builds on |
|---|---|---|
| S1 | CI/CD, deploy to the VPS, backups, logging and monitoring | — |
| S2 | Securing the API and WebSocket | S1 |
| S3 | Tests: rule edge cases, the sequencer, Playwright E2E | S1, S2 |
| **S4** | Assets (this spec) | S1, S3 |

S4 adds a step to S1's `check` job and two checks to S3's E2E suite.

## Where things stand (measured on 2026-11-13)

| Asset | Today |
|---|---|
| `public/audio/music.mp3` | 2,535,801 bytes; MP3 192 kbps joint stereo, 44.1 kHz (about 105 s). Streamed through an `<audio>` element created by `unlock()` on the first pointer or key press, **even when the player has muted the game or set the music to 0**. |
| 14 sound effects (`public/audio/*.ogg`) | about 150 KB in all; Ogg Vorbis. Fetched and decoded by `unlock()`. |
| `public/engine/stockfish-19-lite-single.{js,wasm}` | 28 KB + 1.8 MB. A worker is created only when a game against the computer starts (`useComputer.start` → `createEngine`), so other players never fetch it. |
| Caching of `/audio/*` and `/engine/*` | Next's default for `public/`: `Cache-Control: public, max-age=0`, so every visit revalidates every file. |
| JavaScript on `/` | 9 scripts, **368 KB gzip** (from `.next/server/app/index.html`). One 121 KB chunk mentions `WebGLRenderer`. The main three.js chunk (152 KB) loads later with the scene. |
| All client JavaScript | 517 KB gzip (`.next/static/chunks`). |

Why three.js is likely in the first load: `game/squares.ts` has a **value** import, `import { Vector3 } from 'three'`,
and the chain `ui/*` → `state/store.ts` → `scene/sequencer.ts` → `game/squares.ts` is loaded with the page. Every
other `three` import outside `scene/` components is `import type`.

## Decisions already made

| Question | Decision |
|---|---|
| Music | Re-encoded once to **MP3 128 kbps stereo**, 44.1 kHz, same file name (about 1.7 MB). |
| Caching | Headers only. `/engine/*` immutable for a year, guarded by a test; `/audio/*` a week with stale-while-revalidate. No renaming, no hashed audio URLs. |
| Engine | Stays lazy; additionally prefetched when the player opens the computer panel. |
| Bundle | Take three.js out of the first load if `next analyze` confirms the cause; a size budget checked in CI. |

## Caching (`apps/web/next.config.ts`)

`headers()` returns these in every environment (they are harmless in development), in addition to S2's security
headers, which stay production-only:

| Source | `Cache-Control` |
|---|---|
| `/engine/:file*` | `public, max-age=31536000, immutable` |
| `/audio/:file*` | `public, max-age=604800, stale-while-revalidate=86400` |

The engine's files carry Stockfish's version in their name, so a new engine means new names. A changed sound keeps
its name and reaches returning players within about a week, which is harmless.

### Guard: `apps/web/src/engine/files.test.ts`

- Records the SHA-256 of `public/engine/stockfish-19-lite-single.js` and `.wasm`. If either file's content
  changes, the test fails with: "The engine's files are cached as immutable: give changed files a new name, and
  update uci.ts and this test."
- Checks that the worker URL in `engine/uci.ts` names a file that exists in `public/engine/`, and that every file
  the worker loads is under `/engine/` (so the immutable header covers it).

## Music (`public/audio/music.mp3`, `audio/audio.ts`)

### Re-encoding

Done once, by hand, with ffmpeg (`libmp3lame`, constant 128 kbps, stereo, 44.1 kHz); the result replaces
`music.mp3` and the command is written in `public/audio/CREDITS.md` next to the track's credit, so it can be
repeated. The loop point must stay seamless: listen to the end-to-start join once before committing. ffmpeg is not
installed on the owner's machine; installing it is asked first.

### Fetching only what can be heard

`unlock()` keeps creating the AudioContext and fetching the sound effects on the first gesture, as now. The music
element is created by a new function, `startMusic()`, which does nothing when:

- the music element already exists, or
- there is no AudioContext yet (no gesture), or
- the game is muted, or the music volume is 0.

It is called from `unlock()`, from `setMuted(false)`, and from `setVolume('music', v)` when `v > 0`. So a player who
muted the game, or turned the music to 0, never downloads it; turning it back on starts it. Turning it off again
after it started only silences it (the element stays), as today.

## Engine (`engine/`, `ui/MainMenu.tsx`)

- `engine/uci.ts` exports the two file URLs it uses (`ENGINE_SCRIPT`, `ENGINE_WASM`), and `createEngine` uses
  `ENGINE_SCRIPT`.
- `engine/prefetch.ts` (new): `prefetchEngine()` fetches both URLs once per page (`fetch(url, { priority: 'low' })`,
  errors ignored). The HTTP cache keeps them (immutable), so the worker created by Start finds them there.
- `MainMenu.tsx` calls `prefetchEngine()` when the computer panel opens.
- Online and two-player games still never touch `/engine/`.

## Bundle

### Taking three.js out of the first load

1. Confirm with `npx next analyze` (Next 16.4's Turbopack analyzer) which import puts three.js in the chunks of `/`.
2. If it is `game/squares.ts`: `squareToWorld` returns a plain `Point = { x: number; y: number; z: number }`
   (new type in `game/types.ts`). The places that need three's methods get them where three is already loaded:
   - `scene/sequencer.ts` does its few vector operations on `Point`s with small helpers in `game/points.ts` (new;
     only what the sequencer uses today, for example distance and moving a point toward another);
   - `ActorHandle.moveTo` and `CameraRigHandle` take a `Point`; the scene's actors and camera rig copy it into
     their own `Vector3` (`vector.set(p.x, p.y, p.z)`);
   - `scene/Board.tsx` and `scene/Piece.tsx` build a `Vector3` from the `Point` where they need one.
   No deep imports such as `three/src/math/Vector3.js`: they would load a second copy of three.js beside the
   main one.
3. If the analyzer names another cause, apply the same rule to it (nothing outside `scene/` components imports a
   value from `three`, `@react-three/fiber` or `@react-three/drei`), and amend this spec before going further.
4. Measure again; record before and after in the commit message.

A lint rule keeps it that way: `@typescript-eslint/no-restricted-imports` in `apps/web/eslint.config.mjs`, with
`allowTypeImports: true`, forbids value imports of `three`, `three/*` and `@react-three/*` in every file of `src/`
except the scene's components (`src/scene/**/*.tsx`). The scene's plain modules (`sequencer.ts`, `actors.ts`,
`cameraHandle.ts`, `theme.ts`, `tween.ts`) are covered, since the store loads them with the page.

### Size budget (`apps/web/scripts/bundle-size.ts`, `apps/web/bundle-budget.json`)

Run with Node after `next build`:

- **first load**: the gzip size of the chunks Next lists for `/` in `.next/diagnostics/route-bundle-stats.json`
  (`firstLoadChunkPaths`, written by `next build` in 16.4);
- **all JavaScript**: the gzip size of every file under `.next/static/chunks/` ending in `.js`.

It prints both against the budget, and exits 1 when either is over. `bundle-budget.json`:

```json
{ "firstLoadKb": 0, "totalKb": 0 }
```

filled with the numbers measured after the three.js change, plus 5 %, rounded up to a multiple of 10 KB. Raising a
budget means editing this file in the same pull request, where review sees it.

- `apps/web/package.json`: `"size": "node scripts/bundle-size.ts"`.
- CI `check` job: `npm run size -w @chess/web` right after `npm run build`.

## E2E additions (S3's suite)

- `local.spec.ts`: during a two-player game, no request goes to `/engine/`.
- `settings.spec.ts`: with the game muted in Settings before the first move, no request goes to `/audio/music.mp3`
  (sound effects may load).
- `computer.spec.ts`: opening the computer panel requests `/engine/stockfish-19-lite-single.wasm` before Start is
  pressed.

## Error handling

- A failed prefetch is ignored; the worker fetches the files itself at Start, as today.
- `startMusic()` keeps today's handling: a refused `play()` logs a warning; the game never waits on audio.
- The budget script fails with a clear message if `route-bundle-stats.json` is missing (no build) or lists no
  first-load chunks for `/`.

## Testing

- `engine/files.test.ts` (above).
- `audio/audio.test.ts` (new), with fake `AudioContext`, `Audio` and `fetch` stubbed as globals: no music element
  after the first gesture when muted, or with music volume 0; one is created when unmuted later or when the volume
  is raised; never two.
- `engine/prefetch.test.ts` (new): both URLs fetched once however often it is called; a rejected fetch is
  swallowed.
- `squares.test.ts` and `sequencer.test.ts` updated for `Point`; the catalog replay of S3 stays green.
- The three E2E checks above, in all three browsers.
- `curl -I` on a production build shows the two cache headers.
- `npm run size -w @chess/web` passes; changing the budget to a lower number makes it fail.

## Done when

- `music.mp3` is about 1.7 MB and loops cleanly.
- `/engine/*` and `/audio/*` carry the headers above, and the engine guard test is in place.
- A muted player never downloads the music; a two-player or online player never downloads the engine; opening the
  computer panel prefetches it.
- three.js is out of the first load (or the spec is amended with the real cause), and the budget check runs in CI.

## To verify during implementation

- Which import really puts three.js in the first load (`next analyze`).
- Whether WebKit decodes the Ogg Vorbis sound effects (`canPlayType('audio/ogg; codecs="vorbis"')` and a
  `decodeAudioData` of one file, in Playwright's WebKit). If not, Safari players hear no effects: record it as a
  follow-up (changing the effects' format is outside S4).
- That Vercel applies `headers()` to files in `public/` (it does for Next's own server; check the response on a
  preview deployment if one exists, otherwise on `next start`).
- That `fetch(..., { priority: 'low' })` is accepted by all three browsers (an unknown option is ignored).

## Out of scope

- Changing the sound effects' format.
- Reusing one engine worker across games.
- Lighthouse or Core Web Vitals targets.
- Textures and models (the pieces and board are built in code).
- Loading Sentry lazily.
