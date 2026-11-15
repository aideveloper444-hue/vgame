"""
The Amazon Run black stallion (Blender 4.5, background):
  blender -b --python horse.py -- horse_raw.glb out.glb
Source: Microsoft's rigged horse (MIT licence), meshopt-decompressed first (horse_raw.glb). This script:
1. removes the tack (saddle, stirrups, buckles, bit and the reins material) and trims the stiff stick of a tail back
   to a natural dock;
2. turns the bay coat into glossy jet black (the texture's own shading kept as highlights) and smooths the body
   (one Catmull-Clark level, applied in rest pose so the skin weights interpolate);
3. grows hair cards: a long Friesian mane falling down the right side of the neck with a forelock, a long tail
   hanging to the hocks, and feathering over the hooves; all skinned to the skeleton;
4. animates it on its own skeleton: Gallop (a transverse gallop, one stride per 0.5 s), Gallop_Jump, Idle (breathing,
   tail swish) and Intro (rearing up on the hind legs and pawing, for the start-line countdown);
5. exports a GLB (WebP textures).
Blender space after import: metres, z up (hooves 0.14 .. ear tips 2.18), nose toward -x, the horse centred on
y = 0.72; every leg joint bends about the world y axis (positive = the lower end swings toward the nose).
"""
import sys
import math
import random
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Quaternion, noise
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('MESH_horse'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
M = body.matrix_world.copy()
Minv = M.inverted()
CY = 0.72  # the body's centre line (world y)


def ss(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bump(p, a, b):
    """a smooth hump from a to b (0 outside), for a joint's flex during part of a stride"""
    if p < a or p > b:
        return 0.0
    return math.sin(math.pi * (p - a) / (b - a))


# ---------------------------------------------------------------- 1. tack off, tail trimmed
bm = bmesh.new()
bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
seen = set()
kill = []
for v in bm.verts:
    if v.index in seen:
        continue
    stack, comp = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop()
        comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index)
                stack.append(y)
    ws = [M @ c.co for c in comp]
    lo = Vector((min(p.x for p in ws), min(p.y for p in ws), min(p.z for p in ws)))
    hi = Vector((max(p.x for p in ws), max(p.y for p in ws), max(p.z for p in ws)))
    mats = {f.material_index for c in comp for f in c.link_faces}
    n = len(comp)
    reins = 1 in mats
    saddle = n < 120 and lo.x > -0.72 and hi.x < 0.02 and hi.z > 0.95 and lo.z > 0.9
    bit = n < 60 and hi.x < -1.7 and 1.5 < lo.z < 1.7
    tail_tip = n < 20 and lo.x > 1.1
    if reins or saddle or bit or tail_tip:
        kill.extend(comp)
print('TACK verts removed', len(kill))
bmesh.ops.delete(bm, geom=list({f for v in kill for f in v.link_faces}), context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# the stiff tail: keep a short dock (the hair hangs from it)
tail_faces = [f for f in bm.faces if all((M @ v.co).x > 0.5 and (M @ v.co).z > 1.3 for v in f.verts)]
bmesh.ops.delete(bm, geom=tail_faces, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# the body comes in three shells (forehand, barrel, quarters): weld them where they meet so it shades as one
n0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.006 / max(1e-6, M.to_scale().x))
print('WELD merged', n0 - len(bm.verts))
# the bit's bar where it pokes out of the corners of the mouth
bit_faces = [f for f in bm.faces if all((M @ v.co).x < -1.64 and 1.54 < (M @ v.co).z < 1.74 and abs((M @ v.co).y - 0.72) > 0.07 for v in f.verts)]
bmesh.ops.delete(bm, geom=bit_faces, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
print('BIT faces removed', len(bit_faces))
# the back sank where the saddle sat: lift it back to a smooth line from the withers to the loin
bm.verts.ensure_lookup_table()
W0, W1 = -0.76, 0.04
def top_in(a, b):
    zs = [(M @ v.co).z for v in bm.verts if a <= (M @ v.co).x < b]
    return max(zs) if zs else None
z_front, z_hind = top_in(-0.86, -0.76), top_in(0.04, 0.14)
slices = {}
for v in bm.verts:
    w = M @ v.co
    if W0 < w.x < W1:
        k = int((w.x - W0) / 0.04)
        slices[k] = max(slices.get(k, -9), w.z)
lifted = 0
for v in bm.verts:
    w = M @ v.co
    if not (W0 < w.x < W1) or w.z < 1.2:
        continue
    u = (w.x - W0) / (W1 - W0)
    target = z_front + (z_hind - z_front) * u - 0.015
    top = slices[int((w.x - W0) / 0.04)]
    dip = 0.8 * max(0.0, target - top) * math.sin(math.pi * u) ** 0.8
    if dip <= 0:
        continue
    k = ss(1.35, top, w.z) ** 1.5
    w.z += dip * k
    v.co = Minv @ w
    lifted += 1
print('BACK lifted', lifted, 'front', round(z_front, 3), 'hind', round(z_hind, 3))
# the saddle cloth is painted into the coat and embossed in its normal map: remember where (UV) to smooth it out
uvl0 = bm.loops.layers.uv.active
saddle_uv = []
for f in bm.faces:
    c = M @ f.calc_center_median()
    if W0 - 0.02 < c.x < W1 + 0.02 and c.z > 1.15:
        uvs = [l[uvl0].uv.copy() for l in f.loops]
        for i in range(1, len(uvs) - 1):
            saddle_uv.append((uvs[0], uvs[i], uvs[i + 1]))
print('SADDLE uv tris', len(saddle_uv))
bm.to_mesh(body.data)
bm.free()
# drop the now unused reins material slot's faces (none left) - keep the slot, harmless

# ---------------------------------------------------------------- 2. jet-black coat, smoothed body
main = body.material_slots[0].material
for node in main.node_tree.nodes:
    if node.type == 'TEX_IMAGE' and node.image:
        img = node.image
        linked = [l.to_socket.name for l in main.node_tree.links if l.from_node == node]
        print('TEX', img.name, img.size[:], linked)
        # a mask of the saddle cloth in texture space (rasterised from its UV triangles), feathered at the edge
        wd, ht = img.size
        mask = np.zeros((ht, wd), dtype=np.float32)
        for a, b, c in saddle_uv:
            xs = [p.x * wd for p in (a, b, c)]
            ys = [p.y * ht for p in (a, b, c)]
            x0, x1 = max(0, int(min(xs)) - 1), min(wd - 1, int(max(xs)) + 1)
            y0, y1 = max(0, int(min(ys)) - 1), min(ht - 1, int(max(ys)) + 1)
            if x1 <= x0 or y1 <= y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(d) < 1e-9:
                continue
            l1 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
            l2 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
            mask[y0:y1 + 1, x0:x1 + 1] = np.maximum(mask[y0:y1 + 1, x0:x1 + 1], inside.astype(np.float32))
        for _ in range(6):
            mask = np.maximum(mask, 0.25 * (np.roll(mask, 1, 0) + np.roll(mask, -1, 0) + np.roll(mask, 1, 1) + np.roll(mask, -1, 1)) * 0.98)
        m = mask.reshape(-1)
        print('MASK', img.name, int((m > 0.5).sum()), 'px')
        if 'Base Color' not in linked:
            # normal map: flatten the embossed cloth
            px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
            for ch, flat in ((0, 0.5), (1, 0.5), (2, 1.0)):
                px[:, ch] = px[:, ch] * (1 - m) + flat * m
            img.pixels.foreach_set(px.ravel())
            img.pack()
        if 'Base Color' in linked:
            px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
            lum = px[:, 0] * 0.3 + px[:, 1] * 0.55 + px[:, 2] * 0.15
            # keep the painted shading as faint blue-black highlights on a near-black coat
            k = np.clip(lum / max(1e-3, float(np.percentile(lum, 97))), 0, 1) ** 1.6
            base = 0.03 + 0.2 * k
            base = base * (1 - m) + float(np.median(base)) * m
            px[:, 0] = base * 0.92
            px[:, 1] = base * 0.96
            px[:, 2] = base * 1.06
            img.pixels.foreach_set(px.ravel())
            img.pack()
bsdf = next(n for n in main.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Roughness'].default_value = 0.38
if 'Coat Weight' in bsdf.inputs:
    bsdf.inputs['Coat Weight'].default_value = 0.0

bpy.context.view_layer.objects.active = body
for o in bpy.context.selected_objects:
    o.select_set(False)
body.select_set(True)
sub = body.modifiers.new('Smooth', 'SUBSURF')
sub.levels = 1
sub.render_levels = 1
with bpy.context.temp_override(object=body):
    bpy.ops.object.modifier_move_to_index(modifier='Smooth', index=0)
    bpy.ops.object.modifier_apply(modifier='Smooth')
for p in body.data.polygons:
    p.use_smooth = True
M = body.matrix_world.copy()
Minv = M.inverted()

# ---------------------------------------------------------------- 3. hair cards
bmw = bmesh.new()
bmw.from_mesh(body.data)
bmw.transform(M)
bmw.normal_update()
bmesh.ops.triangulate(bmw, faces=bmw.faces)
tree = BVHTree.FromBMesh(bmw)


def surface_from_above(x, y):
    hit = tree.ray_cast(Vector((x, y, 3.5)), Vector((0, 0, -1)))
    return hit if hit[0] is not None else None


def strand_card(bmh, uvl, pts, n, width0, taper=0.7):
    seg = len(pts) - 1
    verts = []
    for i, pt in enumerate(pts):
        t = i / seg
        tan = (pts[min(i + 1, seg)] - pts[max(i - 1, 0)]).normalized()
        side = tan.cross(n).normalized()
        if side.length < 0.5:
            side = tan.cross(Vector((0, 1, 0))).normalized()
        w = width0 * (1 - taper * t)
        verts.append((bmh.verts.new(pt - side * w), bmh.verts.new(pt + side * w), t))
    for i in range(seg):
        (a0, b0, t0), (a1, b1, t1) = verts[i], verts[i + 1]
        f = bmh.faces.new((a0, b0, b1, a1))
        for loop, uv in zip(f.loops, ((0, t0), (1, t0), (1, t1), (0, t1))):
            loop[uvl].uv = uv
    return [v for pair in verts for v in pair[:2]]


def grow(p, d, length, seg, gravity, wave=0.08):
    pts = [p.copy()]
    q = p.copy()
    step = length / seg
    for i in range(seg):
        d = (d + gravity + Vector((noise.noise(q * 7 + Vector((i, 0, 0))), noise.noise(q * 7 + Vector((0, i, 3))), 0)) * wave).normalized()
        q = q + d * step
        pts.append(q.copy())
    return pts


def new_hair_object(name, bmh):
    me = bpy.data.meshes.new(name)
    bmh.transform(Minv)
    bmh.to_mesh(me)
    bmh.free()
    ob = bpy.data.objects.new(name, me)
    body.users_collection[0].objects.link(ob)
    ob.parent = body.parent
    ob.matrix_world = M
    for p in me.polygons:
        p.use_smooth = True
    return ob


# -- mane: along the crest from the poll to the withers, falling down the right side (+y) of the neck
mane = bmesh.new()
uvl = mane.loops.layers.uv.new('UVMap')
crest = []
for i in range(80):
    x = -1.46 + (i / 79) * (1.46 - 0.86)
    h = surface_from_above(x, CY)
    if h:
        crest.append((x, h[0], h[1]))
N_MANE = 900
for k in range(N_MANE):
    x, top, n = random.choice(crest)
    u = (x + 1.46) / (1.46 - 0.86)  # 0 at the poll, 1 near the withers
    jitter = Vector((random.uniform(-0.006, 0.006), random.uniform(-0.03, 0.03), 0))
    p = top + jitter - n * 0.01
    length = (0.32 + 0.42 * ss(0.0, 0.35, u) - 0.16 * ss(0.75, 1.0, u)) * random.uniform(0.82, 1.15)
    side = 1 if random.random() < 0.82 else -1  # most of it falls to the right, a few locks to the left
    d = (n * 0.12 + Vector((0.1, 0.38 * side, -0.62)) + Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.1).normalized()
    pts = grow(p, d, length, 6, Vector((0.01, 0.0, -0.34)), 0.06)
    strand_card(mane, uvl, pts, n, random.uniform(0.010, 0.017))
# forelock: from the poll forward and down over the forehead
poll = surface_from_above(-1.47, CY)
for k in range(70):
    p = poll[0] + Vector((random.uniform(-0.02, 0.02), random.uniform(-0.04, 0.04), 0))
    d = Vector((-0.7, random.uniform(-0.2, 0.2), -0.55)).normalized()
    pts = grow(p, d, random.uniform(0.2, 0.32), 4, Vector((0, 0, -0.18)), 0.05)
    strand_card(mane, uvl, pts, poll[1], random.uniform(0.008, 0.013))
mane_ob = new_hair_object('Horse_Mane', mane)

# -- tail: hanging from the dock to the hocks, a little fuller at the top
tail = bmesh.new()
uvl = tail.loops.layers.uv.new('UVMap')
dock = [Vector((0.34, CY, 1.55)), Vector((0.42, CY, 1.53)), Vector((0.5, CY, 1.5))]
tail_roots = []
for k in range(520):
    t = random.random() ** 0.8
    a = dock[0].lerp(dock[1], min(1, t * 2)) if t < 0.5 else dock[1].lerp(dock[2], (t - 0.5) * 2)
    ang = random.uniform(0, math.tau)
    radial = Vector((0, math.cos(ang), math.sin(ang)))
    p = a + radial * 0.05
    d = (Vector((0.32, 0, -1)) + radial * 0.3 + Vector((random.uniform(-0.1, 0.1), random.uniform(-0.15, 0.15), 0))).normalized()
    length = random.uniform(0.85, 1.12) * (1 - 0.25 * t)
    pts = grow(p, d, length, 7, Vector((0.0, 0, -0.16)), 0.07)
    vs = strand_card(tail, uvl, pts, Vector((0, 1, 0)) if abs(radial.y) < 0.7 else Vector((1, 0, 0)), random.uniform(0.012, 0.02), 0.6)
    tail_roots.append((vs, t))
tail_ob = new_hair_object('Horse_Tail', tail)

# -- feathering over each hoof (the long hair at the fetlocks of a Friesian)
feather = bmesh.new()
uvl = feather.loops.layers.uv.new('UVMap')
fet_bones = ['horse L Finger0', 'horse R Finger0', 'horse L Toe0', 'horse R Toe0']
feather_groups = []
for bn in fet_bones:
    b = arm.data.bones[bn]
    c = arm.matrix_world @ b.head_local
    idx = []
    for k in range(60):
        ang = random.uniform(0, math.tau)
        radial = Vector((math.cos(ang), math.sin(ang), 0))
        p = c + radial * 0.055 + Vector((0, 0, random.uniform(-0.03, 0.05)))
        d = (radial * 0.45 + Vector((0, 0, -1))).normalized()
        pts = grow(p, d, random.uniform(0.12, 0.2), 3, Vector((0, 0, -0.2)), 0.04)
        vs = strand_card(feather, uvl, pts, radial, random.uniform(0.012, 0.018), 0.5)
        idx.extend(vs)
    feather_groups.append((bn, len(idx)))
feather_ob = new_hair_object('Horse_Feather', feather)

# -- skinning: the mane copies the neck's weights from the body; the tail follows its bones from root to tip;
# the feathering rides its fetlock bone
for vg in body.vertex_groups:
    mane_ob.vertex_groups.new(name=vg.name)
dt = mane_ob.modifiers.new('Weights', 'DATA_TRANSFER')
dt.object = body
dt.use_vert_data = True
dt.data_types_verts = {'VGROUP_WEIGHTS'}
dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'
dt.layers_vgroup_select_dst = 'NAME'
bpy.context.view_layer.objects.active = mane_ob
for o in bpy.context.selected_objects:
    o.select_set(False)
mane_ob.select_set(True)
bpy.ops.object.modifier_apply(modifier='Weights')

tail_bones = ['horse Tail', 'horse Tail1', 'horse Tail2']
for bn in tail_bones:
    tail_ob.vertex_groups.new(name=bn)
tw = tail_ob.data
tail_heads = [arm.matrix_world @ arm.data.bones[bn].head_local for bn in tail_bones]
for v in tw.vertices:
    w = M @ v.co
    # down the hanging hair the weight moves from the dock bones toward the end bone (the tail swings from its root)
    down = ss(1.5, 0.5, w.z)
    near = min(range(len(tail_bones)), key=lambda i: (w.x - tail_heads[i].x) ** 2)
    g0 = tail_ob.vertex_groups[tail_bones[near]]
    g0.add([v.index], 1.0 - 0.6 * down, 'REPLACE')
    tail_ob.vertex_groups['horse Tail2'].add([v.index], 0.6 * down + (1.0 - 0.6 * down if near == 2 else 0), 'ADD')

for bn in fet_bones:
    feather_ob.vertex_groups.new(name=bn)
start = 0
for bn, n in feather_groups:
    feather_ob.vertex_groups[bn].add(list(range(start, start + n)), 1.0, 'REPLACE')
    start += n

for ob in (mane_ob, tail_ob, feather_ob):
    am = ob.modifiers.new('Armature', 'ARMATURE')
    am.object = arm

# -- the hair texture: tapered black strands with a cool sheen, alpha-cut
W, H = 64, 256
img = bpy.data.images.new('horseHair', W, H, alpha=True)
px = [0.0] * (W * H * 4)
for x in range(W):
    u = (x + 0.5) / W
    lanes = 0.5 + 0.5 * math.cos((u * 3.5 + 0.2) * math.pi * 2)
    edge = math.sin(u * math.pi) ** 0.6
    for y in range(H):
        t = (y + 0.5) / H
        taper = 1 - ss(0.6, 1.0, t) * (1 - 0.6 * lanes)
        a = edge * (0.55 + 0.45 * lanes) * taper
        a *= 0.85 + 0.15 * noise.noise(Vector((x * 0.5, y * 0.05, 0)))
        lum = 0.03 + 0.07 * lanes + 0.04 * t
        i = (y * W + x) * 4
        px[i:i + 4] = [lum * 0.92, lum * 0.95, lum * 1.08, max(0.0, min(1.0, a))]
img.pixels.foreach_set(px)
img.pack()
hmat = bpy.data.materials.new('Horse_Hair')
hmat.use_nodes = True
nt = hmat.node_tree
hb = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = img
nt.links.new(tex.outputs['Color'], hb.inputs['Base Color'])
nt.links.new(tex.outputs['Alpha'], hb.inputs['Alpha'])
hb.inputs['Roughness'].default_value = 0.45
if hasattr(hmat, 'blend_method'):
    hmat.blend_method = 'CLIP'
for ob in (mane_ob, tail_ob, feather_ob):
    ob.data.materials.append(hmat)
print('HAIR', len(mane_ob.data.polygons), len(tail_ob.data.polygons), len(feather_ob.data.polygons))

# ---------------------------------------------------------------- 4. animation on the horse's own skeleton
A3inv = arm.matrix_world.to_3x3().inverted()
LAT = A3inv @ Vector((0, 1, 0))  # the lateral axis (pitch: legs swing, back flexes) in armature space
VERT = A3inv @ Vector((0, 0, 1))  # the vertical axis (the tail swishes side to side)
FPS = 24
bpy.context.scene.render.fps = FPS


def axis_local(bone, axis_arm):
    return (bone.matrix_local.to_3x3().inverted() @ axis_arm).normalized()


bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
ax = {pb.name: axis_local(pb.bone, LAT) for pb in arm.pose.bones}
axv = {pb.name: axis_local(pb.bone, VERT) for pb in arm.pose.bones}


def pose(frame, angles, yaw=None, lift=0.0):
    """angles: bone -> degrees about the lateral axis; yaw: bone -> degrees about the vertical; lift: pelvis up (m)"""
    for pb in arm.pose.bones:
        q = Quaternion(ax[pb.name], math.radians(angles.get(pb.name, 0.0)))
        if yaw and pb.name in yaw:
            q = Quaternion(axv[pb.name], math.radians(yaw[pb.name])) @ q
        pb.rotation_quaternion = q
        pb.keyframe_insert('rotation_quaternion', frame=frame)
    pel = arm.pose.bones['horse Pelvis']
    pel.location = pel.bone.matrix_local.to_3x3().inverted() @ (arm.matrix_world.inverted().to_3x3() @ Vector((0, 0, lift)))
    pel.keyframe_insert('location', frame=frame)


def new_action(name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    return act


FORE = {'L': 0.4, 'R': 0.62}
HIND = {'L': 0.0, 'R': 0.1}


def gallop_angles(t):
    a = {}
    for s, ph in FORE.items():
        p = (t + ph) % 1.0
        a[f'horse {s} UpperArm'] = 28 * math.cos(2 * math.pi * p)
        a[f'horse {s} Forearm'] = -55 * bump(p, 0.38, 0.92)
        a[f'horse {s} Hand'] = -95 * bump(p, 0.42, 0.9)
        a[f'horse {s} Finger0'] = 18 * bump(p, 0.0, 0.35) - 35 * bump(p, 0.45, 0.95)
    for s, ph in HIND.items():
        p = (t + ph) % 1.0
        a[f'horse {s} Thigh'] = 28 * math.cos(2 * math.pi * p) - 4
        a[f'horse {s} Calf'] = -45 * bump(p, 0.4, 0.92)
        a[f'horse {s} Foot'] = 78 * bump(p, 0.42, 0.9)
        a[f'horse {s} Toe0'] = 15 * bump(p, 0.0, 0.38) - 35 * bump(p, 0.45, 0.95)
    w = 2 * math.pi * t
    a['horse Pelvis'] = 4 * math.sin(w)
    a['horse Spine1'] = 3 * math.sin(w + 1.0)
    a['horse Spine2'] = 2 * math.sin(w + 1.4)
    a['horse Neck'] = -8 * math.sin(w + 0.6)
    a['horse Neck2'] = 4 * math.sin(w + 0.6)
    a['horse Head'] = 5 * math.sin(w + 0.6)
    a['horse Tail'] = 10 + 6 * math.sin(w)
    a['horse Tail1'] = 4 * math.sin(w - 0.6)
    a['horse Tail2'] = 4 * math.sin(w - 1.2)
    return a, 0.045 * math.cos(w - 1.6)


# Gallop: one stride in 0.5 s (12 frames), looping
new_action('Gallop')
for f in range(13):
    ang, lift = gallop_angles((f % 12) / 12)
    pose(f, ang, lift=lift)

# Gallop_Jump: gather, push off, tuck everything, reach for the ground (1 s)
new_action('Gallop_Jump')
for f in range(25):
    u = f / 24
    up = ss(0.1, 0.35, u) * (1 - ss(0.7, 0.95, u))
    push = bump(u, 0.0, 0.3)
    land = ss(0.75, 1.0, u)
    a = {
        'horse Pelvis': 10 * up - 6 * push + 4 * land * (1 - u),
        'horse Neck': -10 * up + 6 * push,
        'horse Head': 6 * up,
        'horse Tail': 20 * up,
    }
    for s in 'LR':
        a[f'horse {s} UpperArm'] = 45 * up + 22 * land
        a[f'horse {s} Forearm'] = -70 * up
        a[f'horse {s} Hand'] = -110 * up
        a[f'horse {s} Finger0'] = -30 * up
        a[f'horse {s} Thigh'] = -25 * push + 28 * up
        a[f'horse {s} Calf'] = 10 * push - 40 * up
        a[f'horse {s} Foot'] = -20 * push + 70 * up
        a[f'horse {s} Toe0'] = -30 * up
    pose(f, a, lift=0.25 * up)

# Idle: breathing, the head nodding a little, ears and tail swishing (2 s loop)
new_action('Idle')
for f in range(49):
    u = f / 48
    w = 2 * math.pi * u
    a = {
        'horse Spine1': 0.8 * math.sin(w),
        'horse Neck': -4 + 2 * math.sin(w),
        'horse Head': 2 * math.sin(w + 0.8),
        'horse Tail': 6,
    }
    yaw = {'horse Tail': 12 * math.sin(w), 'horse Tail1': 10 * math.sin(w - 0.7), 'horse Tail2': 8 * math.sin(w - 1.4), 'horse Ear R': 10 * bump(u, 0.3, 0.45), 'horse Ear L': -10 * bump(u, 0.62, 0.78)}
    pose(f, a, yaw)

# Intro: rear up on the hind legs and paw the air, then come back down (2.4 s, scrubbed by the countdown)
new_action('Intro')
NF = 58
for f in range(NF):
    u = f / (NF - 1)
    r = ss(0.05, 0.35, u) * (1 - ss(0.72, 0.95, u))
    paw = math.sin(2 * math.pi * 3 * u) * r
    a = {
        'horse Pelvis': 52 * r,
        'horse Spine1': 4 * r,
        'horse Neck': -24 * r,
        'horse Neck2': -8 * r,
        'horse Head': -14 * r,
        'horse Tail': -18 * r,
    }
    for s, k in (('L', 1), ('R', -1)):
        a[f'horse {s} Thigh'] = -42 * r
        a[f'horse {s} Calf'] = -18 * r
        a[f'horse {s} Foot'] = 34 * r
        a[f'horse {s} UpperArm'] = 30 * r + 16 * paw * k
        a[f'horse {s} Forearm'] = -85 * r
        a[f'horse {s} Hand'] = -50 * r + 22 * paw * k
        a[f'horse {s} Finger0'] = -30 * r
    pose(f, a, lift=0.0)

bpy.ops.object.mode_set(mode='OBJECT')
arm.animation_data.action = None
print('ACTIONS', [a.name for a in bpy.data.actions])

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
