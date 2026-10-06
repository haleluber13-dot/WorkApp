#!/usr/bin/env python3
"""Turn a raw 3D scan into a binary glTF small enough to ship in a web app.

Scanner output is enormous — a five-million-vertex, ten-million-triangle mesh
is a normal export — so this reads PLY, STL, OBJ or VRML, collapses it to a
triangle budget by vertex clustering, and writes a single-mesh .glb with
positions and indices only (normals are recomputed in the browser, where they
come out smoother than the raw scan's anyway).

    scan2glb.py <in> <out.glb> [--tris=40000] [--size=0.5] [--axis=y]
                [--centre=xyz] [--ground]

`--size` scales the model so its longest side measures that many metres, which
is how a scan in unknown units is made to mean something.
"""
import array, json, math, os, struct, sys


# ---------------------------------------------------------------- readers
def read_ply(path):
    f = open(path, 'rb')
    if f.readline().strip() != b'ply':
        raise SystemExit('%s: not a PLY' % path)
    fmt, nv, nf = None, 0, 0
    vprops, in_vertex = [], False
    while True:
        line = f.readline().decode('ascii', 'replace').strip()
        if not line:
            continue
        t = line.split()
        if t[0] == 'format':
            fmt = t[1]
        elif t[0] == 'element':
            in_vertex = t[1] == 'vertex'
            if in_vertex:
                nv = int(t[2])
            elif t[1] == 'face':
                nf = int(t[2])
        elif t[0] == 'property' and in_vertex and t[1] != 'list':
            vprops.append((t[1], t[2]))
        elif t[0] == 'end_header':
            break
    SZ = {'float':4, 'float32':4, 'double':8, 'float64':8, 'uchar':1, 'uint8':1,
          'char':1, 'int8':1, 'short':2, 'ushort':2, 'int16':2, 'uint16':2,
          'int':4, 'uint':4, 'int32':4, 'uint32':4}
    FM = {'float':'f', 'float32':'f', 'double':'d', 'float64':'d', 'uchar':'B',
          'uint8':'B', 'char':'b', 'int8':'b', 'short':'h', 'ushort':'H',
          'int16':'h', 'uint16':'H', 'int':'i', 'uint':'I', 'int32':'i', 'uint32':'I'}

    V = array.array('f')
    F = array.array('i')
    if fmt == 'ascii':
        for _ in range(nv):
            p = f.readline().split()
            V.extend((float(p[0]), float(p[1]), float(p[2])))
        for _ in range(nf):
            p = [int(x) for x in f.readline().split()]
            for k in range(1, p[0] - 1):
                F.extend((p[1], p[k + 1], p[k + 2]))
        return V, F

    little = fmt == 'binary_little_endian'
    stride = sum(SZ[t] for t, _ in vprops)
    names = [n for _, n in vprops]
    xi = names.index('x')
    off = sum(SZ[vprops[i][0]] for i in range(xi))
    same = (vprops[xi][0] in ('float', 'float32')
            and names[xi:xi + 3] == ['x', 'y', 'z'])
    buf = f.read(nv * stride)
    if same and stride == 12:
        V.frombytes(buf)
        if not little:
            V.byteswap()
    else:
        code = ('<' if little else '>') + FM[vprops[xi][0]] * 3
        for i in range(nv):
            V.extend(struct.unpack_from(code, buf, i * stride + off))
    del buf

    rest = f.read()
    f.close()
    # faces: uchar count then <count> ints
    p = 0
    end = len(rest)
    while p + 1 <= end and len(F) < nf * 3:
        n = rest[p]; p += 1
        if p + n * 4 > end:
            break
        idx = struct.unpack_from(('<' if little else '>') + 'i' * n, rest, p)
        p += n * 4
        for k in range(1, n - 1):
            F.extend((idx[0], idx[k], idx[k + 1]))
    return V, F


def read_stl(path):
    d = open(path, 'rb').read()
    ascii_stl = d[:5] == b'solid' and b'facet normal' in d[:2048]
    V = array.array('f')
    F = array.array('i')
    if ascii_stl:
        n = 0
        for line in d.decode('ascii', 'replace').splitlines():
            t = line.split()
            if t and t[0] == 'vertex':
                V.extend((float(t[1]), float(t[2]), float(t[3])))
                F.append(n); n += 1
        return V, F
    count, = struct.unpack_from('<I', d, 80)
    p = 84
    for i in range(count):
        V.extend(struct.unpack_from('<9f', d, p + 12))
        F.extend((i * 3, i * 3 + 1, i * 3 + 2))
        p += 50
    return V, F


