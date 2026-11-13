# 3D Combat Chess — Castle Courtyard and Pieces Built from Models

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

The board stands in a scene instead of empty darkness, and every piece can be told apart at a glance. Pieces become
detailed, rigged and animated `.glb` models made with Meshy, replacing the primitive-built models one type at a time,
with the current models kept as the fallback.

| | Sub-project | Builds on | Meshy credits |
|---|---|---|---|
| **A** | Castle courtyard around the board, built in code; team colours become red and blue (this spec) | — | none |
| **B** | Loading `.glb` pieces, and the pawn made end to end as a pilot (this spec) | — | few |
| C | The other five pieces | B, once the pilot passes | most |

C gets its own plan after B's pilot. Its piece designs are fixed here so the pilot is judged against the whole set.

## Originality constraint

Unchanged from `2026-11-11-playable-core-design.md`: the game is in the "chess with combat cutscenes" genre, with its
own piece designs, palette, heraldry and choreography. The reference picture the owner shared is a screenshot of an
existing game; it is not used as a Meshy input and nothing is copied from it — not its characters, its cyan and black
board, its lion and eagle banners, or its tower that turns into a stone giant. Meshy prompts are written from the
designs below.

## Where things stand (observed on 2026-11-13)

- Bishop, queen and king share one body (`Robed` in `scene/pieces/parts.tsx`): a cone robe, a sphere head and a
  small hat. From the default camera they look the same.
- Pieces are about one square tall and cover less than half a square, so detail is lost.
- Around the board: a walnut base (`Board.tsx`) and a flat `#1C1917` background. Nothing else.
- Lights: one ambient, one directional key light with a 2048 shadow map (`Scene.tsx`).
- Team colours: amber `#D97706` and teal `#0F766E`, named "Amber/Teal" and "Cam/Lục" in `ui/i18n.ts`.
- The CSP already allows what loading `.glb` files from `/models/` needs: `connect-src 'self'`, `img-src blob:`,
  `script-src 'wasm-unsafe-eval'`.
- Blender is not installed on the owner's machine.

## Decisions already made

| Question | Decision |
|---|---|
| Where piece models come from | Made by us with Meshy's web app (free plan), driven through the owner's Chrome. |
| How models move | Rigged skeletons with animation clips, played through the existing `Rig` interface. |
| Licence | Meshy free plan: CC BY 4.0. Credited in `public/models/CREDITS.md` and in Settings. |
| Scene around the board | A castle courtyard at dusk, built in code. |
| Team colours | Red and blue, named "Đỏ/Xanh" and "Red/Blue". |
| Rollout | A pilot pawn proves the pipeline before credits go to the other five pieces. |
| Missing or broken model | That piece type falls back to its current primitive-built model. |

## A. The courtyard

A new `scene/Courtyard.tsx`, mounted in `Scene.tsx` next to `<Board />`. No asset files. World units: one square is
1, the board's centre is the origin, the camera starts at `[0, 10, ±9]` (`CAMERA` in `theme.ts`).

| Element | Build |
|---|---|
| Dais | Two stone steps under the existing walnut base: about 11 × 11 and 13 × 13, 0.3 high each, bevelled (`RoundedBox`). |
| Floor | Flagstones around the dais out to a radius of about 20: one `InstancedMesh` of about 400 slabs, each with a small random height and shade (seeded, so every load looks the same). |
| Walls | A ring of wall at a radius of about 18, with merlons (one `InstancedMesh`), and a round tower with a conical roof at each far corner. |
| Braziers | Four, at the dais corners: a stone bowl, an emissive flame and a warm point light whose intensity flickers. No shadows. |
| Banners | One tall pole behind each army, its cloth in that team's colour with our own emblem: an inverted chevron over two crossed spears. The cloth waves (vertex offsets each frame on a 10 × 16 plane). |
| Sky and fog | drei `<Sky>` with a low sun, and `fog` in the dusk colour, so the walls fade into the distance. |

**Light.** The key light becomes warm late sun and keeps the only shadow; its shadow camera covers the board, not the
courtyard, so piece shadows stay sharp. A cool hemisphere light replaces the ambient light as fill. Brazier lights add
warmth near the dais.

**Motion.** With `reducedMotion()` the flames do not flicker and the banners hang still.

**Clicks.** Courtyard meshes ignore the raycaster (`raycast` set to a no-op), so a click off the board still reaches
`onPointerMissed` and deselects, as today.

