# Character Pieces Implementation Plan (part 1: pipeline and the pawn pilot)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared humanoid character pipeline in Blender, add the `hit` clip to the game, and ship the pawn
as the first character piece (an infantryman with spear and shield), tuned live in the owner's Blender app.

**Architecture:** `lp.py` (existing: geometry, rigid-skinned armature with one shared rest frame, baked clips,
clip-contract check, preview, export) gains the `hit` clip, a material table and 40 bones. The new `figure.py` adds a
humanoid skeleton whose poses are written as joint angles about each joint, eased key poses (`through`), a shared walk
(`stride`) and recoil, floor settling (`character`), and body-part shapes. `pieces.py` replaces the Staunton pawn
with the character pawn. `live.py` builds a piece inside the open Blender app for tuning; `npm run living -- pawn`
still builds the shipped model headless from the same code. In the game, the defender plays `hit` and then `die`.

**Tech Stack:** Blender 5.3.0 (bpy, bmesh, mathutils, glTF 2.0 exporter), Python `unittest` inside Blender,
TypeScript, React Three Fiber, Vitest, `@gltf-transform/cli` via `npm run models`, computer use for the Blender app.

**Spec:** `docs/superpowers/specs/2026-11-19-character-pieces-design.md`

**Scope:** this plan ends at the pilot gate (spec: "Pilot (the pawn) passes when"). The rook, bishop, queen, king
and knight (the knight needs a horse skeleton) get a second plan written after the owner approves the pawn, so
their code can follow what the pilot taught.

## Global Constraints

- Blender binary: `/Applications/Blender.app/Contents/MacOS/Blender` (override with `BLENDER=`); headless runs use
  `--background --factory-startup --python-exit-code 1` (the `npm run living` / `living:test` scripts already do).
- Clip names exactly `idle`, `walk`, `attack`, `hit`, `die` in every character model.
- `idle` 2–3 s loop and `walk` 1 loop = 1 square: first frame equals last. `attack` ~0.7 s: starts and ends at rest,
  anticipation before 0.45, contact (furthest forward) at **0.6**. `hit` ~0.3 s: starts at rest, ends recoiled.
  `die` ~0.7 s: starts at `hit`'s last pose; its last frame stays on screen.
- No vertex below z = −0.01 in any frame of any clip. Every vertex weighted 1.0 to exactly one bone. At most 40 bones.
- Materials: `team` is pure magenta `(1, 0, 1)` (recoloured by `GlbPiece`); no other material may look magenta to its
  shader (`min(r, b) − g < 0.1`, linear). One model serves both teams; both wear one shared gold star emblem.
- Blender axes: Z up, figure faces −Y (the exporter makes that +Z, like the current models). Frame rate 30.
- `TIMING.hitMs = 300`; a capture plays attack, then at the impact (0.6 of 700 ms) the defender's `hit`, then `die`.
- A changed model takes the next number (`/models/*` is cached immutable for a year): the pawn ships as `pawn-4.glb`,
  `pawn-3.glb` is deleted. Target ≤ 250 KB per optimised piece (hard limits: 600 KB each, 3.5 MB in all).
- `apps/web/assets-src/` is git-ignored: build outputs land in `apps/web/assets-src/living/`; only scripts are committed.
- Originality: the rook is a tower-shield warden in part 2; nothing here copies another game's design.
- Every hand tweak made in the Blender app is written back into `pieces.py` / `figure.py`; the shipped model is always
  the headless build.
- Web tests need Postgres: from the repo root, `npm run db:up -w @chess/server` (Docker Desktop must be running).

All commands run from `apps/web` unless they say otherwise. Apply a patch block by saving it to a file and running
`git apply <file>` from the repo root.

### Facts verified on this machine (Blender 5.3.0, 2026-11-19)

Every code block and patch below was run before this plan was written: the patches apply in order to commit
`244d97e`, `npm run living:test` then runs 44 tests OK, `npm run living -- pawn` passes the clip contract, the
optimised pawn is 122,708 bytes, and with the game patch `tsc`, `eslint src/scene` and `vitest run src/scene` (34
tests) pass. Principled BSDF has `Emission Color` and `Emission Strength` inputs; `Euler((a, 0, 0))` with a > 0 turns
+Z toward −Y; `Vector.rotation_difference` handles opposite vectors.

---

### Task 1: The `hit` clip, 40 bones and a material table in `lp.py`

**Files:**
- Modify: `apps/web/scripts/blender/lp.py` (`CLIPS`, new `MATERIALS` and `keyed()`, `material()`, `assemble()`,
  `MAX_BONES`, `check()`, `preview()`); `living_pieces.py` (docstring)
- Test: `apps/web/scripts/blender/test_lp.py`

**Interfaces:**
- Produces: `lp.CLIPS == ('idle', 'walk', 'attack', 'hit', 'die')`; `lp.MATERIALS: dict[name, (linear RGBA, metallic,
  roughness, emission)]` with `team, trim, steel, dark, skin, leather, wood, hair, white, glow`; `lp.keyed(colour) ->
  float`; `lp.MAX_BONES = 40`; `lp.check()` now also raises `'die does not start where hit ends'` and
  `'GlbPiece would paint <name> the team colour'`; `lp.preview()` also writes `<prefix>-hit.png`.
- Note: after this task the six Staunton builders in `pieces.py` cannot be rebuilt (they have no `hit`). Their shipped
  `.glb` files are unaffected; each builder is replaced by a character (the pawn in Task 4, the rest in part 2).

- [ ] **Step 1: Write the failing tests**

Apply to `test_lp.py` (the toy gains a `hit` clip; new tests for the hit→die handover, the material guard and the
material table):

````diff
--- a/apps/web/scripts/blender/test_lp.py
+++ b/apps/web/scripts/blender/test_lp.py
@@ -62,6 +62,15 @@
         self.assertAlmostEqual(lp.bounce(0.25, 0.1, 0, 0).translation.z, 0.1)
 
 
+class Materials(unittest.TestCase):
+    def test_only_team_is_magenta_to_the_game_shader(self):
+        for name, (colour, *_) in lp.MATERIALS.items():
+            if name == 'team':
+                self.assertGreater(lp.keyed(colour), 0.35)
+            else:
+                self.assertLess(lp.keyed(colour), 0.1, name)
+
+
 class Geometry(unittest.TestCase):
     def test_spline_passes_through_its_points(self):
         points = [(0, 0), (1, 0), (1, 0), (1, 1), (0, 2)]
@@ -117,8 +126,9 @@
         self.assertAlmostEqual(max(xs) - min(xs), 0.2, delta=1e-6)
 
 
-def toy(attack_end=0.0):
-    """A cylinder in two shards on a body bone, with simple clips; `attack_end` leaves the attack off rest."""
+def toy(attack_end=0.0, hit_lean=0.0):
+    """A cylinder in two shards on a body bone, with simple clips; `attack_end` leaves the attack off rest, and
+    `hit_lean` makes the hit end off rest, where the die (which starts at rest) does not follow it."""
     body = lp.lathe([(0, 0), (0.3, 0), (0.3, 0), (0.3, 1), (0.3, 1), (0, 1)])
     low, high = lp.halves(body, (0, 0, 0.5), (0, 0, 1))
     parts = [lp.Part(low, 'team', 'low'), lp.Part(high, 'trim', 'high')]
@@ -127,6 +137,7 @@
         'idle': (24, lambda t: {'body': lp.move(z=0.02 * (1 - math.cos(math.tau * t)))}),
         'walk': (24, lambda u: {'body': lp.bounce(u, 0.1, 0.1, 0.05)}),
         'attack': (30, lambda t: {'body': lp.tip(lp.ease(t, 0, -0.1, -0.2, 0.3, 0.05, attack_end), 0.3)}),
+        'hit': (9, lambda t: {'body': lp.tip(-hit_lean * t, 0.3)}),
         'die': (30, lp.crumble(parts, parent, 0.3, ['low', 'high'])),
     }
     return lp.Piece(parts, parent, clips, 0.3)
@@ -162,6 +173,21 @@
         with self.assertRaisesRegex(AssertionError, 'attack does not end at rest'):
             lp.check(*built(piece), piece)
 
