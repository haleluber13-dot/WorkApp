#!/usr/bin/env python3
"""MotorLab — the tier the offline single file carries.

The hosted app fetches a model when you pick its machine, so it can afford
640px textures and eighty thousand triangles. The single file inlines
everything it has as base64 inside one HTML document with a hard size cap, so
what it carries has to be an order of magnitude smaller — and every megabyte
saved is another real car in it instead of a generated stand-in.

    python3 motorlab/tools/tiny-glb.py --all /tmp/raw --out assets/models-lite

See _tiny_blender.py for why this is not just shrink-glb.py with the numbers
turned down: the weight was never the triangles.
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, '_tiny_blender.py')


def tiny(src, dst, tex, tris, quality):
    r = subprocess.run([sys.executable, WORKER, src, dst, str(tex), str(tris), str(quality)],
                       capture_output=True, text=True)
    if not os.path.exists(dst):
        raise RuntimeError((r.stdout + r.stderr)[-400:])
    return os.path.getsize(dst)


def main(argv):
    def opt(name, dflt):
        return int(argv[argv.index('--' + name) + 1]) if '--' + name in argv else dflt
    tex, tris, q = opt('tex', 128), opt('tris', 9000), opt('q', 60)

    d = argv[argv.index('--all') + 1]
    out = argv[argv.index('--out') + 1] if '--out' in argv else d.rstrip('/') + '-tiny'
    os.makedirs(out, exist_ok=True)
    before = after = 0
    for name in sorted(os.listdir(d)):
        if not name.endswith('.glb'):
            continue
        src, dst = os.path.join(d, name), os.path.join(out, name)
        b = os.path.getsize(src)
        try:
            a = tiny(src, dst, tex, tris, q)
        except Exception as err:
            print(f'  {name:34s} FAILED {err}')
            continue
        before += b; after += a
        print(f'  {name:34s} {b/1048576:7.2f} MB -> {a/1048576:6.2f} MB')
    print(f'\n{before/1048576:.0f} MB -> {after/1048576:.1f} MB in {out}')


if __name__ == '__main__':
    main(sys.argv[1:])
