#!/usr/bin/env python3
"""Convert an Autodesk .3DS scene into a Wavefront OBJ + MTL pair.

Only the chunks MotorLab needs are read: named meshes, their vertices, UVs,
faces, per-face material assignments and the local transform matrix.  Meshes
are emitted one `o` block per material so each piece can be shown, hidden and
exploded on its own.
"""
import struct, sys, os, math

M_VERSION=0x0002; EDIT=0x3D3D; OBJECT=0x4000; TRIMESH=0x4100
VERTS=0x4110; FACES=0x4120; FACEMAT=0x4130; UVS=0x4140; MATRIX=0x4160
MATERIAL=0xAFFF; MATNAME=0xA000; MATDIFFUSE=0xA020; COLOR24=0x0011; COLORF=0x0010


def cstr(d, p):
    e = d.index(b'\0', p)
    return d[p:e].decode('latin-1'), e + 1


class Mesh:
    def __init__(s, name):
        s.name = name; s.v = []; s.uv = []; s.f = []; s.fm = {}; s.mx = None


def parse(path):
    d = open(path, 'rb').read()
    meshes = []; mats = {}
    cur = None; curmat = None

    def walk(p, end):
        nonlocal cur, curmat
        while p < end - 5:
            cid, clen = struct.unpack_from('<HI', d, p)
            if clen < 6:
                return
            body, nxt = p + 6, p + clen
            if cid in (0x4D4D, EDIT, OBJECT, TRIMESH, MATERIAL, MATDIFFUSE):
                if cid == OBJECT:
                    name, body = cstr(d, body)
                    cur = Mesh(name)
                elif cid == TRIMESH:
                    meshes.append(cur)
                elif cid == MATERIAL:
                    curmat = None
                walk(body, nxt)
            elif cid == MATNAME:
                curmat, _ = cstr(d, body)
                mats.setdefault(curmat, (0.7, 0.7, 0.7))
            elif cid == COLOR24 and curmat:
                mats[curmat] = tuple(c / 255 for c in d[body:body + 3])
            elif cid == COLORF and curmat:
                mats[curmat] = struct.unpack_from('<fff', d, body)
            elif cid == VERTS:
                n, = struct.unpack_from('<H', d, body)
                cur.v = [struct.unpack_from('<fff', d, body + 2 + i * 12) for i in range(n)]
            elif cid == UVS:
                n, = struct.unpack_from('<H', d, body)
                cur.uv = [struct.unpack_from('<ff', d, body + 2 + i * 8) for i in range(n)]
            elif cid == FACES:
                n, = struct.unpack_from('<H', d, body)
                cur.f = [struct.unpack_from('<HHH', d, body + 2 + i * 8) for i in range(n)]
                walk(body + 2 + n * 8, nxt)
            elif cid == FACEMAT:
                name, q = cstr(d, body)
                n, = struct.unpack_from('<H', d, q)
                cur.fm[name] = list(struct.unpack_from('<%dH' % n, d, q + 2))
            elif cid == MATRIX:
                cur.mx = struct.unpack_from('<12f', d, body)
            p = nxt
    walk(0, len(d))
    return [m for m in meshes if m and m.v], mats


def main(argv):
    src, dst = argv[1], argv[2]
    scale = float(argv[3]) if len(argv) > 3 else 1.0
    meshes, mats = parse(src)
    name = os.path.splitext(os.path.basename(dst))[0]

    lo = [1e30] * 3; hi = [-1e30] * 3
    for m in meshes:
        for x, y, z in m.v:
            for i, c in enumerate((x, y, z)):
                lo[i] = min(lo[i], c); hi[i] = max(hi[i], c)
    print('source bounds', [round(v, 2) for v in lo], [round(v, 2) for v in hi],
          'meshes', len(meshes), 'faces', sum(len(m.f) for m in meshes))

    # 3DS is Z-up; MotorLab wants Y-up with the model sitting on Y = 0.
    cx = (lo[0] + hi[0]) / 2; cy = (lo[1] + hi[1]) / 2
    def conv(p):
        return ((p[0] - cx) * scale, (p[2] - lo[2]) * scale, -(p[1] - cy) * scale)

    with open(dst, 'w') as f, open(os.path.splitext(dst)[0] + '.mtl', 'w') as fm:
        f.write('# converted from %s by MotorLab tools/tds2obj.py\n' % os.path.basename(src))
        f.write('mtllib %s.mtl\n' % name)
        for mn, c in mats.items():
            fm.write('newmtl %s\nKd %.4f %.4f %.4f\nKs 0.2 0.2 0.2\nNs 40\nd 1\nillum 2\n\n'
                     % (mn.replace(' ', '_'), *c))
        vbase = 1; tbase = 1
        for m in meshes:
            for p in m.v:
                q = conv(p)
                f.write('v %.5f %.5f %.5f\n' % q)
            for t in m.uv:
                f.write('vt %.5f %.5f\n' % t)
            assigned = set()
            groups = []
            for mn, idx in m.fm.items():
                groups.append((mn, idx)); assigned.update(idx)
            rest = [i for i in range(len(m.f)) if i not in assigned]
            if rest:
                groups.append(('default', rest))
            for mn, idx in groups:
                if not idx:
                    continue
                safe = mn.replace(' ', '_')
                f.write('o %s__%s\nusemtl %s\n' % (m.name.replace(' ', '_'), safe, safe))
                for i in idx:
                    a, b, c = m.f[i]
                    if m.uv:
                        f.write('f %d/%d %d/%d %d/%d\n' % (vbase + a, tbase + a, vbase + b,
                                                           tbase + b, vbase + c, tbase + c))
                    else:
                        f.write('f %d %d %d\n' % (vbase + a, vbase + b, vbase + c))
            vbase += len(m.v); tbase += len(m.uv)
    print('wrote', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv)
