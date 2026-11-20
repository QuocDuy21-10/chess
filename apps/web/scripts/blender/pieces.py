"""The six chess pieces, each a character built on figure.py: each builder returns an lp.Piece. Sizes are in squares
(GlbPiece rescales to HEIGHT in models.ts anyway); the figure stands on z = 0 and faces -Y. Designs: the Characters
table in docs/superpowers/specs/2026-11-19-character-pieces-design.md."""
import math

from mathutils import Vector

import lp
from figure import (REST, Figure, body, character, disc, dome, ellipsoid, hoop, humanoid, limb, plate, recoil, star,
                    stride, through)
from lp import Part, block, cone, lathe

TAU = math.tau
PIECES = {}  # name -> builder


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


HORSE_LEGS = {'fl': (1, -1), 'fr': (-1, -1), 'hl': (1, 1), 'hr': (-1, 1)}  # leg -> (side, end): end -1 is the front


def knight():
    """A plumed rider with a lance on a small horse in a team caparison. Lowers the lance and the horse lunges, the
    horse rears and the rider leans back when hit, the horse kneels and the rider slumps forward in death."""
    f = Figure()
    f.add('root', None, (0, 0, 0))
    f.add('horse_body', 'root', (0, 0, 0.45))
    f.add('horse_neck', 'horse_body', (0, -0.20, 0.52))
    f.add('horse_head', 'horse_neck', (0, -0.30, 0.72))
    f.add('horse_tail', 'horse_body', (0, 0.26, 0.52), True)
    for leg, (s, e) in HORSE_LEGS.items():
        f.add(f'horse_leg_{leg}', 'horse_body', (0.07 * s, 0.18 * e, 0.40), True)
        f.add(f'horse_shin_{leg}', f'horse_leg_{leg}', (0.07 * s, 0.18 * e, 0.21), True)
    humanoid(f, base=(0, 0, 0.16), parent='horse_body', seated=True)  # the rider's hips on the saddle, at 0.58
    f.add('weapon', 'hand_r', f.at('hand_r'))
    grip = f.at('hand_r') + Vector((0, -0.005, -0.035))
    rider = Vector((0, 0, 0.16))
    side = Vector((1, 0, 0))
    parts = body(f) + [
        Part(dome(0.105, 0.87 + rider.z), 'steel', 'head'),
        Part(hoop(0.11, 0.012, rider + Vector((0, 0, 0.872))), 'trim', 'head'),
        Part(ellipsoid(0.03, 0.09, 0.055, rider + Vector((0, 0.03, 1.0))), 'team', 'head'),  # plume
        Part(ellipsoid(0.155, 0.115, 0.085, rider + Vector((0, 0, 0.60))), 'team', 'chest'),  # surcoat
        Part(limb(grip + Vector((0, 0, -0.20)), grip + Vector((0, 0, 0.58)), 0.014), 'wood', 'weapon'),  # lance
        Part(cone(0.024, 0.08, grip + Vector((0, 0, 0.62)), 8), 'steel', 'weapon'),
        Part(cone(0.04, 0.08, grip + Vector((0, 0, 0.07)), 12), 'trim', 'weapon'),  # its hand guard
        Part(ellipsoid(0.13, 0.27, 0.13, (0, 0, 0.45)), 'coat', 'horse_body'),
        Part(ellipsoid(0.152, 0.30, 0.135, (0, 0, 0.42)), 'team', 'horse_body'),  # caparison, hanging low
        Part(star(0.05, 0.012, (0.154, 0, 0.42), side), 'trim', 'horse_body'),
        Part(star(0.05, 0.012, (-0.154, 0, 0.42), -side), 'trim', 'horse_body'),
        Part(limb((0, -0.20, 0.52), (0, -0.30, 0.70), 0.065, 0.05), 'coat', 'horse_neck'),
        Part(limb((0, -0.15, 0.60), (0, -0.25, 0.77), 0.025), 'hair', 'horse_neck'),  # mane
        Part(limb((0, -0.29, 0.74), (0, -0.42, 0.66), 0.05, 0.04), 'coat', 'horse_head'),
        Part(lp.ball(0.012, 0.042, -0.33, 0.745), 'dark', 'horse_head'),
        Part(lp.ball(0.012, -0.042, -0.33, 0.745), 'dark', 'horse_head'),
        Part(cone(0.014, 0.05, (0.025, -0.28, 0.80), 6), 'coat', 'horse_head'),
        Part(cone(0.014, 0.05, (-0.025, -0.28, 0.80), 6), 'coat', 'horse_head'),
        Part(hoop(0.045, 0.008, (0, -0.39, 0.675), (0, -1, -0.5)), 'trim', 'horse_head'),  # noseband
        Part(limb((0, 0.26, 0.52), (0, 0.36, 0.30), 0.03), 'hair', 'horse_tail'),
    ]
    for leg, (s, e) in HORSE_LEGS.items():
        hip, knee, hoof = (Vector((0.07 * s, 0.18 * e, z)) for z in (0.40, 0.21, 0.03))
        parts += [Part(limb(hip, knee, 0.04, 0.03), 'coat', f'horse_leg_{leg}'),
                  Part(limb(knee, hoof, 0.028), 'coat', f'horse_shin_{leg}'),
                  Part(block(0.06, 0.07, 0.04, hoof + Vector((0, -0.005, -0.01)), bevel=0.012), 'dark',
                       f'horse_shin_{leg}')]

    def level(arm_up, arm_low, chest=0.0, spine=0.0):
        """The lance's forward turn that holds it level, point ahead."""
        return math.pi / 2 + arm_up + arm_low - chest - spine

    def idle(t):  # the horse nods and flicks its tail; the rider sits easy
        b = math.sin(TAU * t)
        return {'horse_neck': 0.04 * b, 'horse_head': 0.05 * math.sin(2 * TAU * t), 'horse_tail': (0, 0.12 * b, 0),
                'chest': 0.015 * b}

    def walk(u):  # a trot: the diagonal pairs strike at u = 0 and u = 0.5, the game's footfalls
        c, s = math.cos(TAU * (u % 1.0)), math.sin(TAU * (u % 1.0))
        pose = {'horse_neck': 0.06 * math.cos(2 * TAU * u), 'horse_tail': (0, 0.1 * c, 0), 'spine': 0.05}
        for leg, sign in (('fl', 1), ('hr', 1), ('fr', -1), ('hl', -1)):
            pose[f'horse_leg_{leg}'] = 0.4 * sign * c
            pose[f'horse_shin_{leg}'] = -0.7 * max(0.0, -sign * s)
        return pose

    gather = {'horse_body': -0.12, 'horse_neck': -0.15, 'arm_up_r': 0.3, 'arm_low_r': 0.2,
              'weapon': level(0.3, 0.2, -0.1, 0.12), 'chest': (-0.1, 0, -0.2), 'spine': 0.12}
    lunge = {'lift': (0, -0.12, 0), 'horse_body': 0.10, 'horse_neck': 0.25, 'horse_head': 0.1,
             'horse_leg_fl': 0.5, 'horse_leg_fr': 0.5, 'horse_leg_hl': -0.4, 'horse_leg_hr': -0.4,
             'arm_up_r': 0.9, 'arm_low_r': 0.1, 'weapon': level(0.9, 0.1, 0.15, 0.2), 'chest': (0.15, 0, 0.3),
             'spine': 0.2}
    follow = {**lunge, 'lift': (0, -0.08, 0), 'arm_up_r': 0.8, 'weapon': level(0.8, 0.1, 0.15, 0.2)}
    rearing = {'horse_body': -0.35, 'horse_neck': -0.3, 'horse_head': -0.2, 'horse_leg_fl': 0.7,
               'horse_leg_fr': 0.7, 'horse_shin_fl': -0.6, 'horse_shin_fr': -0.6, 'spine': -0.3, 'chest': -0.15,
               'head': -0.2, 'arm_up_r': -0.2}
    staggered = {**rearing, 'horse_body': -0.45, 'spine': -0.4}
    kneeling = {'horse_body': 0.3, 'horse_neck': 0.4, 'horse_head': 0.3, 'horse_leg_fl': -0.3, 'horse_leg_fr': -0.3,
                'horse_shin_fl': -1.8, 'horse_shin_fr': -1.8, 'horse_shin_hl': -0.5, 'horse_shin_hr': -0.5,
                'horse_tail': 0.3, 'spine': 0.6, 'chest': 0.2, 'head': 0.5, 'arm_up_r': 0.6, 'weapon': 0.6}

    return character(f, parts, {
        'idle': (90, idle),
        'walk': (30, walk),
        'attack': (30, lambda t: through(t, REST, gather, gather, lunge, follow, REST)),
        'hit': (9, lambda t: through(t, REST, rearing)),
        'die': (30, lambda t: through(t, rearing, staggered, kneeling, kneeling)),
    })


PIECES['knight'] = knight
