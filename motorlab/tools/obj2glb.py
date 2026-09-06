#!/usr/bin/env python3
"""Pack a Wavefront OBJ (+MTL) into a binary glTF file.

MotorLab ships its real vehicle models as .glb: one mesh per named object so
the teardown can still address them individually, positions and UVs only
(normals are recomputed in the browser), and materials carried across by name
so the renderer can substitute real PBR maps for them.  Roughly a quarter the
size of the OBJ it came from, and it parses an order of magnitude faster.
"""
import json, re, struct, sys, os


def load_mtl(path):
    mats = {}
    cur = None
    if not os.path.exists(path):
        return mats
    for line in open(path, errors='replace'):
        t = line.split()
        if not t:
            continue
        if t[0] == 'newmtl':
            cur = t[1]; mats[cur] = {'name': cur, 'kd': [0.72, 0.72, 0.74], 'd': 1.0}
        elif cur is None:
            continue
        elif t[0] == 'Kd':
            mats[cur]['kd'] = [float(x) for x in t[1:4]]
        elif t[0] in ('d', 'Tr'):
            v = float(t[1])
            mats[cur]['d'] = v if t[0] == 'd' else 1 - v
    return mats


def load_obj(path):
    V, VT = [], []
    objs = []          # (name, material, [(vi, ti), ...] triangles)
    name, mat = 'mesh', None
    tris = []

    def flush():
        if tris:
            objs.append((name, mat, list(tris)))
        tris.clear()

    for line in open(path, errors='replace'):
        if line.startswith('v '):
            V.append(tuple(float(x) for x in line.split()[1:4]))
        elif line.startswith('vt '):
            p = line.split()
            VT.append((float(p[1]), float(p[2]) if len(p) > 2 else 0.0))
        elif line[0] in 'og' and line[1] == ' ':
            flush(); name = line[2:].strip() or name
        elif line.startswith('usemtl'):
            flush(); mat = line.split()[1] if len(line.split()) > 1 else None
        elif line.startswith('f '):
            c = []
            for tok in line.split()[1:]:
                bits = tok.split('/')
                vi = int(bits[0]); vi = vi - 1 if vi > 0 else len(V) + vi
                ti = -1
                if len(bits) > 1 and bits[1]:
                    ti = int(bits[1]); ti = ti - 1 if ti > 0 else len(VT) + ti
                c.append((vi, ti))
            for i in range(1, len(c) - 1):          # fan-triangulate
                tris.extend((c[0], c[i], c[i + 1]))
    flush()
    return V, VT, objs


