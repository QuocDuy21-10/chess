# 3D model credits

Every piece model is built from scratch by `scripts/blender/living_pieces.py` (Blender 5.3.0), no third-party assets.
The pawn is a character built on `scripts/blender/figure.py`; the others are still living Staunton pieces:

| File | Piece |
|---|---|
| `pawn-4.glb` | pawn (character) |
| `rook-3.glb` | rook (character) |
| `bishop-3.glb` | bishop |
| `queen-2.glb` | queen |
| `king-3.glb` | king |
| `knight-2.glb` | knight |

From `apps/web`:

```bash
npm run living -- <piece>      # writes assets-src/living/<piece>.glb, .blend and five preview PNGs
npm run models -- assets-src/living/<piece>.glb public/models/<piece>-<n>.glb
npm run living:test            # the building blocks' tests (lp.py and figure.py)
```

To tune a piece in the Blender app: Text › Open `scripts/blender/live.py`, set `PIECE` and `CLIP`, Run Script.

`npm run models` is `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 512 --instance
false` (@gltf-transform/cli 4.5.1).

A changed model takes the next number: browsers cache `/models/*` for a year. Earlier numbers are not reused: `pawn-1`,
`pawn-2` and `pawn-3`, `knight-1`, `bishop-1` and `bishop-2`, `rook-1`, `queen-1`, `king-1` and `king-2` were
stand-ins, KayKit characters (Kay Lousberg, CC0) or the living Staunton pawn that shipped before.
