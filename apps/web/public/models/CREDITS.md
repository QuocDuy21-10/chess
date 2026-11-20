# 3D model credits

Every piece model is a character built from scratch by `scripts/blender/living_pieces.py` on
`scripts/blender/figure.py` (Blender 5.3.0), no third-party assets:

| File | Piece |
|---|---|
| `pawn-4.glb` | pawn: infantryman |
| `rook-3.glb` | rook: tower-shield warden |
| `bishop-4.glb` | bishop: cleric |
| `queen-3.glb` | queen |
| `king-4.glb` | king |
| `knight-3.glb` | knight: rider on a horse |

From `apps/web`:

```bash
npm run living -- <piece>      # writes assets-src/living/<piece>.glb, .blend and five preview PNGs
npm run models -- assets-src/living/<piece>.glb public/models/<piece>-<n>.glb
npm run living:test            # the building blocks' tests (lp.py and figure.py)
```

To tune a piece in the Blender app, run `scripts/blender/live.py` from Blender's Python console (its docstring has
the line), or Text › Open it and Run Script for the pawn.

`npm run models` is `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 512 --instance
false` (@gltf-transform/cli 4.5.1).

A changed model takes the next number: browsers cache `/models/*` for a year. Earlier numbers are not reused:
`pawn-1` to `pawn-3`, `knight-1` and `knight-2`, `bishop-1` to `bishop-3`, `rook-1` and `rook-2`, `queen-1` and
`queen-2`, `king-1` to `king-3` were stand-ins, KayKit characters (Kay Lousberg, CC0) or living Staunton pieces that
shipped before.
