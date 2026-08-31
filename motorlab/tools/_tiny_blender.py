"""Make a model small enough that the whole catalogue fits in one HTML file.

    python3 _tiny_blender.py in.glb out.glb <tex px> <tris> <jpeg quality>

shrink-glb.py reduces triangles and textures and stops there, which is not
where the weight is. A model published for a renderer is split into a mesh per
material — a hundred and eighteen of them on one car — and none of its vertices
are shared between triangles. Fourteen thousand triangles were being stored as
forty-one thousand separate vertices in a hundred and eighteen separate
accessors: a hundred and fifty bytes a triangle, against about twenty for the
same geometry welded and indexed.

So this does the three things that actually matter, in order:

    decimate  cut the triangles, one part at a time
    join      one object per material, not per part
    weld      merge vertices that sit on top of each other

and only then shrinks the textures.

Decimate before join, and never after. A joined car is one mesh of seven
hundred thousand vertices, and Blender's collapse decimator quietly gives up
part way through one that big: asked for six thousandths of the Quattro it
returned a fifth of it, and returned exactly the same fifth whatever ratio it
was given. The same car decimated part by part and then joined comes out at
eleven thousand triangles — a hundred and thirty times smaller — which is the
difference between the catalogue fitting in the offline file and half of it
being left out.
"""
import bpy, bmesh, sys
from mathutils import Vector

src, dst = sys.argv[1], sys.argv[2]
tex = int(sys.argv[3]) if len(sys.argv) > 3 else 128
tris = int(sys.argv[4]) if len(sys.argv) > 4 else 9000
quality = int(sys.argv[5]) if len(sys.argv) > 5 else 60

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
bpy.context.view_layer.update()


def meshes():
    return [o for o in bpy.context.scene.objects
            if o.type == 'MESH' and o.data and len(o.data.vertices)]


def count(objs):
    n = 0
    for o in objs:
        o.data.calc_loop_triangles()
        n += len(o.data.loop_triangles)
    return n


# --- flatten: transforms into the vertices --------------------------------
seen = set()
for o in meshes():
    mw = o.matrix_world.copy()
    if o.data.name in seen:
        o.data = o.data.copy()
    seen.add(o.data.name)
    o.parent = None
    o.matrix_basis.identity()
    o.data.transform(mw)
bpy.context.view_layer.update()

objs = meshes()
if not objs:
    raise SystemExit('no meshes')

before = sum(len(o.data.vertices) for o in objs)
total = count(objs)

# --- decimate, part by part ----------------------------------------------
if total > tris:
    ratio = tris / total
    for o in objs:
        o.data.calc_loop_triangles()
        n = len(o.data.loop_triangles)
        if n < 24:
            continue
        # One ratio across the car, so its proportions survive — but never so
        # hard that a mirror or a filler cap is reduced to a single triangle.
        # Small parts are cheap; it is the body shells that cost.
        r = max(ratio, min(1.0, 40.0 / n))
        if r >= 0.98:
            continue
        mod = o.modifiers.new('ml_dec', 'DECIMATE')
        mod.ratio = r
        mod.use_collapse_triangulate = True

    # Bake here rather than leaving it to the exporter's export_apply. A mesh
    # carrying shape keys cannot have a modifier applied, and the exporter's
    # response to that is to export the mesh unmodified and say nothing: one
    # car came out at twenty-eight megabytes with a decimate modifier sitting
    # on it doing nothing. Reading the evaluated mesh out of the depsgraph has
    # no such condition attached.
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if not o.modifiers:
            continue
        baked = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear()
        if o.data.shape_keys:
            o.shape_key_clear()
        o.data = baked
    objs = meshes()

# --- join: one object per material, not one per part ----------------------
target = objs[0]
if len(objs) > 1:
    # bpy.ops.object.join, not a bmesh merge: a bmesh merge keeps each face's
    # material index but not the material list it points into, so a car that
    # arrived with seventy materials came out with two and one flat colour.
    try:
        for o in bpy.context.scene.objects:
            o.select_set(o in objs)
        bpy.context.view_layer.objects.active = target
        with bpy.context.temp_override(active_object=target, selected_editable_objects=objs,
                                       object=target, selected_objects=objs):
            bpy.ops.object.join()
    except Exception as err:
        print('MLTINY join refused: %s' % err)

