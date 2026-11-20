"""The six chess pieces: each builder returns an lp.Piece. Sizes are in squares (GlbPiece rescales to HEIGHT in
models.ts anyway); the piece stands on z = 0 and faces -Y. Character pieces (built on figure.py) replace the living
Staunton pieces one by one: see docs/superpowers/specs/2026-11-19-character-pieces-design.md (Characters) and
docs/superpowers/specs/2026-11-19-living-pieces-design.md (Pieces) for the ones still to replace."""
import math

from mathutils import Vector

import lp
from figure import (REST, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, plate, recoil, star, stride,
                    through)
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
        Part(lathe([(0, 0.29), (0.19, 0.29), (0.172, 0.36), (0.148, 0.45), (0.14, 0.53), (0, 0.53)], 24), 'team',
             'hips'),  # tunic, flaring to the hem
        Part(hoop(0.188, 0.011, (0, 0, 0.293)), 'trim', 'hips'),  # its gold hem
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
    struck = {**recoil(0.35), 'arm_up_l': 0.55, 'arm_low_l': 1.0}  # the shield comes up to the chest
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
    """Warden: heavy plate, a closed great helm, a tall tower shield with a battlement top on the left arm, a mace.
    Bashes with the shield, braces behind it when hit, falls backward with the shield across him."""
    f = humanoid()
    f.add('weapon', 'hand_r', f.at('hand_r'))
    f.add('shield', 'arm_low_l', f.at('arm_low_l'))
    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
    face = Vector((0.15, -1, 0)).normalized()
    centre = f.at('arm_low_l') + Vector((0.08, -0.085, -0.05))
    w, top, notch = 0.12, 0.19, 0.045  # half its width; the top of its merlons; how deep the notches are
    battlement = [(-w, -0.21), (w, -0.21), (w, top), (0.6 * w, top), (0.6 * w, top - notch), (0.2 * w, top - notch),
                  (0.2 * w, top), (-0.2 * w, top), (-0.2 * w, top - notch), (-0.6 * w, top - notch), (-0.6 * w, top),
                  (-w, top)]
    parts = body(f) + [
        Part(lathe([(0, 0.74), (0.106, 0.74), (0.108, 0.90), (0.10, 0.97), (0, 0.975)], 24), 'steel', 'head'),  # great helm
        Part(block(0.13, 0.03, 0.016, (0, -0.10, 0.855)), 'dark', 'head'),  # its eye slit
        Part(block(0.014, 0.02, 0.15, (0, -0.104, 0.86)), 'trim', 'head'),  # a gold bar down the face
        Part(hoop(0.107, 0.01, (0, 0, 0.94)), 'trim', 'head'),
        Part(ellipsoid(0.085, 0.085, 0.065, f.at('arm_up_l') + Vector((0.02, 0, 0.02))), 'steel', 'arm_up_l'),
        Part(ellipsoid(0.085, 0.085, 0.065, f.at('arm_up_r') + Vector((-0.02, 0, 0.02))), 'steel', 'arm_up_r'),
        Part(lathe([(0, 0.26), (0.18, 0.26), (0.162, 0.36), (0.148, 0.45), (0.14, 0.53), (0, 0.53)], 24), 'team',
             'hips'),  # surcoat
        Part(hoop(0.178, 0.011, (0, 0, 0.263)), 'trim', 'hips'),
        Part(hoop(0.133, 0.014, (0, 0, 0.47)), 'leather', 'spine'),
        Part(limb(grip + Vector((0, 0, -0.06)), grip + Vector((0, 0, 0.26)), 0.014), 'wood', 'weapon'),  # mace haft
        Part(lp.ball(0.048, *(grip + Vector((0, 0, 0.30)))), 'steel', 'weapon'),  # mace head
        Part(plate(battlement, 0.035, centre, face), 'team', 'shield'),
        Part(star(0.055, 0.012, centre + face * 0.022 + Vector((0, 0, -0.02)), face), 'trim', 'shield'),
    ]

    def facing_ahead(arm_up, arm_low, chest=0.0, spine=0.0):
        """The shield's forward turn that keeps its face toward the facing, for these arm and body turns."""
        return arm_up + arm_low - chest - spine

    def idle(t):  # slow, heavy breathing
        b = math.sin(TAU * t)
        return {'chest': 0.015 * b, 'head': (0, 0, 0.03 * math.sin(2 * TAU * t))}

    def walk(u):  # heavy steps, the shield carried in front
        return {**stride(u, legs=0.35, knees=0.5, arms=0.12, sway=0.07, lean=0.04),
                'arm_up_l': 0.35, 'arm_low_l': 0.9, 'shield': facing_ahead(0.35, 0.9, 0.04)}

    windup = {'arm_up_l': 0.1, 'arm_low_l': 1.4, 'shield': facing_ahead(0.1, 1.4, -0.12, -0.05),
              'chest': (-0.12, 0, 0.35), 'spine': -0.05, 'arm_up_r': -0.2, 'leg_up_l': 0.2, 'leg_up_r': -0.2}
    strike = {'arm_up_l': 1.2, 'arm_low_l': 0.3, 'shield': facing_ahead(1.2, 0.3, 0.2, 0.12),
              'chest': (0.2, 0, -0.4), 'spine': 0.12, 'arm_up_r': -0.35, 'lift': (0, -0.06, 0),
              'leg_up_l': 0.55, 'leg_low_l': -0.3, 'leg_up_r': -0.4}
    follow = {**strike, 'arm_up_l': 1.0, 'shield': facing_ahead(1.0, 0.3, 0.2, 0.12), 'lift': (0, -0.04, 0)}
    struck = {**recoil(0.25), 'arm_up_l': 0.45, 'arm_low_l': 1.1, 'shield': facing_ahead(0.45, 1.1, -0.125, -0.25)}
    staggered = {**struck, 'spine': -0.4, 'root': -0.15}
    down = {'root': -1.45, 'spine': -0.1, 'head': 0.3, 'arm_up_l': 0.6, 'arm_low_l': 1.6,
            'shield': facing_ahead(0.6, 1.6, 0, -0.1), 'arm_up_r': 0.2, 'leg_up_l': 0.3, 'leg_up_r': 0.1}  # on his back

    return character(f, parts, {
        'idle': (90, idle),
        'walk': (30, walk),
        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
        'hit': (9, lambda t: through(t, REST, struck)),
        'die': (30, lambda t: through(t, struck, staggered, down, down)),
    })