**Performance.** About 40 draw calls for the whole courtyard. Only the board and the pieces cast shadows.

## Team colours

| | Today | New |
|---|---|---|
| `TEAM.w` (`theme.ts`) | amber `#D97706` | red `#B91C1C` |
| `TEAM.b` | teal `#0F766E` | blue `#1D4ED8` |
| `team` in `ui/i18n.ts` | `Amber/Teal`, `Cam/Lục` | `Red/Blue`, `Đỏ/Xanh` |
| `e2e/local.spec.ts`, `e2e/online.spec.ts` | `Teal wins`, `Amber wins` | `Blue wins`, `Red wins` |

The interface accent (amber buttons) is not a team colour and stays. The check highlight stays red but becomes
emissive, so the red king's robe does not blend into its square; a screenshot of a red king in check confirms it.

## B. Pieces from `.glb` models

### Piece designs

Stylised, chibi proportions (big head, about three heads tall) so each piece reads from above. Each type has one
silhouette feature that names it. Heights are in squares; pieces cover about 70% of a square.

| Piece | Design | Reads as | Height | Rig |
|---|---|---|---|---|
| Pawn | Stocky foot soldier: wide-brimmed steel kettle hat, breastplate under a sleeveless tabard, kite shield on the left arm, short spear | the wide brim | 0.9 | humanoid |
| Knight | Champion on foot whose great helm carries a horse's head crest; short cape; greatsword | the horse head | 1.2 | humanoid |
| Bishop | Cleric in a long robe with cream trim; tall cleft hat split down the middle; crook staff | the cleft hat | 1.25 | humanoid |
| Rook | Wooden siege tower on four wheels, crenellated top, cloth hangings. No figure, no transformation | the square tower | 1.3 | none |
| Queen | Gowned queen with a tall flared collar, a crown of many tall points, an orb sceptre | the pointed crown | 1.4 | humanoid |
| King | Bearded king in a fur-trimmed cloak, a crown topped with a cross, a greatsword resting point-down | the cross on top | 1.55 | humanoid |

Everything in the team's colour (tabard, cape, robe, gown, cloak, hangings, the shield's face) is painted flat
**magenta `#FF00FF`** in the texture prompt; the game replaces it with the team's colour.

The knight changes from today's mounted lancer to a champion on foot: Meshy cannot rig a rider on a horse, and the
horse-head crest keeps the chess knight's silhouette. Until the knight's model lands, today's knight stays.

### The pilot pawn's prompts

Model: *"Stylized low-poly chibi medieval foot soldier, stocky, about three heads tall, wide-brimmed steel kettle
hat, steel breastplate under a sleeveless tabard, kite shield on the left arm, short spear in the right hand, A-pose,
game asset, simple clean shapes."*

Texture: *"Brushed silver steel armour, brown leather belt and boots, wooden spear shaft, the tabard and the shield's
face painted flat pure magenta #FF00FF, no patterns, no logos, no text."*

The prompts for the other five follow the same form from the table above; each one used is recorded in `CREDITS.md`.

### Making a model in Meshy

Claude drives the owner's Chrome; the owner signs in. Claude asks before each download, each acceptance of terms, and
anything that would spend money. For each piece:

1. Text to 3D with the model prompt; low-poly style, a target of about 8k triangles where the app offers one.
2. Texture with the texture prompt.
3. Rig as a humanoid (not for the rook).
4. Add four clips from Meshy's library: idle, walk, an attack that suits the weapon, death.
5. Download as GLB.

### Pipeline

- Downloads go to `apps/web/assets-src/<piece>/`, which is git-ignored. They are only read by tools, never run.
- `npm run models -w @chess/web` runs `@gltf-transform/cli` (a devDependency at an exact version): simplify, meshopt
  compression, textures resized to 512 px and converted to WebP. If Meshy exports each clip as its own file, a small
  script (`scripts/merge-clips.ts`, using `@gltf-transform/core`) copies the clips into the main file, matching
  channels by bone name; the pilot shows whether this is needed.
- The result is `apps/web/public/models/<piece>-<n>.glb`. The number is a version: a changed model gets a new name.
- `public/models/CREDITS.md`: the Meshy licence, the date, the prompts and the exact commands, so a model can be made
  again.

### Manifest: `scene/pieces/models.ts`