+    def test_check_rejects_a_death_that_does_not_start_where_the_hit_ends(self):
+        piece = toy(hit_lean=0.1)
+        with self.assertRaisesRegex(AssertionError, 'die does not start where hit ends'):
+            lp.check(*built(piece), piece)
+
+    def test_check_rejects_a_part_the_game_would_paint_the_team_colour(self):
+        piece = toy()
+        lp.MATERIALS['purple'] = (lp.srgb('#9933CC'), 0.0, 0.5, 0.0)
+        try:
+            piece.parts[1].material = 'purple'
+            with self.assertRaisesRegex(AssertionError, 'GlbPiece would paint purple the team colour'):
+                lp.check(*built(piece), piece)
+        finally:
+            del lp.MATERIALS['purple']
+
     def test_a_falling_shard_lands_on_the_floor_and_never_sinks(self):
         piece = toy()
         shard = lp.shards_of(piece.parts, piece.parent, ['high'])[0]
@@ -180,7 +206,11 @@
         points = [v.co for p in piece.parts for v in p.mesh.verts]
         self.assertAlmostEqual(lp.topple_angle(points, 0.3), math.pi / 2, delta=0.02)
 
-    def test_export_writes_the_four_clips_with_unique_node_names(self):
+    def test_assemble_adds_only_the_materials_its_parts_use(self):
+        obj, _ = built(toy())
+        self.assertEqual([m.name for m in obj.data.materials], ['team', 'trim'])
+
+    def test_export_writes_every_clip_with_unique_node_names(self):
         piece = toy()
         built(piece)
         path = os.path.join(tempfile.mkdtemp(), 'toy.glb')
````

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run living:test`
Expected: FAIL. `test_only_team_is_magenta_to_the_game_shader` and the purple test error with
`AttributeError: module 'lp' has no attribute 'MATERIALS'`; `test_check_rejects_a_death_that_does_not_start_where_the_hit_ends`
fails with `AssertionError not raised`.

- [ ] **Step 3: Implement**

Apply to `lp.py`:

````diff
--- a/apps/web/scripts/blender/lp.py
+++ b/apps/web/scripts/blender/lp.py
@@ -14,7 +14,7 @@
 from mathutils import Matrix, Vector
 
 FPS = 30
-CLIPS = ('idle', 'walk', 'attack', 'die')
+CLIPS = ('idle', 'walk', 'attack', 'hit', 'die')  # hit plays before die (TIMING.hitMs)
 IMPACT = 0.6  # TIMING.impactAt in apps/web/src/scene/theme.ts: the attack's contact, as a fraction of the clip
 IDENTITY = Matrix.Identity(4)
 TWIST = 0.13  # radians: keeps cut() planes off the lathe's vertex columns, which sit every 7.5 degrees
@@ -33,6 +33,26 @@
 RED = srgb('#B91C1C')  # PALETTE.red, for the preview renders only
 
 
+# name -> (linear RGBA, metallic, roughness, emission strength). Only 'team' may look magenta to GlbPiece's shader.
+MATERIALS = {
+    'team': (MAGENTA, 0.0, 0.25, 0.0),
+    'trim': (GOLD, 1.0, 0.3, 0.0),
+    'steel': (srgb('#B8BEC8'), 1.0, 0.28, 0.0),
+    'dark': (srgb('#2A2A30'), 0.0, 0.5, 0.0),
+    'skin': (srgb('#E8B48C'), 0.0, 0.6, 0.0),
+    'leather': (srgb('#6B4226'), 0.0, 0.7, 0.0),
+    'wood': (srgb('#8A5A32'), 0.0, 0.65, 0.0),
+    'hair': (srgb('#5A3A22'), 0.0, 0.75, 0.0),
+    'white': (srgb('#EDEAE2'), 0.0, 0.8, 0.0),
+    'glow': (srgb('#FFE9A8'), 0.0, 0.4, 6.0),
+}
+
+
+def keyed(colour):
+    """How magenta GlbPiece's recolour shader finds a linear colour: it starts painting at 0.15 and fully at 0.35."""
+    return min(colour[0], colour[2]) - colour[1]
+
+
 def need(condition, message):
     """Raises AssertionError(message) unless `condition`; unlike assert, python -O cannot strip it."""
     if not condition:
@@ -243,7 +263,7 @@
 
 TOLERANCE = 1e-4
 FLOOR = -0.01  # the lowest z any vertex may reach in any frame of any clip
-MAX_BONES = 16
+MAX_BONES = 40
 
 
 @dataclass
@@ -266,12 +286,15 @@
     bpy.context.scene.render.fps = FPS
 
 
-def material(name, colour, metallic, roughness):
+def material(name, colour, metallic, roughness, emission=0.0):
     m = bpy.data.materials.new(name)
     bsdf = m.node_tree.nodes['Principled BSDF']
     bsdf.inputs['Base Color'].default_value = colour
     bsdf.inputs['Metallic'].default_value = metallic
     bsdf.inputs['Roughness'].default_value = roughness
+    if emission:
+        bsdf.inputs['Emission Color'].default_value = colour
+        bsdf.inputs['Emission Strength'].default_value = emission
     m.diffuse_color = colour
     m.use_backface_culling = True  # every part is a closed solid: exported single-sided
     return m
@@ -280,7 +303,9 @@
 def assemble(name, piece):
     """The piece as one mesh object skinned to one armature: each part's vertices weighted 1.0 to its bone."""
     bones = list(piece.parent)
-    slots = ['team', 'trim']
+    for part in piece.parts:
+        need(part.material in MATERIALS, f'a part uses the unknown material {part.material}')
+    slots = [name for name in MATERIALS if any(part.material == name for part in piece.parts)]
     bm = bmesh.new()
     ranges = []
     for part in piece.parts:
@@ -306,8 +331,8 @@
     mesh = bpy.data.meshes.new(name)
     bm.to_mesh(mesh)
     bm.free()
-    mesh.materials.append(material('team', MAGENTA, 0.0, 0.25))
-    mesh.materials.append(material('trim', GOLD, 1.0, 0.3))
+    for slot in slots:
+        mesh.materials.append(material(slot, *MATERIALS[slot]))
     obj = bpy.data.objects.new(name, mesh)
     for bone in bones:
         obj.vertex_groups.new(name=bone)
@@ -388,9 +413,12 @@
     for clip in CLIPS:
         need(clip in piece.clips and clip in bpy.data.actions, f'missing clip {clip}')
     need(len(rig.data.bones) <= MAX_BONES, f'{len(rig.data.bones)} bones; at most {MAX_BONES}')
+    for m in obj.data.materials:
+        need(m.name == 'team' or keyed(m.diffuse_color) < 0.1, f'GlbPiece would paint {m.name} the team colour')
     loose = [v.index for v in obj.data.vertices if len(v.groups) != 1 or abs(v.groups[0].weight - 1) > 1e-6]
     need(not loose, f'{len(loose)} vertices are not weighted 1.0 to exactly one bone')
     rest = [IDENTITY] * len(rig.pose.bones)
+    hit_end = None
     for clip in CLIPS:
         frames = piece.clips[clip][0]
         lows, fronts, poses = [], [], []
@@ -404,8 +432,12 @@
         need(low >= FLOOR, f'{clip} sinks {-low:.3f} below the floor at frame {lows.index(low)}')
         if clip in ('idle', 'walk'):
             need(same(poses[0], poses[-1]), f'{clip} does not loop: its last frame differs from its first')
+        elif clip == 'die':
+            need(same(poses[0], hit_end), 'die does not start where hit ends')
         else:
             need(same(poses[0], rest), f'{clip} does not start at rest')
+        if clip == 'hit':
+            hit_end = poses[-1]
         if clip == 'attack':
             need(same(poses[-1], rest), 'attack does not end at rest')
             contact, furthest = round(IMPACT * frames), fronts.index(min(fronts))
@@ -525,6 +557,7 @@
         'rest': ('idle', 0),
         'walk': ('walk', piece.clips['walk'][0] // 4),
         'attack': ('attack', round(IMPACT * piece.clips['attack'][0])),
+        'hit': ('hit', piece.clips['hit'][0]),
         'die': ('die', piece.clips['die'][0]),
     }
     for label, (clip, frame) in shots.items():
````

In `scripts/blender/living_pieces.py`'s docstring, change `<piece>-{rest,walk,attack,die}.png` to
`<piece>-{rest,walk,attack,hit,die}.png`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run living:test`
Expected: `Ran 29 tests` … `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/blender/lp.py scripts/blender/test_lp.py scripts/blender/living_pieces.py
git commit -m "feat: add the hit clip and a material table to the Blender piece builder"
```

---

### Task 2: The humanoid figure (`figure.py`)

