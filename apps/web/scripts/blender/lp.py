"""Building blocks for the living chess pieces: geometry, rig, baked clips, the clip-contract check, preview, export.

Coordinates are Blender's: Z up, the piece faces -Y (the glTF exporter turns that into +Z, the way the game's pieces
face). Every bone has its head at the origin and points up, so all bones share one rest frame and a pose is a plain
armature-space matrix per bone: see bake(). Spec: docs/superpowers/specs/2026-11-19-living-pieces-design.md.
"""
import json
import math
import struct
from dataclasses import dataclass

import bmesh
import bpy
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
    m.use_backface_culling = True  # every part is a closed solid: exported single-sided
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
