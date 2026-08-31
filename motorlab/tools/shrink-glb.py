#!/usr/bin/env python3
"""MotorLab — make a downloaded model small enough to ship.

A model published for a renderer carries 4K PBR maps and a million triangles.
That is right for a render and wrong for a browser: one car arrives at 69 MB.
Almost all of it is texture, so almost all of the saving is there.

This drives Blender: import, scale every image down to a cap, decimate to a
triangle budget, re-export as GLB with the images re-encoded as JPEG.

    python3 motorlab/tools/shrink-glb.py in.glb out.glb --tex 1024 --tris 120000

Run over a whole directory with --all, which writes <dir>-lite unless --out
says otherwise:

    python3 motorlab/tools/shrink-glb.py --all assets/models --tex 1024 --tris 120000
    python3 motorlab/tools/shrink-glb.py --all /tmp/raw --out assets/models --tex 1024
"""
import os, subprocess, sys, tempfile

BLENDER = r'''
import bpy, sys
src, dst, tex, tris = sys.argv[-4], sys.argv[-3], int(sys.argv[-2]), int(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

# --- textures: the bulk of the file --------------------------------------
for im in bpy.data.images:
    try:
        w, h = im.size
        if not w or not h:
            continue
        m = max(w, h)
        if m > tex:
            k = tex / m
            im.scale(max(1, int(w * k)), max(1, int(h * k)))
    except Exception:
        pass

# --- geometry -------------------------------------------------------------
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data]
for o in meshes:
    o.data.calc_loop_triangles()
total = sum(len(o.data.loop_triangles) for o in meshes)
if total > tris and total > 0:
    # one ratio across the whole scene, so the proportions of the thing survive
    ratio = max(0.03, tris / total)
    for o in meshes:
        mod = o.modifiers.new('ml_dec', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', export_apply=True, export_yup=True,
    export_image_format='JPEG', export_jpeg_quality=72,
    export_draco_mesh_compression_enable=False)
print('MLSHRINK tris %d -> %d' % (total, min(total, tris)))
'''


def shrink(src, dst, tex, tris):
    script = os.path.join(tempfile.gettempdir(), '_ml_shrink.py')
    with open(script, 'w') as f:
        f.write(BLENDER)
    r = subprocess.run([sys.executable, script, src, dst, str(tex), str(tris)],
                       capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError((r.stdout + r.stderr)[-400:])
    return os.path.getsize(dst)


def main(argv):
    def opt(name, dflt):
        return int(argv[argv.index('--' + name) + 1]) if '--' + name in argv else dflt

    tex, tris = opt('tex', 1024), opt('tris', 120_000)

    if '--all' in argv:
        d = argv[argv.index('--all') + 1]
        out = (argv[argv.index('--out') + 1] if '--out' in argv
               else d.rstrip('/') + '-lite')
        os.makedirs(out, exist_ok=True)
        before = after = 0
        for name in sorted(os.listdir(d)):
            if not name.endswith('.glb'):
                continue
            src, dst = os.path.join(d, name), os.path.join(out, name)
            b = os.path.getsize(src)
            try:
                a = shrink(src, dst, tex, tris)
            except Exception as err:
                print(f'  {name:36s} FAILED {err}')
                continue
            before += b; after += a
            print(f'  {name:36s} {b/1048576:7.2f} MB -> {a/1048576:6.2f} MB')
        print(f'\n{before/1048576:.0f} MB -> {after/1048576:.0f} MB in {out}')
        return

    src, dst = [a for a in argv if a.endswith('.glb')][:2]
    print(f'{os.path.getsize(src)/1048576:.2f} MB -> '
          f'{shrink(src, dst, tex, tris)/1048576:.2f} MB')


if __name__ == '__main__':
    main(sys.argv[1:])