```ts
type Clips = { idle: string; walk: string; attack: string; die: string };
export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>> = {
  p: { url: '/models/pawn-1.glb', clips: { /* the animation names in the pilot's file */ } },
};
```

A type that is not listed uses its primitive-built model. `clips` holds the animation names exactly as they appear in
the optimised file, which only the pilot can tell; it is absent for the rook.

### Caching

`next.config.ts` adds `/models/:file*` → `Cache-Control: public, max-age=31536000, immutable`, next to `/engine/`.

### At runtime: `scene/pieces/GlbPiece.tsx`

- **Load.** drei `useGLTF` (meshopt enabled). Each piece on the board is its own copy (`SkeletonUtils.clone`) with its
  own `AnimationMixer`. Skinned meshes cast shadows and are not frustum-culled.
- **Size.** The model's bounding box is measured once per type; the copy is scaled to the height in the table, its
  feet on the square, centred on it.
- **Rig adapter.** `GlbPiece` exposes the same `Rig` (`stride`, `attack`, `die`) as the current models, so `Piece.tsx`,
  the sequencer and `TIMING` do not change:
  - `stride(phase)`: the walk clip at `(phase mod 1) × duration` (one cycle per square); `phase = 0` returns to idle.
  - `attack(t)`, `die(t)`: that clip at `t × duration`; the attack returns to idle at `t = 1`; the death holds its
    last pose.
  - Otherwise the idle clip plays in real time.
  - The time mapping is a pure function, `clipTime(value, duration, loop)`.
- **No clips** (the rook, or a model whose clips fail the pilot): the current model's poses for that type applied to
  the whole model (the rook rocks, rams and tips over; its wheels no longer turn).
- **Team colour.** The materials are cloned once per team and patched with `onBeforeCompile`: after the texture is
  sampled, a texel whose red and blue are high and green low is replaced by the team colour at the texel's brightness,
  so the baked shading survives. All pieces of one team share those materials.
- **Choosing.** `Piece.tsx` renders `GlbPiece` for a type listed in `MODELS`, inside `<Suspense>` whose fallback is the
  primitive-built model. `Scene.tsx` preloads every listed URL when it mounts; the opening camera descent covers the
  swap.

### Errors

- A model that fails to load (404, corrupt file): an error boundary around `GlbPiece` renders the primitive-built model
  for that type and logs once. The game stays playable.
- A missing clip: that type uses whole-model poses, as the rook does.

### Pilot: what the pawn must show before C starts

1. The magenta becomes red or blue cleanly, with no fringes or patches.
2. Attack and death clips exist and read well at `TIMING.attackMs` and `TIMING.dieMs`.
3. The optimised file is at most 600 KB.

If 1 fails, each piece is made in two colours instead (twelve models). If 2 fails, that piece uses whole-model poses.
If 3 fails, the triangle target and texture size come down until it fits.

## Testing

- **Vitest**
  - `scene/pieces/models.test.ts` reads each GLB's JSON chunk in Node (no three.js): every listed file exists under
    `public/models/`; every file there is listed; each is at most 600 KB and all together at most 3.5 MB; each listed
    clip name is one of the file's animations; names match `<piece>-<n>.glb`.
  - `clipTime` unit tests: looping, clamping, `phase = 0`.
  - `ui/i18n.ts` team names.
- **Playwright**: the new team names; no request under `/models/` fails and the console has no errors during a game.
- **In the browser** (screenshots in the pull request): the courtyard from both sides; the pilot pawn of each team at
  rest, walking, attacking and dying; a red king in check; reduced motion.
- **Bundle budget**: GLTFLoader, the meshopt decoder and `SkeletonUtils` add roughly 25 KB gzip to the scene's chunk,
  which may pass `totalKb: 550`. If so, `bundle-budget.json` is raised in the same pull request.

## Out of scope

- The other five models (sub-project C).
- A graphics-quality setting.
- Changing the camera's limits or the fight choreography.
- Mixing animation clips (cross-fades); poses switch directly, as today.

## Risks

- Meshy's free credits (about 100 a month) may not cover six pieces with retries; C may take more than one month.
- Meshy's library may lack a fitting attack or death clip for some pieces; those fall back to whole-model poses.
- Thirty-two skinned pieces at about 8k triangles each is about 256k triangles; low-end phones are checked in the pilot.
