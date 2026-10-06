#!/usr/bin/env python3
"""MotorLab — turn raw downloads into the two tiers the app ships.

fetch-sketchfab.py leaves the models exactly as their authors uploaded them:
hundreds of megabytes, 4K textures, a million triangles, a shadow plane under
each one and the origin wherever it landed. This is everything between that and
something a browser opens:

    pose      strip the props, centre it, sit it on the ground, nose it +X
    full      1024px textures, ~140k triangles   -> assets/models
    lite      256px textures,  ~14k triangles    -> assets/models-lite
    manifest  rewrite the recorded byte counts to what is actually on disk

    export SKETCHFAB_TOKEN=...
    python3 motorlab/tools/fetch-sketchfab.py --into /tmp/raw
    python3 motorlab/tools/prepare-models.py /tmp/raw

The lite tier exists for the single-file offline build, which has to fit in a
16 MB HTML file; build-single.mjs substitutes it and skips any model that has
no lite twin. Both tiers are built from the same posed source, so a car is the
same car and the same size in either.

Add `--skip-pose` when re-running on a directory that has already been posed —
posing twice is harmless but slow, and it is the slow half.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..')
POSE = os.path.join(HERE, 'pose-glb.py')
SHRINK = os.path.join(HERE, 'shrink-glb.py')

FULL = dict(tex=1024, tris=140_000)
LITE = dict(tex=256, tris=14_000)

# Nothing in a .glb says which end is the front, and no geometric rule gets it
# right for every car — a mid-engine car's cabin is central, a truck's is over
# the front axle. So the ones that came out backwards were looked at and are
# listed here; pose-glb.py turns these an extra 180 degrees.
FLIPPED = os.path.join(HERE, 'models-flipped.txt')


def run(cmd):
    r = subprocess.run(cmd, text=True, capture_output=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stdout.write(r.stderr)
    return r.returncode


def sizes(d):
    return {f: os.path.getsize(os.path.join(d, f))
            for f in os.listdir(d) if f.endswith('.glb')} if os.path.isdir(d) else {}


def main(argv):
    raw = argv[0] if argv and not argv[0].startswith('--') else None
    if not raw:
        sys.exit(__doc__)
    full = os.path.join(APP, 'assets', 'models')
    lite = os.path.join(APP, 'assets', 'models-lite')

    if '--skip-pose' not in argv:
        print('== pose ==')
        cmd = [sys.executable, POSE, '--all', raw]
        if os.path.exists(FLIPPED):
            cmd += ['--flip-list', FLIPPED]
        run(cmd)

    for name, out, opt in (('full', full, FULL), ('lite', lite, LITE)):
        print(f'== {name} tier -> {os.path.relpath(out, APP)} ==')
        os.makedirs(out, exist_ok=True)
        run([sys.executable, SHRINK, '--all', raw, '--out', out,
             '--tex', str(opt['tex']), '--tris', str(opt['tris'])])

    # --- the manifest records how big each file is; make that true again ----
    mpath = os.path.join(full, 'manifest.json')
    m = json.load(open(mpath))
    have = sizes(full)
    for key, rec in m['models'].items():
        if rec['file'] in have:
            rec['bytes'] = have[rec['file']]
    with open(mpath, 'w') as f:
        json.dump(m, f, indent=2)
        f.write('\n')

    tot = sum(have.values()) / 1048576
    lt = sum(sizes(lite).values()) / 1048576
    print(f'\n{len(have)} models: {tot:.0f} MB full, {lt:.0f} MB lite')


if __name__ == '__main__':
    main(sys.argv[1:])