# The join can be refused, and when it was, everything below used to run on
# the first object only. Everything from here on works over whatever objects
# are actually left, however many that is.
objs = meshes()

for o in objs:
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    # Decimating a part leaves behind every vertex it could not put in a
    # triangle, and the exporter writes them all out. The Quattro came back
    # with thirty thousand triangles and eight hundred thousand vertices,
    # which is most of a megabyte of nothing at all.
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    stray = [e for e in bm.edges if not e.link_faces]
    if stray:
        bmesh.ops.delete(bm, geom=stray, context='EDGES')
    bm.to_mesh(me)
    bm.free()
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])
    while len(me.color_attributes):
        me.color_attributes.remove(me.color_attributes[0])
    try:
        me.free_normals_split()
    except Exception:
        pass

after = count(objs)

# --- second pass, for the machines made of a thousand parts ---------------
# Per-part decimation keeps a floor under every part, and on a truck built
# from a thousand brackets the floors add up to four times the budget. The
# joined mesh is small now, well inside what the collapse decimator handles
# honestly, so a second pass over the whole thing brings those in — and does
# nothing at all to a car that already made weight.
if after > tris * 1.4:
    for o in objs:
        mod = o.modifiers.new('ml_dec2', 'DECIMATE')
        mod.ratio = tris / after
        mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        baked = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear()
        if o.data.shape_keys:
            o.shape_key_clear()
        o.data = baked
    after = count(objs)

# --- everything that is not one of those meshes --------------------------
# The join leaves the scene full of the objects it could not take: empties
# from the source hierarchy, and meshes that arrived with no vertices at all.
# The exporter writes every one of them out as a node with a name, and on the
# pickup that was seven thousand empty nodes — half a megabyte of JSON around
# ninety kilobytes of car. Short names for what is left, too: nothing reads
# them, and 'Material2.011' repeated a few hundred times is not free.
keep = set(objs)
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for i, o in enumerate(objs):
    o.name = 'p%d' % i
    o.data.name = 'p%d' % i
for i, m in enumerate(bpy.data.materials):
    m.name = 'm%d' % i
for i, im in enumerate(bpy.data.images):
    im.name = 't%d' % i

# --- textures ------------------------------------------------------------
# A scanned car can arrive with seventy-four maps on it, and one budget per
# map means the paint and a scuff on a door handle cost the same. They do not
# matter the same. Rank them by how much detail they were authored with and
# spend the pixels in that order: the few big maps stay legible, the long tail
# of trim and badge maps goes small, and the car reads right at the size
# anyone will ever see it in this build.
imgs = []
for im in bpy.data.images:
    try:
        w, h = im.size
        if w and h:
            imgs.append((w * h, im))
    except Exception:
        pass
imgs.sort(key=lambda p: -p[0])
for rank, (_, im) in enumerate(imgs):
    cap = tex if rank < 6 else (tex // 2 if rank < 18 else tex // 4)
    try:
        w, h = im.size
        m = max(w, h)
        if m > cap:
            k = cap / m
            im.scale(max(8, int(w * k)), max(8, int(h * k)))
    except Exception:
        pass

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', export_apply=True, export_yup=True,
    export_image_format='JPEG', export_jpeg_quality=quality,
    export_normals=True, export_tangents=False,
    # Geometry is nearly all of what is left once the textures are small, and
    # float32 positions are a wasteful way to say where a bumper is to the
    # nearest tenth of a millimetre. Quantised and Draco-coded it is about an
    # eighth the size, for a shape nobody can tell apart at this scale.
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=11,
    export_draco_normal_quantization=7,
    export_draco_texcoord_quantization=9,
    export_draco_color_quantization=8,
    export_draco_generic_quantization=8)
print('MLTINY verts %d -> %d, tris %d -> %d'
      % (before, sum(len(o.data.vertices) for o in meshes()), total, after))