PIECES['rook'] = rook


def bishop():
    """Cleric: white beard, tall mitre, long vestments to the floor, a gold crozier with a glowing gem. Raises the
    crozier and thrusts it with a flash of light, staggers leaning on it when hit, slumps to the ground beside it."""
    f = humanoid()
    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
    gem = grip + Vector((0, -0.05, 0.60))
    f.add('weapon', 'hand_r', f.at('hand_r'))
    f.add('flash', 'weapon', gem)
    mitre = [(-0.085, 0), (0.085, 0), (0.075, 0.12), (0.04, 0.19), (0, 0.22), (-0.04, 0.19), (-0.075, 0.12)]
    parts = body(f, armour='white', sleeves='team', legs='white') + [
        Part(plate(mitre, 0.12, (0, 0, 0.885)), 'team', 'head'),
        Part(block(0.172, 0.125, 0.022, (0, 0, 0.895)), 'trim', 'head'),  # the mitre's gold band
        Part(block(0.022, 0.125, 0.19, (0, 0, 0.985)), 'trim', 'head'),  # and its upright stripe
        Part(ellipsoid(0.075, 0.05, 0.075, (0, -0.07, 0.775)), 'white', 'head'),  # beard
        Part(ellipsoid(0.05, 0.022, 0.016, (0, -0.092, 0.808)), 'white', 'head'),  # moustache
        Part(ellipsoid(0.165, 0.125, 0.065, (0, 0, 0.69)), 'team', 'chest'),  # a short cape on the shoulders
        Part(block(0.02, 0.012, 0.11, (0, -0.122, 0.60)), 'trim', 'chest'),  # a gold cross on the chest
        Part(block(0.07, 0.012, 0.02, (0, -0.122, 0.62)), 'trim', 'chest'),
        Part(lathe([(0, 0.03), (0.2, 0.03), (0.17, 0.2), (0.145, 0.4), (0.135, 0.55), (0, 0.55)], 24), 'team',
             'hips'),  # vestments to the floor
        Part(hoop(0.198, 0.011, (0, 0, 0.034)), 'trim', 'hips'),
        Part(limb(grip + Vector((0, 0, -0.40)), grip + Vector((0, 0, 0.56)), 0.013), 'trim', 'weapon'),  # crozier
        Part(hoop(0.045, 0.011, gem + Vector((0, 0.0, 0.04)), (1, 0, 0)), 'trim', 'weapon'),  # its crook
        Part(lp.ball(0.026, *gem), 'glow', 'flash'),
    ]

    def level(arm_up, arm_low, chest=0.0, spine=0.0):
        """The crozier's forward turn that holds it level, pointing ahead."""
        return math.pi / 2 + arm_up + arm_low - chest - spine

    def idle(t):  # a gentle forward tilt, as if praying
        b = math.sin(TAU * t)
        return {'chest': 0.04 + 0.02 * b, 'head': 0.08 + 0.03 * b}

    def walk(u):  # a smooth, short-stepped glide
        return {**stride(u, legs=0.22, knees=0.35, arms=0.1, sway=0.03, lean=0.05), 'arm_up_r': 0.05}

    windup = {'arm_up_r': 2.0, 'arm_low_r': 0.3, 'chest': (-0.1, 0, -0.25), 'spine': -0.08, 'head': -0.15,
              'flash': (0, 0, 0, 1.6)}
    strike = {'arm_up_r': 1.35, 'arm_low_r': 0.1, 'weapon': level(1.35, 0.1, 0.12, 0.06), 'chest': (0.12, 0, 0.3),
              'spine': 0.06, 'flash': (0, 0, 0, 4.0), 'leg_up_l': 0.3, 'leg_up_r': -0.2}
    follow = {**strike, 'arm_up_r': 1.2, 'weapon': level(1.2, 0.1, 0.12, 0.06), 'flash': (0, 0, 0, 2.0)}
    struck = {**recoil(0.3), 'arm_up_r': 0.25}  # leaning on the crozier
    staggered = {**struck, 'spine': -0.4, 'root': (0, 0.2, 0)}
    down = {'root': (0, 1.45, 0), 'spine': 0.3, 'head': (0.3, 0.2, 0), 'arm_up_r': 0.5, 'arm_up_l': 0.4,
            'leg_up_l': 0.4, 'leg_low_l': -0.5, 'leg_up_r': 0.2}  # on his left side

    return character(f, parts, {
        'idle': (90, idle),
        'walk': (30, walk),
        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
        'hit': (9, lambda t: through(t, REST, struck)),
        'die': (30, lambda t: through(t, struck, staggered, down, down)),
    })


