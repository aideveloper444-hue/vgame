"""
VIBO home poster for Amazon Run (Blender 4.5, background):
  blender -b --python poster_duo.py -- stallion.glb raja.glb out.png [tiger_yaw_deg] [horse_frame] [tiger_frame]
Midnight and the tiger galloping side by side toward the camera in bright daylight: a warm high sun, a blue sky fill,
a crisp rim. Transparent background (the poster page lays them over the jungle photo). 1440 x 2160.
"""
import sys
import math
import bpy
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
horse_src, tiger_src, out = a[:3]
tyaw = math.radians(float(a[3])) if len(a) > 3 else 0.0
hf = int(a[4]) if len(a) > 4 else 6
tf = int(a[5]) if len(a) > 5 else 4
TX = float(a[6]) if len(a) > 6 else -1.7
TY = float(a[7]) if len(a) > 7 else -0.55
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
            new.remove(o)
    return new


def wbox(objs):
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        if o.type == 'MESH':
            dg = bpy.context.evaluated_depsgraph_get()
            ev = o.evaluated_get(dg)
            m = ev.to_mesh()
            pts += [ev.matrix_world @ m.vertices[i].co for i in range(0, len(m.vertices), 7)]
            ev.to_mesh_clear()
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


horse = load(horse_src)
for o in horse:
    if o.type == 'MESH' and o.name.startswith('MESH_horse'):
        bs = next((x for x in o.material_slots[0].material.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
        if bs:
            bs.inputs['Roughness'].default_value = 0.5
            if 'Specular IOR Level' in bs.inputs:
                bs.inputs['Specular IOR Level'].default_value = 0.35
harm = next(o for o in horse if o.type == 'ARMATURE')
harm.animation_data_create()
harm.animation_data.action = next(x for x in bpy.data.actions if x.name == 'Gallop')
hact = harm.animation_data.action
tiger = load(tiger_src)
tarm = next(o for o in tiger if o.type == 'ARMATURE')
tact = next(x for x in bpy.data.actions if x != hact)
tarm.animation_data_create()
tarm.animation_data.action = tact
# the tiger's top-level node: scale and turn it as a whole
troot = next(o for o in tiger if o.parent is None)
sc.frame_set(hf)
# both actions play on their own frame: offset the tiger's strip so each sits at its own pose on the same scene frame
if tact.frame_range[1] > 1:
    tarm.animation_data.action = None
    tr = tarm.animation_data.nla_tracks.new()
    st = tr.strips.new('t', int(hf - tf), tact)
lo, hi = wbox(tiger)
h = hi.z - lo.z
s = 1.25 / max(1e-6, h)  # the tiger's height in the game's proportions (horse 2.04 tall to the ears)
troot.scale = troot.scale * s
troot.rotation_mode = 'XYZ'
troot.rotation_euler.z += tyaw
bpy.context.view_layer.update()
lo, hi = wbox(tiger)
c = (lo + hi) / 2
troot.location += Vector((TX - c.x, TY - c.y, 0.14 - lo.z))
bpy.context.view_layer.update()
print('TIGER box', [round(x, 2) for x in lo], [round(x, 2) for x in hi])

sc.render.engine = 'BLENDER_EEVEE_NEXT'
for k, v in (('use_raytracing', True), ('taa_render_samples', 96), ('use_shadows', True)):
    if hasattr(sc.eevee, k):
        setattr(sc.eevee, k, v)
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = 1440, 2160
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.45, 0.6, 0.85, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.45
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy, sun.color, sun.angle = 4.5, (1.0, 0.9, 0.75), math.radians(3)
so = bpy.data.objects.new('sun', sun)
sc.collection.objects.link(so)
so.rotation_euler = (math.radians(45), math.radians(-15), math.radians(240))


def area(name, loc, energy, color, size, tgt):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy, ld.color, ld.size = energy, color, size
    lo_ = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(lo_)
    lo_.location = loc
    lo_.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


area('rim', (3.0, 4.5, 3.0), 1600, (0.85, 0.92, 1.0), 2, (-1.0, 0.1, 1.1))
area('rim2', (3.0, -2.5, 2.5), 350, (1.0, 0.85, 0.65), 2, (-0.6, 0.7, 1.1))
area('fill', (-6, -1, 1.5), 300, (0.9, 0.95, 1.0), 5, (-0.6, 1.3, 1.0))
# ground: catches the contact shadow; holdout keeps the picture transparent except for the shadow darkening
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 1.3, 0.14))
g = bpy.context.active_object
g.is_shadow_catcher = True
g.hide_render = True

cd = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cd)
sc.collection.objects.link(cam)
sc.camera = cam
tgt = Vector((-1.15, 0.1, 0.95))
cam.location = tgt + Vector((-4.6, -2.2, -0.3))
cam.rotation_euler = (tgt + Vector((0, 0, 0.15)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cd.lens = 38
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
