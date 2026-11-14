# 3D model credits

| File | Source | Author | Licence |
|---|---|---|---|
| `pawn-2.glb` | KayKit Character Pack: Adventurers 2.0 (Free) — `Knight`, `sword_1handed`, `shield_badge_color`; KayKit Character Animations 1.1 (Free) — `Idle_A`, `Walking_A`, `Melee_1H_Attack_Chop`, `Death_A` | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 (http://creativecommons.org/publicdomain/zero/1.0/) |

Downloaded on 2026-11-14 from https://kaylousberg.itch.io/kaykit-adventurers and
https://kaylousberg.itch.io/kaykit-character-animations ("Free" tier, no payment). CC0 needs no credit; the game
credits the author in Settings as thanks.

## Making `pawn-2.glb` again

Unzip both downloads into `apps/web/assets-src/` (git-ignored), then from `apps/web`:

```bash
node scripts/kaykit-pawn.ts assets-src/kaykit/KayKit_Adventurers_2.0_FREE assets-src/kaykit-anims/KayKit_Character_Animations_1.1 assets-src/kaykit/pawn.glb
npm run models -- assets-src/kaykit/pawn.glb public/models/pawn-<n>.glb
```

`kaykit-pawn.ts` gives the Knight the sword and the shield, repaints the atlas's two red swatches magenta (the
team colour is applied at runtime by `GlbPiece`), and copies the four clips in as `idle`, `walk`, `attack`, `die`.
`npm run models` is `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 512
--instance false` (@gltf-transform/cli 4.5.1). A changed model takes the next number: browsers cache `/models/*`
for a year.

`pawn-1.glb` is skipped on purpose: a local stand-in once had that name and may sit in a developer's browser cache.
