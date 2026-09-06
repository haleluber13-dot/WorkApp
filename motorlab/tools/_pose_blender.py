"""The Blender half of pose-glb.py. Run through Blender-as-a-module:

    python3 _pose_blender.py in.glb out.glb <0|1 flip>

It prints one line, `MLPOSE {json}`, so the caller can tell a real result from
Blender's ordinary chatter on stdout.

Everything here moves vertices, never objects. `bpy.ops.object.transform_apply`
is the obvious tool and it is the wrong one without a window: it works off the
selection and the active object, both of which are unreliable in a headless
module, and when it declines it declines quietly. `mesh.transform(matrix)` has
none of that around it — it is just arithmetic on the vertex data — so after
the flatten below every object sits at the identity and world space and local
space are the same thing.
"""
import bpy, json, math, sys
from mathutils import Matrix, Vector

src, dst, flip = sys.argv[-3], sys.argv[-2], sys.argv[-1] == '1'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
bpy.context.view_layer.update()


def meshes():
    return [o for o in bpy.context.scene.objects
            if o.type == 'MESH' and o.data and len(o.data.vertices)]


def flatten():
    """Push each object's world matrix into its vertices and clear it."""
    seen = set()
    for o in meshes():
        mw = o.matrix_world.copy()
        # glTF shares one mesh between several objects freely; transforming
        # shared data once per user would apply it twice.
        if o.data.name in seen:
            o.data = o.data.copy()
        seen.add(o.data.name)
        o.parent = None
        o.matrix_basis = Matrix.Identity(4)
        o.data.transform(mw)
    bpy.context.view_layer.update()


def move(m):
    """Apply one world-space matrix to every mesh in the scene."""
    for o in meshes():
        o.data.transform(m)


def box(o):
    vs = o.data.vertices
    p = vs[0].co
    lo, hi = Vector(p), Vector(p)
    for v in vs:
        p = v.co
        for k in range(3):
            if p[k] < lo[k]:
                lo[k] = p[k]
            if p[k] > hi[k]:
                hi[k] = p[k]
    return lo, hi


def tri_count(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def span(pairs):
    lo = Vector((min(a.x for a, _ in pairs), min(a.y for a, _ in pairs),
                 min(a.z for a, _ in pairs)))
    hi = Vector((max(b.x for _, b in pairs), max(b.y for _, b in pairs),
                 max(b.z for _, b in pairs)))
    return lo, hi


flatten()

items = []
for o in meshes():
    lo, hi = box(o)
    items.append({'o': o, 'lo': lo, 'hi': hi, 'd': hi - lo, 't': tri_count(o)})
if not items:
    raise SystemExit('no meshes')

lo0, hi0 = span([(i['lo'], i['hi']) for i in items])
scene_max = max(hi0 - lo0)
report = {'before': list(hi0 - lo0), 'dropped': []}

# --- 1. shadow planes and backdrops ---------------------------------------
# Flat, and big enough to matter. A window is flat too, but a window is small;
# the test is the pairing of the two.
keep = []
for i in items:
    d = sorted(i['d'])                       # thinnest .. thickest
    flat = d[0] <= 0.02 * max(d[2], 1e-9)
    name = i['o'].name.lower()
    named = any(w in name for w in ('shadow', 'backdrop', 'ground', 'floor', 'plane'))
    if flat and (d[2] >= 0.55 * scene_max or named):
        report['dropped'].append([i['o'].name, 'flat plane', i['t']])
    else:
        keep.append(i)
items = keep or items

# --- 2. clusters that do not touch the main body --------------------------
# Union-find over the boxes, grown by a little slack so parts that merely sit
# beside each other still count as connected. The cluster carrying the most
# triangles is the subject; anything else is a stray copy or a prop.
pad = 0.02 * scene_max
parent = list(range(len(items)))


def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a


def union(a, b):
    a, b = find(a), find(b)
    if a != b:
        parent[a] = b


for a in range(len(items)):
    A = items[a]
    for b in range(a + 1, len(items)):
        B = items[b]
        if all(A['lo'][k] - pad <= B['hi'][k] and B['lo'][k] - pad <= A['hi'][k]
               for k in range(3)):
            union(a, b)

groups = {}
for a in range(len(items)):
    groups.setdefault(find(a), []).append(a)
if len(groups) > 1:
    main = max(groups.values(), key=lambda g: sum(items[i]['t'] for i in g))
    for g in groups.values():
        if g is main:
            continue
        for i in g:
            report['dropped'].append([items[i]['o'].name, 'detached', items[i]['t']])
    items = [items[i] for i in main]

survivors = {i['o'].name for i in items}
for o in list(meshes()):
    if o.name not in survivors:
        bpy.data.objects.remove(o, do_unlink=True)

# --- 3. centre, ground, and turn the length onto X ------------------------
lo, hi = span([(i['lo'], i['hi']) for i in items])
mid, d = (lo + hi) * 0.5, hi - lo
# glTF is Y-up; the importer brings it in Z-up, so the ground axis here is Z.
move(Matrix.Translation(Vector((-mid.x, -mid.y, -lo.z))))

turn = d.y > d.x        # length along Y in Blender is length along Z in glTF
if turn or flip:
    ang = (math.pi / 2 if turn else 0.0) + (math.pi if flip else 0.0)
    move(Matrix.Rotation(ang, 4, 'Z'))

objs = meshes()
boxes = [box(o) for o in objs]
lo, hi = span(boxes)
report['after'] = list(hi - lo)
report['floor'] = lo.z
report['kept'] = len(objs)
report['parts'] = sorted(
    ([o.name, [round(v, 3) for v in b[0]], [round(v, 3) for v in (b[1] - b[0])]]
     for o, b in zip(objs, boxes)),
    key=lambda r: -max(r[2]))[:40]

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True,
                          export_yup=True, export_image_format='AUTO',
                          export_draco_mesh_compression_enable=False)
print('MLPOSE ' + json.dumps(report))
