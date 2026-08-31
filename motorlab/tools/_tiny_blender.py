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

    join      one object per material, not per part
    weld      merge vertices that sit on top of each other
    strip     drop the UV maps, colour layers and custom normals nothing reads

and only then decimates and shrinks the textures. The result is around a tenth
the size for the same shape.
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


# --- flatten: transforms into the vertices, one object out of many --------
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
# the first object only — so one car came out at twenty-eight megabytes with
# the rest of it exported untouched. Everything from here on works over
# whatever objects are actually left, however many that is.
objs = meshes()
before = sum(len(o.data.vertices) for o in objs)

for o in objs:
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.triangulate(bm, faces=bm.faces)
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

total = 0
for o in objs:
    o.data.calc_loop_triangles()
    total += len(o.data.loop_triangles)
if total > tris and total > 0:
    # one ratio across every object, so the proportions of the thing survive
    ratio = max(0.004, tris / total)
    for o in objs:
        mod = o.modifiers.new('ml_dec', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True

    # Bake it here rather than leaving it to the exporter's export_apply. A
    # mesh carrying shape keys cannot have a modifier applied, and the
    # exporter's response to that is to export the mesh unmodified and say
    # nothing: one car came out at twenty-eight megabytes with a decimate
    # modifier sitting on it doing nothing. Reading the evaluated mesh out of
    # the depsgraph has no such condition attached.
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        baked = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear()
        if o.data.shape_keys:
            o.shape_key_clear()
        o.data = baked
me = target.data

# --- textures ------------------------------------------------------------
for im in bpy.data.images:
    try:
        w, h = im.size
        if not w or not h:
            continue
        m = max(w, h)
        if m > tex:
            k = tex / m
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
    export_draco_position_quantization=12,
    export_draco_normal_quantization=8,
    export_draco_texcoord_quantization=10,
    export_draco_color_quantization=8,
    export_draco_generic_quantization=8)
print('MLTINY verts %d -> %d, tris %d -> %d' % (before, len(me.vertices), total, min(total, tris)))
