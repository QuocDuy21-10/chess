# Living Staunton Pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six KayKit characters with Staunton-shaped "living" chess pieces in red/blue stone with gold
trim, each built, rigged, animated (`idle`, `walk`, `attack`, `die`) and exported by a Blender Python script.

**Architecture:** `apps/web/scripts/blender/lp.py` holds the building blocks (lathe/cut/slab geometry, a rigid-skinned
armature whose bones all share one rest frame, clips baked frame by frame from Python pose functions, the clip-contract
self-check, preview renders, glTF export). `pieces.py` defines the six pieces with those blocks. `living_pieces.py` is
the entry point Blender runs headless. Each built `.glb` goes through the existing `npm run models` optimiser into
`public/models/<piece>-<n>.glb`, and `models.ts` points at it. `GlbPiece.tsx` stays unchanged: it already recolours
magenta and scrubs the four clips.

**Tech Stack:** Blender 5.3.0 (bpy, bmesh, mathutils; glTF 2.0 exporter), Python `unittest` run inside Blender,
TypeScript/Vitest for the one sequencer change, `@gltf-transform/cli` via `npm run models`.

**Spec:** `docs/superpowers/specs/2026-11-19-living-pieces-design.md`

## Global Constraints

- Blender binary: `/Applications/Blender.app/Contents/MacOS/Blender` (override with `BLENDER=`), always run with
  `--background --factory-startup --python-exit-code 1`.
- Clip names exactly `idle`, `walk`, `attack`, `die`; all four in every model.
- Attack contact at **0.6** of the clip (`TIMING.impactAt`); `attack` starts and ends at the rest pose; `die` starts at
  rest and its last frame is the final pose; `idle` and `walk` loop (last frame = first frame).
- No vertex below z = −0.01 in any frame of any clip.
- Every vertex weighted 1.0 to exactly one bone; at most 16 bones per piece.
- Materials: `team` base colour pure magenta `(1, 0, 1)` (recoloured by `GlbPiece`), `trim` gold metal.
- Blender axes: Z up, piece faces −Y (the exporter makes that +Z, like the current models).
- A changed model takes the next number (`/models/*` is cached immutable for a year); a replaced file is deleted so
  `models.test.ts` (every file on disk is listed) passes. Target ≤ 150 KB per optimised piece (hard limit 600 KB).
- `apps/web/assets-src/` is git-ignored: build outputs go to `apps/web/assets-src/living/`; only scripts are committed.
- **Deviation from the spec, to approve with this plan:** Task 3 changes one line of the sequencer so footfall sounds
  fall on the hop landings (`(i + 1) / count` instead of `(i + 0.5) / count`). Without it every footfall plays at the
  top of a hop. Nothing else in the game's code changes until Task 10's credits cleanup.

All commands run from `apps/web` unless they say otherwise.

### API facts verified on this machine (Blender 5.3.0, 2026-11-19)

- `Action.fcurves` no longer exists (layered actions). Keyframes go in with `pose_bone.keyframe_insert(path, frame=)`
  after assigning a new action to `rig.animation_data.action`; one slot per action is created automatically.
- `export_scene.gltf(export_animation_mode='ACTIONS')` writes every action as its own animation, named after it.
- Keys from frame 1 export starting at t = 1/30 s, so clips are keyed from **frame 0**.
- With every bone's head at the origin pointing up, rest frame R is shared; basis = R⁻¹·L·R reproduces any
  armature-space matrix L exactly (max vertex error 1.3e-7 in a probe).
- `bmesh.ops.bisect_plane(clear_outer=True)` + `holes_fill` gives manifold shards; `extrude_face_region` + `bevel`
  on a concave outline stays manifold; EEVEE renders headless (~6 s per 512 px frame).

---

### Task 1: Geometry and motion building blocks (`lp.py`, part 1)

**Files:**
- Create: `apps/web/scripts/blender/lp.py`
- Create: `apps/web/scripts/blender/test_lp.py`
- Modify: `apps/web/package.json` (scripts)

**Interfaces:**
- Produces (used by every later task): `need(cond, msg)`, `srgb(hex)`, `MAGENTA`, `GOLD`, `RED`, `IMPACT`, `CLIPS`,
  `keys(t, *v)`, `ease(t, *v)`, `span(t, a, b)`, `bump(t, centre, width)`, `move(x, y, z)`,
  `turn(angle, axis, pivot)`, `stretch(sx, sy, sz, pivot)`, `tip(angle, radius)`, `rock(angle, radius)`,
  `bounce(u, height, lean, squash)`, `spline(points, per)`, `arc(centre_z, radius, start_deg, end_deg, count)`,
  `lathe(profile, steps, closed)`, `ring(radius, thickness, z)`, `ball(radius, x, y, z)`,
  `block(sx, sy, sz, at, angle, bevel)`, `cone(radius, depth, at)`, `shift(bm, vec)`, `keep(bm, co, no)`,
  `halves(bm, co, no)`, `cut(bm, heights, sectors)`, `slab(outline, thickness, bevel)`. All matrices are
  `mathutils.Matrix` 4×4; all meshes are `bmesh.types.BMesh`.

- [ ] **Step 1: Add the npm scripts**

In `apps/web/package.json`, add after the `"models"` line (keep the comma on `"models"`):

```json
    "living": "sh -c '\"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}\" --background --factory-startup --python-exit-code 1 --python scripts/blender/living_pieces.py -- \"$0\" assets-src/living'",
    "living:test": "sh -c '\"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}\" --background --factory-startup --python-exit-code 1 --python scripts/blender/test_lp.py'"
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/scripts/blender/test_lp.py`:

```python
"""Tests for lp.py, run inside Blender: npm run living:test (from apps/web)."""
import math
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mathutils import Matrix, Vector  # noqa: E402

import lp  # noqa: E402


def manifold(bm):
    return all(e.is_manifold for e in bm.edges)


def close(a, b, tolerance=1e-6):
    return all(abs(x - y) < tolerance for row_a, row_b in zip(a, b) for x, y in zip(row_a, row_b))


class Timing(unittest.TestCase):
    def test_keys_matches_rig_ts(self):
        self.assertEqual(lp.keys(0.5, 0, 1, 0), 1)
        self.assertAlmostEqual(lp.keys(0.25, 0, 1, 0), 0.5)
        self.assertEqual(lp.keys(2, 0, 1, 0), 0)

    def test_ease_settles_on_keys_and_eases_between(self):
        self.assertEqual(lp.ease(0.5, 0, 1, 0), 1)
        self.assertAlmostEqual(lp.ease(0.125, 0, 1, 0), 0.15625)  # smoothstep(0.25)

    def test_span_clamps(self):
        self.assertEqual(lp.span(0.5, 0.25, 0.75), 0.5)
        self.assertEqual(lp.span(0.1, 0.25, 0.75), 0)
        self.assertEqual(lp.span(0.9, 0.25, 0.75), 1)

    def test_bump_peaks_at_its_centre_and_wraps(self):
        self.assertEqual(lp.bump(0.3, 0.3, 0.1), 1)
        self.assertEqual(lp.bump(0.5, 0.3, 0.1), 0)
        self.assertAlmostEqual(lp.bump(0.98, 0.02, 0.1), lp.bump(0.06, 0.02, 0.1))


class Motion(unittest.TestCase):
    def test_turn_x_leans_the_top_forward(self):
        self.assertLess((lp.turn(0.3, 'X') @ Vector((0, 0, 1))).y, 0)

    def test_turn_y_leans_the_top_toward_plus_x(self):
        self.assertGreater((lp.turn(0.3, 'Y') @ Vector((0, 0, 1))).x, 0)

    def test_tip_and_rock_keep_the_base_on_or_above_the_floor(self):
        rim = [Vector((0.3 * math.cos(a), 0.3 * math.sin(a), 0)) for a in (i * math.tau / 48 for i in range(48))]
        for m in (lp.tip(0.4, 0.3), lp.tip(-0.4, 0.3), lp.rock(0.4, 0.3), lp.rock(-0.4, 0.3)):
            self.assertGreaterEqual(min((m @ p).z for p in rim), -1e-9)

    def test_tip_forward_moves_the_top_toward_minus_y(self):
        self.assertLess((lp.tip(0.3, 0.3) @ Vector((0, 0, 1))).y, -0.2)

    def test_bounce_rests_on_landings_and_rises_between(self):
        for u in (0, 0.5, 1):
            self.assertTrue(close(lp.bounce(u, 0.1, 0.1, 0.1), Matrix.Identity(4)))
        self.assertAlmostEqual(lp.bounce(0.25, 0.1, 0, 0).translation.z, 0.1)


class Geometry(unittest.TestCase):
    def test_spline_passes_through_its_points(self):
        points = [(0, 0), (1, 0), (1, 0), (1, 1), (0, 2)]
        out = lp.spline(points)
        for p in points:
            self.assertTrue(any((Vector(p) - Vector(q)).length < 1e-9 for q in out), p)

    def test_a_repeated_point_keeps_a_sharp_corner(self):
        out = lp.spline([(0, 0), (1, 0), (1, 0), (1, 1)])
        corner = out.index(next(q for q in out if (Vector(q) - Vector((1, 0))).length < 1e-9))
        self.assertTrue(all(abs(q[1]) < 1e-9 for q in out[:corner]))  # no overshoot before the corner

    def test_arc_runs_from_start_to_end(self):
        points = lp.arc(1.0, 0.5, -90, 90)
        self.assertAlmostEqual(points[0][1], 0.5)
        self.assertEqual(points[-1][0], 0.0)
        self.assertAlmostEqual(points[-1][1], 1.5)

    def test_lathe_makes_a_closed_solid(self):
        bm = lp.lathe([(0, 0), (1, 0), (1, 1), (0, 1)])
        self.assertTrue(manifold(bm))
        self.assertAlmostEqual(bm.calc_volume(), math.pi, delta=0.01 * math.pi)

    def test_ring_ball_block_and_cone_are_closed(self):
        for bm in (lp.ring(0.3, 0.02, 0.5), lp.ball(0.1, 0.2, 0, 0.3), lp.block(0.1, 0.2, 0.3), lp.cone(0.05, 0.1)):
            self.assertTrue(manifold(bm))
            self.assertGreater(bm.calc_volume(), 0)

    def test_ball_is_where_it_was_put(self):
        bm = lp.ball(0.1, 0.2, 0, 0.3)
        centre = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
        self.assertLess((centre - Vector((0.2, 0, 0.3))).length, 1e-3)

    def test_cut_splits_a_body_into_closed_shards_that_add_up(self):
        body = lp.lathe([(0, 0), (0.3, 0), (0.3, 0), (0.3, 1), (0.3, 1), (0, 1)])
        shards = lp.cut(body, [0.43], 3)
        self.assertEqual(len(shards), 6)
        for s in shards:
            self.assertTrue(manifold(s))
        self.assertAlmostEqual(sum(s.calc_volume() for s in shards), body.calc_volume(), delta=1e-3 * body.calc_volume())

    def test_halves_add_up(self):
        body = lp.lathe([(0, 0), (0.3, 0), (0.3, 1), (0, 1)])
        low, high = lp.halves(body, (0, 0, 0.5), (0, 0.5, 0.87))
        self.assertTrue(manifold(low) and manifold(high))
        self.assertLess(min(v.co.z for v in low.verts), min(v.co.z for v in high.verts))
        self.assertAlmostEqual(low.calc_volume() + high.calc_volume(), body.calc_volume(), delta=1e-3)

    def test_slab_is_a_closed_plate_of_its_thickness(self):
        bm = lp.slab([(0, 0), (0.4, 0), (0.4, 0.5), (0.2, 0.2), (0, 0.5)], 0.2, 0.03)
        self.assertTrue(manifold(bm))
        xs = [v.co.x for v in bm.verts]
        self.assertAlmostEqual(max(xs) - min(xs), 0.2, delta=1e-6)


def run():
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    if not result.wasSuccessful():
        raise RuntimeError('lp tests failed')  # --python-exit-code 1 turns this into exit status 1


run()
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm run living:test`
Expected: exit status 1 with `ModuleNotFoundError: No module named 'lp'`.

