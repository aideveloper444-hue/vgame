"""
VIBO home poster for Amazon Run (Blender 4.5, background):
  blender -b --python poster_art.py -- stallion.glb tex_dir out.png [frame] [cam_yaw_deg]
Midnight galloping down a forest trail at golden hour: the game's forest panorama as the world (background and
light), a low warm sun behind him for a bright rim, a cool fill, a leaf-litter floor, a warm haze that melts the
horizon, shallow depth of field. Portrait 1440 x 2160, no text (the app prints the game's name on the card).
"""
import sys
import math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, tex, out = argv[:3]
frame = int(argv[3]) if len(argv) > 3 else 4
yaw = math.radians(float(argv[4])) if len(argv) > 4 else math.radians(-35)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'
ee = sc.eevee
for k, v in (('use_raytracing', True), ('use_shadows', True), ('taa_render_samples', 128), ('use_gtao', True)):
    if hasattr(ee, k):
        setattr(ee, k, v)
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'
sc.view_settings.exposure = 0.0
sc.render.resolution_x, sc.render.resolution_y = 1440, 2160
sc.render.image_settings.file_format = 'PNG'

# world: the sky photo (equirect), rotated so the bright part sits behind the horse
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
wn = sc.world.node_tree
env = wn.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(f'{tex}/sky_4k.jpg')
mp = wn.nodes.new('ShaderNodeMapping')
mp.inputs['Rotation'].default_value = (0, 0, math.radians(200))
tc = wn.nodes.new('ShaderNodeTexCoord')
wn.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
wn.links.new(mp.outputs['Vector'], env.inputs['Vector'])
# warm the sky toward sunset
hsv = wn.nodes.new('ShaderNodeMixRGB')
hsv.blend_type = 'MULTIPLY'
hsv.inputs['Fac'].default_value = 0.55
hsv.inputs['Color2'].default_value = (1.0, 0.62, 0.38, 1)
wn.links.new(env.outputs['Color'], hsv.inputs['Color1'])
wn.links.new(hsv.outputs['Color'], wn.nodes['Background'].inputs['Color'])
wn.nodes['Background'].inputs['Strength'].default_value = 0.8
sc.render.film_transparent = True  # the horse alone: the poster page lays him over the graded jungle photo

# the low sun behind the horse (rim), a soft cool fill, a weak warm key from camera side
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy, sun.color, sun.angle = 8.0, (1.0, 0.68, 0.4), math.radians(2)
so = bpy.data.objects.new('sun', sun)
sc.collection.objects.link(so)
so.rotation_euler = (math.radians(80), 0, math.radians(200) + yaw)


def area(name, loc, energy, color, size, tgt=(-0.5, 0.72, 1.2)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy, ld.color, ld.size = energy, color, size
    lo = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(lo)
    lo.location = loc
    lo.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


# the forest floor: the game's leaf-litter texture
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0.72, 0.14))
g = bpy.context.active_object
gm = bpy.data.materials.new('sand')
gm.use_nodes = True
n = gm.node_tree
b = n.nodes['Principled BSDF']
td = n.nodes.new('ShaderNodeTexImage')
td.image = bpy.data.images.load(f'{tex}/hd/leaf_diff.webp')
tn = n.nodes.new('ShaderNodeTexImage')
tn.image = bpy.data.images.load(f'{tex}/hd/leaf_nor.webp')
tn.image.colorspace_settings.name = 'Non-Color'
tcg = n.nodes.new('ShaderNodeTexCoord')
mpg = n.nodes.new('ShaderNodeMapping')
mpg.inputs['Scale'].default_value = (45, 45, 45)
n.links.new(tcg.outputs['UV'], mpg.inputs['Vector'])
n.links.new(mpg.outputs['Vector'], td.inputs['Vector'])
n.links.new(mpg.outputs['Vector'], tn.inputs['Vector'])
dark = n.nodes.new('ShaderNodeMixRGB')
dark.blend_type = 'MULTIPLY'
dark.inputs['Fac'].default_value = 1.0
dark.inputs['Color2'].default_value = (0.55, 0.45, 0.35, 1)
n.links.new(td.outputs['Color'], dark.inputs['Color1'])
n.links.new(dark.outputs['Color'], b.inputs['Base Color'])
nm = n.nodes.new('ShaderNodeNormalMap')
nm.inputs['Strength'].default_value = 0.9
n.links.new(tn.outputs['Color'], nm.inputs['Color'])
n.links.new(nm.outputs['Normal'], b.inputs['Normal'])
b.inputs['Roughness'].default_value = 0.85
g.data.materials.append(gm)
g.hide_render = True  # only lights the horse from below a little; the page draws the floor

# the horse: a touch more gloss for the sunset highlights
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('MESH_horse'):
        bs = next((x for x in o.material_slots[0].material.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
        if bs:
            bs.inputs['Roughness'].default_value = 0.42

arm.animation_data_create()
arm.animation_data.action = bpy.data.actions['Gallop']
sc.frame_set(frame)

cd = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cd)
sc.collection.objects.link(cam)
sc.camera = cam
target = Vector((-0.5, 0.72, 1.05))
dist = 5.2
# nose points -x: a yaw of 0 looks at the horse head-on, negative swings round to its left flank
cam.location = target + Vector((-math.cos(yaw) * dist, math.sin(yaw) * dist, -0.55))
cam.rotation_euler = (target + Vector((0, 0, 0.25)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cd.lens = 42
cd.dof.use_dof = False
cd.dof.focus_distance = (target - cam.location).length
cd.dof.aperture_fstop = 1.2
area('key', tuple(cam.location + Vector((0.5, -1.5, 2.0))), 260, (1.0, 0.85, 0.7), 3)
area('fill', (2.5, 4.0, 1.0), 120, (0.6, 0.72, 1.0), 4)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
