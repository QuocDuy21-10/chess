# 3D Combat Chess — Living Staunton Pieces Built in Blender

Date: 2026-11-19
Status: design approved in chat; spec awaiting review

## Goal

Replace the six KayKit characters with pieces that read as chess pieces at a glance and move with character. Each
piece is a Staunton-shaped figure in team-coloured polished stone with gold trim that comes alive: it hops between
squares, strikes with its own move and shatters when taken. Every model is built, rigged, animated and exported by a
Blender Python script, so any model can be rebuilt byte for byte from the repository.

## Where things stand (observed on 2026-11-19)

- All six pieces are KayKit CC0 characters (`public/models/*-N.glb`, built by `scripts/kaykit-piece.ts`). The owner
  finds them cartoonish, hard to tell apart as chess pieces (the knight is an archer, the rook a rogue), stiff when
  walking and monotonous in attack and death.
- `scene/pieces/GlbPiece.tsx` already loads a `.glb`, clones its skeleton per piece, recolours magenta to the team
  colour in the shader, and scrubs four clips through the `Rig` interface: `idle` plays in real time, `walk` is held at
  `stride(phase)` (one loop per square), `attack(t)` and `die(t)` at progress t.
- The sequencer makes knights hop, plays two footfalls per square, starts the defender's `die` at
  `TIMING.impactAt` (0.6) of the 700 ms attack, and holds the last death pose until the piece is removed.
- `models.test.ts` checks each listed model is on disk under a versioned name, every clip exists, and sizes stay under
  600 KB each and 3.5 MB in all. `npm run models` optimises a `.glb` (meshopt, WebP, 512 px textures).
- Blender 5.3.0 is installed at `/Applications/Blender.app`.

## Decisions made in chat

1. Style: **living chess pieces** — classic Staunton silhouettes, not humanoid characters.
2. Materials: keep the red and blue teams; bodies are polished team-coloured stone, trim is gold metal. One mesh
   serves both teams.
3. Animation scope: the four existing clips (`idle`, `walk`, `attack`, `die`), made unique per piece. No hit or
   victory clips, no change to the sequencer, `Rig` or game logic.
4. Tooling: a Blender Python script run headless, not clicking through the Blender UI.
5. Rollout: the pawn first as a pilot; the other five after the owner approves it. The knight comes last.

## Originality constraint

Unchanged from `2026-11-11-playable-core-design.md`. Staunton piece shapes are a public, 175-year-old design. The
rook stays a tower that rocks and slams; it never turns into a stone giant.

## Pipeline

```
apps/web/scripts/blender/living_pieces.py   (bpy, run by Blender in the background)
   └─ builds one piece: mesh → shards → armature → materials → 4 actions → self-check
   └─ writes assets-src/living/<piece>.glb, <piece>.blend, <piece>.png (preview render)
npm run models -- assets-src/living/<piece>.glb public/models/<piece>-<n>.glb
models.ts: point the piece's url at the new file (clips keep the names idle/walk/attack/die)
```

Run, from `apps/web`:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/blender/living_pieces.py -- pawn assets-src/living
```

`--factory-startup` keeps the owner's Blender preferences and add-ons out of the build. `assets-src/` is already
git-ignored; the `.blend` is kept there so the owner can open and hand-tune a piece. Only the script is committed.

### Building a piece

- **Body:** a profile curve (list of radius/height points per piece) revolved around Z (Screw modifier, 48 steps),
  then piece-specific parts: crenellations, coronet points, cross, mitre with its slit, horse head and neck. Bevels and
  smooth shading; no textures.
- **Shards:** the body is cut with a fixed set of planes into 6–10 chunks, so `die` can break it apart. Cuts are
  seeded, so rebuilds are identical.
- **Armature, rigid skinning:** 6–12 bones per piece (root, base, body, neck/head or top parts, one per shard).
  Every vertex has weight 1.0 on exactly one bone, so nothing deforms or needs weight painting.
- **Materials:** `team` — base colour pure magenta (`#FF00FF`), roughness 0.25, metallic 0, so `GlbPiece`'s existing
  recolour replaces it with red or blue; `trim` — gold, metallic 1, roughness 0.3. Two materials per piece.
- **Scale and origin:** the base stands on z = 0, centred on the origin, facing −Y in Blender (+Z in three.js, like
  the current models). `GlbPiece.fit` rescales to `HEIGHT[type]`, so absolute size does not matter.
- **Actions:** four actions named exactly `idle`, `walk`, `attack`, `die`, exported with the glTF exporter's
  "Actions" mode. Frame rate 30.

### Clip contract (from the sequencer)

| Clip | Length | Rules |
|---|---|---|
| `idle` | 2–3 s loop | First and last frames equal. Small amplitude: the piece must not leave its square. |
| `walk` | 1 loop = 1 square | Two bounces per loop (matching two footfalls), squash on landing, lean forward. In place: the game moves the piece. First and last frames equal. |
| `attack` | ~0.7 s | Anticipation before 0.45, contact at **0.6** of the clip, back to the rest pose exactly at the last frame. In place. |
| `die` | ~0.7 s | Starts with a recoil (the hit), then breaks apart. The last frame is the final pose and stays on screen. Shards stay above the floor (z ≥ 0). |