**Files:**
- Create: `apps/web/scripts/blender/figure.py`
- Create: `apps/web/scripts/blender/test_figure.py`
- Modify: `apps/web/scripts/blender/test_lp.py` (`run()` also runs `test_figure`)

**Interfaces:**
- Consumes: `lp.need`, `lp.move`, `lp.IDENTITY`, `lp.ease`, `lp.world_poses`, `lp.Piece`, `lp.Part`, `lp.lathe`,
  `lp.arc`, `lp.ring`, `lp.slab`, `lp.ball`, `lp.block` (all existing).
- Produces (used by Task 4 and part 2):
  - `Figure` with `add(bone, parent, pivot, down=False)`, `.parent -> dict`, `at(bone) -> Vector`,
    `local(pose) -> {bone: Matrix}`.
  - `humanoid() -> Figure`: 18 bones `root, hips, spine, chest, neck, head`, and per side `l`/`r`
    `arm_up_*, arm_low_*, hand_*, leg_up_*, leg_low_*, foot_*`.
  - Pose format: `{bone: forward | (forward, side, twist), 'lift': (x, y, z)}`; `REST = {}`.
  - `through(t, *poses) -> pose`, `stride(u, legs=0.45, knees=0.7, arms=0.35, sway=0.05, lean=0.06) -> pose`,
    `recoil(lean=0.3) -> pose`.
  - `character(f, parts, clips) -> lp.Piece`, clips `{name: (frames, fn)}` with `fn(t) -> pose`; every frame settled
    on the floor.
  - Shapes returning bmesh: `limb(a, b, r0, r1=None, steps=16)`, `ellipsoid(rx, ry, rz, at=ZERO, steps=16)`,
    `dome(radius, z, steps=24)`, `disc(radius, depth, at, toward=(0, -1, 0), steps=24)`,
    `hoop(radius, thickness, at, toward=(0, 0, 1), steps=32)`, `star(radius, depth, at, toward=(0, -1, 0), points=5)`;
    helpers `place(bm, matrix)`, `facing(direction)`.
  - `body(f, armour='steel', sleeves='steel', legs='steel') -> [lp.Part]`: head with eyes and nose, neck, chest, belly,
    hips, pauldrons, arms, hands, legs, knee cops, boots; feet on z = 0; top of the head at 0.94.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/scripts/blender/test_figure.py`:

```python
"""Tests for figure.py, run inside Blender with lp's: npm run living:test (from apps/web)."""
import math
import unittest

from mathutils import Matrix, Vector

import figure
import lp


def manifold(bm):
    return all(e.is_manifold for e in bm.edges)


def tip_of(f, pose, bone, offset):
    """Where a point `offset` from `bone`'s joint ends up in `pose`."""
    world = lp.world_poses(f.parent, f.local(pose))
    return world[bone] @ (f.at(bone) + Vector(offset))


class Skeleton(unittest.TestCase):
    def test_the_humanoid_has_18_bones_each_after_its_parent(self):
        f = figure.humanoid()
        self.assertEqual(len(f.joints), 18)
        seen = set()
        for bone, joint in f.joints.items():
            self.assertTrue(joint.parent is None or joint.parent in seen, bone)
            seen.add(bone)

    def test_a_bone_must_come_after_its_parent(self):
        with self.assertRaisesRegex(AssertionError, 'must be added first'):
            figure.Figure().add('hand', 'arm', (0, 0, 0))

    def test_forward_swings_upright_and_hanging_parts_toward_the_facing(self):
        f = figure.humanoid()
        self.assertLess(tip_of(f, {'head': 0.4}, 'head', (0, 0, 0.2)).y, -0.05)  # the top of the head
        self.assertLess(tip_of(f, {'arm_up_l': 0.4}, 'arm_up_l', (0, 0, -0.2)).y, -0.05)  # the elbow

    def test_side_swings_a_hanging_part_toward_plus_x(self):
        f = figure.humanoid()
        elbow = f.at('arm_low_l') - f.at('arm_up_l')
        self.assertGreater(tip_of(f, {'arm_up_l': (0, 0.5, 0)}, 'arm_up_l', elbow).x, f.at('arm_low_l').x + 0.05)

    def test_a_child_follows_its_parent(self):
        f = figure.humanoid()
        moved = tip_of(f, {'arm_up_r': 1.0}, 'hand_r', (0, 0, 0))
        self.assertLess(moved.y, f.at('hand_r').y - 0.1)

    def test_lift_moves_the_whole_figure(self):
        f = figure.humanoid()
        self.assertAlmostEqual(tip_of(f, {'lift': (0, 0, 0.1)}, 'foot_l', (0, 0, 0)).z, f.at('foot_l').z + 0.1)

    def test_an_unknown_bone_is_refused(self):
        with self.assertRaisesRegex(AssertionError, 'unknown bone tail'):
            figure.humanoid().local({'tail': 0.1})


class Clips(unittest.TestCase):
    def test_through_lands_on_its_keys_and_rests_a_missing_bone(self):
        a, b = {'head': 0.2}, {'head': (0.4, 0.1, 0), 'chest': 0.3}
        self.assertEqual(figure.through(0, a, b)['head'], (0.2, 0.0, 0.0))
        self.assertEqual(figure.through(1, a, b)['head'], (0.4, 0.1, 0.0))
        self.assertEqual(figure.through(0, a, b)['chest'], (0.0, 0.0, 0.0))

    def test_stride_loops_and_steps_with_alternate_feet(self):
        f = figure.humanoid()
        self.assertEqual(figure.stride(0), figure.stride(1))
        ahead = lambda u: tip_of(f, figure.stride(u), 'foot_l', (0, 0, 0)).y - tip_of(f, figure.stride(u), 'foot_r', (0, 0, 0)).y
        self.assertLess(ahead(0), -0.05)  # the left foot leads as the left heel strikes
        self.assertGreater(ahead(0.5), 0.05)  # then the right

    def test_a_settled_pose_rests_on_the_floor(self):
        f = figure.humanoid()
        parts = figure.body(f)
        piece = figure.character(f, parts, {'up': (2, lambda t: {'lift': (0, 0, 0.3 * t), 'leg_up_l': 0.8 * t})})
        local = piece.clips['up'][1](1.0)
        world = lp.world_poses(f.parent, local)
        low = min((world[p.bone] @ v.co).z for p in parts for v in p.mesh.verts)
        self.assertAlmostEqual(low, 0.0, places=6)

    def test_the_settled_rest_pose_is_the_identity(self):
        f = figure.humanoid()
        piece = figure.character(f, figure.body(f), {'still': (2, lambda t: figure.REST)})
        local = piece.clips['still'][1](0.0)
        self.assertEqual(set(local), {'root'})
        self.assertTrue(all(abs(x - y) < 1e-9 for r, s in zip(local['root'], Matrix.Identity(4)) for x, y in zip(r, s)))


class Geometry(unittest.TestCase):
    def test_every_shape_is_a_closed_solid(self):
        shapes = [figure.limb((0, 0, 0), (0.1, -0.2, 0.3), 0.03, 0.02), figure.limb((0, 0, 1), (0, 0, 0), 0.05),
                  figure.ellipsoid(0.1, 0.2, 0.3, (0, 0, 1)), figure.dome(0.1, 0.9), figure.disc(0.1, 0.02, (0, 0, 0.5)),
                  figure.hoop(0.1, 0.01, (0, 0, 0.5), (0, -1, 0)), figure.star(0.06, 0.01, (0, 0, 0.5))]
        for bm in shapes:
            self.assertTrue(manifold(bm))
            self.assertGreater(bm.calc_volume(), 0)

    def test_a_limb_runs_from_a_to_b_with_round_ends(self):
        bm = figure.limb((0, 0, 1), (0, 0, 0), 0.05)  # pointing down, like a leg
        zs = [v.co.z for v in bm.verts]
        self.assertAlmostEqual(min(zs), -0.05, places=4)
        self.assertAlmostEqual(max(zs), 1.05, places=4)

    def test_a_disc_faces_where_it_is_told(self):
        bm = figure.disc(0.1, 0.02, (0, 0, 0.5), (0, -1, 0))
        ys = [v.co.y for v in bm.verts]
        self.assertLess(min(ys), -0.02)  # the domed face bulges toward -Y
        self.assertAlmostEqual(max(ys), 0.0, places=6)

    def test_the_body_stands_on_the_floor_on_its_own_bones(self):
        f = figure.humanoid()
        parts = figure.body(f)
        self.assertTrue(all(p.bone in f.joints for p in parts))
        self.assertAlmostEqual(min(v.co.z for p in parts for v in p.mesh.verts), 0.0, places=4)
        self.assertLess(max(v.co.z for p in parts for v in p.mesh.verts), 1.0)
