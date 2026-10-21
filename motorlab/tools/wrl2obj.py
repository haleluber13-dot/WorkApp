#!/usr/bin/env python3
"""Convert a VRML 2.0 IndexedFaceSet (what a 3D scanner exports) to OBJ.

Scanner output is one enormous triangle soup with no material structure, so
only the geometry is read: the coordinate array and the face index array, with
normals recomputed later in the browser. Handles the single-shape files Artec
Studio writes; enough for a scanned part.
"""
import re, sys, os


def floats(text):
    return [float(x) for x in text.replace(',', ' ').split()]


def block(src, key, start=0):
    """The bracketed array following `key`, and where it ended."""
    i = src.index(key, start)
    a = src.index('[', i)
    depth, j = 0, a
    while True:
        if src[j] == '[':
            depth += 1
        elif src[j] == ']':
            depth -= 1
            if depth == 0:
                break
        j += 1
    return src[a + 1:j], j


def main(argv):
    src = open(argv[1], errors='replace').read()
    dst = argv[2]
    scale = float(argv[3]) if len(argv) > 3 else 1.0

    pts, _ = block(src, 'point')
    idx_raw, _ = block(src, 'coordIndex')
    P = floats(pts)
    V = [(P[i], P[i + 1], P[i + 2]) for i in range(0, len(P) - 2, 3)]
    faces, cur = [], []
    for tok in idx_raw.replace(',', ' ').split():
        n = int(tok)
        if n < 0:
            if len(cur) >= 3:
                for k in range(1, len(cur) - 1):       # fan-triangulate
                    faces.append((cur[0], cur[k], cur[k + 1]))
            cur = []
        else:
            cur.append(n)

    lo = [min(v[a] for v in V) for a in range(3)]
    hi = [max(v[a] for v in V) for a in range(3)]
    size = [hi[a] - lo[a] for a in range(3)]
    print('%s: %d vertices, %d triangles, bounds %s size %s'
          % (os.path.basename(argv[1]), len(V), len(faces),
             [round(x, 1) for x in lo], [round(x, 1) for x in size]))

    # centre on X/Z, sit on Y = 0 — the frame every MotorLab part is built in
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    with open(dst, 'w') as f:
        f.write('# converted from %s by MotorLab tools/wrl2obj.py\n' % os.path.basename(argv[1]))
        f.write('o scan\n')
        for x, y, z in V:
            f.write('v %.5f %.5f %.5f\n'
                    % ((x - cx) * scale, (y - lo[1]) * scale, (z - cz) * scale))
        for a, b, c in faces:
            f.write('f %d %d %d\n' % (a + 1, b + 1, c + 1))
    print('wrote', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv)
