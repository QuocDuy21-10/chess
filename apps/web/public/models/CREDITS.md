# 3D model credits

All piece models come from two CC0 packs by Kay Lousberg (www.kaylousberg.com), licence
http://creativecommons.org/publicdomain/zero/1.0/:

- KayKit Character Pack: Adventurers 2.0 (Free) — https://kaylousberg.itch.io/kaykit-adventurers
- KayKit Character Animations 1.1 (Free) — https://kaylousberg.itch.io/kaykit-character-animations

Both were downloaded on 2026-11-14 at the "Free" tier, with no payment. CC0 needs no credit; the game credits the
author in Settings as thanks.

| File | Piece | Character and weapons | Clips: attack, die (idle `Idle_A`, walk `Walking_A`) |
|---|---|---|---|
| `pawn-2.glb` | pawn | Knight, `sword_1handed`, `shield_badge_color` | `Melee_1H_Attack_Chop`, `Death_A` |
| `knight-1.glb` | knight | Ranger, `bow` | `Ranged_Bow_Release`, `Death_B` |
| `bishop-2.glb` | bishop | Mage, `staff` | `Ranged_Magic_Shoot`, `Death_A` |
| `rook-1.glb` | rook | Rogue_Hooded, `dagger` | `Melee_1H_Attack_Stab`, `Death_B` |
| `queen-1.glb` | queen | Rogue, `crossbow_1handed` | `Ranged_1H_Shoot`, `Death_A` |
| `king-2.glb` | king | Barbarian, `axe_1handed`, `shield_round_barbarian` | `Melee_1H_Attack_Chop`, `Death_A` |

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
