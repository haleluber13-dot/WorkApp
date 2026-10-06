#!/usr/bin/env python3
"""MotorLab — put a downloaded model on its feet.

A model published for a turntable render is not a model you can drop into a
scene. It arrives with a shadow plane under it, sometimes a backdrop, sometimes
a second copy of a wheel parked ten metres away, and its origin wherever the
author happened to leave it. None of that shows in a thumbnail, and all of it
ruins an automatic fit: the app scales a car to 4.5 m by its bounding box, so
one stray quad off in the distance shrinks the actual car to a toy.

This is the pass that fixes it, geometrically, with no reliance on object names
(they are 'Object_17' as often as they are 'CarBody'):

  * a shadow plane is flat and as wide as the whole scene    -> dropped
  * a stray copy does not touch the main body                -> dropped
  * the survivors are centred on X/Z and sat on the ground
  * the long axis is turned onto X, which is where the app expects a nose

    python3 motorlab/tools/pose-glb.py in.glb out.glb
    python3 motorlab/tools/pose-glb.py --all assets/models        # in place
    python3 motorlab/tools/pose-glb.py in.glb out.glb --flip      # nose the other way
    python3 motorlab/tools/pose-glb.py --all assets/models --flip-list f.txt

The Blender half lives in _pose_blender.py beside this file: it runs inside
Blender-as-a-module, which is a different interpreter's worth of imports, and
keeping it separate keeps both halves readable.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, '_pose_blender.py')


def pose(src, dst, flip=False):
    r = subprocess.run([sys.executable, WORKER, src, dst, '1' if flip else '0'],
                       capture_output=True, text=True)
    line = [l for l in (r.stdout or '').splitlines() if l.startswith('MLPOSE ')]
    # Blender-as-a-module is noisy and does not always exit 0 even when the
    # export worked, so the report line and the file on disk are the test.
    if not line or not os.path.exists(dst):
        raise RuntimeError((r.stdout + r.stderr)[-500:])
    return json.loads(line[0][len('MLPOSE '):])


def fmt(v):
    return ' x '.join(f'{x:.2f}' for x in v)


def main(argv):
    flips = set()
    if '--flip-list' in argv:
        with open(argv[argv.index('--flip-list') + 1]) as f:
            flips = {w.strip() for w in f.read().split() if w.strip()}

    if '--all' in argv:
        d = argv[argv.index('--all') + 1]
        for name in sorted(os.listdir(d)):
            if not name.endswith('.glb'):
                continue
            src, tmp = os.path.join(d, name), os.path.join(d, '_posed_' + name)
            try:
                rep = pose(src, tmp, name[:-4] in flips)
            except Exception as err:
                print(f'  {name:30s} FAILED {err}')
                continue
            os.replace(tmp, src)
            drop = sum(t for _, _, t in rep['dropped'])
            print(f'  {name:30s} {fmt(rep["before"]):22s} -> {fmt(rep["after"]):22s}'
                  f'  {len(rep["dropped"])} dropped ({drop} tris)')
            for n, why, t in rep['dropped'][:4]:
                print(f'      - {n[:36]:36s} {why} {t} tris')
        return

    src, dst = [a for a in argv if a.endswith('.glb')][:2]
    rep = pose(src, dst, '--flip' in argv)
    print(json.dumps(rep, indent=1))


if __name__ == '__main__':
    main(sys.argv[1:])
