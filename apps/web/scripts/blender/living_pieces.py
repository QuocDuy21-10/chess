"""Builds one living chess piece: npm run living -- <piece>  (from apps/web; Blender runs this file).

Writes assets-src/living/<piece>.glb (for npm run models), <piece>.blend (to open and tune by hand) and
<piece>-{rest,walk,attack,hit,die}.png (to judge the look). Writes nothing if the piece breaks the clip contract.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import lp  # noqa: E402
import pieces  # noqa: E402


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    lp.need(len(args) == 2 and args[0] in pieces.PIECES, f'usage: npm run living -- <{"|".join(pieces.PIECES)}>')
    name, out = args[0], os.path.abspath(args[1])
    lp.reset()
    piece = pieces.PIECES[name]()
    obj, rig = lp.assemble(name, piece)
    for clip in lp.CLIPS:
        lp.bake(rig, piece, clip)
    lp.check(obj, rig, piece)
    os.makedirs(out, exist_ok=True)
    lp.preview(os.path.join(out, name), obj, rig, piece)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f'{name}.blend'))
    lp.export(os.path.join(out, f'{name}.glb'))
    print(f'{name}: the clip contract holds; wrote {os.path.join(out, name)}.glb')


main()