## Pieces

All pieces hop: they have no legs. Character comes from rhythm and from each piece's own strike.

| Piece | Shape | idle | walk | attack (contact at 0.6) | die |
|---|---|---|---|---|---|
| Pawn | Ball head, collar, low base | Quick small bob, slight sway | Small, nimble hops | Leans back, **head-butts** forward, springs back | Jolts back, cracks into ~6 shards that drop to the floor |
| Rook | Tower, 5 merlons (one bone each) | Nearly still; merlons twitch now and then | Heavy side-to-side rocking | Tilts back, **body-slams** forward; merlons rattle | Merlons fly off, the tower collapses into blocks |
| Knight | Horse head on a neck, mane, ears (neck and head on separate bones) | Nods, flicks ears | Trotting bounce (the game still does the hop) | **Rears up**, then strikes down with the head | Neck droops, head breaks off, body shatters |
| Bishop | Mitre with a slit, ball finial | Gentle forward tilt, as if praying | Smooth glide, little bounce | **Spins one full turn**, then thrusts the mitre's point | The mitre splits along its slit, the body falls |
| Queen | Coronet of 8 balls, narrow waist | Slow hip sway | Light, graceful hops | **Whirls and lashes** sideways; coronet points flare out | The coronet pops off, the body shatters |
| King | Tallest, cross finial | Slow and stately | Heavy, dignified hops | **Rises tall**, then hammers down like a gavel | The cross falls first, the king topples slowly and cracks |

## Testing

- **In the script:** after building, an assert-based self-check: the four actions exist; `idle` and `walk` start and
  end on the same pose; `attack` ends on the rest pose; every vertex has exactly one weight of 1.0; bone count ≤ 16;
  `die`'s last frame keeps every shard at z ≥ 0. The build fails loudly on any miss.
- **Existing Vitest guards:** `models.test.ts` (versioned name, clips present, size limits). Target ≤ 150 KB per piece
  after `npm run models`.
- **Existing E2E:** every listed model loads in the three browsers.
- **By eye:** the script renders a preview PNG (EEVEE, three-quarter view) for the owner; then the piece is checked in
  the running game through a played capture (walk, attack, death) in the browser preview.

## Pilot (the pawn) passes when

1. The owner approves the preview render and the in-game look.
2. Red and blue both recolour cleanly, with the gold trim untouched.
3. Walk, attack and death read well at the game's timings, with the strike landing as the defender recoils.
4. `pawn-3.glb` is ≤ 150 KB and all tests pass.

Then the rook, bishop, queen, king and knight follow in that order, one commit each, and `CREDITS.md` and the credits
line in Settings are updated once no KayKit model ships.

## Out of scope

Hit and victory clips, particles or dust, animated emission, new sounds, sequencer or timing changes, humanoid
characters.

## Outcome (2026-11-19)

All six pieces are living Staunton pieces built by `scripts/blender/living_pieces.py`; no KayKit model ships, so the
Settings credit and `scripts/kaykit-piece.ts` are gone. The owner approved the pawn pilot before the other five.

| File | Bytes | Bones |
|---|---|---|
| `pawn-3.glb` | 63,016 | 9 |
| `rook-2.glb` | 72,484 | 14 |
| `bishop-3.glb` | 53,744 | 3 |
| `queen-2.glb` | 94,596 | 10 |
| `king-3.glb` | 71,124 | 8 |
| `knight-2.glb` | 64,044 | 10 |

418 KB in all (the KayKit set was about 1.05 MB). Every build passed the clip-contract check first time; changes made
by eye after looking at the previews:

- Gold bands ride bones of their own (`band`, `collar`) and drop flat in a death; bound to a shard, they tumbled
  upright like hoops (pawn, rook, queen, knight).
- The rook's merlons are lower and wider (0.18 × 0.14 instead of 0.13 × 0.22), so the top reads as battlements.
- The king's cross is about 30% larger, to read from the game camera.
- Materials export single-sided: every part is a closed solid.

One change outside the models, approved with the plan: footfall sounds play as each hop lands
(`(i + 1) / count` in `sequencer.ts`), since every piece now hops twice per square.

Checked in the running game (two-player, 1. Nc3 d5 2. Nxd5 Qxd5 3. e4 Qxa2 4. Rxa2 Bf5 5. exf5, frames sampled from the
canvas): the knight's hop and strike, the pawn, knight, queen and bishop deaths, the rook's slam and the queen's
attack all play; red and blue recolour cleanly with the gold untouched; every model loads. The king is never captured,
so its death was checked in the preview render only. Not measured: the frame rate on the CPU renderer. Not run here:
`online.test.ts` and the E2E suite, both of which need the Postgres container (Docker was not running).