- [ ] **Step 4: Write `lp.py` part 1**

Create `apps/web/scripts/blender/lp.py`:

```python
"""Building blocks for the living chess pieces: geometry, rig, baked clips, the clip-contract check, preview, export.

Coordinates are Blender's: Z up, the piece faces -Y (the glTF exporter turns that into +Z, the way the game's pieces
face). Every bone has its head at the origin and points up, so all bones share one rest frame and a pose is a plain
armature-space matrix per bone: see bake(). Spec: docs/superpowers/specs/2026-11-19-living-pieces-design.md.
"""
import math

import bmesh
from mathutils import Matrix, Vector

FPS = 30
CLIPS = ('idle', 'walk', 'attack', 'die')
IMPACT = 0.6  # TIMING.impactAt in apps/web/src/scene/theme.ts: the attack's contact, as a fraction of the clip
IDENTITY = Matrix.Identity(4)
TWIST = 0.13  # radians: keeps cut() planes off the lathe's vertex columns, which sit every 7.5 degrees


def srgb(hex_colour):
    """Linear RGBA for an sRGB colour written '#RRGGBB'."""
    def linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_colour.lstrip('#')
    return tuple(linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


MAGENTA = (1.0, 0.0, 1.0, 1.0)  # GlbPiece's shader paints this the team colour
GOLD = srgb('#E0B04A')  # red and blue both well above green, so GlbPiece leaves it alone
RED = srgb('#B91C1C')  # PALETTE.red, for the preview renders only


def need(condition, message):
    """Raises AssertionError(message) unless `condition`; unlike assert, python -O cannot strip it."""
    if not condition:
        raise AssertionError(message)


# --- Timing --------------------------------------------------------------------------------------------------------

def clamp01(t):
    return min(max(t, 0.0), 1.0)


def keys(t, *values):
    """Linear interpolation through equally spaced keyframes, like keys() in rig.ts: keys(0.5, 0, 1, 0) == 1."""
    x = clamp01(t) * (len(values) - 1)
    i = min(int(x), len(values) - 2)
    return values[i] + (values[i + 1] - values[i]) * (x - i)


def ease(t, *values):
    """Like keys(), but each segment eases in and out, so the motion settles on every key."""
    x = clamp01(t) * (len(values) - 1)
    i = min(int(x), len(values) - 2)
    f = x - i
    return values[i] + (values[i + 1] - values[i]) * f * f * (3 - 2 * f)


def span(t, start, end):
    """Progress of t through [start, end], clamped to 0..1."""
    return clamp01((t - start) / (end - start))


def bump(t, centre, width):
    """1 at `centre`, easing to 0 at `width` either side; wraps around 1, so loops stay seamless."""
    d = abs(t - centre) % 1.0
    return ease(clamp01(1 - min(d, 1.0 - d) / width), 0, 1)


# --- Motion (armature-space matrices) -------------------------------------------------------------------------------

def move(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def turn(angle, axis, pivot=(0.0, 0.0, 0.0)):
    """Rotation by `angle` radians about the world `axis` ('X', 'Y' or 'Z') through `pivot`.
    turn(a, 'X') with a > 0 leans the top forward (toward -Y); turn(a, 'Y') with a > 0 leans it toward +X."""
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-p)


def stretch(sx, sy, sz, pivot=(0.0, 0.0, 0.0)):
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Diagonal((sx, sy, sz, 1.0)) @ Matrix.Translation(-p)


def tip(angle, radius):
    """Leans the piece over the rim of its base, `radius` from the axis: forward for angle > 0, back for < 0.
    Pivoting on the rim keeps the base on or above the floor."""
    return turn(angle, 'X', (0.0, -radius if angle > 0 else radius, 0.0))


def rock(angle, radius):
    """Rocks the piece sideways on its rim: toward +X for angle > 0, toward -X for < 0."""
    return turn(angle, 'Y', (radius if angle > 0 else -radius, 0.0, 0.0))


def bounce(u, height, lean, squash):
    """Walk pose at loop phase u: two hops per loop that land at u = 0 and 0.5 (the footfalls), rising, leaning
    forward and stretching in the air. Every landing is the rest pose, so a walk starts and ends at rest.
    Keep height >= base radius * lean, or the front of the base dips below the floor."""
    a = math.sin(math.pi * ((2 * u) % 1.0))
    return move(z=height * a) @ turn(lean * a, 'X') @ stretch(1 - squash * a / 2, 1 - squash * a / 2, 1 + squash * a)


# --- Geometry (bmesh) -----------------------------------------------------------------------------------------------

def spline(points, per=4):
    """A Catmull-Rom curve through `points` [(r, z)], `per` samples per segment. Repeating a point keeps a sharp
    corner there."""
    pts = [Vector(p) for p in [points[0], *points, points[-1]]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1:i + 3]
        if (p2 - p1).length < 1e-9:
            continue
        for k in range(per):
            t = k / per
            out.append(tuple(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                    + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)))
    out.append(tuple(pts[-1]))
    return out


def arc(centre_z, radius, start_deg, end_deg, count=12):
    """Points [(r, z)] on a circle about (0, centre_z) in the profile plane, from start_deg to end_deg
    (0 = outward, 90 = straight up): the round tops of pieces."""
    points = []
    for i in range(count + 1):
        a = math.radians(start_deg + (end_deg - start_deg) * i / count)
        r = radius * math.cos(a)
        points.append((0.0 if abs(r) < 1e-9 else r, centre_z + radius * math.sin(a)))
    return points


def shift(bm, vec):
    bmesh.ops.translate(bm, vec=vec, verts=bm.verts)
    return bm


def lathe(profile, steps=48, closed=False):
    """A solid of revolution about Z from `profile` [(r, z)]. An open profile must start and end on the axis
    (r = 0); a closed one is a loop off the axis (a ring)."""
    bm = bmesh.new()
    verts = [bm.verts.new((max(r, 0.0), 0.0, z)) for r, z in profile]
    for a, b in list(zip(verts, verts[1:])) + ([(verts[-1], verts[0])] if closed else []):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ring(radius, thickness, z, steps=48):
    """A torus around Z at height z, its tube `thickness` in radius: a trim band."""
    loop = [(radius + thickness * math.cos(a), z + thickness * math.sin(a)) for a in (i * math.tau / 12 for i in range(12))]
    return lathe(loop, steps, closed=True)


def ball(radius, x=0.0, y=0.0, z=0.0):
    return shift(lathe(arc(0.0, radius, -90, 90), steps=24), (x, y, z))


def block(sx, sy, sz, at=(0.0, 0.0, 0.0), angle=0.0, bevel=0.01):
    """A box sx by sy by sz with rounded edges, centred on `at`, then turned `angle` radians about Z through the
    origin."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
    shift(bm, at)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(angle, 3, 'Z'), verts=bm.verts)
    return bm


def cone(radius, depth, at=(0.0, 0.0, 0.0), segments=12):
    """A cone pointing up, `depth` tall, centred on `at`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=0.0, depth=depth)
    return shift(bm, at)


def keep(bm, co, no):
    """Cuts `bm` by the plane through `co` with normal `no`, drops the side `no` points to, and caps the cut."""
    result = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no,
                                    clear_outer=True)
    edges = [e for e in result['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    return bm


def halves(bm, co, no):
    """`bm` split by a plane into (the side `no` points away from, the side it points to); `bm` is left whole."""
    return keep(bm.copy(), co, no), keep(bm.copy(), co, [-c for c in no])


def cut(bm, heights, sectors):
    """Shards for a death: `bm` sliced into bands at `heights`, each band into `sectors` (at least 3) equal wedges
    around Z, each band turned half a wedge from the one below. Bottom band first. Empty shards are dropped."""
    need(sectors >= 3, 'a wedge must be narrower than half a turn')
    bounds = [None, *heights, None]
    width = math.tau / sectors
    shards = []
    for band, (low, high) in enumerate(zip(bounds, bounds[1:])):
        for k in range(sectors):
            a0 = (k + band * 0.5) * width + TWIST
            a1 = a0 + width
            s = bm.copy()
            if low is not None:
                keep(s, (0, 0, low), (0, 0, -1))
            if high is not None:
                keep(s, (0, 0, high), (0, 0, 1))
            keep(s, (0, 0, 0), (math.sin(a0), -math.cos(a0), 0))
            keep(s, (0, 0, 0), (-math.sin(a1), math.cos(a1), 0))
            if s.verts:
                shards.append(s)
            else:
                s.free()
    return shards


def slab(outline, thickness, bevel):
    """A carved plate: the polygon `outline` [(y, z)] in the YZ plane, `thickness` deep along X (centred on
    x = 0), its rim rounded by `bevel`."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((-thickness / 2, y, z)) for y, z in outline])
    top = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(thickness, 0, 0), verts=[g for g in top['geom'] if isinstance(g, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rim = [e for e in bm.edges if any(len(f.verts) > 4 for f in e.link_faces)]
    bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=3, profile=0.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return bm
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm run living:test`
Expected: `Ran 18 tests ... OK`, exit status 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/scripts/blender/lp.py apps/web/scripts/blender/test_lp.py
git commit -m "feat: add the geometry and motion building blocks for pieces built in Blender"
```

---

### Task 2: Rig, baked clips, clip-contract check, death helpers, preview and export (`lp.py`, part 2)

**Files:**
- Modify: `apps/web/scripts/blender/lp.py` (append)
- Modify: `apps/web/scripts/blender/test_lp.py` (add a test class before `def run():`)
- Create: `apps/web/scripts/blender/living_pieces.py`
- Create: `apps/web/scripts/blender/pieces.py`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces: `Part(mesh, material, bone)`, `Piece(parts, parent, clips, radius)` where `parent` is
  `{bone: parent bone or None}` (parents first, root `'body'`) and `clips` is `{clip: (frames, pose)}` with
  `pose(t) -> {bone: Matrix}` relative to the parent; `reset()`, `assemble(name, piece) -> (obj, rig)`,
  `world_poses(parent, local) -> {bone: Matrix}`, `bake(rig, piece, clip)`, `evaluate(rig, clip, frame)`,
  `deformed(obj) -> [Vector]`, `check(obj, rig, piece)`, `Shard(bone, centre, points)`,
  `shards_of(parts, parent, bones) -> [Shard]`, `fall(shard, s, spread, jump, tumble, towards=None) -> Matrix`
  (armature space), `crumble(parts, parent, radius, bones, recoil, spread, jump, tumble, start, special) -> pose`,
  `topple_angle(points, radius) -> float`, `preview(prefix, obj, rig, piece)`, `export(path)`, `glb_json(path)`.
  `pieces.py` exposes `PIECES = {name: builder}`, `foot(r)`, `foot_ring(r)`, `wedges(body, heights)`.

- [ ] **Step 1: Write the failing tests**

In `test_lp.py`, add before `def run():`:

```python
def toy(attack_end=0.0):
    """A cylinder in two shards on a body bone, with simple clips; `attack_end` leaves the attack off rest."""
    body = lp.lathe([(0, 0), (0.3, 0), (0.3, 0), (0.3, 1), (0.3, 1), (0, 1)])
    low, high = lp.halves(body, (0, 0, 0.5), (0, 0, 1))
    parts = [lp.Part(low, 'team', 'low'), lp.Part(high, 'trim', 'high')]
    parent = {'body': None, 'low': 'body', 'high': 'body'}
    clips = {
        'idle': (24, lambda t: {'body': lp.move(z=0.02 * (1 - math.cos(math.tau * t)))}),
        'walk': (24, lambda u: {'body': lp.bounce(u, 0.1, 0.1, 0.05)}),
        'attack': (30, lambda t: {'body': lp.tip(lp.ease(t, 0, -0.1, -0.2, 0.3, 0.05, attack_end), 0.3)}),
        'die': (30, lp.crumble(parts, parent, 0.3, ['low', 'high'])),
    }
    return lp.Piece(parts, parent, clips, 0.3)


