"""Render a small three-quarter view of a .glb, so a model can be looked at
rather than inferred from its bounding box.

    python3 _shot_blender.py in.glb out.png [size] [samples]

Cycles on the CPU, because there is no GPU here and the raster engines want
one. At a couple of hundred pixels and a handful of samples that is a few
seconds a model, which is what a contact sheet needs.
"""
import bpy, math, sys
from mathutils import Vector

src = sys.argv[1]
dst = sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 360
samples = int(sys.argv[4]) if len(sys.argv) > 4 else 24

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
bpy.context.view_layer.update()

meshes = [o for o in bpy.context.scene.objects
          if o.type == 'MESH' and o.data and len(o.data.vertices)]
if not meshes:
    raise SystemExit('no meshes')

lo = Vector((1e30,) * 3)
hi = Vector((-1e30,) * 3)
for o in meshes:
    m = o.matrix_world
    for v in o.data.vertices:
        p = m @ v.co
        for k in range(3):
            if p[k] < lo[k]:
                lo[k] = p[k]
            if p[k] > hi[k]:
                hi[k] = p[k]
mid = (lo + hi) * 0.5
r = max(hi - lo) * 0.5 or 1.0

# --- a ground plane, so it is obvious when a model is not sitting on one ----
bpy.ops.mesh.primitive_plane_add(size=r * 12, location=(mid.x, mid.y, lo.z))
ground = bpy.context.active_object
gm = bpy.data.materials.new('ml_ground')
gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.18, .19, .21, 1)
ground.data.materials.append(gm)

# --- three-quarter front, high enough to read the roof ---------------------
cam_d = r * 3.1
bpy.ops.object.camera_add(location=(mid.x + cam_d * .78, mid.y - cam_d * .62,
                                    lo.z + r * 1.15))
cam = bpy.context.active_object
cam.data.lens = 55
d = mid - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = cam

# --- light: a key, a fill, and a sky so nothing goes black ------------------
w = bpy.context.scene.world or bpy.data.worlds.new('W')
bpy.context.scene.world = w
w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs[0].default_value = (.45, .5, .58, 1)
bg.inputs[1].default_value = 1.2

for pos, energy in (((cam_d, -cam_d, cam_d * 1.4), 12.0),
                    ((-cam_d, cam_d * .6, cam_d), 5.0)):
    bpy.ops.object.light_add(type='AREA', location=(mid.x + pos[0], mid.y + pos[1],
                                                    lo.z + pos[2]))
    L = bpy.context.active_object
    L.data.size = r * 4
    L.data.energy = energy * r * r * 40
    dd = mid - L.location
    L.rotation_euler = dd.to_track_quat('-Z', 'Y').to_euler()

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 4
sc.render.resolution_x = size
sc.render.resolution_y = int(size * 0.72)
sc.render.filepath = dst
sc.render.image_settings.file_format = 'PNG'
sc.view_settings.view_transform = 'Filmic'
bpy.ops.render.render(write_still=True)
print('MLSHOT ' + dst)