def build(objpath, glbpath, scale=1.0, drop_beyond=None, offset_xyz=(0, 0, 0),
          ground=False, name_material=False, want_uv=True, weld=0.0, strip=None):
    V, VT, objs = load_obj(objpath)
    mtlpath = None
    for line in open(objpath, errors='replace'):
        if line.startswith('mtllib'):
            mtlpath = os.path.join(os.path.dirname(objpath), line.split()[1].strip())
            break
    mats = load_mtl(mtlpath) if mtlpath else {}

    bin_parts = []
    offset = 0
    buffer_views, accessors, meshes, nodes = [], [], [], []
    mat_index, gmats = {}, []

    def view(data, target):
        nonlocal offset
        pad = (-len(data)) % 4
        bin_parts.append(data + b'\0' * pad)
        buffer_views.append({'buffer': 0, 'byteOffset': offset,
                             'byteLength': len(data), 'target': target})
        offset += len(data) + pad
        return len(buffer_views) - 1

    def material(name):
        if name in mat_index:
            return mat_index[name]
        m = mats.get(name, {'name': name or 'default', 'kd': [0.72, 0.72, 0.74], 'd': 1.0})
        g = {'name': m['name'],
             'pbrMetallicRoughness': {'baseColorFactor': m['kd'] + [m['d']],
                                      'metallicFactor': 0.15, 'roughnessFactor': 0.6},
             'doubleSided': True}
        if m['d'] < 0.999:
            g['alphaMode'] = 'BLEND'
        gmats.append(g)
        mat_index[name] = len(gmats) - 1
        return mat_index[name]

    kept = dropped = 0
    for name, mat, tris in objs:
        remap, pos, uv, idx = {}, [], [], []
        for key in tris:
            j = remap.get(key)
            if j is None:
                j = len(pos)
                remap[key] = j
                p = V[key[0]]
                pos.append(((p[0] + offset_xyz[0]) * scale,
                            (p[1] + offset_xyz[1]) * scale,
                            (p[2] + offset_xyz[2]) * scale))
                uv.append(VT[key[1]] if 0 <= key[1] < len(VT) else (0.0, 0.0))
            idx.append(j)
        # drop stray geometry far outside the model's real extent
        if drop_beyond:
            keep = []
            for t in range(0, len(idx), 3):
                if all(abs(pos[idx[t + k]][a]) < drop_beyond[a] for k in range(3) for a in range(3)):
                    keep.extend(idx[t:t + 3])
                else:
                    dropped += 1
            idx = keep
        if weld:
            # vertex clustering: collapse anything inside one grid cell, then
            # throw away the triangles that collapse to a line or a point
            cell, seen, remap2 = {}, {}, [0] * len(pos)
            npos = []
            for j, p in enumerate(pos):
                k = (round(p[0] / weld), round(p[1] / weld), round(p[2] / weld))
                if k in cell:
                    remap2[j] = cell[k]
                else:
                    cell[k] = len(npos); remap2[j] = len(npos); npos.append(p)
            keep = []
            for t in range(0, len(idx), 3):
                a, b, c = (remap2[idx[t + k]] for k in range(3))
                if a != b and b != c and a != c and (a, b, c) not in seen:
                    seen[(a, b, c)] = 1
                    keep.extend((a, b, c))
            pos, idx = npos, keep
            uv = uv[:len(npos)] if len(uv) >= len(npos) else uv
        if not idx:
            continue
        # drop vertices no surviving triangle refers to, so the accessor bounds
        # describe the geometry that is actually drawn
        used, order = {}, []
        for j, v in enumerate(idx):
            if v not in used:
                used[v] = len(order); order.append(v)
            idx[j] = used[v]
        pos = [pos[v] for v in order]
        uv = [uv[v] if v < len(uv) else (0.0, 0.0) for v in order]
        kept += len(idx) // 3

        lo = [min(p[a] for p in pos) for a in range(3)]
        hi = [max(p[a] for p in pos) for a in range(3)]
        pv = view(struct.pack('<%df' % (len(pos) * 3), *[c for p in pos for c in p]), 34962)
        accessors.append({'bufferView': pv, 'componentType': 5126, 'count': len(pos),
                          'type': 'VEC3', 'min': lo, 'max': hi})
        a_pos = len(accessors) - 1
        a_uv = None
        if want_uv and any(u != (0.0, 0.0) for u in uv):
            tv = view(struct.pack('<%df' % (len(uv) * 2), *[c for p in uv for c in p]), 34962)
            accessors.append({'bufferView': tv, 'componentType': 5126,
                              'count': len(uv), 'type': 'VEC2'})
            a_uv = len(accessors) - 1
        if len(pos) < 65536:
            iv = view(struct.pack('<%dH' % len(idx), *idx), 34963); ct = 5123
        else:
            iv = view(struct.pack('<%dI' % len(idx), *idx), 34963); ct = 5125
        accessors.append({'bufferView': iv, 'componentType': ct, 'count': len(idx), 'type': 'SCALAR'})
        a_idx = len(accessors) - 1

        node = name + ('__' + mat if name_material and mat else '')
        if strip:
            node = re.sub(strip, '', node)
        # glTF consumers drop '.' from node names, so settle it here instead
        node = node.replace('.', '_')
        meshes.append({'name': node, 'primitives': [
            {'attributes': ({'POSITION': a_pos, 'TEXCOORD_0': a_uv} if a_uv is not None
                             else {'POSITION': a_pos}),
             'indices': a_idx, 'material': material(mat)}]})
        nodes.append({'name': node, 'mesh': len(meshes) - 1})

    gltf = {'asset': {'version': '2.0', 'generator': 'MotorLab obj2glb'},
            'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
            'nodes': nodes, 'meshes': meshes, 'materials': gmats,
            'accessors': accessors, 'bufferViews': buffer_views,
            'buffers': [{'byteLength': offset}]}

    bin_blob = b''.join(bin_parts)
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    glb = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_blob))
           + struct.pack('<II', len(js), 0x4E4F534A) + js
           + struct.pack('<II', len(bin_blob), 0x004E4942) + bin_blob)
    open(glbpath, 'wb').write(glb)
    print('%s: %d meshes, %d triangles%s -> %s (%d KB)'
          % (os.path.basename(objpath), len(meshes), kept,
             (', %d dropped' % dropped) if dropped else '',
             glbpath, len(glb) // 1024))
    return [n['name'] for n in nodes]


def measure(objpath):
    V, VT, objs = load_obj(objpath)
    lo = [min(p[a] for p in V) for a in range(3)]
    hi = [max(p[a] for p in V) for a in range(3)]
    return lo, hi


if __name__ == '__main__':
    opt = {}
    args = []
    for a in sys.argv[1:]:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            opt[k] = v or '1'
        else:
            args.append(a)
    names = build(args[0], args[1],
                  float(opt.get('scale', 1)),
                  [float(x) for x in opt['clip'].split(',')] if 'clip' in opt else None,
                  [float(x) for x in opt.get('offset', '0,0,0').split(',')],
                  name_material='split' in opt, want_uv='nouv' not in opt,
                  weld=float(opt.get('weld', 0)), strip=opt.get('strip'))
    if 'list' in opt:
        for n in names:
            print('   ', n)
