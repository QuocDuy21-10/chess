# 3D Combat Chess — Character Pieces Built in Blender

Date: 2026-11-19
Status: design approved in chat; spec awaiting review

## Goal

Replace the six living Staunton pieces with medieval characters that match the owner's reference sprite sheets in
`docs-local/generated/sprites 2/` (stocky soldiers with large heads, silver armour, gold trim and team-coloured
cloth). Each character walks, fights, takes a hit and falls. Supersedes the style choice in
`2026-11-19-living-pieces-design.md`; that pipeline (`lp.py`, headless build, clip self-check, `npm run models`) is
reused.

## Where things stand (observed on 2026-11-19)

- All six pieces are living Staunton models built by `scripts/blender/living_pieces.py` from builders in `pieces.py`,
  with helpers, rigid skinning, baking, the clip self-check, preview renders and export in `lp.py`
  (`MAX_BONES = 16`).
- `GlbPiece.tsx` clones each model's skeleton, recolours magenta to the team colour in the shader, and holds four
  clips (`idle`, `walk`, `attack`, `die`) through the `Rig` interface.
- `sequencer.ts` walks the attacker to its stand-off, plays `attack`, and starts the defender's `die` at
  `TIMING.impactAt` (0.6) of the 700 ms attack. Knights hop.
- The reference sheets are 4×4 grids facing right: four walk frames, then anticipation, attack, hit, defeated, for a
  blue and a red faction.

## Decisions made in chat

1. Look: humanoid characters like the reference sheets (the knight rides a horse).
2. **Rook:** a heavy tower-shield warden, not the sheet's brick tower that turns into a golem. That transformation is
   another game's signature gag, and the originality constraint in `2026-11-11-playable-core-design.md` forbids it.
