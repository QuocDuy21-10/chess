# Character Pieces Implementation Plan (part 2: the other five pieces)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the living Staunton rook, bishop, queen, king and knight with character pieces like the approved
pawn, then make `hit` a required clip and run the full checks.

**Architecture:** Part 1 (`docs/superpowers/plans/2026-11-19-character-pieces.md`, Tasks 1–6, done) built `figure.py`,
the `hit` clip and the pawn. This part extends `figure.py` (a size component in poses for the glowing orbs, a seated
rider on a parent bone for the knight, `body()` following a raised skeleton, `plate()` for shaped flat parts), adds a
horse-coat material, then replaces one Staunton builder per task in `pieces.py`, tuned live in the owner's Blender
app and shipped under the next file number. The last task deletes the Staunton helpers and makes `hit` required.

**Tech Stack:** Blender 5.3.0 (bpy, bmesh, mathutils, glTF exporter), Python `unittest` inside Blender, TypeScript,
React Three Fiber, Vitest, Playwright, `@gltf-transform/cli` via `npm run models`, computer use for the Blender app.

**Spec:** `docs/superpowers/specs/2026-11-19-character-pieces-design.md`

## Global Constraints

- Everything in part 1's Global Constraints still holds: clip names `idle`, `walk`, `attack`, `hit`, `die`; contact
  at 0.6; `die` starts where `hit` ends; nothing below z = −0.01; one weight of 1.0 per vertex; at most 40 bones;
  only `team` may look magenta; Z up, facing −Y, 30 fps; ≤ 250 KB per optimised piece (limits 600 KB each, 3.5 MB in
  all); build outputs in the git-ignored `apps/web/assets-src/living/`.
- New files: `rook-3.glb` (replaces `rook-2.glb`), `bishop-4.glb` (replaces `bishop-3.glb`), `queen-3.glb`
  (replaces `queen-2.glb`), `king-4.glb` (replaces `king-3.glb`), `knight-3.glb` (replaces `knight-2.glb`). A
  replaced file is deleted with `git rm`.
- Every hand tweak made in the Blender app is written back into `pieces.py` / `figure.py`; the shipped model is the
  headless build.
- The rook is a tower-shield warden; it never turns into a stone giant (originality constraint).
- Web tests need Postgres: from the repo root, `npm run db:up -w @chess/server` (Docker Desktop running).
- E2E must start its own servers: the owner's dev servers on ports 3000/3001 have to be stopped first (part 1's run
  reused them and failed with `401`). Never stop them without the owner's say-so.

All commands run from `apps/web` unless they say otherwise. Apply a patch block by saving it to a file and running
`git apply <file>` from the repo root. Tasks 8–12's patches were made against the untuned builders: if live tuning in
an earlier task changed the lines around the next builder, `git apply` refuses; then use `patch -p1 < <file>` (it
tolerates moved context) or replace the old builder function by hand with the new one from the patch's `+` lines.

### Facts verified on this machine (2026-11-19/20)

Every patch below was run before this plan was written, on commit `08b1b50`: Task 7's tests fail first (1 failure, 5
errors), then `npm run living:test` runs 48 tests OK; Tasks 8–12's patches apply in order and each piece passes the
clip contract at its own step; after Task 13's cleanup all six still pass. Optimised sizes before tuning: rook 125,588,
bishop 123,000, queen 124,384, king 131,864, knight 168,892 bytes. Task 13's game patch type-checks and lints.
Learned in part 1's live session: Blender's background `app_*` tools work; its current-frame field does not take
typed input, so set the frame by clicking the timeline ruler; rerun the live script from the Python console (Scripting
tab), then look in the Layout tab.

---

### Task 7: Orbs, a seated rider, shaped plates

**Files:**
- Modify: `apps/web/scripts/blender/figure.py` (`angles()` and `through()` gain a size component; `Figure.local()`
  scales; `humanoid(f=None, base=ZERO, parent='root', seated=False)`; `body()` follows the skeleton; new `plate()`;
  `star()` uses it)
- Modify: `apps/web/scripts/blender/lp.py` (`MATERIALS['coat']`)
- Modify: `apps/web/scripts/blender/live.py` (`PIECE` and `CLIP` can come from the console)
- Test: `apps/web/scripts/blender/test_figure.py`

**Interfaces:**
- Produces: pose values `forward | (forward, side, twist) | (forward, side, twist, size)`, size 1 at rest;
  `STILL = (0, 0, 0, 1)`; `through()` returns 4-tuples; `humanoid(f, base=(x, y, z), parent='horse_body',
  seated=True)` adds the 17 bones below `root` to an existing figure; `plate(outline, depth, at, toward=(0, -1, 0))`
  with outline points `(across, up)`; material `'coat'` (`#C9BCA6`, the horse); in Blender's console
  `exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': '<piece>', 'CLIP': '<clip>'})`.

- [ ] **Step 1: Write the failing tests**

````diff
--- a/apps/web/scripts/blender/test_figure.py
+++ b/apps/web/scripts/blender/test_figure.py
@@ -50,6 +50,29 @@
         f = figure.humanoid()
         self.assertAlmostEqual(tip_of(f, {'lift': (0, 0, 0.1)}, 'foot_l', (0, 0, 0)).z, f.at('foot_l').z + 0.1)
 
+    def test_size_scales_a_part_about_its_joint(self):
+        f = figure.humanoid()
+        f.add('orb', 'hand_r', f.at('hand_r'))
+        self.assertAlmostEqual(tip_of(f, {'orb': (0, 0, 0, 3)}, 'orb', (0, 0, -0.1)).z, f.at('hand_r').z - 0.3)
+        self.assertAlmostEqual(tip_of(f, {'orb': (0, 0, 0, 3)}, 'orb', (0, 0, 0)).z, f.at('hand_r').z)
+
+    def test_a_rider_sits_on_its_parent_bone_and_follows_it(self):
+        f = figure.Figure()
+        f.add('root', None, (0, 0, 0))
+        f.add('horse', 'root', (0, 0, 0.45))
+        figure.humanoid(f, base=(0, 0, 0.16), parent='horse', seated=True)
+        self.assertEqual(f.joints['hips'].parent, 'horse')
+        self.assertAlmostEqual(f.at('hips').z, 0.58)
+        self.assertLess(f.at('leg_low_l').y, -0.05)  # the knees reach forward, astride
+        self.assertLess(tip_of(f, {'horse': 0.3}, 'head', (0, 0, 0)).y, f.at('head').y - 0.05)
+
+    def test_the_body_follows_a_raised_skeleton(self):
+        f = figure.Figure()
+        f.add('root', None, (0, 0, 0))
+        figure.humanoid(f, base=(0, 0, 0.2))
+        parts = figure.body(f)
+        self.assertAlmostEqual(min(v.co.z for p in parts for v in p.mesh.verts), 0.2, places=4)
+
     def test_an_unknown_bone_is_refused(self):
         with self.assertRaisesRegex(AssertionError, 'unknown bone tail'):
             figure.humanoid().local({'tail': 0.1})
@@ -58,9 +81,9 @@
 class Clips(unittest.TestCase):
     def test_through_lands_on_its_keys_and_rests_a_missing_bone(self):
         a, b = {'head': 0.2}, {'head': (0.4, 0.1, 0), 'chest': 0.3}
-        self.assertEqual(figure.through(0, a, b)['head'], (0.2, 0.0, 0.0))
-        self.assertEqual(figure.through(1, a, b)['head'], (0.4, 0.1, 0.0))
-        self.assertEqual(figure.through(0, a, b)['chest'], (0.0, 0.0, 0.0))
+        self.assertEqual(figure.through(0, a, b)['head'], (0.2, 0.0, 0.0, 1.0))
+        self.assertEqual(figure.through(1, a, b)['head'], (0.4, 0.1, 0.0, 1.0))
+        self.assertEqual(figure.through(0, a, b)['chest'], (0.0, 0.0, 0.0, 1.0))
 
     def test_stride_loops_and_steps_with_alternate_feet(self):
         f = figure.humanoid()
@@ -90,7 +113,9 @@
     def test_every_shape_is_a_closed_solid(self):
         shapes = [figure.limb((0, 0, 0), (0.1, -0.2, 0.3), 0.03, 0.02), figure.limb((0, 0, 1), (0, 0, 0), 0.05),
                   figure.ellipsoid(0.1, 0.2, 0.3, (0, 0, 1)), figure.dome(0.1, 0.9), figure.disc(0.1, 0.02, (0, 0, 0.5)),
-                  figure.hoop(0.1, 0.01, (0, 0, 0.5), (0, -1, 0)), figure.star(0.06, 0.01, (0, 0, 0.5))]
+                  figure.hoop(0.1, 0.01, (0, 0, 0.5), (0, -1, 0)), figure.star(0.06, 0.01, (0, 0, 0.5)),
+                  figure.plate([(-0.1, 0), (0.1, 0), (0.1, 0.2), (0.03, 0.2), (0.03, 0.15), (-0.03, 0.15),
+                                (-0.03, 0.2), (-0.1, 0.2)], 0.02, (0, 0, 0.5))]
         for bm in shapes:
             self.assertTrue(manifold(bm))
             self.assertGreater(bm.calc_volume(), 0)
@@ -107,6 +132,12 @@
         self.assertLess(min(ys), -0.02)  # the domed face bulges toward -Y
         self.assertAlmostEqual(max(ys), 0.0, places=6)
 
+    def test_a_plate_facing_minus_y_runs_across_x(self):
+        bm = figure.plate([(-0.1, 0), (0.1, 0), (0.1, 0.2), (-0.1, 0.2)], 0.02, (0, 0, 0.5))
+        xs, ys = [v.co.x for v in bm.verts], [v.co.y for v in bm.verts]
+        self.assertAlmostEqual(max(xs) - min(xs), 0.2, places=4)
+        self.assertAlmostEqual(max(ys) - min(ys), 0.02, places=4)
+
     def test_the_body_stands_on_the_floor_on_its_own_bones(self):
         f = figure.humanoid()
         parts = figure.body(f)