def built(piece):
    lp.reset()
    obj, rig = lp.assemble('toy', piece)
    for clip in lp.CLIPS:
        lp.bake(rig, piece, clip)
    return obj, rig


class Rig(unittest.TestCase):
    def test_a_baked_pose_moves_each_vertex_by_its_bone_matrix(self):
        piece = toy()
        obj, rig = built(piece)
        frame = 18
        lp.evaluate(rig, 'die', frame)
        points = lp.deformed(obj)
        world = lp.world_poses(piece.parent, piece.clips['die'][1](frame / 30))
        names = [g.name for g in obj.vertex_groups]
        rest = [v.co.copy() for v in obj.data.vertices]
        error = max((points[i] - world[names[v.groups[0].group]] @ rest[i]).length for i, v in enumerate(obj.data.vertices))
        self.assertLess(error, 1e-4)

    def test_check_accepts_a_piece_that_keeps_the_contract(self):
        piece = toy()
        lp.check(*built(piece), piece)

    def test_check_rejects_an_attack_that_does_not_end_at_rest(self):
        piece = toy(attack_end=0.2)
        with self.assertRaisesRegex(AssertionError, 'attack does not end at rest'):
            lp.check(*built(piece), piece)

    def test_a_falling_shard_lands_on_the_floor_and_never_sinks(self):
        piece = toy()
        shard = lp.shards_of(piece.parts, piece.parent, ['high'])[0]
        for i in range(21):
            m = lp.fall(shard, i / 20, 0.3, 0.2, 1.5)
            self.assertGreaterEqual(min((m @ p).z for p in shard.points), -1e-9)
        self.assertAlmostEqual(min((lp.fall(shard, 1, 0.3, 0.2, 1.5) @ p).z for p in shard.points), 0, delta=1e-6)

    def test_shards_of_leaves_out_parts_under_another_shard(self):
        parts = [lp.Part(lp.ball(0.1, z=0.5), 'team', 'neck'), lp.Part(lp.ball(0.1, z=1.0), 'team', 'head')]
        neck, = lp.shards_of(parts, {'body': None, 'neck': 'body', 'head': 'neck'}, ['neck', 'head'])[:1]
        self.assertLess(max(p.z for p in neck.points), 0.7)

    def test_a_cylinder_topples_all_the_way_onto_its_side(self):
        piece = toy()
        points = [v.co for p in piece.parts for v in p.mesh.verts]
        self.assertAlmostEqual(lp.topple_angle(points, 0.3), math.pi / 2, delta=0.02)

    def test_export_writes_the_four_clips_with_unique_node_names(self):
        piece = toy()
        built(piece)
        path = os.path.join(tempfile.mkdtemp(), 'toy.glb')
        lp.export(path)
        data = lp.glb_json(path)
        self.assertEqual(sorted(a['name'] for a in data['animations']), sorted(lp.CLIPS))
        names = [n['name'] for n in data['nodes']]
        self.assertEqual(len(names), len(set(names)))  # three.js binds clip tracks to nodes by name
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run living:test`
Expected: exit status 1; the new tests error with `AttributeError: module 'lp' has no attribute 'Part'`.

- [ ] **Step 3: Append part 2 to `lp.py`**

Add `import json`, `import struct`, `from dataclasses import dataclass` and `import bpy` to the imports at the top of
`lp.py` (keep them sorted: standard library, then `bmesh`, `bpy`, `mathutils`), then append:

```python
# --- Rig ------------------------------------------------------------------------------------------------------------

TOLERANCE = 1e-4
FLOOR = -0.01  # the lowest z any vertex may reach in any frame of any clip
MAX_BONES = 16


@dataclass
class Part:
    mesh: object  # bmesh.types.BMesh
    material: str  # 'team' (recoloured per team in the game) or 'trim' (gold)
    bone: str


@dataclass
class Piece:
    parts: list
    parent: dict  # bone -> its parent bone, None for the root 'body'; parents come before their children
    clips: dict  # clip -> (frames, pose); pose(t) -> {bone: Matrix}, each relative to its parent's pose
    radius: float  # of the base, for tip() and rock()


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def material(name, colour, metallic, roughness):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = colour
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    m.diffuse_color = colour
    return m


def assemble(name, piece):
    """The piece as one mesh object skinned to one armature: each part's vertices weighted 1.0 to its bone."""
    bones = list(piece.parent)
    slots = ['team', 'trim']
    bm = bmesh.new()
    ranges = []
    for part in piece.parts:
        need(part.bone in bones, f'a part is bound to the unknown bone {part.bone}')
        data = bpy.data.meshes.new('part')
        part.mesh.to_mesh(data)
        first_vert, first_face = len(bm.verts), len(bm.faces)
        bm.from_mesh(data)
        bpy.data.meshes.remove(data)
        ranges.append((part, first_vert, len(bm.verts), first_face, len(bm.faces)))
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    deform = bm.verts.layers.deform.verify()
    for part, v0, v1, f0, f1 in ranges:
        for v in bm.verts[v0:v1]:
            v[deform][bones.index(part.bone)] = 1.0
        for f in bm.faces[f0:f1]:
            f.material_index = slots.index(part.material)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:  # crisp rims, smooth curves
        e.smooth = not (e.is_manifold and e.calc_face_angle(0.0) > math.radians(40))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material('team', MAGENTA, 0.0, 0.25))
    mesh.materials.append(material('trim', GOLD, 1.0, 0.3))
    obj = bpy.data.objects.new(name, mesh)
    for bone in bones:
        obj.vertex_groups.new(name=bone)

    rig = bpy.data.objects.new(f'{name}-rig', bpy.data.armatures.new(f'{name}-rig'))
    scene = bpy.context.scene
    scene.collection.objects.link(rig)
    scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in bones:
        edit = rig.data.edit_bones.new(bone)
        edit.head, edit.tail = (0, 0, 0), (0, 0, 1)  # one shared rest frame: see the module docstring
        if piece.parent[bone]:
            edit.parent = rig.data.edit_bones[piece.parent[bone]]
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.parent = rig
    obj.modifiers.new('rig', 'ARMATURE').object = rig
    rig.animation_data_create()
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return obj, rig