PIECES['bishop'] = bishop


def queen():
    """Crown, brown hair, a long gown with gold trim, a glowing orb in her right hand. Draws the hand back and thrusts
    the orb, which flares; steps back with an arm raised when hit; sinks to her knees, slumped."""
    f = humanoid()
    orb = f.at('hand_r') + Vector((0, -0.035, -0.045))
    f.add('flash', 'hand_r', orb)
    f.add('gown', 'hips', (0, 0, 0.5))
    points = [Part(cone(0.017, 0.05, (0.085 * math.cos(a), 0.08 * math.sin(a), 0.962), 8), 'trim', 'head')
              for a in (k * TAU / 6 for k in range(6))]
    parts = body(f, armour='team', sleeves='team', legs='team') + points + [
        Part(ellipsoid(0.103, 0.095, 0.105, (0, 0.02, 0.855)), 'hair', 'head'),
        Part(ellipsoid(0.085, 0.05, 0.12, (0, 0.065, 0.75)), 'hair', 'head'),  # hair down her back
        Part(hoop(0.087, 0.013, (0, 0, 0.935)), 'trim', 'head'),  # crown
        Part(hoop(0.05, 0.008, (0, 0, 0.715)), 'trim', 'chest'),  # necklace
        Part(hoop(0.128, 0.012, (0, 0, 0.5)), 'trim', 'spine'),  # girdle
        Part(lathe([(0, 0.03), (0.24, 0.03), (0.2, 0.15), (0.15, 0.35), (0.125, 0.5), (0, 0.5)], 28), 'team',
             'gown'),
        Part(hoop(0.238, 0.012, (0, 0, 0.034)), 'trim', 'gown'),
        Part(lp.ball(0.03, *orb), 'glow', 'flash'),
    ]

    def idle(t):  # a slow sway of the hips
        b = math.sin(TAU * t)
        return {'hips': (0, 0, 0.05 * b), 'chest': (0, 0, -0.04 * b), 'head': (0.02, 0, 0.03 * b)}

    def walk(u):  # light, graceful steps
        return stride(u, legs=0.25, knees=0.4, arms=0.25, sway=0.06, lean=0.02)

    windup = {'arm_up_r': -0.7, 'arm_low_r': 0.6, 'chest': (-0.05, 0, -0.3), 'head': (0, 0, -0.15),
              'arm_up_l': 0.3, 'flash': (0, 0, 0, 1.5)}
    strike = {'arm_up_r': 1.55, 'arm_low_r': 0.05, 'chest': (0.1, 0, 0.35), 'spine': 0.05,
              'flash': (0, 0, 0, 3.5), 'arm_up_l': -0.3, 'leg_up_l': 0.25, 'leg_up_r': -0.2}
    follow = {**strike, 'arm_up_r': 1.4, 'flash': (0, 0, 0, 1.8)}
    struck = {**recoil(0.3), 'arm_up_l': 1.2, 'arm_low_l': 1.0}  # an arm raised against the blow
    staggered = {**struck, 'spine': -0.35}
    down = {'leg_low_l': -1.6, 'leg_low_r': -1.6, 'gown': (0, 0, 0, 0.75), 'spine': 0.45, 'chest': 0.2, 'head': 0.45,
            'arm_up_l': 0.3, 'arm_up_r': 0.3, 'arm_low_l': 0.4, 'arm_low_r': 0.4}  # on her knees

    return character(f, parts, {
        'idle': (90, idle),
        'walk': (30, walk),
        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
        'hit': (9, lambda t: through(t, REST, struck)),
        'die': (30, lambda t: through(t, struck, staggered, down, down)),
    })