````

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run living:test`
Expected: FAIL (failures=1, errors=5): `Tuples differ: (0.2, 0.0, 0.0) != (0.2, 0.0, 0.0, 1.0)`,
`module 'figure' has no attribute 'plate'`, and `humanoid()` refusing `base` / `parent` / `seated`.

- [ ] **Step 3: Implement**

````diff
--- a/apps/web/scripts/blender/figure.py
+++ b/apps/web/scripts/blender/figure.py
@@ -1,9 +1,9 @@
 """Character pieces: a stocky humanoid skeleton, its body parts, and clips written as joint angles.
 
-A pose is a dict {bone: angles}. `angles` is a number (forward) or a tuple (forward, side, twist), in radians:
-forward > 0 swings the far end of the part toward the facing (-Y), side > 0 toward +X, twist > 0 turns it
-counter-clockwise seen from above. The key 'lift' is a translation (x, y, z) of the whole figure. A bone left out is
-at rest. character() settles every frame on the floor, so a pose never says how high the figure stands.
+A pose is a dict {bone: angles}. `angles` is a number (forward) or a tuple (forward, side, twist) or (forward, side,
+twist, size), in radians: forward > 0 swings the far end of the part toward the facing (-Y), side > 0 toward +X,
+twist > 0 turns it counter-clockwise seen from above; size scales the part about its joint (1 at rest: a glowing orb
+that swells on a strike). The key 'lift' is a translation (x, y, z) of the whole figure. A bone left out is at rest. character() settles every frame on the floor, so a pose never says how high the figure stands.
 Spec: docs/superpowers/specs/2026-11-19-character-pieces-design.md.
 """
 import math
@@ -15,6 +15,7 @@
 import lp
 
 ZERO = (0.0, 0.0, 0.0)
+STILL = (0.0, 0.0, 0.0, 1.0)  # the angles of a bone at rest
 REST = {}
 SIDES = (('l', 1), ('r', -1))  # the figure faces -Y, so its left side is +X
 
@@ -50,41 +51,49 @@
             if bone == 'lift':
                 continue
             lp.need(bone in self.joints, f'a pose turns the unknown bone {bone}')
-            forward, side, twist = angles(value)
+            forward, side, twist, size = angles(value)
             joint = self.joints[bone]
             sign = -1.0 if joint.down else 1.0
             p = Vector(joint.pivot)
             spin = Euler((sign * forward, sign * side, twist)).to_matrix().to_4x4()
+            if size != 1.0:
+                spin = spin @ Matrix.Scale(size, 4)
             out[bone] = Matrix.Translation(p) @ spin @ Matrix.Translation(-p)
-        lift = angles(pose.get('lift', ZERO))
+        lift = angles(pose.get('lift', ZERO))[:3]
         if any(lift):
             out['root'] = lp.move(*lift) @ out.get('root', lp.IDENTITY)
         return out
 
 
 def angles(value):
-    """(forward, side, twist) from a pose value: a number means a forward swing."""
+    """(forward, side, twist, size) from a pose value: a number means a forward swing; size defaults to 1."""
     if isinstance(value, (int, float)):
-        return (float(value), 0.0, 0.0)
-    return tuple(float(v) for v in value)
+        return (float(value), 0.0, 0.0, 1.0)
+    values = tuple(float(v) for v in value)
+    return values + (1.0,) if len(values) == 3 else values
 
 
-def humanoid():
-    """The shared skeleton: a figure 1.0 tall (about 4.5 heads), feet on z = 0, facing -Y. 18 bones."""
-    f = Figure()
-    f.add('root', None, ZERO)
-    f.add('hips', 'root', (0, 0, 0.42))
-    f.add('spine', 'hips', (0, 0, 0.48))
-    f.add('chest', 'spine', (0, 0, 0.58))
-    f.add('neck', 'chest', (0, 0, 0.72))
-    f.add('head', 'neck', (0, 0, 0.75))
+def humanoid(f=None, base=ZERO, parent='root', seated=False):
+    """The shared skeleton: a figure 1.0 tall (about 4.5 heads), feet on z = 0, facing -Y. 18 bones. Given a figure
+    `f`, adds the 17 bones below 'root' to it instead, raised by `base` and with the hips on `parent`; `seated` bends
+    the legs to sit astride a horse (the knight)."""
+    if f is None:
+        f = Figure()
+        f.add('root', None, ZERO)
+    o = Vector(base)
+    f.add('hips', parent, o + Vector((0, 0, 0.42)))
+    f.add('spine', 'hips', o + Vector((0, 0, 0.48)))
+    f.add('chest', 'spine', o + Vector((0, 0, 0.58)))
+    f.add('neck', 'chest', o + Vector((0, 0, 0.72)))
+    f.add('head', 'neck', o + Vector((0, 0, 0.75)))
     for side, s in SIDES:
-        f.add(f'arm_up_{side}', 'chest', (0.15 * s, 0, 0.68), True)
-        f.add(f'arm_low_{side}', f'arm_up_{side}', (0.165 * s, 0, 0.555), True)
-        f.add(f'hand_{side}', f'arm_low_{side}', (0.175 * s, -0.01, 0.44), True)
-        f.add(f'leg_up_{side}', 'hips', (0.07 * s, 0, 0.41), True)
-        f.add(f'leg_low_{side}', f'leg_up_{side}', (0.075 * s, 0, 0.23), True)
-        f.add(f'foot_{side}', f'leg_low_{side}', (0.075 * s, 0, 0.07), True)
+        f.add(f'arm_up_{side}', 'chest', o + Vector((0.15 * s, 0, 0.68)), True)
+        f.add(f'arm_low_{side}', f'arm_up_{side}', o + Vector((0.165 * s, 0, 0.555)), True)
+        f.add(f'hand_{side}', f'arm_low_{side}', o + Vector((0.175 * s, -0.01, 0.44)), True)
+        knee, ankle = ((0.17 * s, -0.10, 0.31), (0.18 * s, -0.07, 0.14)) if seated else ((0.075 * s, 0, 0.23), (0.075 * s, 0, 0.07))
+        f.add(f'leg_up_{side}', 'hips', o + Vector((0.07 * s, 0, 0.41)), True)
+        f.add(f'leg_low_{side}', f'leg_up_{side}', o + Vector(knee), True)
+        f.add(f'foot_{side}', f'leg_low_{side}', o + Vector(ankle), True)
     return f
 
 
@@ -93,7 +102,7 @@
 def through(t, *poses):
     """The pose at t through equally spaced key poses, easing in and out of each, like lp.ease."""
     bones = sorted(set().union(*poses))
-    return {b: tuple(lp.ease(t, *(angles(p.get(b, ZERO))[i] for p in poses)) for i in range(3)) for b in bones}
+    return {b: tuple(lp.ease(t, *(angles(p.get(b, STILL))[i] for p in poses)) for i in range(4)) for b in bones}
 
 
 def stride(u, legs=0.45, knees=0.7, arms=0.35, sway=0.05, lean=0.06):
@@ -177,6 +186,14 @@
     return place(lp.ring(radius, thickness, 0.0, steps), Matrix.Translation(at) @ facing(toward))
 
 
+def plate(outline, depth, at, toward=(0, -1, 0)):
+    """A flat plate `depth` thick cut to `outline` [(across, up)], centred on `at` with its face toward `toward`: a
+    tower shield, a mitre, a cloak. Facing -Y, `across` runs along +X."""
+    bm = lp.slab(outline, depth, 0.2 * depth)  # a plate in YZ, thick along X
+    turn = Vector((1, 0, 0)).rotation_difference(Vector(toward)).to_matrix().to_4x4()
+    return place(bm, Matrix.Translation(at) @ turn)
+
+
 def star(radius, depth, at, toward=(0, -1, 0), points=5):
     """A flat star `depth` thick, its face toward `toward`, one point up: the emblem both teams wear."""
     outline = []
@@ -184,23 +201,24 @@
         r = radius if i % 2 == 0 else 0.45 * radius
         a = math.pi / 2 + i * math.pi / points
         outline.append((r * math.cos(a), r * math.sin(a)))
-    bm = lp.slab(outline, depth, 0.2 * depth)  # a plate in YZ, thick along X
-    turn = Vector((1, 0, 0)).rotation_difference(Vector(toward)).to_matrix().to_4x4()
-    return place(bm, Matrix.Translation(at) @ turn)
+    return plate(outline, depth, at, toward)
 
 
 def body(f, armour='steel', sleeves='steel', legs='steel'):
-    """The parts every humanoid character shares: head with a face, neck, chest, belly, hips, limbs, hands, boots."""
+    """The parts every humanoid character shares: head with a face, neck, chest, belly, hips, limbs, hands, boots.
+    They follow the skeleton, wherever humanoid() put it."""
     P = lp.Part
+    o = f.at('hips') - Vector((0, 0, 0.42))  # how far the skeleton was raised
+    at = lambda x, y, z: o + Vector((x, y, z))  # noqa: E731
     parts = [
-        P(ellipsoid(0.095, 0.09, 0.1, (0, 0, 0.84)), 'skin', 'head'),
-        P(lp.ball(0.012, -0.032, -0.081, 0.85), 'dark', 'head'),
-        P(lp.ball(0.012, 0.032, -0.081, 0.85), 'dark', 'head'),
-        P(lp.ball(0.017, 0, -0.092, 0.825), 'skin', 'head'),
-        P(limb((0, 0, 0.70), (0, 0, 0.77), 0.04), 'skin', 'neck'),
-        P(ellipsoid(0.15, 0.11, 0.12, (0, 0, 0.63)), armour, 'chest'),
-        P(ellipsoid(0.13, 0.10, 0.08, (0, 0, 0.50)), armour, 'spine'),
-        P(ellipsoid(0.12, 0.09, 0.07, (0, 0, 0.43)), 'leather', 'hips'),
+        P(ellipsoid(0.095, 0.09, 0.1, at(0, 0, 0.84)), 'skin', 'head'),
+        P(lp.ball(0.012, *at(-0.032, -0.081, 0.85)), 'dark', 'head'),
+        P(lp.ball(0.012, *at(0.032, -0.081, 0.85)), 'dark', 'head'),
+        P(lp.ball(0.017, *at(0, -0.092, 0.825)), 'skin', 'head'),
+        P(limb(at(0, 0, 0.70), at(0, 0, 0.77), 0.04), 'skin', 'neck'),
+        P(ellipsoid(0.15, 0.11, 0.12, at(0, 0, 0.63)), armour, 'chest'),
+        P(ellipsoid(0.13, 0.10, 0.08, at(0, 0, 0.50)), armour, 'spine'),
+        P(ellipsoid(0.12, 0.09, 0.07, at(0, 0, 0.43)), 'leather', 'hips'),
     ]
     for side, s in SIDES:
         shoulder, elbow, wrist = f.at(f'arm_up_{side}'), f.at(f'arm_low_{side}'), f.at(f'hand_{side}')
````

````diff
--- a/apps/web/scripts/blender/lp.py
+++ b/apps/web/scripts/blender/lp.py
@@ -44,6 +44,7 @@
     'wood': (srgb('#8A5A32'), 0.0, 0.65, 0.0),
     'hair': (srgb('#5A3A22'), 0.0, 0.75, 0.0),
     'white': (srgb('#EDEAE2'), 0.0, 0.8, 0.0),
+    'coat': (srgb('#C9BCA6'), 0.0, 0.7, 0.0),  # the knight's horse
     'glow': (srgb('#FFE9A8'), 0.0, 0.4, 6.0),
 }
 
````

````diff
--- a/apps/web/scripts/blender/live.py
+++ b/apps/web/scripts/blender/live.py
@@ -1,6 +1,10 @@
-"""Builds a piece in the open Blender scene and plays one clip, for tuning it live. In Blender: Text > Open this file,
-set PIECE and CLIP, then Run Script (Alt+P); edit pieces.py or figure.py and run again. It saves and exports nothing:
-npm run living -- <piece> builds the shipped model from the same code."""
+"""Builds a piece in the open Blender scene and plays one clip, for tuning it live. In Blender's Python console:
+
+    P = '/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py'
+    exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': 'rook', 'CLIP': 'attack'})
+
+(or Text > Open this file and Run Script, for the pawn's attack). Edit pieces.py or figure.py and run it again. It
+saves and exports nothing: npm run living -- <piece> builds the shipped model from the same code."""
 import importlib
 import os
 import sys
@@ -8,8 +12,8 @@
 import bpy
 from mathutils import Euler
 
-PIECE = 'pawn'
-CLIP = 'attack'  # idle, walk, attack, hit or die
+PIECE = globals().get('PIECE', 'pawn')  # the console run above passes these in
+CLIP = globals().get('CLIP', 'attack')  # idle, walk, attack, hit or die
 
 space = getattr(bpy.context, 'space_data', None)
 text = space.text if space is not None and space.type == 'TEXT_EDITOR' else None
````

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run living:test && npm run living -- pawn`
Expected: `Ran 48 tests` … `OK`, and `pawn: the clip contract holds`. The pawn's geometry and poses are unchanged
(its skeleton is not raised, and its 3-tuple poses read as size 1), so `pawn-4.glb` is not rebuilt.

- [ ] **Step 5: Commit**

```bash
git add scripts/blender/figure.py scripts/blender/lp.py scripts/blender/live.py scripts/blender/test_figure.py
git commit -m "feat: give the figure growing orbs, a seated rider and shaped plates"
```

