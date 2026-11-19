# 3D model credits

Every piece model is built from scratch by `scripts/blender/living_pieces.py` (Blender 5.3.0), no third-party assets:

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

`npm run models` is `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 512 --instance
false` (@gltf-transform/cli 4.5.1).

A changed model takes the next number: browsers cache `/models/*` for a year. Earlier numbers are not reused: `pawn-1`
and `pawn-2`, `knight-1`, `bishop-1` and `bishop-2`, `rook-1`, `queen-1`, `king-1` and `king-2` were stand-ins or
KayKit characters (Kay Lousberg, CC0) that shipped before.
