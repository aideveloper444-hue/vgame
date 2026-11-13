"""
Wildbound animal upgrade (run inside Blender 4.5, background):
  blender -b --python process.py -- in.glb out.glb <subdiv levels> <normal strength>
1. Subdivide the skinned body (Catmull-Clark, applied in rest pose before the Armature modifier, so vertex
   groups / skin weights are interpolated onto the new vertices) and shade it smooth.
2. Build a tangent-space detail normal map from the model's own colour texture (a high-pass of its luminance as
   height: fur clumps, stripes, skin folds), and wire it into the material so the glTF export writes normalTexture.
3. Export GLB with the skeleton and every action, textures kept.
"""
import sys
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, levels, strength = argv[0], argv[1], int(argv[2]), float(argv[3])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

# the importer's bone-display icosphere is not part of the model
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)

meshes = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
# 'lod': the source ships several detail levels of the same body, all visible at once (they overlap and the coarse
# ones poke through). Keep only the most detailed mesh for each material.
if len(argv) > 4 and argv[4] == 'lod':
    best = {}
    for o in meshes:
        key = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else ''
        if key not in best or len(o.data.polygons) > len(best[key].data.polygons):
            best[key] = o
    for o in meshes:
        if o not in best.values():
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = list(best.values())
print('SKINNED', [(m.name, len(m.data.polygons)) for m in meshes])


def blur(a, r):
    """separable box blur, run twice (close to a gaussian), wrapping like a tiling texture"""
    for _ in range(2):
        k = 2 * r + 1
        c = np.cumsum(np.pad(a, ((0, 0), (r + 1, r)), mode='wrap'), axis=1)
        a = (c[:, k:] - c[:, :-k]) / k
        c = np.cumsum(np.pad(a, ((r + 1, r), (0, 0)), mode='wrap'), axis=0)
        a = (c[k:, :] - c[:-k, :]) / k
    return a


done_imgs = {}
for ob in meshes:
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    if levels > 0:
        sub = ob.modifiers.new('Subdiv', 'SUBSURF')
        sub.levels = levels
        sub.render_levels = levels
        sub.quality = 3
        sub.uv_smooth = 'PRESERVE_BOUNDARIES'
        sub.boundary_smooth = 'PRESERVE_CORNERS'
        # before the armature: subdivide the rest pose, keep the skinning live
        while ob.modifiers.find('Subdiv') > 0:
            bpy.ops.object.modifier_move_up(modifier='Subdiv')
        bpy.ops.object.modifier_apply(modifier='Subdiv')
    for p in ob.data.polygons:
        p.use_smooth = True
    print('AFTER', ob.name, len(ob.data.polygons), 'polys', len(ob.vertex_groups), 'groups')

    # ---- detail normal map from the base colour
    for slot in ob.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf or bsdf.inputs['Normal'].is_linked:
            continue
        base = bsdf.inputs['Base Color']
        if not base.is_linked or base.links[0].from_node.type != 'TEX_IMAGE':
            continue
        img = base.links[0].from_node.image
        if img.name not in done_imgs:
            w, h = img.size
            px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
            lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
            # height: fine detail (fur, pores, wrinkles) plus a little of the broad form, never the flat colour
            fine = lum - blur(lum, max(2, w // 256))
            broad = blur(lum, max(1, w // 512)) - blur(lum, max(4, w // 64))
            hgt = fine + 0.35 * broad
            hgt /= max(1e-4, np.percentile(np.abs(hgt), 98))
            dx = (np.roll(hgt, -1, axis=1) - np.roll(hgt, 1, axis=1)) * 0.5
            dy = (np.roll(hgt, -1, axis=0) - np.roll(hgt, 1, axis=0)) * 0.5
            n = np.dstack([-dx * strength, -dy * strength, np.ones_like(hgt)])
            n /= np.linalg.norm(n, axis=2, keepdims=True)
            rgba = np.dstack([n * 0.5 + 0.5, np.ones_like(hgt)]).astype(np.float32)
            nimg = bpy.data.images.new(img.name + '_detailN', w, h, alpha=False)
            nimg.colorspace_settings.name = 'Non-Color'
            nimg.pixels.foreach_set(rgba.ravel())
            nimg.file_format = 'PNG'
            nimg.pack()
            done_imgs[img.name] = nimg
            print('NORMAL', img.name, w, h)
        nimg = done_imgs[img.name]
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = nimg
        tex.interpolation = 'Linear'
        uvsrc = base.links[0].from_node.inputs['Vector']
        if uvsrc.is_linked:
            nt.links.new(uvsrc.links[0].from_socket, tex.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = 1.0
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_skins=True,
    export_morph=False,
    # WebP (EXT_texture_webp): a fraction of PNG's size, keeps alpha (the tiger's cheek-fur cards)
    export_image_format='WEBP',
    export_image_quality=88,
    export_apply=False,
    export_yup=True,
)
print('EXPORTED', out)