```

Apply to `test_lp.py` so the same Blender run picks them up:

````diff
--- a/apps/web/scripts/blender/test_lp.py
+++ b/apps/web/scripts/blender/test_lp.py
@@ -222,7 +222,10 @@
 
 
 def run():
-    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
+    import test_figure  # noqa: E402  figure.py's tests run in the same Blender session
+    loader = unittest.defaultTestLoader
+    suite = unittest.TestSuite([loader.loadTestsFromModule(sys.modules[__name__]), loader.loadTestsFromModule(test_figure)])
+    result = unittest.TextTestRunner(verbosity=2).run(suite)
     if not result.wasSuccessful():
         raise RuntimeError('lp tests failed')  # --python-exit-code 1 turns this into exit status 1
 
````

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run living:test`
Expected: FAIL with `ModuleNotFoundError: No module named 'figure'`.

- [ ] **Step 3: Implement**

Create `apps/web/scripts/blender/figure.py`:

```python
"""Character pieces: a stocky humanoid skeleton, its body parts, and clips written as joint angles.

A pose is a dict {bone: angles}. `angles` is a number (forward) or a tuple (forward, side, twist), in radians:
forward > 0 swings the far end of the part toward the facing (-Y), side > 0 toward +X, twist > 0 turns it
counter-clockwise seen from above. The key 'lift' is a translation (x, y, z) of the whole figure. A bone left out is
at rest. character() settles every frame on the floor, so a pose never says how high the figure stands.
Spec: docs/superpowers/specs/2026-11-19-character-pieces-design.md.
"""
import math
from dataclasses import dataclass

import bmesh
from mathutils import Euler, Matrix, Vector

import lp

ZERO = (0.0, 0.0, 0.0)
REST = {}
SIDES = (('l', 1), ('r', -1))  # the figure faces -Y, so its left side is +X


@dataclass
class Joint:
    parent: object  # str, or None for the root
    pivot: tuple  # where the part turns, in rest coordinates
    down: bool  # the part hangs below its joint (arms, legs), so a forward swing turns it the other way round X


class Figure:
    """A skeleton: bones in parent-first order, each turning about its joint."""

    def __init__(self):
        self.joints = {}

    def add(self, bone, parent, pivot, down=False):
        lp.need(parent is None or parent in self.joints, f'{bone}: its parent {parent} must be added first')
        self.joints[bone] = Joint(parent, tuple(pivot), down)

    @property
    def parent(self):
        return {bone: joint.parent for bone, joint in self.joints.items()}

    def at(self, bone):
        return Vector(self.joints[bone].pivot)

    def local(self, pose):
        """lp.Piece's pose format (a parent-relative matrix per bone) for a pose of joint angles."""
        out = {}
        for bone, value in pose.items():
            if bone == 'lift':
                continue
            lp.need(bone in self.joints, f'a pose turns the unknown bone {bone}')
            forward, side, twist = angles(value)
            joint = self.joints[bone]
            sign = -1.0 if joint.down else 1.0
            p = Vector(joint.pivot)
            spin = Euler((sign * forward, sign * side, twist)).to_matrix().to_4x4()
            out[bone] = Matrix.Translation(p) @ spin @ Matrix.Translation(-p)
        lift = angles(pose.get('lift', ZERO))
        if any(lift):
            out['root'] = lp.move(*lift) @ out.get('root', lp.IDENTITY)
        return out


def angles(value):
    """(forward, side, twist) from a pose value: a number means a forward swing."""
    if isinstance(value, (int, float)):
        return (float(value), 0.0, 0.0)
    return tuple(float(v) for v in value)


def humanoid():
    """The shared skeleton: a figure 1.0 tall (about 4.5 heads), feet on z = 0, facing -Y. 18 bones."""
    f = Figure()
    f.add('root', None, ZERO)
    f.add('hips', 'root', (0, 0, 0.42))
    f.add('spine', 'hips', (0, 0, 0.48))
    f.add('chest', 'spine', (0, 0, 0.58))
    f.add('neck', 'chest', (0, 0, 0.72))
    f.add('head', 'neck', (0, 0, 0.75))
    for side, s in SIDES:
        f.add(f'arm_up_{side}', 'chest', (0.15 * s, 0, 0.68), True)
        f.add(f'arm_low_{side}', f'arm_up_{side}', (0.165 * s, 0, 0.555), True)
        f.add(f'hand_{side}', f'arm_low_{side}', (0.175 * s, -0.01, 0.44), True)
        f.add(f'leg_up_{side}', 'hips', (0.07 * s, 0, 0.41), True)
        f.add(f'leg_low_{side}', f'leg_up_{side}', (0.075 * s, 0, 0.23), True)
        f.add(f'foot_{side}', f'leg_low_{side}', (0.075 * s, 0, 0.07), True)
    return f


# --- Clips ------------------------------------------------------------------------------------------------------------

def through(t, *poses):
    """The pose at t through equally spaced key poses, easing in and out of each, like lp.ease."""
    bones = sorted(set().union(*poses))
    return {b: tuple(lp.ease(t, *(angles(p.get(b, ZERO))[i] for p in poses)) for i in range(3)) for b in bones}


def stride(u, legs=0.45, knees=0.7, arms=0.35, sway=0.05, lean=0.06):
    """The walk at loop phase u: two steps per loop, the left heel striking at u = 0 and the right at u = 0.5, when
    the game plays its footfalls. Arms swing against the legs."""
    a = math.tau * (u % 1.0)  # u = 1 is exactly u = 0, so the loop closes
    c, s = math.cos(a), math.sin(a)
    return {
        'leg_up_l': legs * c, 'leg_up_r': -legs * c,
        'leg_low_l': -knees * max(0.0, -s), 'leg_low_r': -knees * max(0.0, s),
        'arm_up_l': -arms * c, 'arm_up_r': arms * c,
        'arm_low_l': 0.4 * arms, 'arm_low_r': 0.4 * arms,
        'hips': (0.0, 0.0, -sway * c),
        'chest': (lean, 0.0, sway * c),
    }


def recoil(lean=0.3):
    """The end of a hit: driven back, chest and head thrown back, knees giving."""
    return {'spine': -lean, 'chest': -0.5 * lean, 'head': -0.7 * lean, 'arm_up_l': 0.5 * lean, 'arm_up_r': 0.5 * lean,
            'leg_up_l': -0.4 * lean, 'leg_up_r': 0.6 * lean, 'leg_low_r': -0.6 * lean}


def character(f, parts, clips):
    """An lp.Piece from clips {name: (frames, fn)}, fn(t) -> pose. Every frame is settled: the figure moves up or down
    so its lowest point stays as low as it is at rest (on the floor), as if gravity held it there."""
    points = {}
    for part in parts:
        lp.need(part.bone in f.joints, f'a part is bound to the unknown bone {part.bone}')
        points.setdefault(part.bone, []).extend(v.co.copy() for v in part.mesh.verts)
    floor = min(p.z for ps in points.values() for p in ps)

    def settled(fn):
        def pose(t):
            local = f.local(fn(t))
            world = lp.world_poses(f.parent, local)
            low = min((world[b] @ p).z for b, ps in points.items() for p in ps)
            local['root'] = lp.move(z=floor - low) @ local.get('root', lp.IDENTITY)
            return local
        return pose
    return lp.Piece(parts, f.parent, {name: (frames, settled(fn)) for name, (frames, fn) in clips.items()}, 0.0)


# --- Geometry ---------------------------------------------------------------------------------------------------------

def place(bm, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return bm


def facing(direction):
    """The rotation that turns +Z toward `direction`."""
    return Vector((0, 0, 1)).rotation_difference(Vector(direction)).to_matrix().to_4x4()


def limb(a, b, r0, r1=None, steps=16):
    """A rounded tube from a to b, r0 thick at a and r1 at b: an arm, a leg, a spear shaft."""
    r1 = r0 if r1 is None else r1
    a, b = Vector(a), Vector(b)
    profile = lp.arc(0.0, r0, -90, 0, 6) + lp.arc((b - a).length, r1, 0, 90, 6)
    return place(lp.lathe(profile, steps), Matrix.Translation(a) @ facing(b - a))


def ellipsoid(rx, ry, rz, at=ZERO, steps=16):
    return place(lp.lathe(lp.arc(0.0, 1.0, -90, 90, 8), steps), Matrix.Translation(at) @ Matrix.Diagonal((rx, ry, rz, 1)))


def dome(radius, z, steps=24):
    """A helmet bowl: a half ball standing on z."""
    return lp.lathe([(0.0, z)] + lp.arc(z, radius, 0, 90, 8), steps)


def disc(radius, depth, at, toward=(0, -1, 0), steps=24):
    """A round plate `depth` thick with a slightly domed face toward `toward`: a shield."""
    bm = lp.lathe([(0.0, 0.0), (radius, 0.0), (0.95 * radius, depth), (0.0, 1.3 * depth)], steps)
    return place(bm, Matrix.Translation(at) @ facing(toward))


def hoop(radius, thickness, at, toward=(0, 0, 1), steps=32):
    """A torus of `radius` around the axis `toward`: a rim, a belt, a crown band."""
    return place(lp.ring(radius, thickness, 0.0, steps), Matrix.Translation(at) @ facing(toward))


def star(radius, depth, at, toward=(0, -1, 0), points=5):
    """A flat star `depth` thick, its face toward `toward`, one point up: the emblem both teams wear."""
    outline = []
    for i in range(2 * points):
        r = radius if i % 2 == 0 else 0.45 * radius
        a = math.pi / 2 + i * math.pi / points
        outline.append((r * math.cos(a), r * math.sin(a)))
    bm = lp.slab(outline, depth, 0.2 * depth)  # a plate in YZ, thick along X
    turn = Vector((1, 0, 0)).rotation_difference(Vector(toward)).to_matrix().to_4x4()
    return place(bm, Matrix.Translation(at) @ turn)


def body(f, armour='steel', sleeves='steel', legs='steel'):
    """The parts every humanoid character shares: head with a face, neck, chest, belly, hips, limbs, hands, boots."""
    P = lp.Part
    parts = [
        P(ellipsoid(0.095, 0.09, 0.1, (0, 0, 0.84)), 'skin', 'head'),
        P(lp.ball(0.012, -0.032, -0.081, 0.85), 'dark', 'head'),
        P(lp.ball(0.012, 0.032, -0.081, 0.85), 'dark', 'head'),
        P(lp.ball(0.017, 0, -0.092, 0.825), 'skin', 'head'),
        P(limb((0, 0, 0.70), (0, 0, 0.77), 0.04), 'skin', 'neck'),
        P(ellipsoid(0.15, 0.11, 0.12, (0, 0, 0.63)), armour, 'chest'),
        P(ellipsoid(0.13, 0.10, 0.08, (0, 0, 0.50)), armour, 'spine'),
        P(ellipsoid(0.12, 0.09, 0.07, (0, 0, 0.43)), 'leather', 'hips'),
    ]
    for side, s in SIDES:
        shoulder, elbow, wrist = f.at(f'arm_up_{side}'), f.at(f'arm_low_{side}'), f.at(f'hand_{side}')
        hip, knee, ankle = f.at(f'leg_up_{side}'), f.at(f'leg_low_{side}'), f.at(f'foot_{side}')
        parts += [
            P(ellipsoid(0.065, 0.065, 0.055, shoulder + Vector((0.01 * s, 0, 0.01))), armour, f'arm_up_{side}'),
            P(limb(shoulder, elbow, 0.04, 0.035), sleeves, f'arm_up_{side}'),
            P(limb(elbow, wrist, 0.035, 0.03), sleeves, f'arm_low_{side}'),
            P(ellipsoid(0.036, 0.036, 0.042, wrist + Vector((0, 0, -0.035))), 'skin', f'hand_{side}'),
            P(limb(hip, knee, 0.055, 0.045), legs, f'leg_up_{side}'),
            P(ellipsoid(0.05, 0.05, 0.04, knee), armour, f'leg_low_{side}'),
            P(limb(knee, ankle, 0.045, 0.04), legs, f'leg_low_{side}'),
            P(lp.block(0.075, 0.13, 0.06, ankle + Vector((0, -0.025, -0.04)), bevel=0.02), armour, f'foot_{side}'),
        ]
    return parts
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run living:test`
Expected: `Ran 44 tests` … `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/blender/figure.py scripts/blender/test_figure.py scripts/blender/test_lp.py
git commit -m "feat: add a humanoid figure with joint-angle poses for the character pieces"
```

