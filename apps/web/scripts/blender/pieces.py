"""The six chess pieces: each builder returns an lp.Piece. Sizes are in squares (GlbPiece rescales to HEIGHT in
models.ts anyway); the piece stands on z = 0 and faces -Y. Character pieces (built on figure.py) replace the living
Staunton pieces one by one: see docs/superpowers/specs/2026-11-19-character-pieces-design.md (Characters) and
docs/superpowers/specs/2026-11-19-living-pieces-design.md (Pieces) for the ones still to replace."""
import math

from mathutils import Vector

from figure import REST, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, recoil, star, stride, through
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
    """Infantryman: plumed helmet, team tunic, spear in the right hand, round shield on the left forearm. Thrusts the
    spear from behind the shield, recoils behind it, falls on his side with spear and shield."""
    f = humanoid()
    f.add('weapon', 'hand_r', f.at('hand_r'))
    f.add('shield', 'arm_low_l', f.at('arm_low_l'))
    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
    face = Vector((0.25, -1, 0)).normalized()  # the shield turns a little outward
    centre = f.at('arm_low_l') + Vector((0.07, -0.08, -0.06))
    parts = body(f) + [
        Part(dome(0.105, 0.87), 'steel', 'head'),  # kettle helmet
        Part(hoop(0.11, 0.012, (0, 0, 0.872)), 'trim', 'head'),
        Part(ellipsoid(0.03, 0.08, 0.05, (0, 0.03, 0.99)), 'team', 'head'),  # plume
        Part(lathe([(0, 0.30), (0.16, 0.30), (0.15, 0.40), (0.14, 0.53), (0, 0.53)], 24), 'team', 'hips'),  # tunic
        Part(hoop(0.133, 0.014, (0, 0, 0.47)), 'leather', 'spine'),  # belt
        Part(limb(grip + Vector((0, 0, -0.40)), grip + Vector((0, 0, 0.62)), 0.012), 'wood', 'weapon'),
        Part(cone(0.028, 0.10, grip + Vector((0, 0, 0.67)), 8), 'steel', 'weapon'),
        Part(disc(0.13, 0.03, centre, face), 'team', 'shield'),
        Part(hoop(0.128, 0.01, centre + face * 0.012, face), 'trim', 'shield'),
        Part(star(0.06, 0.012, centre + face * 0.035, face), 'trim', 'shield'),
    ]

    def level(arm_up, arm_low, chest=0.0, spine=0.0):
        """The weapon's forward turn that holds the spear level, point ahead, for these arm and body turns."""
        return math.pi / 2 + arm_up + arm_low - chest - spine

    def idle(t):  # breathing, a glance aside now and then
        b = math.sin(TAU * t)
        return {'chest': 0.02 * b, 'head': (-0.02 * b, 0, 0.05 * math.sin(2 * TAU * t)), 'arm_up_l': 0.03 * b}

    def walk(u):  # the spear arm stays nearly still
        return {**stride(u), 'arm_up_r': 0.08 * math.cos(TAU * u), 'arm_low_r': 0.1}

    windup = {'arm_up_r': -0.5, 'arm_low_r': 0.9, 'weapon': level(-0.5, 0.9, -0.05), 'chest': (-0.05, 0, -0.3),
              'arm_up_l': 0.5, 'arm_low_l': 0.6, 'leg_up_l': 0.35, 'leg_up_r': -0.25, 'leg_low_l': -0.2}
    strike = {'arm_up_r': 1.3, 'arm_low_r': 0.15, 'weapon': level(1.3, 0.15, 0.15, 0.1), 'chest': (0.15, 0, 0.35),
              'spine': 0.1, 'arm_up_l': 0.3, 'arm_low_l': 0.5, 'leg_up_l': 0.6, 'leg_up_r': -0.45, 'leg_low_l': -0.35}
    follow = {**strike, 'arm_up_r': 1.1, 'weapon': level(1.1, 0.15, 0.15, 0.1)}
    struck = {**recoil(0.35), 'arm_up_l': 0.8, 'arm_low_l': 0.9}  # the shield comes up
    staggered = {**struck, 'spine': -0.5, 'root': (0, -0.2, 0)}
    down = {'root': (0, -1.5, 0), 'spine': 0.15, 'head': (0.2, -0.3, 0), 'arm_up_l': 0.4, 'arm_up_r': 0.6,
            'weapon': 0.3, 'leg_up_l': 0.4, 'leg_low_l': -0.6, 'leg_up_r': 0.1}  # on his right side

    return character(f, parts, {
        'idle': (72, idle),
        'walk': (30, walk),
        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),  # strike at 0.6
        'hit': (9, lambda t: through(t, REST, struck)),
        'die': (30, lambda t: through(t, struck, staggered, down, down)),
    })


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
              Part(foot_ring(r), 'trim', 'band'), Part(ring(0.21, 0.012, 0.30), 'trim', 'collar')]
    parts += [Part(block(0.06, 0.05, 0.08, (0, y, z)), 'trim', 'head' if on_head(y, z) else 'neck') for y, z in MANE]
    parent = {'body': None, 's0': 'body', 's1': 'body', 's2': 'body', 'neck': 'body', 'head': 'neck',
              'ear_l': 'head', 'ear_r': 'head', 'band': 'body', 'collar': 'body'}
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

    die = crumble(parts, parent, r, ['neck', 'head', 's0', 's1', 's2', 'band', 'collar'], spread=0.22, jump=0.08, tumble=1.0,
                  special={'head': {'spread': 0.3, 'jump': 0.3, 'tumble': 2.2, 'towards': (0.3, -1, 0)},
                           'neck': {'spread': 0.12, 'jump': 0.02, 'tumble': 1.3, 'towards': (0, -1, 0), 'start': 0.36},
                           **{s: {'start': 0.42} for s in ('s0', 's1', 's2')}, **FLAT_BANDS})
    return Piece(parts, parent, {'idle': (72, idle), 'walk': (30, walk), 'attack': (30, attack), 'die': (30, die)}, r)


PIECES['knight'] = knight
