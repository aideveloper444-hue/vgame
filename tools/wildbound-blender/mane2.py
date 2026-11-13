"""
A hair-card mane for the Wildbound lion (Blender 4.5, background):
  blender -b --python mane2.py -- leo_hd.glb out.glb
- 'Lion_ManeBase': the head / neck / chest region of the body copied and pushed out a little: a dark under-layer
  so the neck never shows between the locks.
- 'Lion_ManeHair': ~4000 hair strands grown over that region (sweeping back and down, longest on the neck and
  chest, short around the face), each turned into a thin ribbon (a hair card) with UVs along its length and a
  generated tapered-strand alpha texture. Both are skinned to the lion's skeleton (weights copied from the body).
Blender space after import of leo_hd.glb: metres, z up (paws 0 .. head top 1.61), nose toward -y (y = -1.24).
"""
import sys
import math
import random
import bpy
import bmesh
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.material_slots and o.material_slots[0].material.name == 'Lion_M_Material')
arm_mod = next(m for m in body.modifiers if m.type == 'ARMATURE')
armature = arm_mod.object
print('BODY', body.name, len(body.data.vertices), 'armature', armature.name)

M = body.matrix_world.copy()
Minv = M.inverted()


def ss(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def mane_weight(w):
    """w: world position (metres). Lm along the body (nose +1.24 .. tail -1.97), Hm height."""
    Lm, Hm = -w.y, w.z
    # in the original model units (nose -107 .. tail 171, height 0 .. 139), where the region was tuned
    L = (1.24 - Lm) / 0.01155 - 107
    H = Hm / 0.01158
    along = ss(-91, -81, L) * (1 - ss(-40, -14, L))
    high = ss(36, 70, H)
    chest = ss(16, 46, H) * (1 - ss(-66, -48, L))
    return along * max(high, chest), L, H


def region_copy(name, push):
    ob = body.copy()
    ob.data = body.data.copy()
    ob.name = name
    ob.data.name = name
    body.users_collection[0].objects.link(ob)
    mat = body.material_slots[0].material.copy()
    mat.name = name
    ob.material_slots[0].material = mat
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    W = {v: mane_weight(M @ v.co)[0] for v in bm.verts}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if min(W[v] for v in f.verts) < 0.02], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        k = W.get(v, 0)
        v.co += v.normal * k * push
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ---- the under-layer (local units: the body mesh is in model units scaled by its object matrix)
scale = M.to_scale().x
base = region_copy('Lion_ManeBase', 0.04 / scale)
print('BASE', len(base.data.polygons))

# ---- grow strands over the region (sample the body surface, weighted by the mane region)
deps = bpy.context.evaluated_depsgraph_get()
bm = bmesh.new()
bm.from_mesh(body.data)
bm.transform(M)
bm.normal_update()
bmesh.ops.triangulate(bm, faces=bm.faces)
faces = []
for f in bm.faces:
    c = f.calc_center_median()
    w, L, H = mane_weight(c)
    if w > 0.03:
        faces.append((f, w * f.calc_area()))
total = sum(a for _, a in faces)
tree = BVHTree.FromBMesh(bm)
print('FACES', len(faces))

