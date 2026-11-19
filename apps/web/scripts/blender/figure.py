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