def world_poses(parent, local):
    """Armature-space matrices from parent-relative ones; a bone missing from `local` keeps its parent's pose."""
    world = {}
    for bone, up in parent.items():
        world[bone] = (world[up] if up else IDENTITY) @ local.get(bone, IDENTITY)
    return world


def bake(rig, piece, clip):
    """Keys `clip` on every bone at every frame, from frame 0. With one shared rest frame R, a bone's basis is
    R^-1 L R, where L is its pose relative to its parent. Every bone is keyed so no clip leaves a bone at another
    clip's pose in the game's mixer."""
    frames, pose = piece.clips[clip]
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    rig.animation_data.action = action
    rest = rig.data.bones[0].matrix_local.copy()
    to_bone = rest.inverted()
    previous = {}
    for frame in range(frames + 1):
        local = pose(frame / frames)
        for pb in rig.pose.bones:
            loc, rot, scale = (to_bone @ local.get(pb.name, IDENTITY) @ rest).decompose()
            if pb.name in previous and previous[pb.name].dot(rot) < 0:
                rot.negate()  # the same rotation, but the short way round from the last frame
            previous[pb.name] = rot
            pb.location, pb.rotation_quaternion, pb.scale = loc, rot, scale
            for path in ('location', 'rotation_quaternion', 'scale'):
                pb.keyframe_insert(path, frame=frame)
    rig.animation_data.action = None


def evaluate(rig, clip, frame):
    rig.animation_data.action = bpy.data.actions[clip]
    bpy.context.scene.frame_set(frame)


def deformed(obj):
    """World positions of `obj`'s vertices as posed now."""
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def same(a, b):
    """Whether two lists of matrices agree within TOLERANCE."""
    return all(abs(x - y) < TOLERANCE for m, n in zip(a, b) for row_m, row_n in zip(m, n) for x, y in zip(row_m, row_n))


def check(obj, rig, piece):
    """The clip contract in the spec's Testing section; raises AssertionError naming the first breach."""
    for clip in CLIPS:
        need(clip in piece.clips and clip in bpy.data.actions, f'missing clip {clip}')
    need(len(rig.data.bones) <= MAX_BONES, f'{len(rig.data.bones)} bones; at most {MAX_BONES}')
    loose = [v.index for v in obj.data.vertices if len(v.groups) != 1 or abs(v.groups[0].weight - 1) > 1e-6]
    need(not loose, f'{len(loose)} vertices are not weighted 1.0 to exactly one bone')
    rest = [IDENTITY] * len(rig.pose.bones)
    for clip in CLIPS:
        frames = piece.clips[clip][0]
        lows, fronts, poses = [], [], []
        for frame in range(frames + 1):
            evaluate(rig, clip, frame)
            points = deformed(obj)
            lows.append(min(p.z for p in points))
            fronts.append(min(p.y for p in points))
            poses.append([pb.matrix_basis.copy() for pb in rig.pose.bones])
        low = min(lows)
        need(low >= FLOOR, f'{clip} sinks {-low:.3f} below the floor at frame {lows.index(low)}')
        if clip in ('idle', 'walk'):
            need(same(poses[0], poses[-1]), f'{clip} does not loop: its last frame differs from its first')
        else:
            need(same(poses[0], rest), f'{clip} does not start at rest')
        if clip == 'attack':
            need(same(poses[-1], rest), 'attack does not end at rest')
            contact, furthest = round(IMPACT * frames), fronts.index(min(fronts))
            need(abs(furthest - contact) <= 1, f'attack reaches furthest forward at frame {furthest}, not {contact}')
    rig.animation_data.action = None


# --- Deaths ---------------------------------------------------------------------------------------------------------

@dataclass
class Shard:
    bone: str
    centre: Vector
    points: list  # rest positions of the vertices that move with this bone and no other shard


def shards_of(parts, parent, bones):
    """A Shard for each of `bones`, from the parts on it or on bones below it that are not shards themselves."""
    def owner(bone):
        while bone and bone not in bones:
            bone = parent[bone]
        return bone
    shards = []
    for bone in bones:
        points = [v.co.copy() for p in parts if owner(p.bone) == bone for v in p.mesh.verts]
        need(points, f'shard {bone} has no geometry')
        shards.append(Shard(bone, sum(points, Vector()) / len(points), points))
    return shards


def fall(shard, s, spread, jump, tumble, towards=None):
    """Armature-space pose of a flying shard at progress s (0..1): out from the axis (or `towards` a direction) by
    `spread`, up by `jump` and down to the floor, tumbling `tumble` radians about its centre. Once it touches the
    floor it slides on it instead of sinking."""
    flat = Vector(towards) if towards else Vector((shard.centre.x, shard.centre.y, 0.0))
    out = flat.normalized() if flat.length > 1e-3 else Vector((0.0, -1.0, 0.0))  # a shard on the axis falls forward
    axis = Vector((0.0, 0.0, 1.0)).cross(out)  # tumbling about it tips the top outward

    def spin(angle):
        return Matrix.Translation(shard.centre) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-shard.centre)

    def lowest(m):
        return min((m @ p).z for p in shard.points)

    eased = 1 - (1 - s) ** 2
    turned = spin(tumble * eased)
    landing = -lowest(spin(tumble))
    z = max(jump * math.sin(math.pi * s) + landing * s * s, -lowest(turned))
    return Matrix.Translation(out * spread * eased + Vector((0.0, 0.0, z))) @ turned


def crumble(parts, parent, radius, bones, recoil=0.3, spread=0.25, jump=0.15, tumble=1.2, start=0.3, special=None):
    """A die(t): a jolt back over the rim until `start` (the hit), then `bones` burst out and fall to the floor.
    `special` maps a bone to overrides of fall()'s keywords and of 'start', which must not come before `start`."""
    shards = shards_of(parts, parent, bones)
    special = special or {}

    def pose(t):
        local = {'body': tip(-recoil * math.sin(math.pi * span(t, 0.0, start)), radius)}
        world = world_poses(parent, local)
        for i, shard in enumerate(shards):
            k = 0.8 + 0.1 * (i * 7 % 5)  # each shard a little different, the same on every build
            options = {'spread': spread * k, 'jump': jump * k, 'tumble': tumble * k * (-1) ** i, 'start': start}
            options.update(special.get(shard.bone, {}))
            begin = options.pop('start')
            need(begin >= start, f'{shard.bone} would leave the body before the hit ends')
            if t < begin:
                continue  # still riding its parent
            moved = fall(shard, span(t, begin, 1.0), **options)
            local[shard.bone] = world[parent[shard.bone]].inverted() @ moved
            world[shard.bone] = moved
        return local
    return pose


def topple_angle(points, radius, limit=math.pi / 2):
    """How far the piece can tip forward over its rim before any of `points` would go below the floor."""
    angle = 0.0
    while angle + 0.01 <= limit and min((tip(angle + 0.01, radius) @ p).z for p in points) >= -1e-6:
        angle += 0.01
    return angle


# --- Output ---------------------------------------------------------------------------------------------------------

