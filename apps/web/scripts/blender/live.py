"""Builds a piece in the open Blender scene and plays one clip, for tuning it live. In Blender's Python console:

    P = '/Users/dinhduy/Workspace/chess/apps/web/scripts/blender/live.py'
    exec(compile(open(P).read(), P, 'exec'), {'__file__': P, 'PIECE': 'rook', 'CLIP': 'attack'})

(or Text > Open this file and Run Script, for the pawn's attack). Edit pieces.py or figure.py and run it again. It
saves and exports nothing: npm run living -- <piece> builds the shipped model from the same code."""
import importlib
import os
import sys

import bpy
from mathutils import Euler

PIECE = globals().get('PIECE', 'pawn')  # the console run above passes these in
CLIP = globals().get('CLIP', 'attack')  # idle, walk, attack, hit or die

space = getattr(bpy.context, 'space_data', None)
text = space.text if space is not None and space.type == 'TEXT_EDITOR' else None
HERE = os.path.dirname(bpy.path.abspath(text.filepath if text and text.filepath else __file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lp  # noqa: E402
import figure  # noqa: E402
import pieces  # noqa: E402

for module in (lp, figure, pieces):  # pick up edits made since the last run
    importlib.reload(module)

for data in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
    for item in list(data):
        data.remove(item)
scene = bpy.context.scene
scene.render.fps = lp.FPS
piece = pieces.PIECES[PIECE]()
obj, rig = lp.assemble(PIECE, piece)
for clip in lp.CLIPS:
    lp.bake(rig, piece, clip)
lp.check(obj, rig, piece)  # raises, naming the first breach of the clip contract
bpy.data.materials['team'].diffuse_color = lp.RED  # the viewport shows the red team; the export stays magenta
bpy.data.materials['team'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = lp.RED
rig.animation_data.action = bpy.data.actions[CLIP]
rig.hide_set(True)  # every bone stands at the origin (lp's shared rest frame), so drawn they only hide the figure
scene.frame_start, scene.frame_end, scene.frame_current = 0, piece.clips[CLIP][0], 0
for area in (a for screen in bpy.data.screens for a in screen.areas):  # a three-quarter view from the front right
    if area.type == 'VIEW_3D':
        view = area.spaces.active
        view.region_3d.view_location = (0, 0, 0.5)
        view.region_3d.view_rotation = Euler((1.3, 0, 0.6)).to_quaternion()
        view.region_3d.view_distance = 2.4
        view.shading.type = 'MATERIAL'
print(f'{PIECE}: the clip contract holds; playing {CLIP} ({piece.clips[CLIP][0]} frames)')
