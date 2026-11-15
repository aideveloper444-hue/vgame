"""
Portrait and store card for the stallion (Blender 4.5, background):
  blender -b --python horse_art.py -- stallion.glb sky.jpg out_dir
Renders the game model in front of the game's own forest photo (thrown out of focus by the camera's depth of field),
with a warm key light, a cool rim light and a soft fill, like the painted cards of the other animals:
  card_stallion.webp (472 x 469, a three-quarter view in full gallop) and head_stallion.webp (194 x 252, head and mane).
"""
import sys
import math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, sky, out_dir = argv[0], argv[1], argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 90
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0.1
scene.world = bpy.data.worlds.new('w')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.07, 0.05, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.6


def look(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def light(name, kind, loc, energy, color, size=2.0):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if hasattr(ld, 'size'):
        ld.size = size
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = loc
    look(lo, (-0.6, 0.72, 1.2))
    return lo


light('key', 'AREA', (-3.5, -3.0, 3.6), 650, (1.0, 0.92, 0.82), 3)
light('rim', 'AREA', (2.5, 3.5, 3.0), 1100, (0.75, 0.85, 1.0), 2)
light('fill', 'AREA', (-4.0, 2.5, 1.2), 250, (0.9, 0.95, 1.0), 4)

# the forest backdrop: a big emissive plane carrying the sky/forest photo, far behind the horse
img = bpy.data.images.load(sky)
# a soft, out-of-focus forest: the photo scaled right down (the texture filtering smooths it into a blur)
img.scale(72, 40)
mat = bpy.data.materials.new('backdrop')
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = img
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Strength'].default_value = 0.42
outn = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(tex.outputs['Color'], em.inputs['Color'])
nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
bpy.ops.mesh.primitive_plane_add(size=1)
plane = bpy.context.active_object
plane.data.materials.append(mat)

cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam)
scene.camera = cam
cam_d.dof.use_dof = True


def shot(path, action, frame, w, h, cam_loc, target, lens, plane_dist, plane_size):
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[action]
    scene.frame_set(frame)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    cam.location = cam_loc
    look(cam, target)
    cam_d.lens = lens
    cam_d.dof.focus_distance = (Vector(target) - Vector(cam_loc)).length
    cam_d.dof.aperture_fstop = 1.4
    # the backdrop square to the camera, far behind the horse
    d = (Vector(target) - Vector(cam_loc)).normalized()
    plane.location = Vector(target) + d * plane_dist
    plane.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    plane.scale = (plane_size, plane_size, 1)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDERED', path)


# the store card: rearing up on the hind legs, forelegs pawing (the pose of the reference photos)
shot(f'{out_dir}/card_stallion.webp', 'Intro', 24, 472, 469, (-2.9, -2.3, 1.85), (-0.42, 0.72, 1.62), 36, 7, 22)
# the portrait: head and mane, slightly from the front
shot(f'{out_dir}/head_stallion.webp', 'Idle', 0, 194, 252, (-3.2, -1.0, 1.95), (-1.38, 0.72, 1.7), 62, 6, 12)
