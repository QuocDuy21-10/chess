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

# Gold bands on bones of their own: they drop flat in a death rather than tumbling upright with a shard.
FLAT_BANDS = {'band': {'spread': 0, 'jump': 0.04, 'tumble': 0, 'start': 0.42},
              'collar': {'spread': 0.1, 'jump': 0.08, 'tumble': 0, 'start': 0.42}}


def pawn():
    """Ball head, collar, low base. Quick bob; nimble hops; a head-butt; cracks into six shards."""
    r = 0.3
    profile = spline(foot(r) + [(0.15, 0.25), (0.115, 0.40), (0.10, 0.50), (0.10, 0.50), (0.16, 0.525),
                                (0.16, 0.565), (0.085, 0.594), (0.085, 0.594)])[:-1] + arc(0.735, 0.165, -59, 90)
    parts = wedges(lathe(profile), [0.45])
    parts += [Part(foot_ring(r), 'trim', 'band'), Part(ring(0.16, 0.012, 0.545), 'trim', 'collar')]
    shards = [f's{i}' for i in range(6)]
    parent = {'body': None, **{s: 'body' for s in shards}, 'band': 'body', 'collar': 'body'}

    def idle(t):  # a quick small bob with a slight sway
        b = 0.5 - 0.5 * math.cos(2 * TAU * t)
        return {'body': rock(0.025 * math.sin(TAU * t), r) @ stretch(1 - 0.006 * b, 1 - 0.006 * b, 1 + 0.012 * b)}

    def walk(u):  # small, nimble hops
        return {'body': bounce(u, 0.07, 0.12, 0.08)}

    def attack(t):  # leans back, head-butts forward at the contact, springs back
        return {'body': move(y=ease(t, 0, 0.03, 0.05, -0.10, 0.02, 0))
                @ tip(ease(t, 0, -0.12, -0.22, 0.32, 0.05, 0), r)
                @ stretch(1, 1, ease(t, 1, 0.95, 0.92, 1.06, 1, 1))}

    die = crumble(parts, parent, r, shards + ['band', 'collar'], spread=0.28, jump=0.12, tumble=1.4,
                  special={'band': {'spread': 0, 'jump': 0.04, 'tumble': 0},  # the gold bands drop flat
                           'collar': {'spread': 0.1, 'jump': 0.08, 'tumble': 0}})
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['pawn'] = pawn


def rook():
    """A tower with five merlons. Nearly still; heavy rocking; a body-slam; merlons fly off, the tower collapses."""
    r = 0.34
    profile = spline(foot(r) + [(0.22, 0.30), (0.21, 0.70), (0.225, 0.92), (0.27, 0.98), (0.27, 0.98), (0.27, 1.08),
                                (0.27, 1.08), (0.20, 1.08), (0.20, 1.08), (0.20, 1.03), (0.20, 1.03), (0, 1.03)])
    parts = wedges(lathe(profile), [0.6])
    merlons = [f'm{k}' for k in range(5)]
    parts += [Part(block(0.07, 0.18, 0.14, (0.235, 0, 1.15), angle=k * TAU / 5), 'team', m) for k, m in enumerate(merlons)]
    parts += [Part(foot_ring(r), 'trim', 'band'), Part(ring(0.27, 0.012, 0.995), 'trim', 'collar')]
    shards = [f's{i}' for i in range(6)]
    parent = {'body': None, **{s: 'body' for s in shards}, **{m: 'body' for m in merlons}, 'band': 'body', 'collar': 'body'}

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

    die = crumble(parts, parent, r, merlons + shards + ['band', 'collar'], recoil=0.2, spread=0.22, jump=0.06, tumble=0.9,
                  special={**{m: {'spread': 0.45, 'jump': 0.35, 'tumble': 2.4} for m in merlons},
                           **{s: {'start': 0.42} for s in shards}, **FLAT_BANDS})
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['rook'] = rook