---
### Task 8: The tower-shield warden

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (`rook()` replaced)
- Create: `apps/web/public/models/rook-3.glb`; delete `apps/web/public/models/rook-2.glb`
- Modify: `apps/web/src/scene/pieces/models.ts` (the tower-shield warden's line)
- Modify: `apps/web/public/models/CREDITS.md` (the tower-shield warden's row)

**Interfaces:**
- Consumes: `figure.py` as of Task 7 (`humanoid`, `body`, `character`, `through`, `stride`, `recoil`, `plate`,
  `star`, `hoop`, `dome`, `ellipsoid`, `limb`, `REST`); `lp.Part`, `lp.block`, `lp.cone`, `lp.lathe`, `lp.ball`;
  `CHARACTER` clips from `models.ts` (part 1, Task 3).
- Produces: `PIECES['rook']` builds the warden: 20 bones (`humanoid()` plus `weapon` on `hand_r` and `shield` on `arm_low_l`); a closed great helm with an eye slit and a gold bar; big pauldrons; a team surcoat with a gold hem; a mace; a team tower shield 24 cm wide with three merlons on its top edge and a gold star. `attack` pulls the shield in and bashes forward with it (`lift` lunges 6 cm); `hit` braces behind the shield; `die` falls backward with the shield across him.

The clip contract in `lp.check()` is this task's test: the build fails on any breach.

- [ ] **Step 1: Replace the tower-shield warden**

````diff
--- a/apps/web/scripts/blender/pieces.py
+++ b/apps/web/scripts/blender/pieces.py
@@ -6,7 +6,9 @@
 
 from mathutils import Vector
 
-from figure import REST, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, recoil, star, stride, through
+import lp
+from figure import (REST, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, plate, recoil, star, stride,
+                    through)
 from lp import (Part, Piece, arc, ball, block, bounce, bump, cone, crumble, cut, ease, fall, halves, lathe, move, ring,
                 rock, shards_of, shift, slab, span, spline, stretch, tip, topple_angle, turn)
 
@@ -96,36 +98,67 @@
 
 
 def rook():
-    """A tower with five merlons. Nearly still; heavy rocking; a body-slam; merlons fly off, the tower collapses."""
-    r = 0.34
-    profile = spline(foot(r) + [(0.22, 0.30), (0.21, 0.70), (0.225, 0.92), (0.27, 0.98), (0.27, 0.98), (0.27, 1.08),
-                                (0.27, 1.08), (0.20, 1.08), (0.20, 1.08), (0.20, 1.03), (0.20, 1.03), (0, 1.03)])
-    parts = wedges(lathe(profile), [0.6])
-    merlons = [f'm{k}' for k in range(5)]
-    parts += [Part(block(0.07, 0.18, 0.14, (0.235, 0, 1.15), angle=k * TAU / 5), 'team', m) for k, m in enumerate(merlons)]
-    parts += [Part(foot_ring(r), 'trim', 'band'), Part(ring(0.27, 0.012, 0.995), 'trim', 'collar')]
-    shards = [f's{i}' for i in range(6)]
-    parent = {'body': None, **{s: 'body' for s in shards}, **{m: 'body' for m in merlons}, 'band': 'body', 'collar': 'body'}
-
-    def idle(t):  # nearly still; each merlon twitches once per loop, at its own moment
-        return {'body': rock(0.008 * math.sin(TAU * t), r),
-                **{m: move(z=0.012 * bump(t, 0.1 + k / 5, 0.05)) for k, m in enumerate(merlons)}}
-
-    def walk(u):  # heavy side-to-side rocking, upright on each footfall; the merlons rattle
-        rattle = move(z=0.008 * abs(math.sin(2 * TAU * u)))
-        return {'body': move(z=0.02 * abs(math.sin(TAU * u))) @ rock(0.10 * math.sin(TAU * u), r),
-                **{m: rattle for m in merlons}}
-
-    def attack(t):  # tilts back, body-slams forward at the contact; the merlons rattle as it lands
-        body = move(y=ease(t, 0, 0.02, 0.04, -0.06, 0, 0)) @ tip(ease(t, 0, -0.10, -0.20, 0.55, 0.10, 0), r)
-        return {'body': body, **{m: move(z=0.03 * bump(t, 0.64 + 0.02 * k, 0.1)) for k, m in enumerate(merlons)}}
+    """Warden: heavy plate, a closed great helm, a tall tower shield with a battlement top on the left arm, a mace.
+    Bashes with the shield, braces behind it when hit, falls backward with the shield across him."""
+    f = humanoid()
+    f.add('weapon', 'hand_r', f.at('hand_r'))
+    f.add('shield', 'arm_low_l', f.at('arm_low_l'))
+    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
+    face = Vector((0.15, -1, 0)).normalized()
+    centre = f.at('arm_low_l') + Vector((0.08, -0.085, -0.05))
+    w, top, notch = 0.12, 0.19, 0.045  # half its width; the top of its merlons; how deep the notches are
+    battlement = [(-w, -0.21), (w, -0.21), (w, top), (0.6 * w, top), (0.6 * w, top - notch), (0.2 * w, top - notch),
+                  (0.2 * w, top), (-0.2 * w, top), (-0.2 * w, top - notch), (-0.6 * w, top - notch), (-0.6 * w, top),
+                  (-w, top)]
+    parts = body(f) + [
+        Part(lathe([(0, 0.74), (0.106, 0.74), (0.108, 0.90), (0.10, 0.97), (0, 0.975)], 24), 'steel', 'head'),  # great helm
+        Part(block(0.13, 0.03, 0.016, (0, -0.10, 0.855)), 'dark', 'head'),  # its eye slit
+        Part(block(0.014, 0.02, 0.15, (0, -0.104, 0.86)), 'trim', 'head'),  # a gold bar down the face
+        Part(hoop(0.107, 0.01, (0, 0, 0.94)), 'trim', 'head'),
+        Part(ellipsoid(0.085, 0.085, 0.065, f.at('arm_up_l') + Vector((0.02, 0, 0.02))), 'steel', 'arm_up_l'),
+        Part(ellipsoid(0.085, 0.085, 0.065, f.at('arm_up_r') + Vector((-0.02, 0, 0.02))), 'steel', 'arm_up_r'),
+        Part(lathe([(0, 0.26), (0.18, 0.26), (0.162, 0.36), (0.148, 0.45), (0.14, 0.53), (0, 0.53)], 24), 'team',
+             'hips'),  # surcoat
+        Part(hoop(0.178, 0.011, (0, 0, 0.263)), 'trim', 'hips'),
+        Part(hoop(0.133, 0.014, (0, 0, 0.47)), 'leather', 'spine'),
+        Part(limb(grip + Vector((0, 0, -0.06)), grip + Vector((0, 0, 0.26)), 0.014), 'wood', 'weapon'),  # mace haft
+        Part(lp.ball(0.048, *(grip + Vector((0, 0, 0.30)))), 'steel', 'weapon'),  # mace head
+        Part(plate(battlement, 0.035, centre, face), 'team', 'shield'),
+        Part(star(0.055, 0.012, centre + face * 0.022 + Vector((0, 0, -0.02)), face), 'trim', 'shield'),
+    ]
 
-    die = crumble(parts, parent, r, merlons + shards + ['band', 'collar'], recoil=0.2, spread=0.22, jump=0.06, tumble=0.9,
-                  special={**{m: {'spread': 0.45, 'jump': 0.35, 'tumble': 2.4} for m in merlons},
-                           **{s: {'start': 0.42} for s in shards}, **FLAT_BANDS})
-    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)
+    def facing_ahead(arm_up, arm_low, chest=0.0, spine=0.0):
+        """The shield's forward turn that keeps its face toward the facing, for these arm and body turns."""
+        return arm_up + arm_low - chest - spine
 
+    def idle(t):  # slow, heavy breathing
+        b = math.sin(TAU * t)
+        return {'chest': 0.015 * b, 'head': (0, 0, 0.03 * math.sin(2 * TAU * t))}
 
+    def walk(u):  # heavy steps, the shield carried in front
+        return {**stride(u, legs=0.35, knees=0.5, arms=0.12, sway=0.07, lean=0.04),
+                'arm_up_l': 0.35, 'arm_low_l': 0.9, 'shield': facing_ahead(0.35, 0.9, 0.04)}
+
+    windup = {'arm_up_l': 0.1, 'arm_low_l': 1.4, 'shield': facing_ahead(0.1, 1.4, -0.12, -0.05),
+              'chest': (-0.12, 0, 0.35), 'spine': -0.05, 'arm_up_r': -0.2, 'leg_up_l': 0.2, 'leg_up_r': -0.2}
+    strike = {'arm_up_l': 1.2, 'arm_low_l': 0.3, 'shield': facing_ahead(1.2, 0.3, 0.2, 0.12),
+              'chest': (0.2, 0, -0.4), 'spine': 0.12, 'arm_up_r': -0.35, 'lift': (0, -0.06, 0),
+              'leg_up_l': 0.55, 'leg_low_l': -0.3, 'leg_up_r': -0.4}
+    follow = {**strike, 'arm_up_l': 1.0, 'shield': facing_ahead(1.0, 0.3, 0.2, 0.12), 'lift': (0, -0.04, 0)}
+    struck = {**recoil(0.25), 'arm_up_l': 0.45, 'arm_low_l': 1.1, 'shield': facing_ahead(0.45, 1.1, -0.125, -0.25)}
+    staggered = {**struck, 'spine': -0.4, 'root': -0.15}
+    down = {'root': -1.45, 'spine': -0.1, 'head': 0.3, 'arm_up_l': 0.6, 'arm_low_l': 1.6,
+            'shield': facing_ahead(0.6, 1.6, 0, -0.1), 'arm_up_r': 0.2, 'leg_up_l': 0.3, 'leg_up_r': 0.1}  # on his back
+
+    return character(f, parts, {
+        'idle': (90, idle),
+        'walk': (30, walk),
+        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
+        'hit': (9, lambda t: through(t, REST, struck)),
+        'die': (30, lambda t: through(t, struck, staggered, down, down)),
+    })
+
+
 PIECES['rook'] = rook
 
 
````

- [ ] **Step 2: Build it headless**

Run: `npm run living -- rook`
Expected: `rook: the clip contract holds; wrote …/assets-src/living/rook.glb`.

- [ ] **Step 3: Look at the five previews**

Open `assets-src/living/rook-{rest,walk,attack,hit,die}.png` with the Read tool. Expected: a helmed warden in a red surcoat with a battlement-topped red shield on his left arm at rest; heavy steps with the shield carried in front; the shield driven forward at the strike; leaning back behind the shield when hit; lying on his back, shield beside him, nothing below the floor.

- [ ] **Step 4: Tune it live with the owner in Blender**

Load the `anthropic-skills:computer-use` skill. `request_access` for Blender if this session has no grant. If
Blender is not running, start it from the shell: `open -na Blender`, and close its splash. In the Scripting tab's
Python console (click into it, type, press Return):

```python
P = '/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py'; exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': 'rook', 'CLIP': 'attack'})
```

Expected: `rook: the clip contract holds; playing attack (30 frames)`. Switch to the Layout tab: the piece stands
in a three-quarter front view. Set frames by clicking the timeline ruler (frame 18 is the strike); Space plays. Show
each clip (rerun with `'CLIP': 'walk'`, `'hit'`, `'die'`; the up arrow recalls the line) and ask the owner what to
change. Make every change in `pieces.py` with the Edit tool and rerun the line; a pose set by hand in Pose Mode is read
from the N panel and written back as `(forward, side, twist)`. Continue when the owner approves the tower-shield warden.

- [ ] **Step 5: Rebuild headless, optimise it into the game, swap the file**

```bash
npm run living -- rook
npm run models -- assets-src/living/rook.glb public/models/rook-3.glb
git rm public/models/rook-2.glb
ls -l public/models/rook-3.glb
```

Expected: the contract holds; at most 256,000 bytes.

- [ ] **Step 6: Point the game at it and record it**

In `apps/web/src/scene/pieces/models.ts`, change the tower-shield warden's line to:

```ts
  r: { url: '/models/rook-3.glb', clips: CHARACTER },
```

In `apps/web/public/models/CREDITS.md`, change the row `` | `rook-2.glb` | rook | `` to `` | `rook-3.glb` | rook (character) | ``.

- [ ] **Step 7: Run the model tests**

Run (Postgres up): `npx vitest run src/scene/pieces && npm run living:test`
Expected: 2 test files pass (the new file is listed, on disk and has every clip); `Ran 48 tests` … `OK`.

- [ ] **Step 8: Commit**

```bash
git add scripts/blender public/models src/scene/pieces/models.ts
git commit -m "feat: draw the rook as a tower-shield warden character"
```

---
### Task 9: The cleric

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (`bishop()` replaced)
- Create: `apps/web/public/models/bishop-4.glb`; delete `apps/web/public/models/bishop-3.glb`
- Modify: `apps/web/src/scene/pieces/models.ts` (the cleric's line)
- Modify: `apps/web/public/models/CREDITS.md` (the cleric's row)

**Interfaces:**
- Consumes: `figure.py` as of Task 7 (`humanoid`, `body`, `character`, `through`, `stride`, `recoil`, `plate`,
  `star`, `hoop`, `dome`, `ellipsoid`, `limb`, `REST`); `lp.Part`, `lp.block`, `lp.cone`, `lp.lathe`, `lp.ball`;
  `CHARACTER` clips from `models.ts` (part 1, Task 3).
- Produces: `PIECES['bishop']` builds the cleric: 20 bones (`humanoid()` plus `weapon` on `hand_r` and `flash` on `weapon`, the glowing gem at the crook); a team mitre with a gold band and stripe; a white beard and moustache; a white alb with a team shoulder cape and a gold cross; team vestments to the floor with a gold hem; a gold crozier. `attack` raises the crozier back over his shoulder, then thrusts it level as the gem swells four times; `hit` staggers leaning on the crozier; `die` falls on his left side.

The clip contract in `lp.check()` is this task's test: the build fails on any breach.

- [ ] **Step 1: Replace the cleric**

````diff
--- a/apps/web/scripts/blender/pieces.py
+++ b/apps/web/scripts/blender/pieces.py
@@ -163,47 +163,61 @@
 
 
 def bishop():
-    """A mitre with a slit and a ball finial. Praying tilt; smooth glide; a spin and a thrust; the mitre splits and
-    flies off, the body falls over."""
-    r = 0.3
-    profile = spline(foot(r) + [(0.13, 0.35), (0.095, 0.55), (0.09, 0.62), (0.09, 0.62), (0.15, 0.645),
-                                (0.15, 0.675), (0.085, 0.70), (0.085, 0.70), (0, 0.70)])
-    mitre = lathe(spline([(0, 0.69), (0.10, 0.70), (0.15, 0.80), (0.15, 0.90), (0.10, 1.02), (0.035, 1.12),
-                          (0.035, 1.12), (0, 1.12)]))
-    slit_at, slit = (0.0, -0.02, 0.95), (0.0, 0.55, 0.83)  # the cut runs up from the back to the front of the mitre
-    low, high = halves(mitre, slit_at, slit)
-    mitre.free()
-    gap = 0.006  # opens the slit so it shows at rest
-    shift(low, [-gap * c for c in slit])
-    shift(high, [gap * c for c in slit])
-    parts = [Part(lathe(profile), 'team', 'body'), Part(foot_ring(r), 'trim', 'body'),
-             Part(ring(0.15, 0.012, 0.66), 'trim', 'body'), Part(low, 'team', 'mitre_lo'),
-             Part(high, 'team', 'mitre_hi'), Part(ball(0.05, z=1.17), 'trim', 'mitre_hi')]
-    parent = {'body': None, 'mitre_lo': 'body', 'mitre_hi': 'body'}
-    hat = shards_of(parts, parent, ['mitre_hi'])[0]
-    lying = topple_angle([v.co for p in parts if p.bone != 'mitre_hi' for v in p.mesh.verts], r)
+    """Cleric: white beard, tall mitre, long vestments to the floor, a gold crozier with a glowing gem. Raises the
+    crozier and thrusts it with a flash of light, staggers leaning on it when hit, slumps to the ground beside it."""
+    f = humanoid()
+    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
+    gem = grip + Vector((0, -0.05, 0.60))
+    f.add('weapon', 'hand_r', f.at('hand_r'))
+    f.add('flash', 'weapon', gem)
+    mitre = [(-0.085, 0), (0.085, 0), (0.075, 0.12), (0.04, 0.19), (0, 0.22), (-0.04, 0.19), (-0.075, 0.12)]
+    parts = body(f, armour='white', sleeves='team', legs='white') + [
+        Part(plate(mitre, 0.12, (0, 0, 0.885)), 'team', 'head'),
+        Part(block(0.172, 0.125, 0.022, (0, 0, 0.895)), 'trim', 'head'),  # the mitre's gold band
+        Part(block(0.022, 0.125, 0.19, (0, 0, 0.985)), 'trim', 'head'),  # and its upright stripe
+        Part(ellipsoid(0.075, 0.05, 0.075, (0, -0.07, 0.775)), 'white', 'head'),  # beard
+        Part(ellipsoid(0.05, 0.022, 0.016, (0, -0.092, 0.808)), 'white', 'head'),  # moustache
+        Part(ellipsoid(0.165, 0.125, 0.065, (0, 0, 0.69)), 'team', 'chest'),  # a short cape on the shoulders
+        Part(block(0.02, 0.012, 0.11, (0, -0.122, 0.60)), 'trim', 'chest'),  # a gold cross on the chest
+        Part(block(0.07, 0.012, 0.02, (0, -0.122, 0.62)), 'trim', 'chest'),
+        Part(lathe([(0, 0.03), (0.2, 0.03), (0.17, 0.2), (0.145, 0.4), (0.135, 0.55), (0, 0.55)], 24), 'team',
+             'hips'),  # vestments to the floor
+        Part(hoop(0.198, 0.011, (0, 0, 0.034)), 'trim', 'hips'),
+        Part(limb(grip + Vector((0, 0, -0.40)), grip + Vector((0, 0, 0.56)), 0.013), 'trim', 'weapon'),  # crozier
+        Part(hoop(0.045, 0.011, gem + Vector((0, 0.0, 0.04)), (1, 0, 0)), 'trim', 'weapon'),  # its crook
+        Part(lp.ball(0.026, *gem), 'glow', 'flash'),
+    ]
+
+    def level(arm_up, arm_low, chest=0.0, spine=0.0):
+        """The crozier's forward turn that holds it level, pointing ahead."""
+        return math.pi / 2 + arm_up + arm_low - chest - spine
 
     def idle(t):  # a gentle forward tilt, as if praying
-        return {'body': tip(0.04 * (0.5 - 0.5 * math.cos(TAU * t)), r)}
+        b = math.sin(TAU * t)
+        return {'chest': 0.04 + 0.02 * b, 'head': 0.08 + 0.03 * b}
 
-    def walk(u):  # a smooth glide with little bounce
-        return {'body': bounce(u, 0.025, 0.05, 0.02)}
+    def walk(u):  # a smooth, short-stepped glide
+        return {**stride(u, legs=0.22, knees=0.35, arms=0.1, sway=0.03, lean=0.05), 'arm_up_r': 0.05}
 
-    def attack(t):  # one full turn, then a thrust of the mitre's point at the contact
-        spin = turn(TAU * ease(span(t, 0.0, 0.45), 0, 1), 'Z')
-        return {'body': move(y=ease(t, 0, 0, 0.02, -0.08, 0.01, 0)) @ tip(ease(t, 0, -0.04, -0.12, 0.38, 0.06, 0), r)
-                @ spin}
+    windup = {'arm_up_r': 2.0, 'arm_low_r': 0.3, 'chest': (-0.1, 0, -0.25), 'spine': -0.08, 'head': -0.15,
+              'flash': (0, 0, 0, 1.6)}
+    strike = {'arm_up_r': 1.35, 'arm_low_r': 0.1, 'weapon': level(1.35, 0.1, 0.12, 0.06), 'chest': (0.12, 0, 0.3),
+              'spine': 0.06, 'flash': (0, 0, 0, 4.0), 'leg_up_l': 0.3, 'leg_up_r': -0.2}
+    follow = {**strike, 'arm_up_r': 1.2, 'weapon': level(1.2, 0.1, 0.12, 0.06), 'flash': (0, 0, 0, 2.0)}
+    struck = {**recoil(0.3), 'arm_up_r': 0.25}  # leaning on the crozier
+    staggered = {**struck, 'spine': -0.4, 'root': (0, 0.2, 0)}
+    down = {'root': (0, 1.45, 0), 'spine': 0.3, 'head': (0.3, 0.2, 0), 'arm_up_r': 0.5, 'arm_up_l': 0.4,
+            'leg_up_l': 0.4, 'leg_low_l': -0.5, 'leg_up_r': 0.2}  # on his left side
 
-    def die(t):  # a jolt back, then the mitre's top flies off behind while the body falls forward
-        if t < 0.3:
-            return {'body': tip(-0.25 * math.sin(math.pi * span(t, 0, 0.3)), r)}
-        body = tip(ease(span(t, 0.35, 0.9), 0, lying), r)
-        flying = fall(hat, span(t, 0.3, 0.95), spread=0.3, jump=0.25, tumble=1.8, towards=(0.6, 0.8, 0))
-        return {'body': body, 'mitre_hi': body.inverted() @ flying}
+    return character(f, parts, {
+        'idle': (90, idle),
+        'walk': (30, walk),
+        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
+        'hit': (9, lambda t: through(t, REST, struck)),
+        'die': (30, lambda t: through(t, struck, staggered, down, down)),
+    })
 
-    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)
 
-
 PIECES['bishop'] = bishop
 
 
````

- [ ] **Step 2: Build it headless**

Run: `npm run living -- bishop`
Expected: `bishop: the clip contract holds; wrote …/assets-src/living/bishop.glb`.

- [ ] **Step 3: Look at the five previews**

Open `assets-src/living/bishop-{rest,walk,attack,hit,die}.png` with the Read tool. Expected: a bearded cleric in a red mitre and red vestments to the floor with a gold crozier at rest; a short-stepped glide; the crozier level and the gem flared into a large glowing ball at the strike; leaning back when hit; lying on his left side with the crozier, nothing below the floor.

- [ ] **Step 4: Tune it live with the owner in Blender**

Load the `anthropic-skills:computer-use` skill. `request_access` for Blender if this session has no grant. If
Blender is not running, start it from the shell: `open -na Blender`, and close its splash. In the Scripting tab's
Python console (click into it, type, press Return):

```python
P = '/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py'; exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': 'bishop', 'CLIP': 'attack'})
```

Expected: `bishop: the clip contract holds; playing attack (30 frames)`. Switch to the Layout tab: the piece stands
in a three-quarter front view. Set frames by clicking the timeline ruler (frame 18 is the strike); Space plays. Show
each clip (rerun with `'CLIP': 'walk'`, `'hit'`, `'die'`; the up arrow recalls the line) and ask the owner what to
change. Make every change in `pieces.py` with the Edit tool and rerun the line; a pose set by hand in Pose Mode is read
from the N panel and written back as `(forward, side, twist)`. Continue when the owner approves the cleric.

- [ ] **Step 5: Rebuild headless, optimise it into the game, swap the file**

```bash
npm run living -- bishop
npm run models -- assets-src/living/bishop.glb public/models/bishop-4.glb
git rm public/models/bishop-3.glb
ls -l public/models/bishop-4.glb
```

Expected: the contract holds; at most 256,000 bytes.

- [ ] **Step 6: Point the game at it and record it**

In `apps/web/src/scene/pieces/models.ts`, change the cleric's line to:

```ts
  b: { url: '/models/bishop-4.glb', clips: CHARACTER },
```

In `apps/web/public/models/CREDITS.md`, change the row `` | `bishop-3.glb` | bishop | `` to `` | `bishop-4.glb` | bishop (character) | ``.

- [ ] **Step 7: Run the model tests**

Run (Postgres up): `npx vitest run src/scene/pieces && npm run living:test`
Expected: 2 test files pass (the new file is listed, on disk and has every clip); `Ran 48 tests` … `OK`.

- [ ] **Step 8: Commit**

```bash
git add scripts/blender public/models src/scene/pieces/models.ts
git commit -m "feat: draw the bishop as a cleric character"
```

---
### Task 10: The queen

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (`queen()` replaced)
- Create: `apps/web/public/models/queen-3.glb`; delete `apps/web/public/models/queen-2.glb`
- Modify: `apps/web/src/scene/pieces/models.ts` (the queen's line)
- Modify: `apps/web/public/models/CREDITS.md` (the queen's row)

**Interfaces:**
- Consumes: `figure.py` as of Task 7 (`humanoid`, `body`, `character`, `through`, `stride`, `recoil`, `plate`,
  `star`, `hoop`, `dome`, `ellipsoid`, `limb`, `REST`); `lp.Part`, `lp.block`, `lp.cone`, `lp.lathe`, `lp.ball`;
  `CHARACTER` clips from `models.ts` (part 1, Task 3).
- Produces: `PIECES['queen']` builds the queen: 20 bones (`humanoid()` plus `flash` on `hand_r`, the orb in her hand, and `gown` on `hips`); a gold crown of six points; brown hair falling down her back; a team bodice and sleeves; a gold necklace and girdle; a floor-length team gown with a gold hem. `attack` draws the hand back, then thrusts the orb, which swells three and a half times; `hit` steps back with her left arm raised; `die` sinks to her knees (shins fold back, the gown shrinks to 0.75 about the waist) and slumps forward.

The clip contract in `lp.check()` is this task's test: the build fails on any breach.

- [ ] **Step 1: Replace the queen**

````diff
--- a/apps/web/scripts/blender/pieces.py
+++ b/apps/web/scripts/blender/pieces.py
@@ -222,37 +222,50 @@
 
 
 def queen():
-    """A coronet of eight balls on a narrow waist. Hip sway; graceful hops; a whirling lash with the coronet flaring;
-    the coronet pops off and the body shatters."""
-    r = 0.32
-    profile = spline(foot(r) + [(0.15, 0.32), (0.10, 0.52), (0.09, 0.62), (0.10, 0.72), (0.10, 0.82), (0.10, 0.82),
-                                (0.17, 0.85), (0.17, 0.885), (0.10, 0.91), (0.10, 0.91), (0.12, 1.0), (0.16, 1.12),
-                                (0.19, 1.21), (0.19, 1.21), (0.19, 1.23), (0.19, 1.23), (0.12, 1.24), (0.06, 1.27),
-                                (0, 1.28)])
-    parts = wedges(lathe(profile), [0.7])
-    parts += [Part(ring(0.185, 0.014, 1.22), 'trim', 'crown'), Part(ball(0.045, z=1.315), 'trim', 'crown')]
-    parts += [Part(ball(0.028, 0.175 * math.cos(a), 0.175 * math.sin(a), 1.255), 'trim', 'crown')
-              for a in (k * TAU / 8 for k in range(8))]
-    parts += [Part(foot_ring(r), 'trim', 'band'), Part(ring(0.17, 0.012, 0.87), 'trim', 'collar')]
-    shards = [f's{i}' for i in range(6)]
-    parent = {'body': None, **{s: 'body' for s in shards}, 'crown': 'body', 'band': 'body', 'collar': 'body'}
+    """Crown, brown hair, a long gown with gold trim, a glowing orb in her right hand. Draws the hand back and thrusts
+    the orb, which flares; steps back with an arm raised when hit; sinks to her knees, slumped."""
+    f = humanoid()
+    orb = f.at('hand_r') + Vector((0, -0.035, -0.045))
+    f.add('flash', 'hand_r', orb)
+    f.add('gown', 'hips', (0, 0, 0.5))
+    points = [Part(cone(0.017, 0.05, (0.085 * math.cos(a), 0.08 * math.sin(a), 0.962), 8), 'trim', 'head')
+              for a in (k * TAU / 6 for k in range(6))]
+    parts = body(f, armour='team', sleeves='team', legs='team') + points + [
+        Part(ellipsoid(0.103, 0.095, 0.105, (0, 0.02, 0.855)), 'hair', 'head'),
+        Part(ellipsoid(0.085, 0.05, 0.12, (0, 0.065, 0.75)), 'hair', 'head'),  # hair down her back
+        Part(hoop(0.087, 0.013, (0, 0, 0.935)), 'trim', 'head'),  # crown
+        Part(hoop(0.05, 0.008, (0, 0, 0.715)), 'trim', 'chest'),  # necklace
+        Part(hoop(0.128, 0.012, (0, 0, 0.5)), 'trim', 'spine'),  # girdle
+        Part(lathe([(0, 0.03), (0.24, 0.03), (0.2, 0.15), (0.15, 0.35), (0.125, 0.5), (0, 0.5)], 28), 'team',
+             'gown'),
+        Part(hoop(0.238, 0.012, (0, 0, 0.034)), 'trim', 'gown'),
+        Part(lp.ball(0.03, *orb), 'glow', 'flash'),
+    ]
 
     def idle(t):  # a slow sway of the hips
-        return {'body': rock(0.03 * math.sin(TAU * t), r) @ turn(0.06 * math.sin(TAU * t), 'Z')}
+        b = math.sin(TAU * t)
+        return {'hips': (0, 0, 0.05 * b), 'chest': (0, 0, -0.04 * b), 'head': (0.02, 0, 0.03 * b)}
 
-    def walk(u):  # light, graceful hops with a sway
-        return {'body': bounce(u, 0.06, 0.08, 0.05) @ turn(0.05 * math.sin(TAU * u), 'Z')}
+    def walk(u):  # light, graceful steps
+        return stride(u, legs=0.25, knees=0.4, arms=0.25, sway=0.06, lean=0.02)
 
-    def attack(t):  # whirls once, leaning out further as she turns, and lashes forward at the contact
-        whirl = -TAU * (1 - ease(span(t, 0.0, 0.6), 0, 1))
-        lean = ease(t, 0, 0.12, 0.22, 0.35, 0.05, 0)
-        flare = 1 + 0.25 * bump(t, 0.6, 0.2)  # the coronet's points spread out at the strike
-        return {'body': turn(whirl, 'Z') @ tip(lean, r), 'crown': stretch(flare, flare, 1, (0, 0, 1.25))}
+    windup = {'arm_up_r': -0.7, 'arm_low_r': 0.6, 'chest': (-0.05, 0, -0.3), 'head': (0, 0, -0.15),
+              'arm_up_l': 0.3, 'flash': (0, 0, 0, 1.5)}
+    strike = {'arm_up_r': 1.55, 'arm_low_r': 0.05, 'chest': (0.1, 0, 0.35), 'spine': 0.05,
+              'flash': (0, 0, 0, 3.5), 'arm_up_l': -0.3, 'leg_up_l': 0.25, 'leg_up_r': -0.2}
+    follow = {**strike, 'arm_up_r': 1.4, 'flash': (0, 0, 0, 1.8)}
+    struck = {**recoil(0.3), 'arm_up_l': 1.2, 'arm_low_l': 1.0}  # an arm raised against the blow
+    staggered = {**struck, 'spine': -0.35}
+    down = {'leg_low_l': -1.6, 'leg_low_r': -1.6, 'gown': (0, 0, 0, 0.75), 'spine': 0.45, 'chest': 0.2, 'head': 0.45,
+            'arm_up_l': 0.3, 'arm_up_r': 0.3, 'arm_low_l': 0.4, 'arm_low_r': 0.4}  # on her knees
 
-    die = crumble(parts, parent, r, ['crown'] + shards + ['band', 'collar'], spread=0.26, jump=0.12, tumble=1.3,
-                  special={'crown': {'spread': 0.2, 'jump': 0.45, 'tumble': 2.5}, **{s: {'start': 0.38} for s in shards},
-                           **FLAT_BANDS})
-    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)
+    return character(f, parts, {
+        'idle': (90, idle),
+        'walk': (30, walk),
+        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
+        'hit': (9, lambda t: through(t, REST, struck)),
+        'die': (30, lambda t: through(t, struck, staggered, down, down)),
+    })
 
 
 PIECES['queen'] = queen
````

- [ ] **Step 2: Build it headless**

Run: `npm run living -- queen`
Expected: `queen: the clip contract holds; wrote …/assets-src/living/queen.glb`.

- [ ] **Step 3: Look at the five previews**

Open `assets-src/living/queen-{rest,walk,attack,hit,die}.png` with the Read tool. Expected: a crowned queen in a long red gown, a small glowing orb in her right hand at rest; light steps; the orb flared and held out at the strike; an arm raised against the blow when hit; kneeling and slumped forward at the end, nothing below the floor.

- [ ] **Step 4: Tune it live with the owner in Blender**

Load the `anthropic-skills:computer-use` skill. `request_access` for Blender if this session has no grant. If
Blender is not running, start it from the shell: `open -na Blender`, and close its splash. In the Scripting tab's
Python console (click into it, type, press Return):

```python
P = '/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py'; exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': 'queen', 'CLIP': 'attack'})
```

Expected: `queen: the clip contract holds; playing attack (30 frames)`. Switch to the Layout tab: the piece stands
in a three-quarter front view. Set frames by clicking the timeline ruler (frame 18 is the strike); Space plays. Show
each clip (rerun with `'CLIP': 'walk'`, `'hit'`, `'die'`; the up arrow recalls the line) and ask the owner what to
change. Make every change in `pieces.py` with the Edit tool and rerun the line; a pose set by hand in Pose Mode is read
from the N panel and written back as `(forward, side, twist)`. Continue when the owner approves the queen.

- [ ] **Step 5: Rebuild headless, optimise it into the game, swap the file**

```bash
npm run living -- queen
npm run models -- assets-src/living/queen.glb public/models/queen-3.glb
git rm public/models/queen-2.glb
ls -l public/models/queen-3.glb
```

Expected: the contract holds; at most 256,000 bytes.

- [ ] **Step 6: Point the game at it and record it**

In `apps/web/src/scene/pieces/models.ts`, change the queen's line to:

```ts
  q: { url: '/models/queen-3.glb', clips: CHARACTER },
```

In `apps/web/public/models/CREDITS.md`, change the row `` | `queen-2.glb` | queen | `` to `` | `queen-3.glb` | queen (character) | ``.

- [ ] **Step 7: Run the model tests**

Run (Postgres up): `npx vitest run src/scene/pieces && npm run living:test`
Expected: 2 test files pass (the new file is listed, on disk and has every clip); `Ran 48 tests` … `OK`.

- [ ] **Step 8: Commit**

```bash
git add scripts/blender public/models src/scene/pieces/models.ts
git commit -m "feat: draw the queen as a queen character"
```

---
### Task 11: The king

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (`king()` replaced; and the spec)
- Create: `apps/web/public/models/king-4.glb`; delete `apps/web/public/models/king-3.glb`
- Modify: `apps/web/src/scene/pieces/models.ts` (the king's line)
- Modify: `apps/web/public/models/CREDITS.md` (the king's row)

**Interfaces:**
- Consumes: `figure.py` as of Task 7 (`humanoid`, `body`, `character`, `through`, `stride`, `recoil`, `plate`,
  `star`, `hoop`, `dome`, `ellipsoid`, `limb`, `REST`); `lp.Part`, `lp.block`, `lp.cone`, `lp.lathe`, `lp.ball`;
  `CHARACTER` clips from `models.ts` (part 1, Task 3).
- Produces: `PIECES['king']` builds the king: 20 bones (`humanoid()` plus `weapon` on `hand_r` and `cloak` on `chest`, hanging from the shoulders); a gold crown of five points over a team velvet cap; brown hair, beard and moustache; silver armour with a team tabard, gold hem and gold belt; a team cloak with a white fur hem and a white fur collar; a sword with a gold crossguard and pommel. `attack` raises the sword high behind his head, then slashes it level and on down; `hit` steps back with the cloak swinging out; `die` falls forward, face turned aside, the cloak flat over his back, the crown kept.

The clip contract in `lp.check()` is this task's test: the build fails on any breach.

- [ ] **Step 1: Replace the king**

````diff
--- a/apps/web/scripts/blender/pieces.py
+++ b/apps/web/scripts/blender/pieces.py
@@ -272,45 +272,62 @@
 
 
 def king():
-    """The tallest, with a cross. Stately breathing; heavy hops; rises and hammers down; the cross falls first, then
-    the king topples slowly and cracks."""
-    r = 0.34
-    profile = spline(foot(r) + [(0.16, 0.35), (0.115, 0.60), (0.11, 0.80), (0.11, 0.88), (0.11, 0.88), (0.18, 0.91),
-                                (0.18, 0.945), (0.11, 0.97), (0.11, 0.97), (0.13, 1.07), (0.17, 1.20), (0.20, 1.27),
-                                (0.20, 1.27), (0.20, 1.30), (0.20, 1.30), (0.14, 1.31), (0.07, 1.345), (0, 1.355)])
-    parts = wedges(lathe(profile), [0.75])
-    parts += [Part(block(0.065, 0.065, 0.25, (0, 0, 1.46)), 'trim', 'cross'),
-              Part(block(0.19, 0.065, 0.065, (0, 0, 1.50)), 'trim', 'cross'),
-              Part(foot_ring(r), 'trim', 's0'), Part(ring(0.18, 0.012, 0.93), 'trim', 's3'),
-              Part(ring(0.20, 0.014, 1.285), 'trim', 's3')]
-    names = [f's{i}' for i in range(6)]
-    parent = {'body': None, **{s: 'body' for s in names}, 'cross': 'body'}
-    cross = shards_of(parts, parent, ['cross'])[0]
-    shards = shards_of(parts, parent, names)
-    lying = topple_angle([v.co for p in parts if p.bone != 'cross' for v in p.mesh.verts], r)
+    """Crown, beard, a fur-trimmed cloak, silver armour, a sword. Raises the sword and slashes down, steps back with
+    the cloak swinging when hit, falls forward with the cloak over him and the crown kept."""
+    f = humanoid()
+    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
+    f.add('weapon', 'hand_r', f.at('hand_r'))
+    f.add('cloak', 'chest', (0, 0.13, 0.70), True)
+    cloak = [(-0.21, -0.55), (0.21, -0.55), (0.16, 0), (-0.16, 0)]
+    points = [Part(cone(0.02, 0.06, (0.093 * math.cos(a), 0.088 * math.sin(a), 0.965), 8), 'trim', 'head')
+              for a in (k * TAU / 5 + TAU / 4 for k in range(5))]
+    parts = body(f) + points + [
+        Part(ellipsoid(0.1, 0.092, 0.09, (0, 0.02, 0.86)), 'hair', 'head'),
+        Part(ellipsoid(0.08, 0.055, 0.075, (0, -0.07, 0.785)), 'hair', 'head'),  # beard
+        Part(ellipsoid(0.05, 0.022, 0.016, (0, -0.092, 0.808)), 'hair', 'head'),  # moustache
+        Part(dome(0.082, 0.925), 'team', 'head'),  # the velvet cap inside the crown
+        Part(hoop(0.095, 0.015, (0, 0, 0.93)), 'trim', 'head'),  # crown
+        Part(lathe([(0, 0.29), (0.19, 0.29), (0.172, 0.36), (0.148, 0.45), (0.14, 0.53), (0, 0.53)], 24), 'team',
+             'hips'),  # tabard
+        Part(hoop(0.188, 0.011, (0, 0, 0.293)), 'trim', 'hips'),
+        Part(hoop(0.133, 0.014, (0, 0, 0.47)), 'trim', 'spine'),  # a gold belt
+        Part(plate(cloak, 0.025, (0, 0.13, 0.70), (0, 1, 0)), 'team', 'cloak'),
+        Part(block(0.44, 0.04, 0.035, (0, 0.13, 0.155)), 'white', 'cloak'),  # its fur hem
+        Part(hoop(0.12, 0.032, (0, 0.01, 0.715)), 'white', 'chest'),  # fur collar
+        Part(block(0.05, 0.014, 0.50, grip + Vector((0, 0, 0.32))), 'steel', 'weapon'),  # blade
+        Part(block(0.15, 0.024, 0.024, grip + Vector((0, 0, 0.065))), 'trim', 'weapon'),  # crossguard
+        Part(lp.ball(0.022, *(grip + Vector((0, 0, -0.055)))), 'trim', 'weapon'),  # pommel
+    ]
 
-    def idle(t):  # slow and stately breathing
-        b = 0.5 - 0.5 * math.cos(TAU * t)
-        return {'body': rock(0.01 * math.sin(TAU * t), r) @ stretch(1 - 0.004 * b, 1 - 0.004 * b, 1 + 0.008 * b)}
+    def level(arm_up, arm_low, chest=0.0, spine=0.0):
+        """The sword's forward turn that holds it level, point ahead."""
+        return math.pi / 2 + arm_up + arm_low - chest - spine
 
-    def walk(u):  # heavy, dignified hops
-        return {'body': bounce(u, 0.04, 0.06, 0.03)}
+    def idle(t):  # slow and stately
+        b = math.sin(TAU * t)
+        return {'chest': 0.015 * b, 'head': (-0.02 * b, 0, 0.04 * math.sin(2 * TAU * t)), 'cloak': -0.03 * b}
 
-    def attack(t):  # rises tall, then hammers down like a gavel at the contact
-        rise = ease(t, 0, 0.5, 1.0, -0.4, 0, 0)
-        return {'body': tip(ease(t, 0, -0.05, -0.10, 0.45, 0.08, 0), r)
-                @ stretch(1 - 0.04 * rise, 1 - 0.04 * rise, 1 + 0.10 * rise)}
+    def walk(u):  # heavy, dignified steps, the cloak swaying behind
+        return {**stride(u, legs=0.35, knees=0.55, arms=0.2, sway=0.05, lean=0.03),
+                'arm_up_r': 0.06, 'cloak': -0.15 + 0.05 * math.cos(2 * TAU * u)}
 
-    def die(t):  # a short jolt; the cross falls; the king topples slowly; its halves crack apart
-        if t < 0.15:
-            return {'body': tip(-0.2 * math.sin(math.pi * span(t, 0, 0.15)), r)}
-        body = tip(ease(span(t, 0.3, 0.9), 0, lying), r)
-        flying = fall(cross, span(t, 0.15, 0.7), spread=0.25, jump=0.2, tumble=1.6, towards=(0.7, 0.7, 0))
-        crack = 0.035 * ease(span(t, 0.85, 1.0), 0, 1)  # along X, which stays level while it topples about X
-        return {'body': body, 'cross': body.inverted() @ flying,
-                **{s.bone: move(x=crack if s.centre.x > 0 else -crack) for s in shards}}
+    windup = {'arm_up_r': 2.6, 'arm_low_r': 0.4, 'chest': (-0.15, 0, -0.2), 'spine': -0.08, 'head': -0.1,
+              'cloak': -0.2, 'arm_up_l': 0.3}
+    strike = {'arm_up_r': 1.3, 'arm_low_r': 0.15, 'weapon': level(1.3, 0.15, 0.2, 0.1), 'chest': (0.2, 0, 0.25),
+              'spine': 0.1, 'cloak': -0.35, 'leg_up_l': 0.45, 'leg_low_l': -0.25, 'leg_up_r': -0.35}
+    follow = {**strike, 'arm_up_r': 0.8, 'weapon': level(0.8, 0.15, 0.2, 0.1) + 0.6, 'cloak': -0.25}
+    struck = {**recoil(0.3), 'cloak': -0.6, 'arm_up_r': 0.3}  # the cloak swings out behind
+    staggered = {**struck, 'spine': -0.45, 'root': (0, -0.2, 0)}
+    down = {'root': 1.45, 'spine': 0.1, 'head': (-0.3, 0, 0.9), 'arm_up_l': 1.2, 'arm_up_r': 1.0, 'cloak': 0.1,
+            'leg_low_l': -0.3}  # face down, the cloak flat over his back, his face turned aside
 
-    return Piece(parts, parent, {'idle': (90, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)
+    return character(f, parts, {
+        'idle': (90, idle),
+        'walk': (30, walk),
+        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
+        'hit': (9, lambda t: through(t, REST, struck)),
+        'die': (30, lambda t: through(t, struck, staggered, down, down)),
+    })
 
 
 PIECES['king'] = king
````

- [ ] **Step 2: Build it headless**

Run: `npm run living -- king`
Expected: `king: the clip contract holds; wrote …/assets-src/living/king.glb`.

- [ ] **Step 3: Look at the five previews**

Open `assets-src/living/king-{rest,walk,attack,hit,die}.png` with the Read tool. Expected: a crowned, bearded king in silver armour and a red tabard, a red cloak behind him and a sword upright at rest; dignified steps with the cloak swaying; the sword level at the strike; the cloak swung out when hit; face down with the cloak over his back and the crown on at the end, nothing below the floor.

- [ ] **Step 4: Tune it live with the owner in Blender**

Load the `anthropic-skills:computer-use` skill. `request_access` for Blender if this session has no grant. If
Blender is not running, start it from the shell: `open -na Blender`, and close its splash. In the Scripting tab's
Python console (click into it, type, press Return):

```python
P = '/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py'; exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': 'king', 'CLIP': 'attack'})
```

Expected: `king: the clip contract holds; playing attack (30 frames)`. Switch to the Layout tab: the piece stands
in a three-quarter front view. Set frames by clicking the timeline ruler (frame 18 is the strike); Space plays. Show
each clip (rerun with `'CLIP': 'walk'`, `'hit'`, `'die'`; the up arrow recalls the line) and ask the owner what to
change. Make every change in `pieces.py` with the Edit tool and rerun the line; a pose set by hand in Pose Mode is read
from the N panel and written back as `(forward, side, twist)`. Continue when the owner approves the king.

- [ ] **Step 5: Rebuild headless, optimise it into the game, swap the file**

```bash
npm run living -- king
npm run models -- assets-src/living/king.glb public/models/king-4.glb
git rm public/models/king-3.glb
ls -l public/models/king-4.glb
```

Expected: the contract holds; at most 256,000 bytes.

- [ ] **Step 6: Point the game at it and record it**

In `apps/web/src/scene/pieces/models.ts`, change the king's line to:

```ts
  k: { url: '/models/king-4.glb', clips: CHARACTER },
```

In `apps/web/public/models/CREDITS.md`, change the row `` | `king-3.glb` | king | `` to `` | `king-4.glb` | king (character) | ``.

In `docs/superpowers/specs/2026-11-19-character-pieces-design.md`, in the Characters table's King row, change "Falls
on his side, crown kept" to "Falls forward, the cloak flat over his back, crown kept" (on his side, the cloak stood up
from the floor like a board).

- [ ] **Step 7: Run the model tests**

Run (Postgres up): `npx vitest run src/scene/pieces && npm run living:test`
Expected: 2 test files pass (the new file is listed, on disk and has every clip); `Ran 48 tests` … `OK`.

- [ ] **Step 8: Commit**

```bash
git add scripts/blender public/models src/scene/pieces/models.ts ../../docs/superpowers/specs/2026-11-19-character-pieces-design.md
git commit -m "feat: draw the king as a king character"
```

---
### Task 12: The mounted knight

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (`knight()` replaced)
- Create: `apps/web/public/models/knight-3.glb`; delete `apps/web/public/models/knight-2.glb`
- Modify: `apps/web/src/scene/pieces/models.ts` (the mounted knight's line)
- Modify: `apps/web/public/models/CREDITS.md` (the mounted knight's row)

**Interfaces:**
- Consumes: `figure.py` as of Task 7 (`humanoid`, `body`, `character`, `through`, `stride`, `recoil`, `plate`,
  `star`, `hoop`, `dome`, `ellipsoid`, `limb`, `REST`, `Figure`); `lp.Part`, `lp.block`, `lp.cone`, `lp.lathe`, `lp.ball`;
  `CHARACTER` clips from `models.ts` (part 1, Task 3).
- Produces: `PIECES['knight']` builds the knight: 31 bones (`root`; `horse_body`, `horse_neck`, `horse_head`, `horse_tail`, and `horse_leg_*` / `horse_shin_*` for `fl`, `fr`, `hl`, `hr`; the seated rider's 17 bones on `horse_body`, hips at 0.58; `weapon` on `hand_r`); a coat-coloured horse with a hair mane and tail, dark eyes and hooves, ears and a gold noseband, under a team caparison with a gold star on each side; a rider in steel with a plumed helmet and a team surcoat; a lance with a gold hand guard. `walk` trots (diagonal pairs strike at u = 0 and 0.5); `attack` gathers, lowers the lance level, then lunges 12 cm; `hit` rears and the rider leans back; `die` folds the forelegs so the horse kneels and the rider slumps forward, the lance drooping. The Staunton knight's `HORSE` and `MANE` outlines are deleted with it.

The clip contract in `lp.check()` is this task's test: the build fails on any breach.

- [ ] **Step 1: Replace the mounted knight**

````diff
--- a/apps/web/scripts/blender/pieces.py
+++ b/apps/web/scripts/blender/pieces.py
@@ -7,8 +7,8 @@
 from mathutils import Vector
 
 import lp
-from figure import (REST, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, plate, recoil, star, stride,
-                    through)
+from figure import (REST, Figure, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, plate, recoil, star,
+                    stride, through)
 from lp import (Part, Piece, arc, ball, block, bounce, bump, cone, crumble, cut, ease, fall, halves, lathe, move, ring,
                 rock, shards_of, shift, slab, span, spline, stretch, tip, topple_angle, turn)
 
@@ -333,59 +333,94 @@
 PIECES['king'] = king
 
 
-HORSE = [(0.17, 0.28), (0.20, 0.55), (0.17, 0.80), (0.10, 1.00), (0.00, 1.15), (-0.08, 1.12), (-0.15, 1.00),
-         (-0.32, 0.88), (-0.34, 0.80), (-0.28, 0.74), (-0.16, 0.76), (-0.08, 0.66), (-0.15, 0.50), (-0.16, 0.35),
-         (-0.12, 0.28)]  # a horse's head and neck in profile, (y, z), facing -Y
-MANE = [(0.205, 0.62), (0.195, 0.72), (0.18, 0.82), (0.145, 0.92), (0.10, 1.02)]  # just proud of the neck's back
+HORSE_LEGS = {'fl': (1, -1), 'fr': (-1, -1), 'hl': (1, 1), 'hr': (-1, 1)}  # leg -> (side, end): end -1 is the front
 
 
 def knight():
-    """A carved horse's head on a neck, with ears, gold eyes and mane. Nods and flicks its ears; trots; rears up and
-    strikes down with its head; the head breaks off, the neck falls forward, the base shatters."""
-    r = 0.32
-    profile = spline(foot(r) + [(0.19, 0.22), (0.20, 0.27), (0.20, 0.27), (0.21, 0.29), (0.21, 0.31), (0.21, 0.31),
-                                (0, 0.31)])
-    throat, split = (0.0, -0.08, 0.66), (0.0, -0.49, 0.87)  # a plane from the throat up to the back of the neck
-    carved = slab(HORSE, 0.2, 0.04)
-    neck, head = halves(carved, throat, split)
-    carved.free()
+    """A plumed rider with a lance on a small horse in a team caparison. Lowers the lance and the horse lunges, the
+    horse rears and the rider leans back when hit, the horse kneels and the rider slumps forward in death."""
+    f = Figure()
+    f.add('root', None, (0, 0, 0))
+    f.add('horse_body', 'root', (0, 0, 0.45))
+    f.add('horse_neck', 'horse_body', (0, -0.20, 0.52))
+    f.add('horse_head', 'horse_neck', (0, -0.30, 0.72))
+    f.add('horse_tail', 'horse_body', (0, 0.26, 0.52), True)
+    for leg, (s, e) in HORSE_LEGS.items():
+        f.add(f'horse_leg_{leg}', 'horse_body', (0.07 * s, 0.18 * e, 0.40), True)
+        f.add(f'horse_shin_{leg}', f'horse_leg_{leg}', (0.07 * s, 0.18 * e, 0.21), True)
+    humanoid(f, base=(0, 0, 0.16), parent='horse_body', seated=True)  # the rider's hips on the saddle, at 0.58
+    f.add('weapon', 'hand_r', f.at('hand_r'))
+    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
+    rider = Vector((0, 0, 0.16))
+    side = Vector((1, 0, 0))
+    parts = body(f) + [
+        Part(dome(0.105, 0.87 + rider.z), 'steel', 'head'),
+        Part(hoop(0.11, 0.012, rider + Vector((0, 0, 0.872))), 'trim', 'head'),
+        Part(ellipsoid(0.03, 0.09, 0.055, rider + Vector((0, 0.03, 1.0))), 'team', 'head'),  # plume
+        Part(ellipsoid(0.155, 0.115, 0.085, rider + Vector((0, 0, 0.60))), 'team', 'chest'),  # surcoat
+        Part(limb(grip + Vector((0, 0, -0.20)), grip + Vector((0, 0, 0.58)), 0.014), 'wood', 'weapon'),  # lance
+        Part(cone(0.024, 0.08, grip + Vector((0, 0, 0.62)), 8), 'steel', 'weapon'),
+        Part(cone(0.04, 0.08, grip + Vector((0, 0, 0.07)), 12), 'trim', 'weapon'),  # its hand guard
+        Part(ellipsoid(0.13, 0.27, 0.13, (0, 0, 0.45)), 'coat', 'horse_body'),
+        Part(ellipsoid(0.152, 0.30, 0.135, (0, 0, 0.42)), 'team', 'horse_body'),  # caparison, hanging low
+        Part(star(0.05, 0.012, (0.154, 0, 0.42), side), 'trim', 'horse_body'),
+        Part(star(0.05, 0.012, (-0.154, 0, 0.42), -side), 'trim', 'horse_body'),
+        Part(limb((0, -0.20, 0.52), (0, -0.30, 0.70), 0.065, 0.05), 'coat', 'horse_neck'),
+        Part(limb((0, -0.15, 0.60), (0, -0.25, 0.77), 0.025), 'hair', 'horse_neck'),  # mane
+        Part(limb((0, -0.29, 0.74), (0, -0.42, 0.66), 0.05, 0.04), 'coat', 'horse_head'),
+        Part(lp.ball(0.012, 0.042, -0.33, 0.745), 'dark', 'horse_head'),
+        Part(lp.ball(0.012, -0.042, -0.33, 0.745), 'dark', 'horse_head'),
+        Part(cone(0.014, 0.05, (0.025, -0.28, 0.80), 6), 'coat', 'horse_head'),
+        Part(cone(0.014, 0.05, (-0.025, -0.28, 0.80), 6), 'coat', 'horse_head'),
+        Part(hoop(0.045, 0.008, (0, -0.39, 0.675), (0, -1, -0.5)), 'trim', 'horse_head'),  # noseband
+        Part(limb((0, 0.26, 0.52), (0, 0.36, 0.30), 0.03), 'hair', 'horse_tail'),
+    ]
+    for leg, (s, e) in HORSE_LEGS.items():
+        hip, knee, hoof = (Vector((0.07 * s, 0.18 * e, z)) for z in (0.40, 0.21, 0.03))
+        parts += [Part(limb(hip, knee, 0.04, 0.03), 'coat', f'horse_leg_{leg}'),
+                  Part(limb(knee, hoof, 0.028), 'coat', f'horse_shin_{leg}'),
+                  Part(block(0.06, 0.07, 0.04, hoof + Vector((0, -0.005, -0.01)), bevel=0.012), 'dark',
+                       f'horse_shin_{leg}')]
 
-    def on_head(y, z):
-        return split[1] * (y - throat[1]) + split[2] * (z - throat[2]) > 0
+    def level(arm_up, arm_low, chest=0.0, spine=0.0):
+        """The lance's forward turn that holds it level, point ahead."""
+        return math.pi / 2 + arm_up + arm_low - chest - spine
 
-    parts = wedges(lathe(profile), [])
-    parts += [Part(neck, 'team', 'neck'), Part(head, 'team', 'head'),
-              Part(cone(0.03, 0.1, (0.045, 0.02, 1.16)), 'team', 'ear_l'),
-              Part(cone(0.03, 0.1, (-0.045, 0.02, 1.16)), 'team', 'ear_r'),
-              Part(ball(0.02, 0.1, -0.13, 0.97), 'trim', 'head'), Part(ball(0.02, -0.1, -0.13, 0.97), 'trim', 'head'),
-              Part(foot_ring(r), 'trim', 'band'), Part(ring(0.21, 0.012, 0.30), 'trim', 'collar')]
-    parts += [Part(block(0.06, 0.05, 0.08, (0, y, z)), 'trim', 'head' if on_head(y, z) else 'neck') for y, z in MANE]
-    parent = {'body': None, 's0': 'body', 's1': 'body', 's2': 'body', 'neck': 'body', 'head': 'neck',
-              'ear_l': 'head', 'ear_r': 'head', 'band': 'body', 'collar': 'body'}
-    neck_at, head_at = (0, 0.05, 0.31), (0, 0.04, 0.78)
-    ear_at = {'ear_l': (0.045, 0.02, 1.11), 'ear_r': (-0.045, 0.02, 1.11)}
+    def idle(t):  # the horse nods and flicks its tail; the rider sits easy
+        b = math.sin(TAU * t)
+        return {'horse_neck': 0.04 * b, 'horse_head': 0.05 * math.sin(2 * TAU * t), 'horse_tail': (0, 0.12 * b, 0),
+                'chest': 0.015 * b}
 
-    def flick(t, ear, centre):  # an ear twitches back once per loop
-        return turn(-0.35 * bump(t, centre, 0.04), 'X', ear_at[ear])
+    def walk(u):  # a trot: the diagonal pairs strike at u = 0 and u = 0.5, the game's footfalls
+        c, s = math.cos(TAU * (u % 1.0)), math.sin(TAU * (u % 1.0))
+        pose = {'horse_neck': 0.06 * math.cos(2 * TAU * u), 'horse_tail': (0, 0.1 * c, 0), 'spine': 0.05}
+        for leg, sign in (('fl', 1), ('hr', 1), ('fr', -1), ('hl', -1)):
+            pose[f'horse_leg_{leg}'] = 0.4 * sign * c
+            pose[f'horse_shin_{leg}'] = -0.7 * max(0.0, -sign * s)
+        return pose
 
-    def idle(t):  # nods, flicks its ears
-        return {'neck': turn(0.04 * math.sin(TAU * t), 'X', neck_at),
-                'head': turn(0.05 * math.sin(TAU * t + 1), 'X', head_at),
-                'ear_l': flick(t, 'ear_l', 0.3), 'ear_r': flick(t, 'ear_r', 0.75)}
+    gather = {'horse_body': -0.12, 'horse_neck': -0.15, 'arm_up_r': 0.3, 'arm_low_r': 0.2,
+              'weapon': level(0.3, 0.2, -0.1, 0.12), 'chest': (-0.1, 0, -0.2), 'spine': 0.12}
+    lunge = {'lift': (0, -0.12, 0), 'horse_body': 0.10, 'horse_neck': 0.25, 'horse_head': 0.1,
+             'horse_leg_fl': 0.5, 'horse_leg_fr': 0.5, 'horse_leg_hl': -0.4, 'horse_leg_hr': -0.4,
+             'arm_up_r': 0.9, 'arm_low_r': 0.1, 'weapon': level(0.9, 0.1, 0.15, 0.2), 'chest': (0.15, 0, 0.3),
+             'spine': 0.2}
+    follow = {**lunge, 'lift': (0, -0.08, 0), 'arm_up_r': 0.8, 'weapon': level(0.8, 0.1, 0.15, 0.2)}
+    rearing = {'horse_body': -0.35, 'horse_neck': -0.3, 'horse_head': -0.2, 'horse_leg_fl': 0.7,
+               'horse_leg_fr': 0.7, 'horse_shin_fl': -0.6, 'horse_shin_fr': -0.6, 'spine': -0.3, 'chest': -0.15,
+               'head': -0.2, 'arm_up_r': -0.2}
+    staggered = {**rearing, 'horse_body': -0.45, 'spine': -0.4}
+    kneeling = {'horse_body': 0.3, 'horse_neck': 0.4, 'horse_head': 0.3, 'horse_leg_fl': -0.3, 'horse_leg_fr': -0.3,
+                'horse_shin_fl': -1.8, 'horse_shin_fr': -1.8, 'horse_shin_hl': -0.5, 'horse_shin_hr': -0.5,
+                'horse_tail': 0.3, 'spine': 0.6, 'chest': 0.2, 'head': 0.5, 'arm_up_r': 0.6, 'weapon': 0.6}
 
-    def walk(u):  # a trotting bounce (the game also arcs the knight through the air), nodding on every hop
-        return {'body': bounce(u, 0.03, 0.08, 0.03), 'neck': turn(0.10 * math.sin(2 * TAU * u), 'X', neck_at)}
+    return character(f, parts, {
+        'idle': (90, idle),
+        'walk': (30, walk),
+        'attack': (30, lambda t: through(t, REST, gather, gather, lunge, follow, REST)),
+        'hit': (9, lambda t: through(t, REST, rearing)),
+        'die': (30, lambda t: through(t, rearing, staggered, kneeling, kneeling)),
+    })
 
-    def attack(t):  # rears up, then strikes down with the head at the contact
-        return {'body': tip(ease(t, 0, -0.15, -0.28, 0.28, 0.05, 0), r),
-                'neck': turn(ease(t, 0, -0.15, -0.35, 0.30, 0.05, 0), 'X', neck_at),
-                'head': turn(ease(t, 0, -0.10, -0.20, 0.25, 0, 0), 'X', head_at)}
 
-    die = crumble(parts, parent, r, ['neck', 'head', 's0', 's1', 's2', 'band', 'collar'], spread=0.22, jump=0.08, tumble=1.0,
-                  special={'head': {'spread': 0.3, 'jump': 0.3, 'tumble': 2.2, 'towards': (0.3, -1, 0)},
-                           'neck': {'spread': 0.12, 'jump': 0.02, 'tumble': 1.3, 'towards': (0, -1, 0), 'start': 0.36},
-                           **{s: {'start': 0.42} for s in ('s0', 's1', 's2')}, **FLAT_BANDS})
-    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)
-
-
 PIECES['knight'] = knight
````

- [ ] **Step 2: Build it headless**

Run: `npm run living -- knight`
Expected: `knight: the clip contract holds; wrote …/assets-src/living/knight.glb`.

- [ ] **Step 3: Look at the five previews**

Open `assets-src/living/knight-{rest,walk,attack,hit,die}.png` with the Read tool. Expected: a plumed rider with an upright lance on a small horse in a red caparison at rest; a trot with the legs in diagonal pairs; the lance level and the horse lunging at the strike; the horse rearing and the rider leaning back when hit; the horse kneeling with the rider slumped over it at the end, nothing below the floor.

- [ ] **Step 4: Tune it live with the owner in Blender**

Load the `anthropic-skills:computer-use` skill. `request_access` for Blender if this session has no grant. If
Blender is not running, start it from the shell: `open -na Blender`, and close its splash. In the Scripting tab's
Python console (click into it, type, press Return):

```python
P = '/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py'; exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': 'knight', 'CLIP': 'attack'})
```

Expected: `knight: the clip contract holds; playing attack (30 frames)`. Switch to the Layout tab: the piece stands
in a three-quarter front view. Set frames by clicking the timeline ruler (frame 18 is the strike); Space plays. Show
each clip (rerun with `'CLIP': 'walk'`, `'hit'`, `'die'`; the up arrow recalls the line) and ask the owner what to
change. Make every change in `pieces.py` with the Edit tool and rerun the line; a pose set by hand in Pose Mode is read
from the N panel and written back as `(forward, side, twist)`. Continue when the owner approves the mounted knight.

- [ ] **Step 5: Rebuild headless, optimise it into the game, swap the file**

```bash
npm run living -- knight
npm run models -- assets-src/living/knight.glb public/models/knight-3.glb
git rm public/models/knight-2.glb
ls -l public/models/knight-3.glb
```

Expected: the contract holds; at most 256,000 bytes.

- [ ] **Step 6: Point the game at it and record it**

In `apps/web/src/scene/pieces/models.ts`, change the mounted knight's line to:

```ts
  n: { url: '/models/knight-3.glb', clips: CHARACTER },
```

In `apps/web/public/models/CREDITS.md`, change the row `` | `knight-2.glb` | knight | `` to `` | `knight-3.glb` | knight (character) | ``.

- [ ] **Step 7: Run the model tests**

Run (Postgres up): `npx vitest run src/scene/pieces && npm run living:test`
Expected: 2 test files pass (the new file is listed, on disk and has every clip); `Ran 48 tests` … `OK`.

- [ ] **Step 8: Commit**

```bash
git add scripts/blender public/models src/scene/pieces/models.ts
git commit -m "feat: draw the knight as a mounted knight character"
```

---
### Task 13: Retire the Staunton code, make `hit` required, check everything

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (docstring, imports; `foot`, `foot_ring`, `wedges`, `FLAT_BANDS` deleted)
- Modify: `apps/web/src/scene/pieces/models.ts` (`Clips.hit` required, `CHARACTER` folded into `CLIPS`)
- Modify: `apps/web/src/scene/pieces/GlbPiece.tsx` (every model has a hit action), `apps/web/src/scene/pieces/rig.ts`
- Test: `apps/web/src/scene/pieces/models.test.ts` (every model has a hit clip)
- Modify: `apps/web/public/models/CREDITS.md`, `docs/superpowers/specs/2026-11-19-character-pieces-design.md`

**Interfaces:**
- Consumes: every model listed with `CHARACTER` (Tasks 8–12 and part 1's pawn).
- Produces: `Clips` with a required `hit`; `CLIPS = { idle, walk, attack, hit, die }`; `CHARACTER` no longer exists.
  `Rig.hit` stays optional: the built-in fallback models have none.

- [ ] **Step 1: Make `hit` required, with a guard test**

The guard test passes at once (every model already lists `CHARACTER`); it keeps a model without `hit` from shipping
later.

Replace `apps/web/src/scene/pieces/models.ts` with:

```ts
import type { PieceSymbol } from 'chess.js';

/** Animation names in a model's file, one for each pose the actor plays. */
export interface Clips {
  idle: string;
  walk: string;
  attack: string;
  hit: string;
  die: string;
}

// scripts/blender/living_pieces.py names every model's clips the same way.
const CLIPS: Clips = { idle: 'idle', walk: 'walk', attack: 'attack', hit: 'hit', die: 'die' };

/** Piece types drawn from a .glb model. A type not listed here uses its model built in code. */
export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>> = {
  p: { url: '/models/pawn-4.glb', clips: CLIPS },
  n: { url: '/models/knight-3.glb', clips: CLIPS },
  b: { url: '/models/bishop-4.glb', clips: CLIPS },
  r: { url: '/models/rook-3.glb', clips: CLIPS },
  q: { url: '/models/queen-3.glb', clips: CLIPS },
  k: { url: '/models/king-4.glb', clips: CLIPS },
};

/** A model is scaled to this height, in squares. */
export const HEIGHT: Record<PieceSymbol, number> = { p: 0.9, n: 1.2, b: 1.25, r: 1.3, q: 1.4, k: 1.55 };
```

(If tuning changed a file number, keep the number that is on disk.) Then apply:

````diff
diff --git a/apps/web/src/scene/pieces/GlbPiece.tsx b/apps/web/src/scene/pieces/GlbPiece.tsx
index 772b06b..ef1bd8e 100644
--- a/apps/web/src/scene/pieces/GlbPiece.tsx
+++ b/apps/web/src/scene/pieces/GlbPiece.tsx
@@ -21,8 +21,7 @@ import { HEIGHT, MODELS, type Clips } from './models';
 import { clipTime, keys, type PieceModelProps } from './rig';
 
 type Clip = keyof Clips;
-/** One action per clip; only hit may be missing. */
-type Actions = Record<Exclude<Clip, 'hit'>, AnimationAction> & { hit?: AnimationAction };
+type Actions = Record<Clip, AnimationAction>;
 
 // Texels whose red and blue are high and green low (the magenta painted in Meshy) take the team's colour,
 // at the texel's brightness so the shading baked into the texture survives.
@@ -75,7 +74,7 @@ function animate(model: Object3D, animations: AnimationClip[], clips: Clips | un
       action.clampWhenFinished = true;
     }
     action.play();
-    (actions as Record<Clip, AnimationAction>)[key] = action;
+    actions[key] = action;
   }
   return { mixer, actions };
 }
@@ -160,7 +159,7 @@ export function GlbPiece({ type, color, ref }: PieceModelProps & { type: PieceSy
     }
     /** Holds `clip` at `value` (see clipTime), with every other clip weighted out. */
     const hold = (clip: Clip, value: number, loop: boolean) => {
-      const action = anim.actions[clip]!;
+      const action = anim.actions[clip];
       only(anim.actions, clip);
       action.enabled = true;
       action.paused = true;
@@ -177,8 +176,8 @@ export function GlbPiece({ type, color, ref }: PieceModelProps & { type: PieceSy
         if (posed.current) hold('attack', t, false);
       },
       hit(t) {
-        posed.current = anim.actions.hit !== undefined; // a model without a hit clip keeps idling until it dies
-        if (posed.current) hold('hit', t, false);
+        posed.current = true; // die follows at once
+        hold('hit', t, false);
       },
       die(t) {
         posed.current = true; // the last pose stays until the piece is removed
diff --git a/apps/web/src/scene/pieces/models.test.ts b/apps/web/src/scene/pieces/models.test.ts
index 222ac2f..9d4d04c 100644
--- a/apps/web/src/scene/pieces/models.test.ts
+++ b/apps/web/src/scene/pieces/models.test.ts
@@ -59,3 +59,7 @@ test('every listed clip is an animation in its file', () => {
     for (const name of Object.values(clips)) expect(names, `${url} has no clip named ${name}`).toContain(name);
   }
 });
+
+test('every model is a character: its clips include the hit', () => {
+  for (const [, { url, clips }] of listed) expect(clips?.hit, url).toBe('hit');
+});
diff --git a/apps/web/src/scene/pieces/rig.ts b/apps/web/src/scene/pieces/rig.ts
index 84e24f6..f346263 100644
--- a/apps/web/src/scene/pieces/rig.ts
+++ b/apps/web/src/scene/pieces/rig.ts
@@ -6,7 +6,7 @@ export interface Rig {
   stride(phase: number): void;
   /** Attack pose at progress t (0..1). Must be back at rest when t = 1. */
   attack(t: number): void;
-  /** Hit pose at progress t (0..1): the recoil from a blow, played before die. Models without one keep idling. */
+  /** Hit pose at progress t (0..1): the recoil from a blow, played before die. The built-in models have none. */
   hit?(t: number): void;
   /** Death pose at progress t (0..1). t = 1 is the final pose; the piece is then removed. */
   die(t: number): void;
````

- [ ] **Step 2: Delete the Staunton helpers from `pieces.py`**

````diff
--- a/apps/web/scripts/blender/pieces.py
+++ b/apps/web/scripts/blender/pieces.py
@@ -1,7 +1,6 @@
-"""The six chess pieces: each builder returns an lp.Piece. Sizes are in squares (GlbPiece rescales to HEIGHT in
-models.ts anyway); the piece stands on z = 0 and faces -Y. Character pieces (built on figure.py) replace the living
-Staunton pieces one by one: see docs/superpowers/specs/2026-11-19-character-pieces-design.md (Characters) and
-docs/superpowers/specs/2026-11-19-living-pieces-design.md (Pieces) for the ones still to replace."""
+"""The six chess pieces, each a character built on figure.py: each builder returns an lp.Piece. Sizes are in squares
+(GlbPiece rescales to HEIGHT in models.ts anyway); the figure stands on z = 0 and faces -Y. Designs: the Characters
+table in docs/superpowers/specs/2026-11-19-character-pieces-design.md."""
 import math
 
 from mathutils import Vector
@@ -9,37 +8,12 @@
 import lp
 from figure import (REST, Figure, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, plate, recoil, star,
                     stride, through)
-from lp import (Part, Piece, arc, ball, block, bounce, bump, cone, crumble, cut, ease, fall, halves, lathe, move, ring,
-                rock, shards_of, shift, slab, span, spline, stretch, tip, topple_angle, turn)
+from lp import Part, block, cone, lathe
 
 TAU = math.tau
-
-
-def foot(r):
-    """The Staunton foot every piece shares: a flat base, a rim, a bead, rising into the stem."""
-    return [(0, 0), (r, 0), (r, 0), (r, 0.15 * r), (r, 0.15 * r), (0.87 * r, 0.25 * r), (0.92 * r, 0.34 * r),
-            (0.70 * r, 0.48 * r)]
-
-
-def foot_ring(r):
-    """The gold band on the foot's bead."""
-    return ring(0.92 * r, 0.012, 0.34 * r)
+PIECES = {}  # name -> builder
 
 
-def wedges(body, heights):
-    """`body` cut into 3 shards per band (lp.cut), as team-coloured parts on bones s0, s1, ... from the bottom band."""
-    shards = cut(body, heights, 3)
-    body.free()
-    return [Part(s, 'team', f's{i}') for i, s in enumerate(shards)]
-
-
-PIECES = {}  # name -> builder; each task adds its piece below
-
-# Gold bands on bones of their own: they drop flat in a death rather than tumbling upright with a shard.
-FLAT_BANDS = {'band': {'spread': 0, 'jump': 0.04, 'tumble': 0, 'start': 0.42},
-              'collar': {'spread': 0.1, 'jump': 0.08, 'tumble': 0, 'start': 0.42}}
-
-
 def pawn():
     """Infantryman: plumed helmet, team tunic, spear in the right hand, round shield on the left forearm. Thrusts the
     spear from behind the shield, recoils behind it, falls on his side with spear and shield."""
````

- [ ] **Step 3: Check the pieces still build and the code is clean**

```bash
for p in pawn rook bishop queen king knight; do npm run living -- $p | grep 'contract holds'; done
npm run living:test && npx vitest run src/scene && npx eslint src/scene && npm run typecheck
```

Expected: six `the clip contract holds` lines; `Ran 48 tests` … `OK`; scene tests pass (including `every model is a
character: its clips include the hit`); no lint output; typecheck exits 0. The models need no rebuild: the cleanup
changes no builder.

- [ ] **Step 4: Record it in CREDITS.md**

Replace `apps/web/public/models/CREDITS.md` with:

~~~markdown
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
~~~

- [ ] **Step 5: Run every test**

From the repo root, with Postgres up: `npm test && npm run typecheck && npm run lint`
Expected: all pass (part 1 ended at server 103, web 163, shared 18; web gains the guard test: 164).

- [ ] **Step 6: Run the E2E suite on its own servers**

Ask the owner to stop their dev servers on ports 3000 and 3001 (or to let you stop them). Check they are gone with
`lsof -ti tcp:3000 -sTCP:LISTEN; lsof -ti tcp:3001 -sTCP:LISTEN` (no output). Then, from the repo root:

```bash
npm run build -w @chess/web
npm run e2e
```

Expected: every test passes in Chromium, Firefox and WebKit (part 1's living pieces ended at 15 passing). If a test
fails, read its error in the output before anything else: `401` means a reused server again.

- [ ] **Step 7: See every piece fight in the game**

With a server running on port 3000 (the E2E web server is gone once the suite ends: start the dev server with the
preview tool, `preview_start` name `chess-dev`, or let the owner restart theirs), drive a Playwright browser (the
`plugin:playwright` tools; it keeps drawing when the app's browser pane is hidden): click `Bắt đầu` (or `Start`), then
enter each move in the move box (placeholder `Nf3 / g1f3`) and press Enter, waiting 2.5 s between moves:
1. Nc3 d5 2. Nxd5 Qxd5 3. e4 Qxa2 4. Rxa2 Bf5 5. exf5. After each capture, take about 14 screenshots back to back
(about 100 ms apart). Check, in the frames: the knight lunges and the pawn recoils and falls; the queen's orb flares
and the knight's horse rears, then kneels; the queen takes a pawn; the rook bashes and the queen kneels; the pawn
thrusts and the bishop falls; red and blue recolour only the cloth; no `piece model failed to load` warning in the
console. The king is never captured: judge its death from its preview and the live session.

- [ ] **Step 8: Record the outcome**

Append to the spec:

```markdown
## Outcome (YYYY-MM-DD)

All six pieces are characters built on `figure.py`; no Staunton model ships, and `hit` is a required clip.

| File | Bytes | Bones |
|---|---|---|
| `pawn-4.glb` | <bytes> | 20 |
| `rook-3.glb` | <bytes> | 20 |
| `bishop-4.glb` | <bytes> | 20 |
| `queen-3.glb` | <bytes> | 20 |
| `king-4.glb` | <bytes> | 20 |
| `knight-3.glb` | <bytes> | 31 |

Changes made with the owner in Blender: <per piece, or "none">. Checked in the running game (1. Nc3 d5 2. Nxd5 Qxd5
3. e4 Qxa2 4. Rxa2 Bf5 5. exf5): <what played>. Tests: <counts>; E2E: <result>.
```

Fill in the real values from `ls -l public/models/*.glb`, the sessions and Steps 5–7.

- [ ] **Step 9: Commit**

```bash
git add scripts/blender/pieces.py src/scene/pieces public/models/CREDITS.md ../../docs/superpowers/specs/2026-11-19-character-pieces-design.md
git commit -m "chore: retire the Staunton piece code and make the hit clip required"
```