def read_obj(path):
    V = array.array('f')
    F = array.array('i')
    for line in open(path, 'rb'):
        if line[:2] == b'v ':
            p = line.split()
            V.extend((float(p[1]), float(p[2]), float(p[3])))
        elif line[:2] == b'f ':
            c = []
            for tok in line.split()[1:]:
                i = int(tok.split(b'/')[0])
                c.append(i - 1 if i > 0 else len(V) // 3 + i)
            for k in range(1, len(c) - 1):
                F.extend((c[0], c[k], c[k + 1]))
    return V, F


def read_wrl(path):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from wrl2obj import block, floats
    src = open(path, errors='replace').read()
    pts, _ = block(src, 'point')
    idx_raw, _ = block(src, 'coordIndex')
    V = array.array('f', floats(pts))
    F = array.array('i')
    cur = []
    for tok in idx_raw.replace(',', ' ').split():
        n = int(tok)
        if n < 0:
            for k in range(1, len(cur) - 1):
                F.extend((cur[0], cur[k], cur[k + 1]))
            cur = []
        else:
            cur.append(n)
    return V, F


READERS = {'.ply':read_ply, '.stl':read_stl, '.obj':read_obj, '.wrl':read_wrl}


# ------------------------------------------------------------- decimation
def cluster(V, F, cell):
    """Collapse every vertex inside one grid cell to their average, then throw
    away the triangles that come out degenerate. Standard vertex clustering:
    crude next to a quadric collapse, but it runs in one pass over the data
    and at the size these are drawn the difference does not show."""
    nv = len(V) // 3
    key = {}
    sums = array.array('d')
    cnt = array.array('i')
    remap = array.array('i', bytes(4 * nv))
    inv = 1.0 / cell
    for i in range(nv):
        x = V[i*3]; y = V[i*3+1]; z = V[i*3+2]
        k = (int(x * inv) & 0x1FFFFF) | ((int(y * inv) & 0x1FFFFF) << 21) \
            | ((int(z * inv) & 0x1FFFFF) << 42)
        j = key.get(k, -1)
        if j < 0:
            j = len(cnt)
            key[k] = j
            sums.extend((x, y, z))
            cnt.append(1)
        else:
            sums[j*3] += x; sums[j*3+1] += y; sums[j*3+2] += z
            cnt[j] += 1
        remap[i] = j
    out = array.array('i')
    seen = set()
    for t in range(0, len(F) - 2, 3):
        a = remap[F[t]]; b = remap[F[t+1]]; c = remap[F[t+2]]
        if a == b or b == c or a == c:
            continue
        s = (a, b, c) if a < b and a < c else ((b, c, a) if b < c else (c, a, b))
        if s in seen:
            continue
        seen.add(s)
        out.extend((a, b, c))
    P = array.array('f')
    for j in range(len(cnt)):
        n = cnt[j]
        P.extend((sums[j*3] / n, sums[j*3+1] / n, sums[j*3+2] / n))
    return P, out


def decimate(V, F, target):
    lo = [min(V[i::3]) for i in range(3)]
    hi = [max(V[i::3]) for i in range(3)]
    diag = math.dist(lo, hi)
    tris = len(F) // 3
    if tris <= target:
        return V, F, lo, hi
    # a first guess from the area each triangle would have to cover, then a
    # few bisection steps, because the relationship is not exactly analytic
    cell = diag / math.sqrt(target) * 0.9
    best = None
    a, b = cell * 0.15, cell * 6.0
    for _ in range(11):
        c = math.sqrt(a * b)
        P, O = cluster(V, F, c)
        n = len(O) // 3
        if best is None or abs(n - target) < abs(best[0] - target):
            best = (n, P, O)
        if n > target:
            a = c
        else:
            b = c
        if 0.85 * target <= n <= 1.06 * target:
            break
    return best[1], best[2], lo, hi


def trim_outliers(V, F, frac):
    """Drop the stray geometry a scan always carries — a cable left in shot, a
    sliver of the turntable. Anything outside the frac..1-frac percentile on
    any axis goes, along with the triangles that used it."""
    nv = len(V) // 3
    bound = []
    for a in range(3):
        col = sorted(V[a::3])
        k = int(len(col) * frac)
        lo, hi = col[k], col[-1 - k]
        pad = (hi - lo) * 0.06
        bound.append((lo - pad, hi + pad))
    keep = bytearray(nv)
    for i in range(nv):
        if (bound[0][0] <= V[i*3] <= bound[0][1] and bound[1][0] <= V[i*3+1] <= bound[1][1]
                and bound[2][0] <= V[i*3+2] <= bound[2][1]):
            keep[i] = 1
    out = array.array('i')
    for t in range(0, len(F) - 2, 3):
        if keep[F[t]] and keep[F[t+1]] and keep[F[t+2]]:
            out.extend((F[t], F[t+1], F[t+2]))
    print('   trimmed %d of %d triangles as strays' % (len(F)//3 - len(out)//3, len(F)//3))
    return V, out


# ------------------------------------------------------------------ glTF
def write_glb(path, P, F, name):
    lo = [min(P[i::3]) for i in range(3)]
    hi = [max(P[i::3]) for i in range(3)]
    nv = len(P) // 3
    idx_fmt, ctype = ('I', 5125) if nv >= 65536 else ('H', 5123)
    idx = array.array(idx_fmt, F)
    pb = P.tobytes()
    ib = idx.tobytes()
    pad = lambda b: b + b'\0' * ((-len(b)) % 4)
    blob = pad(pb) + pad(ib)
    g = {
        'asset': {'version':'2.0', 'generator':'MotorLab scan2glb'},
        'scene': 0, 'scenes': [{'nodes':[0]}],
        'nodes': [{'name':name, 'mesh':0}],
        'meshes': [{'name':name, 'primitives':[
            {'attributes':{'POSITION':0}, 'indices':1, 'material':0}]}],
        'materials': [{'name':'scan',
                       'pbrMetallicRoughness':{'baseColorFactor':[0.72,0.74,0.76,1],
                                               'metallicFactor':0.6,
                                               'roughnessFactor':0.45}}],
        'accessors': [
            {'bufferView':0, 'componentType':5126, 'count':nv, 'type':'VEC3',
             'min':lo, 'max':hi},
            {'bufferView':1, 'componentType':ctype, 'count':len(idx), 'type':'SCALAR'}],
        'bufferViews': [
            {'buffer':0, 'byteOffset':0, 'byteLength':len(pb), 'target':34962},
            {'buffer':0, 'byteOffset':len(pad(pb)), 'byteLength':len(ib), 'target':34963}],
        'buffers': [{'byteLength':len(blob)}],
    }
    # the JSON chunk is padded with spaces, not nulls — a null tail makes
    # JSON.parse fail in every glTF loader
    jb = json.dumps(g, separators=(',', ':')).encode()
    js = jb + b' ' * ((-len(jb)) % 4)
    out = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
           + struct.pack('<II', len(js), 0x4E4F534A) + js
           + struct.pack('<II', len(blob), 0x004E4942) + blob)
    open(path, 'wb').write(out)


def main(argv):
    opt = {}
    args = []
    for a in argv[1:]:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            opt[k] = v or '1'
        else:
            args.append(a)
    src, dst = args[0], args[1]
    ext = os.path.splitext(src)[1].lower()
    V, F = READERS[ext](src)
    print('%-26s %8d verts %9d tris' % (os.path.basename(src), len(V)//3, len(F)//3))

    if 'trim' in opt:
        V, F = trim_outliers(V, F, float(opt['trim']))
    P, O, lo, hi = decimate(V, F, int(opt.get('tris', 40000)))
    del V, F
    lo = [min(P[i::3]) for i in range(3)]
    hi = [max(P[i::3]) for i in range(3)]
    size = [hi[i] - lo[i] for i in range(3)]

    # bring it into MotorLab's frame: metres, Y up, centred, sitting on Y = 0
    k = float(opt['size']) / max(size) if 'size' in opt else 1.0
    axis = opt.get('axis', 'y')
    cx = (lo[0] + hi[0]) / 2; cy = (lo[1] + hi[1]) / 2; cz = (lo[2] + hi[2]) / 2
    for i in range(0, len(P), 3):
        x, y, z = P[i] - cx, P[i+1] - cy, P[i+2] - cz
        if axis == 'z':                      # scanner Z-up to MotorLab Y-up
            x, y, z = x, z, -y
        P[i] = x * k; P[i+1] = y * k; P[i+2] = z * k
    if 'ground' in opt:
        m = min(P[1::3])
        for i in range(1, len(P), 3):
            P[i] -= m

    write_glb(dst, P, O, opt.get('name', os.path.splitext(os.path.basename(dst))[0]))
    lo2 = [min(P[i::3]) for i in range(3)]
    hi2 = [max(P[i::3]) for i in range(3)]
    print('   -> %-34s %6d tris  %5d KB  size %s m'
          % (os.path.basename(dst), len(O)//3, os.path.getsize(dst)//1024,
             [round(hi2[i]-lo2[i], 3) for i in range(3)]))


if __name__ == '__main__':
    main(sys.argv)