PIECES['queen'] = queen


def king():
    """Crown, beard, a fur-trimmed cloak, silver armour, a sword. Raises the sword and slashes down, steps back with
    the cloak swinging when hit, falls forward with the cloak over him and the crown kept."""
    f = humanoid()
    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
    f.add('weapon', 'hand_r', f.at('hand_r'))
    f.add('cloak', 'chest', (0, 0.13, 0.70), True)
    cloak = [(-0.21, -0.55), (0.21, -0.55), (0.16, 0), (-0.16, 0)]
    points = [Part(cone(0.02, 0.06, (0.093 * math.cos(a), 0.088 * math.sin(a), 0.965), 8), 'trim', 'head')
              for a in (k * TAU / 5 + TAU / 4 for k in range(5))]
    parts = body(f) + points + [
        Part(ellipsoid(0.1, 0.092, 0.09, (0, 0.02, 0.86)), 'hair', 'head'),
        Part(ellipsoid(0.08, 0.055, 0.075, (0, -0.07, 0.785)), 'hair', 'head'),  # beard
        Part(ellipsoid(0.05, 0.022, 0.016, (0, -0.092, 0.808)), 'hair', 'head'),  # moustache
        Part(dome(0.082, 0.925), 'team', 'head'),  # the velvet cap inside the crown
        Part(hoop(0.095, 0.015, (0, 0, 0.93)), 'trim', 'head'),  # crown
        Part(lathe([(0, 0.29), (0.19, 0.29), (0.172, 0.36), (0.148, 0.45), (0.14, 0.53), (0, 0.53)], 24), 'team',
             'hips'),  # tabard
        Part(hoop(0.188, 0.011, (0, 0, 0.293)), 'trim', 'hips'),
        Part(hoop(0.133, 0.014, (0, 0, 0.47)), 'trim', 'spine'),  # a gold belt
        Part(plate(cloak, 0.025, (0, 0.13, 0.70), (0, 1, 0)), 'team', 'cloak'),
        Part(block(0.44, 0.04, 0.035, (0, 0.13, 0.155)), 'white', 'cloak'),  # its fur hem
        Part(hoop(0.12, 0.032, (0, 0.01, 0.715)), 'white', 'chest'),  # fur collar
        Part(block(0.05, 0.014, 0.50, grip + Vector((0, 0, 0.32))), 'steel', 'weapon'),  # blade
        Part(block(0.15, 0.024, 0.024, grip + Vector((0, 0, 0.065))), 'trim', 'weapon'),  # crossguard
        Part(lp.ball(0.022, *(grip + Vector((0, 0, -0.055)))), 'trim', 'weapon'),  # pommel
    ]

    def level(arm_up, arm_low, chest=0.0, spine=0.0):
        """The sword's forward turn that holds it level, point ahead."""
        return math.pi / 2 + arm_up + arm_low - chest - spine

    def idle(t):  # slow and stately
        b = math.sin(TAU * t)
        return {'chest': 0.015 * b, 'head': (-0.02 * b, 0, 0.04 * math.sin(2 * TAU * t)), 'cloak': -0.03 * b}

    def walk(u):  # heavy, dignified steps, the cloak swaying behind
        return {**stride(u, legs=0.35, knees=0.55, arms=0.2, sway=0.05, lean=0.03),
                'arm_up_r': 0.06, 'cloak': -0.15 + 0.05 * math.cos(2 * TAU * u)}

    windup = {'arm_up_r': 2.6, 'arm_low_r': 0.4, 'chest': (-0.15, 0, -0.2), 'spine': -0.08, 'head': -0.1,
              'cloak': -0.2, 'arm_up_l': 0.3}
    strike = {'arm_up_r': 1.3, 'arm_low_r': 0.15, 'weapon': level(1.3, 0.15, 0.2, 0.1), 'chest': (0.2, 0, 0.25),
              'spine': 0.1, 'cloak': -0.35, 'leg_up_l': 0.45, 'leg_low_l': -0.25, 'leg_up_r': -0.35}
    follow = {**strike, 'arm_up_r': 0.8, 'weapon': level(0.8, 0.15, 0.2, 0.1) + 0.6, 'cloak': -0.25}
    struck = {**recoil(0.3), 'cloak': -0.6, 'arm_up_r': 0.3}  # the cloak swings out behind
    staggered = {**struck, 'spine': -0.45, 'root': (0, -0.2, 0)}
    down = {'root': 1.45, 'spine': 0.1, 'head': (-0.3, 0, 0.9), 'arm_up_l': 1.2, 'arm_up_r': 1.0, 'cloak': 0.1,
            'leg_low_l': -0.3}  # face down, the cloak flat over his back, his face turned aside

    return character(f, parts, {
        'idle': (90, idle),
        'walk': (30, walk),
        'attack': (30, lambda t: through(t, REST, windup, windup, strike, follow, REST)),
        'hit': (9, lambda t: through(t, REST, struck)),
        'die': (30, lambda t: through(t, struck, staggered, down, down)),
    })


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
