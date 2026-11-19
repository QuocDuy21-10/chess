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
