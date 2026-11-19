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