N = 3200
SEG = 4
hair = bmesh.new()
uv_layer = hair.loops.layers.uv.new('UVMap')
picked = random.choices([f for f, _ in faces], weights=[a for _, a in faces], k=N)
center_head = Vector((0, -1.0, 1.25))
for f in picked:
    # random point on the triangle
    a, b, c = (v.co for v in f.verts)
    r1, r2 = random.random(), random.random()
    if r1 + r2 > 1:
        r1, r2 = 1 - r1, 1 - r2
    p = a + (b - a) * r1 + (c - a) * r2
    n = f.normal.copy()
    w, L, H = mane_weight(p)
    # length: short at the face fringe, longest over the neck and down the chest
    length = (0.08 + 0.2 * ss(-86, -58, L) * (1 - 0.35 * ss(-34, -16, L)) + 0.07 * ss(112, 134, H)) * (0.75 + 0.5 * random.random()) * (0.55 + 0.45 * w)
    # direction: out from the skin, swept back (+y) and down, with a random scatter
    # lies back along the neck and falls down the chest, lifting only a little off the skin
    d = (n * 0.42 + Vector((0, 0.8, -0.38)) + Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.18).normalized()
    # rooted just above the under-layer, so it never shows through
    p = p + n * 0.032 * w
    pts = [p - n * 0.01]
    q = p.copy()
    step = length / SEG
    for i in range(SEG):
        # the strand bends down under its own weight and waves a little
        d = (d + Vector((0, 0.07, -0.2)) + Vector((noise.noise(q * 9 + Vector((i, 0, 0))), noise.noise(q * 9 + Vector((0, i, 3))), 0)) * 0.1).normalized()
        q = q + d * step
        pts.append(q.copy())
    # ribbon: face it toward the outside (across the strand, in the plane of the skin)
    width0 = 0.008 + 0.006 * random.random()
    verts = []
    for i, pt in enumerate(pts):
        t = i / SEG
        tan = (pts[min(i + 1, SEG)] - pts[max(i - 1, 0)]).normalized()
        side = tan.cross(n).normalized()
        if side.length < 0.5:
            side = tan.cross(Vector((1, 0, 0))).normalized()
        wdt = width0 * (1 - 0.65 * t)
        verts.append((hair.verts.new(pt - side * wdt), hair.verts.new(pt + side * wdt), t))
    for i in range(SEG):
        (a0, b0, t0), (a1, b1, t1) = verts[i], verts[i + 1]
        face = hair.faces.new((a0, b0, b1, a1))
        for loop, uv in zip(face.loops, ((0, t0), (1, t0), (1, t1), (0, t1))):
            loop[uv_layer].uv = uv
bm.free()
hair_me = bpy.data.meshes.new('Lion_ManeHair')
hair.transform(Minv)
hair.to_mesh(hair_me)
hair.free()
hob = bpy.data.objects.new('Lion_ManeHair', hair_me)
body.users_collection[0].objects.link(hob)
hob.matrix_world = M
hob.parent = body.parent
hob.matrix_world = M
for p in hair_me.polygons:
    p.use_smooth = True
print('HAIR', len(hair_me.polygons), 'quads')

# ---- skin the cards: copy vertex-group weights from the body, then bind to the armature
for vg in body.vertex_groups:
    hob.vertex_groups.new(name=vg.name)
dt = hob.modifiers.new('Weights', 'DATA_TRANSFER')
dt.object = body
dt.use_vert_data = True
dt.data_types_verts = {'VGROUP_WEIGHTS'}
dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'
dt.layers_vgroup_select_dst = 'NAME'
bpy.context.view_layer.objects.active = hob
for o in bpy.context.selected_objects:
    o.select_set(False)
hob.select_set(True)
bpy.ops.object.modifier_apply(modifier='Weights')
am = hob.modifiers.new('Armature', 'ARMATURE')
am.object = armature

# ---- the strand texture: tapered streaks with alpha, lighter toward the tips
W, H = 64, 256
img = bpy.data.images.new('maneStrands', W, H, alpha=True)
px = [0.0] * (W * H * 4)
for x in range(W):
    u = (x + 0.5) / W
    # 3-4 sub-strands across the card
    lanes = 0.5 + 0.5 * math.cos((u * 3.5 + 0.2) * math.pi * 2)
    edge = math.sin(u * math.pi) ** 0.6
    for y in range(H):
        t = (y + 0.5) / H
        taper = 1 - ss(0.55, 1.0, t) * (1 - 0.6 * lanes)
        a = edge * (0.55 + 0.45 * lanes) * taper
        a *= 0.85 + 0.15 * noise.noise(Vector((x * 0.5, y * 0.05, 0)))
        lum = 0.45 + 0.55 * t
        i = (y * W + x) * 4
        px[i:i + 4] = [lum, lum, lum, max(0.0, min(1.0, a))]
img.pixels.foreach_set(px)
img.pack()
mat = bpy.data.materials.new('Lion_ManeHair')
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
bsdf.inputs['Roughness'].default_value = 0.8
mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else mat.blend_method
hair_me.materials.append(mat)

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_skins=True,
    export_morph=False,
    export_image_format='WEBP',
    export_image_quality=90,
    export_apply=False,
    export_yup=True,
)
print('EXPORTED', out)
