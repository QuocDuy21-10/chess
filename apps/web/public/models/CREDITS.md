# 3D model credits

The KayKit piece models come from two CC0 packs by Kay Lousberg (www.kaylousberg.com), licence
http://creativecommons.org/publicdomain/zero/1.0/:

- KayKit Character Pack: Adventurers 2.0 (Free) — https://kaylousberg.itch.io/kaykit-adventurers
- KayKit Character Animations 1.1 (Free) — https://kaylousberg.itch.io/kaykit-character-animations

Both were downloaded on 2026-11-14 at the "Free" tier, with no payment. CC0 needs no credit; the game credits the
author in Settings as thanks.

| File | Piece | Character and weapons | Clips: attack, die (idle `Idle_A`, walk `Walking_A`) |
|---|---|---|---|

## Making the models again

Unzip both downloads into `apps/web/assets-src/` (git-ignored), then from `apps/web`:

```bash
node scripts/kaykit-piece.ts assets-src/kaykit/KayKit_Adventurers_2.0_FREE assets-src/kaykit-anims/KayKit_Character_Animations_1.1 assets-src/built
npm run models -- assets-src/built/<piece>.glb public/models/<piece>-<n>.glb
```

`kaykit-piece.ts` puts each character's weapons on its hand slots, repaints its cloth swatches magenta (the team
colour is applied at runtime by `GlbPiece`), joins its body into one mesh, and copies the four clips in as `idle`,
`walk`, `attack`, `die`. `npm run models` is `gltf-transform optimize --compress meshopt --texture-compress webp
--texture-size 512 --instance false` (@gltf-transform/cli 4.5.1).

A changed model takes the next number: browsers cache `/models/*` for a year. Skipped on purpose, because a local
browser may hold an earlier file under that name: `pawn-1.glb` (a stand-in), `bishop-1.glb` (its cape kept its own
colour) and `king-1.glb` (only its belt took the team colour).

## Living pieces (made in this repository)

Built from scratch by `scripts/blender/living_pieces.py` (Blender 5.3.0), no third-party assets:

| File | Piece |
|---|---|
| `pawn-3.glb` | pawn |
| `rook-2.glb` | rook |
| `bishop-3.glb` | bishop |
| `queen-2.glb` | queen |
| `king-3.glb` | king |
| `knight-2.glb` | knight |

From `apps/web`:

```bash
npm run living -- <piece>      # writes assets-src/living/<piece>.glb, .blend and four preview PNGs
npm run models -- assets-src/living/<piece>.glb public/models/<piece>-<n>.glb
npm run living:test            # the building blocks' tests
```