---

### Task 3: The defender's `hit` in the game

**Files:**
- Modify: `apps/web/src/scene/actors.ts` (`play` accepts `'hit'`)
- Modify: `apps/web/src/scene/theme.ts` (`TIMING.hitMs`)
- Modify: `apps/web/src/scene/Piece.tsx` (`play` tweens each clip over its own duration)
- Modify: `apps/web/src/scene/sequencer.ts` (`hit` then `die` at the impact)
- Modify: `apps/web/src/scene/pieces/rig.ts` (optional `Rig.hit`)
- Modify: `apps/web/src/scene/pieces/models.ts` (optional `Clips.hit`, exported `CHARACTER` clips)
- Modify: `apps/web/src/scene/pieces/GlbPiece.tsx` (plays `hit` when the model has it)
- Test: `apps/web/src/scene/sequencer.test.ts`

**Interfaces:**
- Produces: `ActorHandle.play(clip: 'attack' | 'hit' | 'die')`; `TIMING.hitMs = 300`; `Rig.hit?(t: number)`;
  `Clips.hit?: string`; `CHARACTER: Clips = { idle, walk, attack, hit: 'hit', die }` exported from `models.ts`
  (Task 6 points the pawn at it). Models listed with `CLIPS` (no `hit`) keep idling during the hit, then die as now.

- [ ] **Step 1: Write the failing test**

Start Postgres first (from the repo root): `npm run db:up -w @chess/server`. Then apply:

````diff
diff --git a/apps/web/src/scene/sequencer.test.ts b/apps/web/src/scene/sequencer.test.ts
index 9245aff..800a511 100644
--- a/apps/web/src/scene/sequencer.test.ts
+++ b/apps/web/src/scene/sequencer.test.ts
@@ -67,6 +67,15 @@ test('a capture runs approach, fight, removal, then step-in, in that order', asy
   expect(pieces().find((p) => p.id === 'w-p-e4')?.square).toBe('d5');
 });
 