def preview(prefix, obj, rig, piece):
    """Renders <prefix>-rest/-walk/-attack/-die.png on a floor, in the red team's colour: at rest, mid-hop, at the
    attack's contact and at the end of the death."""
    scene = bpy.context.scene
    colour = bpy.data.materials['team'].node_tree.nodes['Principled BSDF'].inputs['Base Color']
    colour.default_value = RED
    height = max(v.co.z for v in obj.data.vertices)
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.location = (1.7 * height, -2.4 * height, 1.3 * height)  # three-quarter view from the front right
    camera.rotation_euler = (Vector((0, 0, 0.45 * height)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.0
    sun.rotation_euler = (0.7, 0.2, 0.9)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 1.0
    fill.rotation_euler = (1.2, 0.0, -2.4)
    floor_mesh = bpy.data.meshes.new('floor')
    floor_mesh.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new('floor', floor_mesh)
    staging = [camera, sun, fill, floor]
    for o in staging:
        scene.collection.objects.link(o)
    scene.camera = camera
    scene.world = bpy.data.worlds.new('world')
    background = scene.world.node_tree.nodes.get('Background') if scene.world.node_tree else None
    if background:
        background.inputs['Color'].default_value = (0.18, 0.15, 0.2, 1.0)
    scene.world.color = (0.18, 0.15, 0.2)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 512
    shots = {
        'rest': ('idle', 0),
        'walk': ('walk', piece.clips['walk'][0] // 4),
        'attack': ('attack', round(IMPACT * piece.clips['attack'][0])),
        'die': ('die', piece.clips['die'][0]),
    }
    for label, (clip, frame) in shots.items():
        evaluate(rig, clip, frame)
        scene.render.filepath = f'{prefix}-{label}.png'
        bpy.ops.render.render(write_still=True)
    for o in staging:
        bpy.data.objects.remove(o)
    colour.default_value = MAGENTA
    rig.animation_data.action = None


def export(path):
    """A binary glTF holding every action as its own animation, every bone keyed in every one."""
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animation_mode='ACTIONS', export_skins=True,
                              export_yup=True, export_force_sampling=True, export_optimize_animation_size=False)


def glb_json(path):
    """The JSON chunk of a binary glTF file."""
    with open(path, 'rb') as f:
        data = f.read()
    need(struct.unpack_from('<I', data, 0)[0] == 0x46546C67, f'{path} is not a binary glTF file')
    return json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
```

- [ ] **Step 4: Create the entry point and an empty piece table**

Create `apps/web/scripts/blender/pieces.py`:

```python
"""The six living chess pieces: each builder returns an lp.Piece. Sizes are in squares (GlbPiece rescales to
HEIGHT in models.ts anyway); the base stands on z = 0 and the piece faces -Y. Designs: the Pieces table in
docs/superpowers/specs/2026-11-19-living-pieces-design.md."""
import math

from lp import (Part, Piece, arc, ball, block, bounce, bump, cone, crumble, cut, ease, fall, halves, lathe, move, ring,
                rock, shards_of, shift, slab, span, spline, stretch, tip, topple_angle, turn)

TAU = math.tau


def foot(r):
    """The Staunton foot every piece shares: a flat base, a rim, a bead, rising into the stem."""
    return [(0, 0), (r, 0), (r, 0), (r, 0.15 * r), (r, 0.15 * r), (0.87 * r, 0.25 * r), (0.92 * r, 0.34 * r),
            (0.70 * r, 0.48 * r)]


def foot_ring(r):
    """The gold band on the foot's bead."""
    return ring(0.92 * r, 0.012, 0.34 * r)


def wedges(body, heights):
    """`body` cut into 3 shards per band (lp.cut), as team-coloured parts on bones s0, s1, ... from the bottom band."""
    shards = cut(body, heights, 3)
    body.free()
    return [Part(s, 'team', f's{i}') for i, s in enumerate(shards)]


PIECES = {}  # name -> builder; each task adds its piece below
```

Create `apps/web/scripts/blender/living_pieces.py`:

```python
"""Builds one living chess piece: npm run living -- <piece>  (from apps/web; Blender runs this file).

Writes assets-src/living/<piece>.glb (for npm run models), <piece>.blend (to open and tune by hand) and
<piece>-{rest,walk,attack,die}.png (to judge the look). Writes nothing if the piece breaks the clip contract.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import lp  # noqa: E402
import pieces  # noqa: E402


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    lp.need(len(args) == 2 and args[0] in pieces.PIECES, f'usage: npm run living -- <{"|".join(pieces.PIECES)}>')
    name, out = args[0], os.path.abspath(args[1])
    lp.reset()
    piece = pieces.PIECES[name]()
    obj, rig = lp.assemble(name, piece)
    for clip in lp.CLIPS:
        lp.bake(rig, piece, clip)
    lp.check(obj, rig, piece)
    os.makedirs(out, exist_ok=True)
    lp.preview(os.path.join(out, name), obj, rig, piece)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f'{name}.blend'))
    lp.export(os.path.join(out, f'{name}.glb'))
    print(f'{name}: the clip contract holds; wrote {os.path.join(out, name)}.glb')


main()
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm run living:test`
Expected: `Ran 25 tests ... OK`, exit status 0.

Also run: `npm run living -- pawn`
Expected: exit status 1 with `AssertionError: usage: npm run living -- <>` (no piece yet).

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/blender
git commit -m "feat: rig, bake and check pieces built in Blender, render previews and export them as glTF"
```

---

### Task 3: Footfalls on the hop landings

**Files:**
- Modify: `apps/web/src/scene/sequencer.ts:42`
- Test: `apps/web/src/scene/sequencer.test.ts` (add a test after "a long walk has two footfalls per square…")

**Interfaces:**
- Consumes: `bounce()`'s timing from Task 1: hops land at loop phase 0.5 and 1 of each square.
- Produces: footfall `step` sounds at `((i + 1) / count) * walkMs(length)`.

- [ ] **Step 1: Write the failing test**

Add to `sequencer.test.ts` after the "a long walk has two footfalls per square" test:

```ts
test('footfalls play as each hop lands: two per square, the last as the walk ends', async () => {
  const { deps } = setup('8/P7/8/8/8/8/1N6/k6K w - - 0 1');
  const delays: number[] = [];
  await runSteps([{ kind: 'walk', piece: 'w-k-h1', to: 'h4' }], {
    ...deps,
    sound: (name, delayMs) => void (name === 'step' && delays.push(Math.round(delayMs ?? 0))),
  });
  expect(delays).toEqual([1, 2, 3, 4, 5, 6].map((i) => Math.round((i / 6) * walkMs(3))));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/scene/sequencer.test.ts`
Expected: FAIL; the received delays are a twelfth of `walkMs(3)` earlier (83, 250, …).

- [ ] **Step 3: Change the timing**

In `sequencer.ts`, replace line 42:

```ts
    // Living pieces hop twice per square and land at the end of each hop (scripts/blender/lp.py, bounce).
    for (let i = 0; i < count; i++) sound?.('step', ((i + 1) / count) * walkMs(length));
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/scene/sequencer.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/scene/sequencer.ts apps/web/src/scene/sequencer.test.ts
git commit -m "feat: play footfalls as each hop lands, for pieces that hop twice per square"
```

---

### Task 4: The pawn (pilot)

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (append)
- Create: `apps/web/public/models/pawn-3.glb` (built)
- Delete: `apps/web/public/models/pawn-2.glb`
- Modify: `apps/web/src/scene/pieces/models.ts`
- Modify: `apps/web/public/models/CREDITS.md`

**Interfaces:**
- Consumes: Tasks 1–2 (`lp`), `foot`, `foot_ring`, `wedges` from `pieces.py`.
- Produces: `PIECES['pawn']`; `MODELS.p.url === '/models/pawn-3.glb'`.

- [ ] **Step 1: Run the build to see it fail**

Run: `npm run living -- pawn`
Expected: exit status 1, `AssertionError: usage: npm run living -- <>`.

- [ ] **Step 2: Add the pawn**

Append to `pieces.py`:

```python
def pawn():
    """Ball head, collar, low base. Quick bob; nimble hops; a head-butt; cracks into six shards."""
    r = 0.3
    profile = spline(foot(r) + [(0.15, 0.25), (0.115, 0.40), (0.10, 0.50), (0.10, 0.50), (0.16, 0.525),
                                (0.16, 0.565), (0.085, 0.594), (0.085, 0.594)])[:-1] + arc(0.735, 0.165, -59, 90)
    parts = wedges(lathe(profile), [0.45])
    parts += [Part(foot_ring(r), 'trim', 's0'), Part(ring(0.16, 0.012, 0.545), 'trim', 's3')]
    shards = [f's{i}' for i in range(6)]
    parent = {'body': None, **{s: 'body' for s in shards}}

    def idle(t):  # a quick small bob with a slight sway
        b = 0.5 - 0.5 * math.cos(2 * TAU * t)
        return {'body': rock(0.025 * math.sin(TAU * t), r) @ stretch(1 - 0.006 * b, 1 - 0.006 * b, 1 + 0.012 * b)}

    def walk(u):  # small, nimble hops
        return {'body': bounce(u, 0.07, 0.12, 0.08)}

    def attack(t):  # leans back, head-butts forward at the contact, springs back
        return {'body': move(y=ease(t, 0, 0.03, 0.05, -0.10, 0.02, 0))
                @ tip(ease(t, 0, -0.12, -0.22, 0.32, 0.05, 0), r)
                @ stretch(1, 1, ease(t, 1, 0.95, 0.92, 1.06, 1, 1))}

    die = crumble(parts, parent, r, shards, spread=0.28, jump=0.12, tumble=1.4)
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['pawn'] = pawn
```

- [ ] **Step 3: Build it**

Run: `npm run living -- pawn`
Expected: `pawn: the clip contract holds; wrote …/assets-src/living/pawn.glb`, exit status 0, and
`assets-src/living/pawn-{rest,walk,attack,die}.png` plus `pawn.blend` exist.

If the check fails, the message names the clip and frame. Fix the numbers in `pawn()` (amplitudes, keys), not the
check, then rebuild.

- [ ] **Step 4: Look at the four previews**

Open each PNG with the Read tool. Confirm: the silhouette reads as a Staunton pawn; gold bands sit on the bead and
the collar; mid-hop it is lifted and leaning forward; at contact it is tipped forward; at the end of the death six
shards lie on the floor, none floating or sunk. Adjust profile points in `pawn()` and rebuild until it looks right.

- [ ] **Step 5: Optimise it into the game and swap the file**

```bash
npm run models -- assets-src/living/pawn.glb public/models/pawn-3.glb
git rm public/models/pawn-2.glb
ls -l public/models/pawn-3.glb
```

Expected: `pawn-3.glb` is at most 153,600 bytes (150 KB). If larger, lower `steps` in `lathe()` calls for this piece
from 48 to 32 and rebuild.

- [ ] **Step 6: Point the game at it**

In `apps/web/src/scene/pieces/models.ts`, replace the comment above `CLIPS` and the pawn's line:

```ts
// scripts/kaykit-piece.ts and scripts/blender/living_pieces.py name every model's clips the same way.
```

```ts
  p: { url: '/models/pawn-3.glb', clips: CLIPS },
```

- [ ] **Step 7: Record it in CREDITS.md**

In `apps/web/public/models/CREDITS.md`, delete the `pawn-2.glb` table row and add at the end:

~~~markdown
## Living pieces (made in this repository)

Built from scratch by `scripts/blender/living_pieces.py` (Blender 5.3.0), no third-party assets:

| File | Piece |
|---|---|
| `pawn-3.glb` | pawn |

From `apps/web`:

```bash
npm run living -- <piece>      # writes assets-src/living/<piece>.glb, .blend and four preview PNGs
npm run models -- assets-src/living/<piece>.glb public/models/<piece>-<n>.glb
npm run living:test            # the building blocks' tests
```
~~~

- [ ] **Step 8: Run the web tests**

Run: `npm test`
Expected: PASS, including `models.test.ts` (versioned name, all four clips present, sizes).

- [ ] **Step 9: See it in the game**

Start the dev server with the preview tool (`preview_start` name `chess-dev`, from `.claude/launch.json`). Start a
two-player game, play 1. e4 d5 2. exd5 so a pawn walks, attacks and takes a pawn that shatters. Screenshot the
walk, the strike and the shards; check both red and blue pawns recolour with the gold untouched; check the console
for no `piece model failed to load` warning.

- [ ] **Step 10: Commit**

```bash
git add apps/web/scripts/blender/pieces.py apps/web/public/models apps/web/src/scene/pieces/models.ts
git commit -m "feat: draw the pawn as a living Staunton piece built in Blender"
```

- [ ] **Step 11: STOP — owner approval of the pilot**

Show the owner the four previews and the in-game screenshots. The pilot passes on the spec's four criteria
(approved look; clean red/blue recolour; walk/attack/death read well with the strike as the defender recoils;
≤ 150 KB and all tests pass). Do not start Task 5 until the owner says yes; fold any requested changes into
`pawn()` first, rebuild as `pawn-4.glb` if `pawn-3.glb` was already committed.

---

### Task 5: The rook

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (append)
- Create: `apps/web/public/models/rook-2.glb`; Delete: `apps/web/public/models/rook-1.glb`
- Modify: `apps/web/src/scene/pieces/models.ts`, `apps/web/public/models/CREDITS.md`

**Interfaces:**
- Consumes: as Task 4.
- Produces: `PIECES['rook']`; `MODELS.r.url === '/models/rook-2.glb'`.

- [ ] **Step 1: Run the build to see it fail**

Run: `npm run living -- rook`
Expected: exit status 1, `AssertionError: usage: npm run living -- <pawn>`.

- [ ] **Step 2: Add the rook**

Append to `pieces.py`:

```python
def rook():
    """A tower with five merlons. Nearly still; heavy rocking; a body-slam; merlons fly off, the tower collapses."""
    r = 0.34
    profile = spline(foot(r) + [(0.22, 0.30), (0.21, 0.70), (0.225, 0.92), (0.27, 0.98), (0.27, 0.98), (0.27, 1.08),
                                (0.27, 1.08), (0.20, 1.08), (0.20, 1.08), (0.20, 1.03), (0.20, 1.03), (0, 1.03)])
    parts = wedges(lathe(profile), [0.6])
    merlons = [f'm{k}' for k in range(5)]
    parts += [Part(block(0.07, 0.13, 0.22, (0.235, 0, 1.19), angle=k * TAU / 5), 'team', m) for k, m in enumerate(merlons)]
    parts += [Part(foot_ring(r), 'trim', 's0'), Part(ring(0.27, 0.012, 0.995), 'trim', 's3')]
    shards = [f's{i}' for i in range(6)]
    parent = {'body': None, **{s: 'body' for s in shards}, **{m: 'body' for m in merlons}}

    def idle(t):  # nearly still; each merlon twitches once per loop, at its own moment
        return {'body': rock(0.008 * math.sin(TAU * t), r),
                **{m: move(z=0.012 * bump(t, 0.1 + k / 5, 0.05)) for k, m in enumerate(merlons)}}

    def walk(u):  # heavy side-to-side rocking, upright on each footfall; the merlons rattle
        rattle = move(z=0.008 * abs(math.sin(2 * TAU * u)))
        return {'body': move(z=0.02 * abs(math.sin(TAU * u))) @ rock(0.10 * math.sin(TAU * u), r),
                **{m: rattle for m in merlons}}

    def attack(t):  # tilts back, body-slams forward at the contact; the merlons rattle as it lands
        body = move(y=ease(t, 0, 0.02, 0.04, -0.06, 0, 0)) @ tip(ease(t, 0, -0.10, -0.20, 0.55, 0.10, 0), r)
        return {'body': body, **{m: move(z=0.03 * bump(t, 0.64 + 0.02 * k, 0.1)) for k, m in enumerate(merlons)}}

    die = crumble(parts, parent, r, merlons + shards, recoil=0.2, spread=0.22, jump=0.06, tumble=0.9,
                  special={**{m: {'spread': 0.45, 'jump': 0.35, 'tumble': 2.4} for m in merlons},
                           **{s: {'start': 0.42} for s in shards}})
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['rook'] = rook
```

- [ ] **Step 3: Build it and look at the previews**

Run: `npm run living -- rook`
Expected: `rook: the clip contract holds; …`, exit status 0. Open `assets-src/living/rook-*.png`: five merlons evenly
round the lip, the slam tipped well forward, the merlons and blocks on the floor at the end. Tune numbers in `rook()`
and rebuild until right.

- [ ] **Step 4: Optimise, swap, point the game at it**

```bash
npm run models -- assets-src/living/rook.glb public/models/rook-2.glb
git rm public/models/rook-1.glb
ls -l public/models/rook-2.glb
```

Expected: ≤ 153,600 bytes. In `models.ts`: `r: { url: '/models/rook-2.glb', clips: CLIPS },`. In `CREDITS.md`: delete
the `rook-1.glb` row from the KayKit table and add `| `rook-2.glb` | rook |` to the living pieces table.

- [ ] **Step 5: Run the web tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: See it in the game**

In the dev server preview, play a game where a rook takes (e.g. 1. h4 g5 2. hxg5 h6 3. Rxh6 Nxh6); screenshot the
rocking walk, the slam and the collapse.

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/blender/pieces.py apps/web/public/models apps/web/src/scene/pieces/models.ts
git commit -m "feat: draw the rook as a living tower that rocks, slams and collapses"
```

---

### Task 6: The bishop

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (append)
- Create: `apps/web/public/models/bishop-3.glb`; Delete: `apps/web/public/models/bishop-2.glb`
- Modify: `apps/web/src/scene/pieces/models.ts`, `apps/web/public/models/CREDITS.md`

**Interfaces:**
- Consumes: as Task 4, plus `halves`, `shift`, `ball`, `shards_of`, `fall`, `topple_angle`.
- Produces: `PIECES['bishop']`; `MODELS.b.url === '/models/bishop-3.glb'`.

- [ ] **Step 1: Run the build to see it fail**

Run: `npm run living -- bishop`
Expected: exit status 1, `AssertionError: usage: npm run living -- <pawn|rook>`.

- [ ] **Step 2: Add the bishop**

Append to `pieces.py`:

```python
def bishop():
    """A mitre with a slit and a ball finial. Praying tilt; smooth glide; a spin and a thrust; the mitre splits and
    flies off, the body falls over."""
    r = 0.3
    profile = spline(foot(r) + [(0.13, 0.35), (0.095, 0.55), (0.09, 0.62), (0.09, 0.62), (0.15, 0.645),
                                (0.15, 0.675), (0.085, 0.70), (0.085, 0.70), (0, 0.70)])
    mitre = lathe(spline([(0, 0.69), (0.10, 0.70), (0.15, 0.80), (0.15, 0.90), (0.10, 1.02), (0.035, 1.12),
                          (0.035, 1.12), (0, 1.12)]))
    slit_at, slit = (0.0, -0.02, 0.95), (0.0, 0.55, 0.83)  # the cut runs up from the back to the front of the mitre
    low, high = halves(mitre, slit_at, slit)
    mitre.free()
    gap = 0.006  # opens the slit so it shows at rest
    shift(low, [-gap * c for c in slit])
    shift(high, [gap * c for c in slit])
    parts = [Part(lathe(profile), 'team', 'body'), Part(foot_ring(r), 'trim', 'body'),
             Part(ring(0.15, 0.012, 0.66), 'trim', 'body'), Part(low, 'team', 'mitre_lo'),
             Part(high, 'team', 'mitre_hi'), Part(ball(0.05, z=1.17), 'trim', 'mitre_hi')]
    parent = {'body': None, 'mitre_lo': 'body', 'mitre_hi': 'body'}
    hat = shards_of(parts, parent, ['mitre_hi'])[0]
    lying = topple_angle([v.co for p in parts if p.bone != 'mitre_hi' for v in p.mesh.verts], r)

    def idle(t):  # a gentle forward tilt, as if praying
        return {'body': tip(0.04 * (0.5 - 0.5 * math.cos(TAU * t)), r)}

    def walk(u):  # a smooth glide with little bounce
        return {'body': bounce(u, 0.025, 0.05, 0.02)}

    def attack(t):  # one full turn, then a thrust of the mitre's point at the contact
        spin = turn(TAU * ease(span(t, 0.0, 0.45), 0, 1), 'Z')
        return {'body': move(y=ease(t, 0, 0, 0.02, -0.08, 0.01, 0)) @ tip(ease(t, 0, -0.04, -0.12, 0.38, 0.06, 0), r)
                @ spin}

    def die(t):  # a jolt back, then the mitre's top flies off behind while the body falls forward
        if t < 0.3:
            return {'body': tip(-0.25 * math.sin(math.pi * span(t, 0, 0.3)), r)}
        body = tip(ease(span(t, 0.35, 0.9), 0, lying), r)
        flying = fall(hat, span(t, 0.3, 0.95), spread=0.3, jump=0.25, tumble=1.8, towards=(0.6, 0.8, 0))
        return {'body': body, 'mitre_hi': body.inverted() @ flying}

    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['bishop'] = bishop
```

- [ ] **Step 3: Build it and look at the previews**

Run: `npm run living -- bishop`
Expected: `bishop: the clip contract holds; …`. In the PNGs: the slit visible as a thin diagonal groove on the mitre;
at contact the bishop leans forward; at the end the body lies tipped forward and the mitre's top lies behind it. Tune
and rebuild until right.

- [ ] **Step 4: Optimise, swap, point the game at it**

```bash
npm run models -- assets-src/living/bishop.glb public/models/bishop-3.glb
git rm public/models/bishop-2.glb
ls -l public/models/bishop-3.glb
```

Expected: ≤ 153,600 bytes. `models.ts`: `b: { url: '/models/bishop-3.glb', clips: CLIPS },`. `CREDITS.md`: delete
the `bishop-2.glb` row; add `| `bishop-3.glb` | bishop |` to the living pieces table.

- [ ] **Step 5: Run the web tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: See it in the game**

Play 1. e4 e5 2. Bc4 Nc6 3. Bxf7+ in the preview; screenshot the spin, the thrust and the bishop taken later
(3… Kxf7).

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/blender/pieces.py apps/web/public/models apps/web/src/scene/pieces/models.ts
git commit -m "feat: draw the bishop as a living mitre that spins, thrusts and splits"
```

---

### Task 7: The queen

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (append)
- Create: `apps/web/public/models/queen-2.glb`; Delete: `apps/web/public/models/queen-1.glb`
- Modify: `apps/web/src/scene/pieces/models.ts`, `apps/web/public/models/CREDITS.md`

**Interfaces:**
- Consumes: as Task 4.
- Produces: `PIECES['queen']`; `MODELS.q.url === '/models/queen-2.glb'`.

- [ ] **Step 1: Run the build to see it fail**

Run: `npm run living -- queen`
Expected: exit status 1, `AssertionError: usage: npm run living -- <pawn|rook|bishop>`.

- [ ] **Step 2: Add the queen**

Append to `pieces.py`:

```python
def queen():
    """A coronet of eight balls on a narrow waist. Hip sway; graceful hops; a whirling lash with the coronet flaring;
    the coronet pops off and the body shatters."""
    r = 0.32
    profile = spline(foot(r) + [(0.15, 0.32), (0.10, 0.52), (0.09, 0.62), (0.10, 0.72), (0.10, 0.82), (0.10, 0.82),
                                (0.17, 0.85), (0.17, 0.885), (0.10, 0.91), (0.10, 0.91), (0.12, 1.0), (0.16, 1.12),
                                (0.19, 1.21), (0.19, 1.21), (0.19, 1.23), (0.19, 1.23), (0.12, 1.24), (0.06, 1.27),
                                (0, 1.28)])
    parts = wedges(lathe(profile), [0.7])
    parts += [Part(ring(0.185, 0.014, 1.22), 'trim', 'crown'), Part(ball(0.045, z=1.315), 'trim', 'crown')]
    parts += [Part(ball(0.028, 0.175 * math.cos(a), 0.175 * math.sin(a), 1.255), 'trim', 'crown')
              for a in (k * TAU / 8 for k in range(8))]
    parts += [Part(foot_ring(r), 'trim', 's0'), Part(ring(0.17, 0.012, 0.87), 'trim', 's3')]
    shards = [f's{i}' for i in range(6)]
    parent = {'body': None, **{s: 'body' for s in shards}, 'crown': 'body'}

    def idle(t):  # a slow sway of the hips
        return {'body': rock(0.03 * math.sin(TAU * t), r) @ turn(0.06 * math.sin(TAU * t), 'Z')}

    def walk(u):  # light, graceful hops with a sway
        return {'body': bounce(u, 0.06, 0.08, 0.05) @ turn(0.05 * math.sin(TAU * u), 'Z')}

    def attack(t):  # whirls once, leaning out further as she turns, and lashes forward at the contact
        whirl = -TAU * (1 - ease(span(t, 0.0, 0.6), 0, 1))
        lean = ease(t, 0, 0.12, 0.22, 0.35, 0.05, 0)
        flare = 1 + 0.25 * bump(t, 0.6, 0.2)  # the coronet's points spread out at the strike
        return {'body': turn(whirl, 'Z') @ tip(lean, r), 'crown': stretch(flare, flare, 1, (0, 0, 1.25))}

    die = crumble(parts, parent, r, ['crown'] + shards, spread=0.26, jump=0.12, tumble=1.3,
                  special={'crown': {'spread': 0.2, 'jump': 0.45, 'tumble': 2.5}, **{s: {'start': 0.38} for s in shards}})
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['queen'] = queen
```

- [ ] **Step 3: Build it and look at the previews**

Run: `npm run living -- queen`
Expected: `queen: the clip contract holds; …`. In the PNGs: eight gold balls on the coronet ring, the finial seated on
the dome; at contact she leans forward with the coronet spread; at the end the coronet lies apart from the shards.
Tune and rebuild until right.

- [ ] **Step 4: Optimise, swap, point the game at it**

```bash
npm run models -- assets-src/living/queen.glb public/models/queen-2.glb
git rm public/models/queen-1.glb
ls -l public/models/queen-2.glb
```

Expected: ≤ 153,600 bytes. `models.ts`: `q: { url: '/models/queen-2.glb', clips: CLIPS },`. `CREDITS.md`: delete the
`queen-1.glb` row; add `| `queen-2.glb` | queen |` to the living pieces table.

- [ ] **Step 5: Run the web tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: See it in the game**

Play 1. e4 e5 2. Qh5 Nc6 3. Qxf7+ in the preview; screenshot the whirl, the lash and (3… Kxf7) the queen's death.

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/blender/pieces.py apps/web/public/models apps/web/src/scene/pieces/models.ts
git commit -m "feat: draw the queen as a living piece that whirls, lashes and loses her coronet"
```

---

### Task 8: The king

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (append)
- Create: `apps/web/public/models/king-3.glb`; Delete: `apps/web/public/models/king-2.glb`
- Modify: `apps/web/src/scene/pieces/models.ts`, `apps/web/public/models/CREDITS.md`

**Interfaces:**
- Consumes: as Task 4, plus `block`, `shards_of`, `fall`, `topple_angle`.
- Produces: `PIECES['king']`; `MODELS.k.url === '/models/king-3.glb'`.

- [ ] **Step 1: Run the build to see it fail**

Run: `npm run living -- king`
Expected: exit status 1, `AssertionError: usage: npm run living -- <pawn|rook|bishop|queen>`.

- [ ] **Step 2: Add the king**

Append to `pieces.py`:

```python
def king():
    """The tallest, with a cross. Stately breathing; heavy hops; rises and hammers down; the cross falls first, then
    the king topples slowly and cracks."""
    r = 0.34
    profile = spline(foot(r) + [(0.16, 0.35), (0.115, 0.60), (0.11, 0.80), (0.11, 0.88), (0.11, 0.88), (0.18, 0.91),
                                (0.18, 0.945), (0.11, 0.97), (0.11, 0.97), (0.13, 1.07), (0.17, 1.20), (0.20, 1.27),
                                (0.20, 1.27), (0.20, 1.30), (0.20, 1.30), (0.14, 1.31), (0.07, 1.345), (0, 1.355)])
    parts = wedges(lathe(profile), [0.75])
    parts += [Part(block(0.05, 0.05, 0.20, (0, 0, 1.44)), 'trim', 'cross'),
              Part(block(0.15, 0.05, 0.05, (0, 0, 1.47)), 'trim', 'cross'),
              Part(foot_ring(r), 'trim', 's0'), Part(ring(0.18, 0.012, 0.93), 'trim', 's3'),
              Part(ring(0.20, 0.014, 1.285), 'trim', 's3')]
    names = [f's{i}' for i in range(6)]
    parent = {'body': None, **{s: 'body' for s in names}, 'cross': 'body'}
    cross = shards_of(parts, parent, ['cross'])[0]
    shards = shards_of(parts, parent, names)
    lying = topple_angle([v.co for p in parts if p.bone != 'cross' for v in p.mesh.verts], r)

    def idle(t):  # slow and stately breathing
        b = 0.5 - 0.5 * math.cos(TAU * t)
        return {'body': rock(0.01 * math.sin(TAU * t), r) @ stretch(1 - 0.004 * b, 1 - 0.004 * b, 1 + 0.008 * b)}

    def walk(u):  # heavy, dignified hops
        return {'body': bounce(u, 0.04, 0.06, 0.03)}

    def attack(t):  # rises tall, then hammers down like a gavel at the contact
        rise = ease(t, 0, 0.5, 1.0, -0.4, 0, 0)
        return {'body': tip(ease(t, 0, -0.05, -0.10, 0.45, 0.08, 0), r)
                @ stretch(1 - 0.04 * rise, 1 - 0.04 * rise, 1 + 0.10 * rise)}

    def die(t):  # a short jolt; the cross falls; the king topples slowly; its halves crack apart
        if t < 0.15:
            return {'body': tip(-0.2 * math.sin(math.pi * span(t, 0, 0.15)), r)}
        body = tip(ease(span(t, 0.3, 0.9), 0, lying), r)
        flying = fall(cross, span(t, 0.15, 0.7), spread=0.25, jump=0.2, tumble=1.6, towards=(0.7, 0.7, 0))
        crack = 0.035 * ease(span(t, 0.85, 1.0), 0, 1)  # along X, which stays level while it topples about X
        return {'body': body, 'cross': body.inverted() @ flying,
                **{s.bone: move(x=crack if s.centre.x > 0 else -crack) for s in shards}}

    return Piece(parts, parent, {'idle': (90, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['king'] = king
```

- [ ] **Step 3: Build it and look at the previews**

Run: `npm run living -- king`
Expected: `king: the clip contract holds; …`. In the PNGs: the cross upright and seated on the dome, gold bands at the
collar and crown; at contact the king tipped forward; at the end the king lying forward, split down the middle, the
cross on the floor beside it. Tune and rebuild until right.

- [ ] **Step 4: Optimise, swap, point the game at it**

```bash
npm run models -- assets-src/living/king.glb public/models/king-3.glb
git rm public/models/king-2.glb
ls -l public/models/king-3.glb
```

Expected: ≤ 153,600 bytes. `models.ts`: `k: { url: '/models/king-3.glb', clips: CLIPS },`. `CREDITS.md`: delete the
`king-2.glb` row; add `| `king-3.glb` | king |` to the living pieces table.

- [ ] **Step 5: Run the web tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: See it in the game**

Play 1. e4 e5 2. Ke2 Ke7 3. Ke3 d5 4. Kd3 dxe4+ 5. Kxe4 in the preview; screenshot the king's walk and hammer
(kings are never captured, so the death is checked in the previews only).

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/blender/pieces.py apps/web/public/models apps/web/src/scene/pieces/models.ts
git commit -m "feat: draw the king as a living piece that hammers and topples"
```

---

### Task 9: The knight

**Files:**
- Modify: `apps/web/scripts/blender/pieces.py` (append)
- Create: `apps/web/public/models/knight-2.glb`; Delete: `apps/web/public/models/knight-1.glb`
- Modify: `apps/web/src/scene/pieces/models.ts`, `apps/web/public/models/CREDITS.md`

**Interfaces:**
- Consumes: as Task 4, plus `slab`, `halves`, `cone`, `block`, `ball`.
- Produces: `PIECES['knight']`; `MODELS.n.url === '/models/knight-2.glb'`.

- [ ] **Step 1: Run the build to see it fail**

Run: `npm run living -- knight`
Expected: exit status 1, `AssertionError: usage: npm run living -- <pawn|rook|bishop|queen|king>`.

- [ ] **Step 2: Add the knight**

Append to `pieces.py`:

```python
HORSE = [(0.17, 0.28), (0.20, 0.55), (0.17, 0.80), (0.10, 1.00), (0.00, 1.15), (-0.08, 1.12), (-0.15, 1.00),
         (-0.32, 0.88), (-0.34, 0.80), (-0.28, 0.74), (-0.16, 0.76), (-0.08, 0.66), (-0.15, 0.50), (-0.16, 0.35),
         (-0.12, 0.28)]  # a horse's head and neck in profile, (y, z), facing -Y
MANE = [(0.205, 0.62), (0.195, 0.72), (0.18, 0.82), (0.145, 0.92), (0.10, 1.02)]  # just proud of the neck's back


def knight():
    """A carved horse's head on a neck, with ears, gold eyes and mane. Nods and flicks its ears; trots; rears up and
    strikes down with its head; the head breaks off, the neck falls forward, the base shatters."""
    r = 0.32
    profile = spline(foot(r) + [(0.19, 0.22), (0.20, 0.27), (0.20, 0.27), (0.21, 0.29), (0.21, 0.31), (0.21, 0.31),
                                (0, 0.31)])
    throat, split = (0.0, -0.08, 0.66), (0.0, -0.49, 0.87)  # a plane from the throat up to the back of the neck
    carved = slab(HORSE, 0.2, 0.04)
    neck, head = halves(carved, throat, split)
    carved.free()

    def on_head(y, z):
        return split[1] * (y - throat[1]) + split[2] * (z - throat[2]) > 0

    parts = wedges(lathe(profile), [])
    parts += [Part(neck, 'team', 'neck'), Part(head, 'team', 'head'),
              Part(cone(0.03, 0.1, (0.045, 0.02, 1.16)), 'team', 'ear_l'),
              Part(cone(0.03, 0.1, (-0.045, 0.02, 1.16)), 'team', 'ear_r'),
              Part(ball(0.02, 0.1, -0.13, 0.97), 'trim', 'head'), Part(ball(0.02, -0.1, -0.13, 0.97), 'trim', 'head'),
              Part(foot_ring(r), 'trim', 's0'), Part(ring(0.21, 0.012, 0.30), 'trim', 's1')]
    parts += [Part(block(0.06, 0.05, 0.08, (0, y, z)), 'trim', 'head' if on_head(y, z) else 'neck') for y, z in MANE]
    parent = {'body': None, 's0': 'body', 's1': 'body', 's2': 'body', 'neck': 'body', 'head': 'neck',
              'ear_l': 'head', 'ear_r': 'head'}
    neck_at, head_at = (0, 0.05, 0.31), (0, 0.04, 0.78)
    ear_at = {'ear_l': (0.045, 0.02, 1.11), 'ear_r': (-0.045, 0.02, 1.11)}

    def flick(t, ear, centre):  # an ear twitches back once per loop
        return turn(-0.35 * bump(t, centre, 0.04), 'X', ear_at[ear])

    def idle(t):  # nods, flicks its ears
        return {'neck': turn(0.04 * math.sin(TAU * t), 'X', neck_at),
                'head': turn(0.05 * math.sin(TAU * t + 1), 'X', head_at),
                'ear_l': flick(t, 'ear_l', 0.3), 'ear_r': flick(t, 'ear_r', 0.75)}

    def walk(u):  # a trotting bounce (the game also arcs the knight through the air), nodding on every hop
        return {'body': bounce(u, 0.03, 0.08, 0.03), 'neck': turn(0.10 * math.sin(2 * TAU * u), 'X', neck_at)}

    def attack(t):  # rears up, then strikes down with the head at the contact
        return {'body': tip(ease(t, 0, -0.15, -0.28, 0.28, 0.05, 0), r),
                'neck': turn(ease(t, 0, -0.15, -0.35, 0.30, 0.05, 0), 'X', neck_at),
                'head': turn(ease(t, 0, -0.10, -0.20, 0.25, 0, 0), 'X', head_at)}

    die = crumble(parts, parent, r, ['neck', 'head', 's0', 's1', 's2'], spread=0.22, jump=0.08, tumble=1.0,
                  special={'head': {'spread': 0.3, 'jump': 0.3, 'tumble': 2.2, 'towards': (0.3, -1, 0)},
                           'neck': {'spread': 0.12, 'jump': 0.02, 'tumble': 1.3, 'towards': (0, -1, 0), 'start': 0.36},
                           **{s: {'start': 0.42} for s in ('s0', 's1', 's2')}})
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['knight'] = knight
```

- [ ] **Step 3: Build it and look at the previews**

Run: `npm run living -- knight`
Expected: `knight: the clip contract holds; …`. The knight is the riskiest silhouette: in the PNGs check the head
reads as a horse from the game's three-quarter view (muzzle forward, ears up, mane on the back, gold eyes on both
sides), and the rear and strike read clearly. Tune `HORSE` (more points along the jaw and forehead if it looks
blocky), the slab thickness and the bevel, and rebuild until right.

- [ ] **Step 4: Optimise, swap, point the game at it**

```bash
npm run models -- assets-src/living/knight.glb public/models/knight-2.glb
git rm public/models/knight-1.glb
ls -l public/models/knight-2.glb
```

Expected: ≤ 153,600 bytes. `models.ts`: `n: { url: '/models/knight-2.glb', clips: CLIPS },`. `CREDITS.md`: delete the
`knight-1.glb` row; add `| `knight-2.glb` | knight |` to the living pieces table.

- [ ] **Step 5: Run the web tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: See it in the game**

Play 1. Nc3 d5 2. Nxd5 Qxd5 in the preview; screenshot the hop (the walk clip plays in the air), the rear and strike,
and the knight's death.

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/blender/pieces.py apps/web/public/models apps/web/src/scene/pieces/models.ts
git commit -m "feat: draw the knight as a living horse's head that rears and strikes"
```

---

### Task 10: Retire KayKit and record the outcome

**Files:**
- Delete: `apps/web/scripts/kaykit-piece.ts`
- Modify: `apps/web/src/scene/pieces/models.ts` (comment), `apps/web/src/ui/Settings.tsx:91-104` (credit block),
  `apps/web/src/ui/i18n.ts:92,204` (`modelCredit`), `apps/web/public/models/CREDITS.md`
- Modify: `docs/superpowers/specs/2026-11-19-living-pieces-design.md` (outcome section)

**Interfaces:**
- Consumes: Tasks 4–9 (no KayKit file left in `public/models`).
- Produces: no third-party model ships; nothing else depends on `modelCredit`.

- [ ] **Step 1: Confirm nothing KayKit ships**

Run: `ls public/models; grep -rn "kaykit\|KayKit\|modelCredit" src scripts ../../e2e`
Expected: only the six living files plus `CREDITS.md`; matches only in `Settings.tsx`, `i18n.ts`, `models.ts` and
`scripts/kaykit-piece.ts`.

- [ ] **Step 2: Remove the credit and the old builder**

- `git rm scripts/kaykit-piece.ts`
- In `Settings.tsx`, delete the `{/* KayKit is CC0: … */}` comment and the whole
  `{Object.keys(MODELS).length > 0 && ( <p …>{t.modelCredit} … </p> )}` block after it; remove the `MODELS` import if
  nothing else in the file uses it.
- In `i18n.ts`, delete both `modelCredit:` lines.
- In `models.ts`, the comment above `CLIPS` becomes:
  `// scripts/blender/living_pieces.py names every model's clips the same way.`
- In `CREDITS.md`, delete the KayKit introduction, its table and its "Making the models again" section, so the file
  holds only the living pieces section with all six rows.

- [ ] **Step 3: Run every check**

From the repository root:

```bash
npm test
npm run typecheck
npm run lint
npm run e2e
```

and from `apps/web`: `npm run living:test`.
Expected: all pass; the E2E run loads every listed model in the three browsers.

- [ ] **Step 4: Record the outcome in the spec**

Append to `docs/superpowers/specs/2026-11-19-living-pieces-design.md` a `## Outcome (<date>)` section stating: the
six file names and sizes in bytes (from `ls -l public/models`), total size, the footfall timing change, anything the
owner asked to change at the pilot, any piece whose design moved away from the Pieces table and why, and the
in-game frame rate on the CPU renderer if measured.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src apps/web/public/models apps/web/scripts docs/superpowers/specs/2026-11-19-living-pieces-design.md
git commit -m "chore: retire the KayKit pieces and record the living pieces' outcome"
```
