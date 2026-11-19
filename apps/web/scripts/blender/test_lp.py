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