+test('the defender recoils from the blow, then falls', async () => {
+  const { log, deps } = setup('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
+  await runSteps([{ kind: 'combat', attacker: 'w-p-e4', defender: 'b-p-d5' }], deps);
+  const at = (entry: string) => log.indexOf(entry);
+  expect(at('b-p-d5 hit start')).toBeGreaterThan(at('w-p-e4 attack start'));
+  expect(at('b-p-d5 die start')).toBeGreaterThan(at('b-p-d5 hit end'));
+  expect(at('effect')).toBeGreaterThan(at('b-p-d5 die end'));
+});
+
 test('a knight approaches its victim by hopping', async () => {
   const { log, deps } = setup('rnbqkbnr/ppp1pppp/8/3p4/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 2');
   await runSteps([{ kind: 'combat', attacker: 'w-n-c3', defender: 'b-p-d5' }], deps);
````

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/scene/sequencer.test.ts`
Expected: FAIL: `the defender recoils from the blow, then falls` (no `b-p-d5 hit start` in the log); the other 18 pass.

- [ ] **Step 3: Implement**

Apply:

````diff
diff --git a/apps/web/src/scene/Piece.tsx b/apps/web/src/scene/Piece.tsx
index 23fdca6..8f21a73 100644
--- a/apps/web/src/scene/Piece.tsx
+++ b/apps/web/src/scene/Piece.tsx
@@ -18,6 +18,7 @@ import { TEAM, TIMING, walkMs } from './theme';
 import { tween } from './tween';
 
 const BUILT = { p: Pawn, n: Knight, b: Bishop, r: Rook, q: Queen, k: King };
+const CLIP_MS = { attack: TIMING.attackMs, hit: TIMING.hitMs, die: TIMING.dieMs } as const;
 
 /** One piece on the board. Owns its position and facing, and registers itself as an actor. */
 export function PieceActor({ piece }: { piece: Piece }) {
@@ -55,8 +56,7 @@ export function PieceActor({ piece }: { piece: Piece }) {
           rig.current?.stride(t === 1 ? 0 : t * distance);
         });
       },
-      play: (clip) =>
-        tween(clip === 'attack' ? TIMING.attackMs : TIMING.dieMs, (t) => rig.current?.[clip](t)),
+      play: (clip) => tween(CLIP_MS[clip], (t) => rig.current?.[clip]?.(t)),
     };
     actors.set(piece.id, handle);
     return () => void actors.delete(piece.id);
diff --git a/apps/web/src/scene/actors.ts b/apps/web/src/scene/actors.ts
index e9553da..0afe868 100644
--- a/apps/web/src/scene/actors.ts
+++ b/apps/web/src/scene/actors.ts
@@ -3,7 +3,7 @@ import type { PieceId, Point } from '@/game/types';
 export interface ActorHandle {
   moveTo(point: Point, mode: 'walk' | 'hop'): Promise<void>;
   face(point: Point): void;
-  play(clip: 'attack' | 'die'): Promise<void>;
+  play(clip: 'attack' | 'hit' | 'die'): Promise<void>;
 }
 
 /** Every mounted piece registers itself here so the sequencer can drive it. */
diff --git a/apps/web/src/scene/pieces/GlbPiece.tsx b/apps/web/src/scene/pieces/GlbPiece.tsx
index 3da5949..772b06b 100644
--- a/apps/web/src/scene/pieces/GlbPiece.tsx
+++ b/apps/web/src/scene/pieces/GlbPiece.tsx
@@ -21,6 +21,8 @@ import { HEIGHT, MODELS, type Clips } from './models';
 import { clipTime, keys, type PieceModelProps } from './rig';
 
 type Clip = keyof Clips;
+/** One action per clip; only hit may be missing. */
+type Actions = Record<Exclude<Clip, 'hit'>, AnimationAction> & { hit?: AnimationAction };
 
 // Texels whose red and blue are high and green low (the magenta painted in Meshy) take the team's colour,
 // at the texel's brightness so the shading baked into the texture survives.
@@ -63,24 +65,26 @@ function fit(scene: Object3D, height: number) {
 function animate(model: Object3D, animations: AnimationClip[], clips: Clips | undefined) {
   if (!clips) return null;
   const mixer = new AnimationMixer(model);
-  const actions = {} as Record<Clip, AnimationAction>;
+  const actions = {} as Actions;
   for (const key of Object.keys(clips) as Clip[]) {
     const clip = animations.find((candidate) => candidate.name === clips[key]);
     if (!clip) return null;
     const action = mixer.clipAction(clip);
-    if (key === 'attack' || key === 'die') {
+    if (key !== 'idle' && key !== 'walk') {
       action.setLoop(LoopOnce, 1);
       action.clampWhenFinished = true;
     }
     action.play();
-    actions[key] = action;
+    (actions as Record<Clip, AnimationAction>)[key] = action;
   }
   return { mixer, actions };
 }
 
 /** Weights `clip` in and every other clip out. */
-function only(actions: Record<Clip, AnimationAction>, clip: Clip) {
-  for (const key of Object.keys(actions) as Clip[]) actions[key].setEffectiveWeight(key === clip ? 1 : 0);
+function only(actions: Actions, clip: Clip) {
+  for (const [key, action] of Object.entries(actions) as [Clip, AnimationAction][]) {
+    action.setEffectiveWeight(key === clip ? 1 : 0);
+  }
 }
 
 /** Plays the idle clip on in real time. */
@@ -156,7 +160,7 @@ export function GlbPiece({ type, color, ref }: PieceModelProps & { type: PieceSy
     }
     /** Holds `clip` at `value` (see clipTime), with every other clip weighted out. */
     const hold = (clip: Clip, value: number, loop: boolean) => {
-      const action = anim.actions[clip];
+      const action = anim.actions[clip]!;
       only(anim.actions, clip);
       action.enabled = true;
       action.paused = true;
@@ -172,6 +176,10 @@ export function GlbPiece({ type, color, ref }: PieceModelProps & { type: PieceSy
         posed.current = t < 1; // back to idle at the end
         if (posed.current) hold('attack', t, false);
       },
+      hit(t) {
+        posed.current = anim.actions.hit !== undefined; // a model without a hit clip keeps idling until it dies
+        if (posed.current) hold('hit', t, false);
+      },
       die(t) {
         posed.current = true; // the last pose stays until the piece is removed
         hold('die', t, false);
diff --git a/apps/web/src/scene/pieces/models.ts b/apps/web/src/scene/pieces/models.ts
index 3e2108f..5182e14 100644
--- a/apps/web/src/scene/pieces/models.ts
+++ b/apps/web/src/scene/pieces/models.ts
@@ -5,11 +5,13 @@ export interface Clips {
   idle: string;
   walk: string;
   attack: string;
+  hit?: string;
   die: string;
 }
 
-// scripts/blender/living_pieces.py names every model's clips the same way.
+// scripts/blender/living_pieces.py names every model's clips the same way; character pieces (figure.py) add a hit.
 const CLIPS: Clips = { idle: 'idle', walk: 'walk', attack: 'attack', die: 'die' };
+export const CHARACTER: Clips = { ...CLIPS, hit: 'hit' };
 
 /** Piece types drawn from a .glb model. A type not listed here uses its model built in code. */
 export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>> = {
diff --git a/apps/web/src/scene/pieces/rig.ts b/apps/web/src/scene/pieces/rig.ts
index 323c644..84e24f6 100644
--- a/apps/web/src/scene/pieces/rig.ts
+++ b/apps/web/src/scene/pieces/rig.ts
@@ -6,6 +6,8 @@ export interface Rig {
   stride(phase: number): void;
   /** Attack pose at progress t (0..1). Must be back at rest when t = 1. */
   attack(t: number): void;
+  /** Hit pose at progress t (0..1): the recoil from a blow, played before die. Models without one keep idling. */
+  hit?(t: number): void;
   /** Death pose at progress t (0..1). t = 1 is the final pose; the piece is then removed. */
   die(t: number): void;
 }
diff --git a/apps/web/src/scene/sequencer.ts b/apps/web/src/scene/sequencer.ts
index d362740..cab2cd7 100644
--- a/apps/web/src/scene/sequencer.ts
+++ b/apps/web/src/scene/sequencer.ts
@@ -82,7 +82,7 @@ async function animate(step: Step, deps: SequencerDeps, offSquare: Map<PieceId,
   const impactMs = TIMING.attackMs * TIMING.impactAt;
   sound?.('hit', impactMs);
   await wait(impactMs);
-  await Promise.all([attack, defender.play('die')]);
+  await Promise.all([attack, defender.play('hit').then(() => defender.play('die'))]); // recoils, then falls
   sound?.('fall');
   void camera?.reset(); // glides out while the attacker steps in
 }
diff --git a/apps/web/src/scene/theme.ts b/apps/web/src/scene/theme.ts
index d5a5218..ce81990 100644
--- a/apps/web/src/scene/theme.ts
+++ b/apps/web/src/scene/theme.ts
@@ -33,7 +33,8 @@ export const TIMING = {
   hopMs: 500,
   hopHeight: 0.6,
   attackMs: 700,
-  impactAt: 0.6, // fraction of the attack clip at which the defender starts to fall
+  impactAt: 0.6, // fraction of the attack clip at which the defender is struck
+  hitMs: 300, // the defender's recoil, before it falls
   dieMs: 700,
   promoteMs: 300,
   turnMs: 150,
````

- [ ] **Step 4: Run the checks and make sure they pass**

Run: `npx vitest run src/scene && npx eslint src/scene && npm run typecheck`
Expected: 7 test files, 34 tests pass; no lint output; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/scene
git commit -m "feat: make the defender recoil from the blow before it falls"
```

---

### Task 4: The pawn as a character, and `live.py`

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (docstring, imports, `pawn()` replaced)
- Create: `apps/web/scripts/blender/live.py`

**Interfaces:**
- Consumes: everything `figure.py` produces (Task 2); `lp.Part`, `lp.cone`, `lp.lathe`.
- Produces: `pieces.PIECES['pawn']` builds the character pawn: 20 bones (`humanoid()` plus `weapon` on `hand_r` and
  `shield` on `arm_low_l`), ~5,600 vertices, clips `idle` 72 frames, `walk` 30, `attack` 30 (strike key at 0.6),
  `hit` 9, `die` 30. `live.py` builds `PIECE` in the open Blender scene and plays `CLIP`.

The clip contract in `lp.check()` is this task's test: the build fails on any breach.

- [ ] **Step 1: Replace the pawn**

Apply to `pieces.py`:

````diff
--- a/apps/web/scripts/blender/pieces.py
+++ b/apps/web/scripts/blender/pieces.py
@@ -1,8 +1,12 @@
-"""The six living chess pieces: each builder returns an lp.Piece. Sizes are in squares (GlbPiece rescales to
-HEIGHT in models.ts anyway); the base stands on z = 0 and the piece faces -Y. Designs: the Pieces table in
-docs/superpowers/specs/2026-11-19-living-pieces-design.md."""
+"""The six chess pieces: each builder returns an lp.Piece. Sizes are in squares (GlbPiece rescales to HEIGHT in
+models.ts anyway); the piece stands on z = 0 and faces -Y. Character pieces (built on figure.py) replace the living
+Staunton pieces one by one: see docs/superpowers/specs/2026-11-19-character-pieces-design.md (Characters) and
+docs/superpowers/specs/2026-11-19-living-pieces-design.md (Pieces) for the ones still to replace."""
 import math
 
+from mathutils import Vector
+
+from figure import REST, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, recoil, star, stride, through
 from lp import (Part, Piece, arc, ball, block, bounce, bump, cone, crumble, cut, ease, fall, halves, lathe, move, ring,
                 rock, shards_of, shift, slab, span, spline, stretch, tip, topple_angle, turn)
 
@@ -35,33 +39,57 @@
 
 
 def pawn():
-    """Ball head, collar, low base. Quick bob; nimble hops; a head-butt; cracks into six shards."""
-    r = 0.3
-    profile = spline(foot(r) + [(0.15, 0.25), (0.115, 0.40), (0.10, 0.50), (0.10, 0.50), (0.16, 0.525),
-                                (0.16, 0.565), (0.085, 0.594), (0.085, 0.594)])[:-1] + arc(0.735, 0.165, -59, 90)
-    parts = wedges(lathe(profile), [0.45])
-    parts += [Part(foot_ring(r), 'trim', 'band'), Part(ring(0.16, 0.012, 0.545), 'trim', 'collar')]
-    shards = [f's{i}' for i in range(6)]
-    parent = {'body': None, **{s: 'body' for s in shards}, 'band': 'body', 'collar': 'body'}
-
-    def idle(t):  # a quick small bob with a slight sway
-        b = 0.5 - 0.5 * math.cos(2 * TAU * t)
-        return {'body': rock(0.025 * math.sin(TAU * t), r) @ stretch(1 - 0.006 * b, 1 - 0.006 * b, 1 + 0.012 * b)}
-
-    def walk(u):  # small, nimble hops
-        return {'body': bounce(u, 0.07, 0.12, 0.08)}
-
-    def attack(t):  # leans back, head-butts forward at the contact, springs back
-        return {'body': move(y=ease(t, 0, 0.03, 0.05, -0.10, 0.02, 0))
-                @ tip(ease(t, 0, -0.12, -0.22, 0.32, 0.05, 0), r)
-                @ stretch(1, 1, ease(t, 1, 0.95, 0.92, 1.06, 1, 1))}
+    """Infantryman: plumed helmet, team tunic, spear in the right hand, round shield on the left forearm. Thrusts the
+    spear from behind the shield, recoils behind it, falls on his side with spear and shield."""
+    f = humanoid()
+    f.add('weapon', 'hand_r', f.at('hand_r'))
+    f.add('shield', 'arm_low_l', f.at('arm_low_l'))
+    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
+    face = Vector((0.25, -1, 0)).normalized()  # the shield turns a little outward
+    centre = f.at('arm_low_l') + Vector((0.07, -0.08, -0.06))
+    parts = body(f) + [
+        Part(dome(0.105, 0.87), 'steel', 'head'),  # kettle helmet
+        Part(hoop(0.11, 0.012, (0, 0, 0.872)), 'trim', 'head'),
+        Part(ellipsoid(0.03, 0.08, 0.05, (0, 0.03, 0.99)), 'team', 'head'),  # plume
+        Part(lathe([(0, 0.30), (0.16, 0.30), (0.15, 0.40), (0.14, 0.53), (0, 0.53)], 24), 'team', 'hips'),  # tunic
+        Part(hoop(0.133, 0.014, (0, 0, 0.47)), 'leather', 'spine'),  # belt
+        Part(limb(grip + Vector((0, 0, -0.40)), grip + Vector((0, 0, 0.62)), 0.012), 'wood', 'weapon'),
+        Part(cone(0.028, 0.10, grip + Vector((0, 0, 0.67)), 8), 'steel', 'weapon'),
+        Part(disc(0.13, 0.03, centre, face), 'team', 'shield'),
+        Part(hoop(0.128, 0.01, centre + face * 0.012, face), 'trim', 'shield'),
+        Part(star(0.06, 0.012, centre + face * 0.035, face), 'trim', 'shield'),
+    ]
 
-    die = crumble(parts, parent, r, shards + ['band', 'collar'], spread=0.28, jump=0.12, tumble=1.4,
-                  special={'band': {'spread': 0, 'jump': 0.04, 'tumble': 0},  # the gold bands drop flat
-                           'collar': {'spread': 0.1, 'jump': 0.08, 'tumble': 0}})
-    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)
+    def level(arm_up, arm_low, chest=0.0, spine=0.0):
+        """The weapon's forward turn that holds the spear level, point ahead, for these arm and body turns."""
+        return math.pi / 2 + arm_up + arm_low - chest - spine
 
+    def idle(t):  # breathing, a glance aside now and then
+        b = math.sin(TAU * t)
+        return {'chest': 0.02 * b, 'head': (-0.02 * b, 0, 0.05 * math.sin(2 * TAU * t)), 'arm_up_l': 0.03 * b}
 
+    def walk(u):  # the spear arm stays nearly still
+        return {**stride(u), 'arm_up_r': 0.08 * math.cos(TAU * u), 'arm_low_r': 0.1}
+
+    windup = {'arm_up_r': -0.5, 'arm_low_r': 0.9, 'weapon': level(-0.5, 0.9, -0.05), 'chest': (-0.05, 0, -0.3),
+              'arm_up_l': 0.5, 'arm_low_l': 0.6, 'leg_up_l': 0.35, 'leg_up_r': -0.25, 'leg_low_l': -0.2}
+    strike = {'arm_up_r': 1.3, 'arm_low_r': 0.15, 'weapon': level(1.3, 0.15, 0.15, 0.1), 'chest': (0.15, 0, 0.35),
+              'spine': 0.1, 'arm_up_l': 0.3, 'arm_low_l': 0.5, 'leg_up_l': 0.6, 'leg_up_r': -0.45, 'leg_low_l': -0.35}
+    follow = {**strike, 'arm_up_r': 1.1, 'weapon': level(1.1, 0.15, 0.15, 0.1)}
+    struck = {**recoil(0.35), 'arm_up_l': 0.8, 'arm_low_l': 0.9}  # the shield comes up
+    staggered = {**struck, 'spine': -0.5, 'root': (0, -0.2, 0)}
+    down = {'root': (0, -1.5, 0), 'spine': 0.15, 'head': (0.2, -0.3, 0), 'arm_up_l': 0.4, 'arm_up_r': 0.6,
+            'weapon': 0.3, 'leg_up_l': 0.4, 'leg_low_l': -0.6, 'leg_up_r': 0.1}  # on his right side
+
+    return character(f, parts, {
+        'idle': (72, idle),
+        'walk': (30, walk),
+        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),  # strike at 0.6
+        'hit': (9, lambda t: through(t, REST, struck)),
+        'die': (30, lambda t: through(t, struck, staggered, down, down)),
+    })
+
+
 PIECES['pawn'] = pawn
 
 
````

- [ ] **Step 2: Build it headless**

Run: `npm run living -- pawn`
Expected: ends with `pawn: the clip contract holds; wrote …/assets-src/living/pawn.glb`, and
`assets-src/living/pawn-{rest,walk,attack,hit,die}.png` exist.

- [ ] **Step 3: Look at the five previews**

Open each PNG with the Read tool. Expected: a stocky helmeted soldier in a red tunic with spear and star shield at
rest; mid-stride with the left foot ahead in `walk`; the spear thrust forward in `attack`; leaning back behind the
raised shield in `hit`; lying on his side with spear and shield in `die`, nothing below the floor.

- [ ] **Step 4: Create the live script**

Create `apps/web/scripts/blender/live.py`:

```python
"""Builds a piece in the open Blender scene and plays one clip, for tuning it live. In Blender: Text > Open this file,
set PIECE and CLIP, then Run Script (Alt+P); edit pieces.py or figure.py and run again. It saves and exports nothing:
npm run living -- <piece> builds the shipped model from the same code."""
import importlib
import os
import sys

import bpy

PIECE = 'pawn'
CLIP = 'attack'  # idle, walk, attack, hit or die

space = getattr(bpy.context, 'space_data', None)
text = space.text if space is not None and space.type == 'TEXT_EDITOR' else None
HERE = os.path.dirname(bpy.path.abspath(text.filepath if text and text.filepath else __file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lp  # noqa: E402
import figure  # noqa: E402
import pieces  # noqa: E402

for module in (lp, figure, pieces):  # pick up edits made since the last run
    importlib.reload(module)

for data in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
    for item in list(data):
        data.remove(item)
scene = bpy.context.scene
scene.render.fps = lp.FPS
piece = pieces.PIECES[PIECE]()
obj, rig = lp.assemble(PIECE, piece)
for clip in lp.CLIPS:
    lp.bake(rig, piece, clip)
lp.check(obj, rig, piece)  # raises, naming the first breach of the clip contract
bpy.data.materials['team'].diffuse_color = lp.RED  # the viewport shows the red team; the export stays magenta
bpy.data.materials['team'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = lp.RED
rig.animation_data.action = bpy.data.actions[CLIP]
scene.frame_start, scene.frame_end, scene.frame_current = 0, piece.clips[CLIP][0], 0
print(f'{PIECE}: the clip contract holds; playing {CLIP} ({piece.clips[CLIP][0]} frames)')
```

- [ ] **Step 5: Smoke-test it headless**

Run: `"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" --background --factory-startup --python-exit-code 1 --python scripts/blender/live.py`
Expected: prints `pawn: the clip contract holds; playing attack (30 frames)`.

- [ ] **Step 6: Commit**

```bash
git add scripts/blender/pieces.py scripts/blender/live.py
git commit -m "feat: build the pawn as an infantryman character, with a live script for Blender"
```

---

### Task 5: Tune the pawn live in the owner's Blender app

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (`pawn()` numbers), and `figure.py` only if a shared shape or the
  shared walk changes (then rerun `npm run living:test`).

This task drives the Blender app on the owner's Mac with the computer-use tools, with the owner watching. Load the
`anthropic-skills:computer-use` skill first and follow it.

- [ ] **Step 1: Get access and open Blender**

`request_access` for `Blender`, then `open_application` `Blender`. Close the splash screen (click outside it).

- [ ] **Step 2: Open and run the live script**

Switch an area to the Text Editor (or use the Scripting workspace tab). Text › Open… → go to
`/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py` → Open Text. Click Run Script (or Alt+P with the
pointer over the Text Editor). Expected: the red pawn appears in the 3D viewport; the System Console / Info editor
shows `pawn: the clip contract holds; playing attack (30 frames)`. If a Python error shows, read it in the Info
editor, fix the code in the repo, and run again.

- [ ] **Step 3: Show each clip to the owner**

In the 3D viewport: press numpad 1 (front view; the figure faces you), orbit a little with numpad 4 and numpad 8 to
a three-quarter view, then View › Frame All.
For each clip, set `CLIP = '<clip>'` in the Text Editor, Run Script, and press Space in the viewport to play (Space
again to stop). Take a screenshot at the key moments: rest, mid-stride, the strike (frame 18 of `attack`), the end of
`hit` (frame 9) and the end of `die` (frame 30). Ask the owner what to change.

- [ ] **Step 4: Change, write back, rerun**

Make every change in the repo files, not in the Blender scene: edit the numbers in `pawn()` (key poses `windup`,
`strike`, `follow`, `struck`, `staggered`, `down`; part sizes and positions) or the shared shapes in `figure.py`.
Edit the files with the Edit tool, then click Text › Reload in Blender's Text Editor if it shows the file changed, and
Run Script again (it reloads `lp`, `figure` and `pieces`). If the owner poses a bone by hand in Pose Mode, read its
rotation from the N panel (Item tab, Euler XYZ), convert it into the pose's `(forward, side, twist)` (forward = X for
an upright bone, −X for a hanging one; side = Y, −Y for a hanging one; twist = Z), write it into `pieces.py`, then
rerun so the scene comes from the code again. Repeat until the owner approves the pawn in Blender.

