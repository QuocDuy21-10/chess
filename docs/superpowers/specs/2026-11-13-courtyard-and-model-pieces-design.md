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
| Default view | Lowered from 48° to 28° so the courtyard's far wall is in frame; the wall comes in to a radius of 12. |
| Team colours | Red and blue, named "Đỏ/Xanh" and "Red/Blue". |
| Rollout | A pilot pawn proves the pipeline before credits go to the other five pieces. |
| Missing or broken model | That piece type falls back to its current primitive-built model. |

## A. The courtyard

A new `scene/Courtyard.tsx`, mounted in `Scene.tsx` next to `<Board />`. No asset files. World units: one square is
1, the board's centre is the origin, the camera starts at `[0, 10, ±9]` (`CAMERA` in `theme.ts`).

| Element | Build |
|---|---|
| Dais | Two stone steps under the existing walnut base: 11 × 11 and 13 × 13, 0.3 high each, bevelled (`RoundedBox`). |
| Floor | Flagstones from the dais out to the wall: one `InstancedMesh` of a few hundred slabs, each with a small random height and shade (seeded, so every load looks the same). Beyond the wall, a wide earth plane. |
| Walls | A ring of wall at a radius of 12, 3 high from the flagstones (which lie 1.1 below the board), with merlons on top (0.5 high, one `InstancedMesh`), and a round tower with a conical roof at each of the four diagonal points of the ring, so either side sees two. |
| Braziers | Four, on the corners of the top step: a stone bowl, an emissive flame and a warm point light whose intensity flickers. No shadows. |
| Banners | One tall pole behind each army, its cloth in that team's colour with our own emblem: an inverted chevron over two crossed spears. The cloth waves (vertex offsets each frame on a 10 × 16 plane). |
| Background and fog | Background and `fog` in a dusk colour; the earth plane beyond the wall fades into it. Within the camera's limits the view never reaches the horizon, so there is no sky dome. |

### Camera

At today's default (`[0, 10, 9]`, looking 48° down) the frame ends 8–13 units past the board's centre, so a wall
would be out of sight. The default view comes down to 28°, measured by projecting the board and the wall through
three.js's `PerspectiveCamera`:

| `CAMERA` in `theme.ts` | Today | New |
|---|---|---|
| `position` | `[0, 10, 9]` | `[0, 6.88, 11.58]` |
| `target` (new) | the origin | `[0, 0.4, -0.6]` |
| `fitAspect` | 1.33 | 1.45 |

The distance to the target is 13.8, inside `maxDistance` 14. The board fills 85% of the frame's height, and at
`fitAspect` 95% of its width. The top of the far wall's merlons, 2.4 above the board, sits at 96% of the frame's height,
so all of the wall shows. The second army's camera mirrors `position`
and `target` in z. The orbit limits do not change. The board looks more side-on and the far ranks a little smaller.

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
- **No clips** (the rook, or a model whose clips fail the pilot): whole-model poses — a bob while walking, a lunge
  forward to attack, a fall backward to die. The rook's own poses (rock, ram, tip over; its wheels no longer turn)
  come with sub-project C.
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
  - `scene/camera.test.ts`: the new default view frames the board and the far wall (three.js projection).
  - `scene/courtyard.test.ts`: the seeded flagstones and the wall ring.
- **Playwright**: the new team names; no request under `/models/` fails and the console has no errors during a game.
- **In the browser** (screenshots in the pull request): the courtyard from both sides; the pilot pawn of each team at
  rest, walking, attacking and dying; a red king in check; reduced motion.
- **Bundle budget**: GLTFLoader, the meshopt decoder and `SkeletonUtils` add roughly 25 KB gzip to the scene's chunk,
  which may pass `totalKb: 550`. If so, `bundle-budget.json` is raised in the same pull request.

## Out of scope

- The other five models (sub-project C).
- A graphics-quality setting.
- Changing the camera's orbit limits, or the fight choreography.
- Mixing animation clips (cross-fades); poses switch directly, as today.

## Risks

- Meshy's free credits (about 100 a month) may not cover six pieces with retries; C may take more than one month.
- Meshy's library may lack a fitting attack or death clip for some pieces; those fall back to whole-model poses.
- Thirty-two skinned pieces at about 8k triangles each is about 256k triangles; low-end phones are checked in the pilot.

## Pilot outcome (2026-11-14)

- Meshy's free plan made the pawn (text to image with Nano Banana, image to 3D, texture, remesh to 9,927 faces,
  humanoid rig) but no longer lets a free account download any model, nor add library clips (403). Paying was
  declined.
- The owner chose a CC0 model instead: the pawn is KayKit's `Knight` (Kay Lousberg) with `sword_1handed` and
  `shield_badge_color`, and the clips `Idle_A`, `Walking_A`, `Melee_1H_Attack_Chop`, `Death_A` from KayKit Character
  Animations. `scripts/kaykit-pawn.ts` builds it; it is not the kettle-hat design above. Credits are in
  `public/models/CREDITS.md` and Settings (CC0: optional).
- The three criteria: (1) the magenta-repainted cloth recolours cleanly to red and blue; (2) attack and death read
  well at 700 ms each; (3) `pawn-2.glb` is 163,320 bytes. `pawn-1.glb` is skipped: a local stand-in once had that
  name and may sit in a browser cache for a year.
- Sub-project C started by choosing between Meshy on a paid plan and KayKit (or another CC0 set) for the
  other five pieces.
- Two corrections the pilot forced: GLTFLoader fetches a model's embedded textures from `blob:` URLs, so the CSP's
  `connect-src` now allows `blob:` (the "no CSP change" note above was wrong); and on a CPU WebGL renderer
  (SwiftShader, llvmpipe — as in headless Chromium and on CI) the scene drew about 3 frames a second, so there it now
  renders at half resolution without shadows (`scene/renderer.ts`), about 7.5 frames a second; GPUs are unchanged.
  The Knight's nine body meshes are joined into one, so a pawn costs three draw calls.

## Sub-project C outcome (2026-11-14)

The owner chose KayKit for the other five pieces, every one a character (no horse or tower exists in the pack):
knight = Ranger with a bow, bishop = Mage with a staff (the pointed hat recalls the bishop's mitre), rook =
Rogue_Hooded with a dagger, queen = Rogue with a crossbow, king = Barbarian with an axe and a round shield (the
bear pelt takes the team colour). `scripts/kaykit-pawn.ts` became `scripts/kaykit-piece.ts`, one table for all six;
the pawn rebuilds byte for byte. The design table above (cleft hat, siege tower, crowns) is not what shipped.
All six models together are about 1.05 MB. With every piece a skinned character, headless Chromium on the CPU
renderer draws about 4.5 frames a second under load; all E2E tests pass in the three browsers.
Clips checked for all six models: in a played game the king's axe chop, the rook's stab, the bishop's staff cast,
the queen's crossbow, the knight's bow shot, and the knight's and the rook's falls (Death_B) were seen; and in each
file's data the death clip lowers the
hips by 45–63% and the attack clip swings an arm by 51–109°.
