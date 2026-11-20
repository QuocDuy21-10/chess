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


class Materials(unittest.TestCase):
    def test_only_team_is_magenta_to_the_game_shader(self):
        for name, (colour, *_) in lp.MATERIALS.items():
            if name == 'team':
                self.assertGreater(lp.keyed(colour), 0.35)
            else:
                self.assertLess(lp.keyed(colour), 0.1, name)


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


def toy(attack_end=0.0, hit_lean=0.0):
    """A cylinder in two shards on a body bone, with simple clips; `attack_end` leaves the attack off rest, and
    `hit_lean` makes the hit end off rest, where the die (which starts at rest) does not follow it."""
    body = lp.lathe([(0, 0), (0.3, 0), (0.3, 0), (0.3, 1), (0.3, 1), (0, 1)])
    low, high = lp.halves(body, (0, 0, 0.5), (0, 0, 1))
    parts = [lp.Part(low, 'team', 'low'), lp.Part(high, 'trim', 'high')]
    parent = {'body': None, 'low': 'body', 'high': 'body'}
    clips = {
        'idle': (24, lambda t: {'body': lp.move(z=0.02 * (1 - math.cos(math.tau * t)))}),
        'walk': (24, lambda u: {'body': lp.bounce(u, 0.1, 0.1, 0.05)}),
        'attack': (30, lambda t: {'body': lp.tip(lp.ease(t, 0, -0.1, -0.2, 0.3, 0.05, attack_end), 0.3)}),
        'hit': (9, lambda t: {'body': lp.tip(-hit_lean * t, 0.3)}),
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

    def test_check_rejects_a_death_that_does_not_start_where_the_hit_ends(self):
        piece = toy(hit_lean=0.1)
        with self.assertRaisesRegex(AssertionError, 'die does not start where hit ends'):
            lp.check(*built(piece), piece)

    def test_check_rejects_a_part_the_game_would_paint_the_team_colour(self):
        piece = toy()
        lp.MATERIALS['purple'] = (lp.srgb('#9933CC'), 0.0, 0.5, 0.0)
        try:
            piece.parts[1].material = 'purple'
            with self.assertRaisesRegex(AssertionError, 'GlbPiece would paint purple the team colour'):
                lp.check(*built(piece), piece)
        finally:
            del lp.MATERIALS['purple']

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

    def test_assemble_adds_only_the_materials_its_parts_use(self):
        obj, _ = built(toy())
        self.assertEqual([m.name for m in obj.data.materials], ['team', 'trim'])

    def test_export_writes_every_clip_with_unique_node_names(self):
        piece = toy()
        built(piece)
        path = os.path.join(tempfile.mkdtemp(), 'toy.glb')
        lp.export(path)
        data = lp.glb_json(path)
        self.assertEqual(sorted(a['name'] for a in data['animations']), sorted(lp.CLIPS))
        names = [n['name'] for n in data['nodes']]
        self.assertEqual(len(names), len(set(names)))  # three.js binds clip tracks to nodes by name


def run():
    import test_figure  # noqa: E402  figure.py's tests run in the same Blender session
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite([loader.loadTestsFromModule(sys.modules[__name__]), loader.loadTestsFromModule(test_figure)])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise RuntimeError('lp tests failed')  # --python-exit-code 1 turns this into exit status 1


run()