- [ ] **Step 5: Rebuild headless and check**

Run: `npm run living -- pawn && npm run living:test`
Expected: `pawn: the clip contract holds; …` and `Ran 44 tests` … `OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/blender
git commit -m "feat: tune the pawn with the owner in Blender"
```

(Skip this commit if nothing changed.)

---

### Task 6: Ship `pawn-4.glb`, check it in the game, pilot gate

**Files:**
- Create: `apps/web/public/models/pawn-4.glb`; delete `apps/web/public/models/pawn-3.glb`
- Modify: `apps/web/src/scene/pieces/models.ts` (the pawn's line)
- Modify: `apps/web/public/models/CREDITS.md`
- Modify: `docs/superpowers/specs/2026-11-19-character-pieces-design.md` (append a "Pilot outcome" section)
- Test: `apps/web/src/scene/pieces/models.test.ts` (existing: versioned name, every listed clip present, sizes)

- [ ] **Step 1: Optimise it into the game and swap the file**

```bash
npm run models -- assets-src/living/pawn.glb public/models/pawn-4.glb
git rm public/models/pawn-3.glb
ls -l public/models/pawn-4.glb
```

Expected: at most 256,000 bytes (250 KB); the untuned pilot was 122,708. If larger, lower `steps` in the pawn's
`lathe()`/`dome()`/`disc()` calls from 24 to 16 and rebuild from Task 5 Step 5.

- [ ] **Step 2: Point the game at it**

In `apps/web/src/scene/pieces/models.ts`, change the pawn's line to:

```ts
  p: { url: '/models/pawn-4.glb', clips: CHARACTER },
```

- [ ] **Step 3: Record it in CREDITS.md**

Replace `apps/web/public/models/CREDITS.md` with:

~~~markdown
# 3D model credits

Every piece model is built from scratch by `scripts/blender/living_pieces.py` (Blender 5.3.0), no third-party assets.
The pawn is a character built on `scripts/blender/figure.py`; the others are still living Staunton pieces:

| File | Piece |
|---|---|
| `pawn-4.glb` | pawn (character) |
| `rook-2.glb` | rook |
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
~~~

- [ ] **Step 4: Run every test**

From the repo root, with Postgres up: `npm test && npm run typecheck && npm run lint`
Expected: all pass, including `models.test.ts` (it reads `hit` from the pawn's `CHARACTER` clips and finds it in the file).

- [ ] **Step 5: Run the E2E suite**

From the repo root: `npm run e2e`
Expected: every test passes in Chromium, Firefox and WebKit (every listed model loads).

- [ ] **Step 6: See it in the game**

Load the `anthropic-skills:built-in-browser` skill. `preview_start` name `chess-dev` (from `.claude/launch.json`).
Start a two-player game and play 1. e4 d5 2. exd5: the white pawn walks, thrusts, and the black pawn recoils and
falls. Capture the walk, the strike, the hit and the fall from the canvas (screenshots, or several frames sampled
with `javascript_tool`); check both teams recolour only the tunic, plume and shield face (steel, gold, skin
untouched); `read_console_messages` shows no `piece model failed to load` warning. Also note how the other five
(Staunton) pieces behave in a capture: they idle for 0.3 s, then die as before.

- [ ] **Step 7: Record the pilot outcome**

Append to the spec:

```markdown
## Pilot outcome (YYYY-MM-DD)

`pawn-4.glb`: <bytes> bytes, 20 bones. Changes made with the owner in Blender: <list, or "none">. Checked in the
running game (1. e4 d5 2. exd5): walk, attack, hit and fall play; red and blue recolour only the cloth. Tests: <counts>.
```

Fill in the real date, size, changes and test counts from Steps 1–6.

- [ ] **Step 8: Commit**

```bash
git add public/models src/scene/pieces/models.ts ../../docs/superpowers/specs/2026-11-19-character-pieces-design.md
git commit -m "feat: ship the pawn as an infantryman character"
```

- [ ] **Step 9: STOP — owner approval of the pilot**

Show the owner the in-game captures. The pilot passes on the spec's four criteria: the owner approves the pawn in
Blender and in the game; red and blue recolour only the cloth; walk, attack, hit and death read well at the game's
timings with the hit starting as the spear lands; `pawn-4.glb` ≤ 250 KB and all tests pass. Fold any requested change
back into Task 5 and ship it as `pawn-5.glb`. Once approved, write part 2 of this plan (rook, bishop, queen, king,
knight; then a `models.test.ts` check that every model has `hit`) with the writing-plans skill.