3. **A separate `hit` clip** (the defender's recoil) plays before `die`, so the combat reads as move, attack, hit,
   defeated.
4. **One model per piece type for both teams:** cloth is magenta and recoloured by the existing shader. Both teams
   wear one shared gold emblem; the sheets' eagle and lion would need two models per piece.
5. **Workflow:** done live in the owner's Blender app (computer use). Geometry comes from a script run in Blender's
   Text Editor. Poses, keyframes and proportions are tuned by hand in the viewport, and every hand tweak is written
   back into the script. The shipped `.glb` is rebuilt headless from the script, so every build is identical.
6. **Rollout:** the pawn is the pilot and brings the shared skeleton, the `hit` clip and the game changes. Then the
   rook, bishop, queen and king, and the knight last. One commit per piece.

## Originality constraint

Unchanged from `2026-11-11-playable-core-design.md`: no name, character design, heraldry, palette or signature gag
from an existing game. The reference sheets set the general look (stocky medieval soldiers). Their rook design is
not used, and the emblem is our own.

## Characters

Shared style: about 4.5 heads tall, silver steel, gold trim, skin, leather, wood and team cloth (magenta). No
textures: colour, metallic and roughness only. Non-graphic: no blood. The magic and holy flashes are an emissive
mesh that grows and shrinks, not particles.

| Piece | Look | attack (anticipation → contact at 0.6) | hit | die |
|---|---|---|---|---|
| Pawn | Infantryman: plumed helmet, team tunic, spear, round shield with the emblem | Draws the spear back behind the shield → thrusts | Recoils behind the shield | Falls on his side, spear and shield beside him |
| Rook | Warden: heavy plate, closed great helm, tall tower shield with a battlement top edge, mace | Pulls the shield in → bashes forward with it | Braces and is driven back behind the shield | Falls backward, the shield across him |
| Bishop | Cleric: white beard, tall mitre, long vestments, gold crozier | Raises the crozier → thrusts it with a holy flash | Staggers, leaning on the crozier | Slumps to the ground beside the crozier |
| Knight | Plumed rider with a lance on a small armoured horse with a team caparison | Lowers the lance → the horse lunges and the lance strikes | The horse rears and the rider leans back | The horse kneels and the rider slumps forward |
| Queen | Crown, brown hair, long gown with gold trim | Draws a hand back → thrusts it with a small magic orb | Steps back with an arm raised | Sinks to her knees, slumped |
| King | Crown, beard, fur-trimmed cloak, silver armour, sword | Raises the sword → slashes down | Steps back, the cloak swinging | Falls on his side, crown kept |

## Rig

- **Shared humanoid skeleton** (`figure.py`): `root`, `hips`, `spine`, `chest`, `neck`, `head`; per side `arm_up`,
  `arm_low`, `hand`, `leg_up`, `leg_low`, `foot`; prop bones `weapon`, `shield`, `cloth_0`, `cloth_1` (cloak or
  gown sway), `hat`. About 22 bones.
- **Knight:** the rider's skeleton plus a horse: `horse_body`, `horse_neck`, `horse_head`, two bones per leg,
  `horse_tail`. About 35 bones.
- `lp.MAX_BONES` rises from 16 to 40.
- **Rigid skinning, as now:** every vertex has weight 1.0 on exactly one bone. Joints hide behind armour rings and
  cuffs, so nothing needs weight painting.
- Feet on z = 0, centred on the origin, facing −Y in Blender (+Z in three.js). Frame rate 30.

## Clip contract

| Clip | Length | Rules |
|---|---|---|
| `idle` | 2–3 s loop | Breathing, small sway. First frame equals last. Stays inside the square. |
| `walk` | 1 loop = 1 square | In place, two steps per loop (matching the two footfalls), arms swing. First frame equals last. The knight's horse gallops; the game still does the knight's hop. |
| `attack` | ~0.7 s | Anticipation before 0.45, contact at **0.6**, back at the rest pose on the last frame. In place. |
| `hit` | ~0.3 s | Recoil from the blow. The last frame is the recoiled pose. |
| `die` | ~0.7 s | First frame equals `hit`'s last frame. Ends in the defeated pose, which stays on screen. Every part stays at z ≥ 0. |

## Game changes

- `rig.ts`: `Rig` gains an optional `hit?(t: number)`. The six built-in fallback models are unchanged; they only show
  when a model fails to load.
- `actors.ts`, `Piece.tsx`: `play()` accepts `'hit'`, tweened over the new `TIMING.hitMs = 300` (`theme.ts`).
- `models.ts`, `GlbPiece.tsx`: `Clips` gains `hit`, played once and clamped like `attack` and `die`.
- `sequencer.ts`: at the impact the defender plays `hit`, then `die`, while the attack finishes. A capture takes about
  0.3 s longer.

## Pipeline

```
scripts/blender/figure.py     (new) shared skeleton, body parts, parameterised walk and hit
scripts/blender/pieces.py     each piece's builder is replaced by its character once that character is approved
scripts/blender/lp.py         MAX_BONES = 40; CLIPS and check() gain hit
living_pieces.py, npm run living / living:test / models   unchanged
public/models/<piece>-<n+1>.glb, models.ts points at it
```

Live session per piece: open Blender, run the build from the Text Editor, tune in the viewport with the owner
watching, write each tweak back into the script, then rebuild headless with `npm run living -- <piece>` and optimise
with `npm run models`.

## Testing

- **Build self-check (`lp.check`)**: all six clips exist; `idle` and `walk` start and end on the same pose; `attack`
  ends on the rest pose; `die` starts on `hit`'s last pose; one weight of 1.0 per vertex; at most 40 bones; `die`'s
  last frame keeps every part at z ≥ 0. Any miss fails the build.
- **`npm run living:test`**: covers the new `figure.py` helpers.
- **Vitest**: `sequencer.test.ts` checks `hit` plays at the impact and `die` follows it; `models.test.ts` checks every
  model has a `hit` clip and stays under 600 KB each and 3.5 MB in all. Target ≤ 250 KB per piece.
- **E2E**: every listed model loads in Chromium, Firefox and WebKit. Postgres must be up (Docker).
- **By eye**: the preview render and the live Blender session, then a played game with captures in the browser
  preview.

## Pilot (the pawn) passes when

1. The owner approves the pawn in Blender and in the running game.
2. Red and blue recolour only the cloth; steel, gold and skin are untouched.
3. Walk, attack, hit and death read well at the game's timings, with the hit starting as the spear lands.
4. `pawn-4.glb` is ≤ 250 KB and all tests pass.

## Out of scope

Per-team heraldry, facial expressions, cloth simulation, particles, a victory clip, new sounds, any change to chess
rules or the knight's hop.

## Pilot outcome (2026-11-19)

`pawn-4.glb`: 126,532 bytes, 20 bones, about 5,600 vertices. Built by `npm run living -- pawn`; the clip contract
held on every build.

Changes made while tuning, in Blender and after the first look in the game:

- The tunic flares to its hem and has a gold hem band; as a straight cylinder it read as a drum.
- In `hit`, the shield comes up to the chest, not over the face.
- Steel is half metallic (0.55, `#C8CDD6`) and gold 0.6: fully metallic, both mirrored the courtyard's dark sky and
  the armour read as black in the game.
- `live.py` frames the figure from the front right in material shading and hides the armature (all its bones stand
  at the origin, so drawn they hide the figure). In the Blender app it was run from the Python console with
  `exec(compile(open(P).read(), P, 'exec'), {'__file__': P, '__name__': '__main__'})`.

Checked in the running game (dev server, two players, 1. e4 d5 2. exd5 Qxd5, frames captured in a Playwright
browser): the red pawn walks, winds up and thrusts; the blue pawn recoils and falls on its side with spear and
shield; then the blue Staunton queen takes the red pawn, which recoils and falls. Red and blue recolour only the
tunic, plume and shield face. The Staunton pieces idle through the 0.3 s hit, then shatter as before. Still to judge:
the character pawn is slimmer than the Staunton pieces at `HEIGHT.p = 0.9`.

Tests: `npm run living:test` 44 OK; `npm test` server 103, web 163, shared 18; typecheck and lint clean.
