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
    parts += [Part(foot_ring(r), 'trim', 'band'), Part(ring(0.17, 0.012, 0.87), 'trim', 'collar')]
    shards = [f's{i}' for i in range(6)]
    parent = {'body': None, **{s: 'body' for s in shards}, 'crown': 'body', 'band': 'body', 'collar': 'body'}

    def idle(t):  # a slow sway of the hips
        return {'body': rock(0.03 * math.sin(TAU * t), r) @ turn(0.06 * math.sin(TAU * t), 'Z')}

    def walk(u):  # light, graceful hops with a sway
        return {'body': bounce(u, 0.06, 0.08, 0.05) @ turn(0.05 * math.sin(TAU * u), 'Z')}

    def attack(t):  # whirls once, leaning out further as she turns, and lashes forward at the contact
        whirl = -TAU * (1 - ease(span(t, 0.0, 0.6), 0, 1))
        lean = ease(t, 0, 0.12, 0.22, 0.35, 0.05, 0)
        flare = 1 + 0.25 * bump(t, 0.6, 0.2)  # the coronet's points spread out at the strike
        return {'body': turn(whirl, 'Z') @ tip(lean, r), 'crown': stretch(flare, flare, 1, (0, 0, 1.25))}

    die = crumble(parts, parent, r, ['crown'] + shards + ['band', 'collar'], spread=0.26, jump=0.12, tumble=1.3,
                  special={'crown': {'spread': 0.2, 'jump': 0.45, 'tumble': 2.5}, **{s: {'start': 0.38} for s in shards},
                           **FLAT_BANDS})
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['queen'] = queen


def king():
    """The tallest, with a cross. Stately breathing; heavy hops; rises and hammers down; the cross falls first, then
    the king topples slowly and cracks."""
    r = 0.34
    profile = spline(foot(r) + [(0.16, 0.35), (0.115, 0.60), (0.11, 0.80), (0.11, 0.88), (0.11, 0.88), (0.18, 0.91),
                                (0.18, 0.945), (0.11, 0.97), (0.11, 0.97), (0.13, 1.07), (0.17, 1.20), (0.20, 1.27),
                                (0.20, 1.27), (0.20, 1.30), (0.20, 1.30), (0.14, 1.31), (0.07, 1.345), (0, 1.355)])
    parts = wedges(lathe(profile), [0.75])
    parts += [Part(block(0.065, 0.065, 0.25, (0, 0, 1.46)), 'trim', 'cross'),
              Part(block(0.19, 0.065, 0.065, (0, 0, 1.50)), 'trim', 'cross'),
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
