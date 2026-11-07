import * as THREE from 'three'
import { TrackPath, bankFor } from './trackPath'

/*
 * Curved-world rendering. The scene is built in "focus space" (runner at z = 0, trail along +Z, lanes on X);
 * every vertex is then moved onto the winding trail in the vertex shader:
 *
 *   s = d + z  ->  P(s) + lateral(s) * x + up * (y + height(s) + x * bank(s))
 *
 * all relative to the runner's own frame, so the runner stays at the origin facing +Z and the world bends
 * and climbs around him. A float texture holds the trail around the runner (STEP_T metres per texel), rebuilt
 * every frame. On the inside of a tight turn the far scenery is folded smoothly (it would otherwise cross
 * the centre of the turn).
 */

export const Z_MIN = -90
export const Z_MAX = 230
const STEP_T = 0.5
const N = Math.round((Z_MAX - Z_MIN) / STEP_T) + 1

// up to three branches, two rows each: slot 0 (rows 0-1) is always the runner's own route; slots 1 and 2 are the
// other branches of a junction, drawn by lifting their placements by BRANCH_Y and 2 * BRANCH_Y
export const SLOTS = 3
const data = new Float32Array(N * SLOTS * 2 * 4)
const tex = new THREE.DataTexture(data, N, SLOTS * 2, THREE.RGBAFormat, THREE.FloatType)
/** placements on the right-hand branch of a split are lifted by this much; the shader takes it off again */
export const BRANCH_Y = 5000
tex.minFilter = tex.magFilter = THREE.NearestFilter
tex.needsUpdate = true

export const bendUniforms = {
  wbPath: { value: tex as THREE.Texture },
  wbRange: { value: new THREE.Vector4(Z_MIN, Z_MAX, STEP_T, N) },
  wbOn: { value: 0 },
}

/** GLSL: bend a focus-space world position (and optionally a world normal). */
export const BEND_GLSL = /* glsl */ `
uniform sampler2D wbPath;
uniform vec4 wbRange;
uniform float wbOn;
void wbSample(float z, int row, out vec4 a, out vec4 b, out float zr) {
  float f = clamp((z - wbRange.x) / wbRange.z, 0.0, wbRange.w - 1.001);
  int i = int(floor(f));
  float t = f - float(i);
  a = mix(texelFetch(wbPath, ivec2(i, row), 0), texelFetch(wbPath, ivec2(i + 1, row), 0), t);
  b = mix(texelFetch(wbPath, ivec2(i, row + 1), 0), texelFetch(wbPath, ivec2(i + 1, row + 1), 0), t);
  // beyond the table: carry on straight along the last heading
  zr = z - clamp(z, wbRange.x, wbRange.y);
}
vec3 wbBend(vec3 p) {
  int row = 0;
  if (p.y > 7500.0) { p.y -= 10000.0; row = 4; }
  else if (p.y > 2500.0) { p.y -= 5000.0; row = 2; }
  if (wbOn < 0.5) return p;
  vec4 a; vec4 b; float zr;
  wbSample(p.z, row, a, b, zr);
  float k = b.y;
  float x = p.x;
  // fold far scenery on the inside of a turn instead of letting it cross the centre
  if (x * k > 0.0) {
    float R = 1.0 / max(abs(k), 1e-4);
    float ax = abs(x);
    float near = min(ax, 10.0);
    float rest = ax - near;
    float Rr = max(R - near, 1.0);
    x = sign(x) * (near + Rr * (1.0 - exp(-rest / Rr)));
  }
  vec2 lat = vec2(a.z, -a.w);      // lateral (+X) direction
  vec2 tan2 = vec2(a.w, a.z);      // forward direction
  vec2 xz = a.xy + lat * x + tan2 * zr;
  // banking tilts the trail and its edges only; the far scenery stays level
  return vec3(xz.x, p.y + b.x + clamp(p.x, -6.0, 6.0) * b.z, xz.y);
}
vec3 wbBendDir(vec3 p, vec3 n) {
  if (wbOn < 0.5) return n;
  vec4 a; vec4 b; float zr;
  wbSample(p.z, p.y > 7500.0 ? 4 : p.y > 2500.0 ? 2 : 0, a, b, zr);
  float c = a.z, s = a.w;
  return vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
}
`

let chunksPatched = false
/** Insert the bend into three's shared vertex chunks (only active where WB_BEND is defined). */
export function patchChunks() {
  if (chunksPatched) return
  chunksPatched = true
  const C = THREE.ShaderChunk as unknown as Record<string, string>
  C.common = C.common + '\n#ifdef WB_BEND\n' + BEND_GLSL + '\n#endif\n'
  C.project_vertex = C.project_vertex.replace(
    'mvPosition = modelViewMatrix * mvPosition;',
    `#ifdef WB_BEND
  vec4 wbW = modelMatrix * mvPosition;
  wbW.xyz = wbBend(wbW.xyz);
  mvPosition = viewMatrix * wbW;
#else
  mvPosition = modelViewMatrix * mvPosition;
#endif`,
  )
  if (!C.project_vertex.includes('wbBend')) console.warn('bend: project_vertex not patched')
  C.worldpos_vertex = C.worldpos_vertex.replace(
    'worldPosition = modelMatrix * worldPosition;',
    `worldPosition = modelMatrix * worldPosition;
#ifdef WB_BEND
  worldPosition.xyz = wbBend(worldPosition.xyz);
#endif`,
  )
  // turn the normals with the trail (view-space normal -> world -> rotate -> view)
  C.defaultnormal_vertex =
    C.defaultnormal_vertex +
    `
#ifdef WB_BEND
  {
    vec4 wbP = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      wbP = instanceMatrix * wbP;
    #endif
    wbP = modelMatrix * wbP;
    vec3 wn = (vec4(transformedNormal, 0.0) * viewMatrix).xyz;
    transformedNormal = normalize((viewMatrix * vec4(wbBendDir(wbP.xyz, wn), 0.0)).xyz);
  }
#endif`
}

/** Make a material follow the trail (idempotent; chains any existing onBeforeCompile). */
export function bendMaterial<M extends THREE.Material>(m: M): M {
  const u = m.userData as { wbBent?: boolean; noBend?: boolean }
  if (u.wbBent || u.noBend) return m
  u.wbBent = true
  m.defines = { ...(m.defines ?? {}), WB_BEND: '' }
  if ((m as unknown as THREE.ShaderMaterial).isShaderMaterial) {
    const sm = m as unknown as THREE.ShaderMaterial
    Object.assign(sm.uniforms, bendUniforms)
  } else {
    const prev = m.onBeforeCompile
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r)
      Object.assign(sh.uniforms, bendUniforms)
    }
    const prevKey = m.customProgramCacheKey?.bind(m)
    m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|wb'
  }
  m.needsUpdate = true
  return m
}

const depthMats = new WeakMap<THREE.Material, THREE.MeshDepthMaterial>()
/** Patch every mesh under root: bent materials, bent shadow depth, no stale frustum culling. */
export function bendObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh && !(o as THREE.Points).isPoints) return
    if ((o.userData as { noBend?: boolean }).noBend) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    let any = false
    for (const m of mats) {
      if (!m || (m.userData as { noBend?: boolean }).noBend) continue
      bendMaterial(m)
      any = true
    }
    if (!any) return
    mesh.frustumCulled = false
    if (mesh.castShadow && !mesh.customDepthMaterial) {
      const m0 = mats[0] as THREE.MeshStandardMaterial
      let dm = depthMats.get(m0)
      if (!dm) {
        dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m0.map ?? null, alphaTest: m0.alphaTest || 0 })
        bendMaterial(dm)
        depthMats.set(m0, dm)
      }
      mesh.customDepthMaterial = dm
    }
  })
}

// ---------------------------------------------------------------- the per-frame trail table

const tmp = { x: 0, z: 0, heading: 0, y: 0, k: 0 }
export const frame = { x0: 0, z0: 0, h0: 0, y0: 0, cos: 1, sin: 0 }

/**
 * Rebuild the trail tables around distance d (call once per frame before rendering). paths[0] is the runner's
 * route; every branch is expressed in the runner's frame, so a branch not taken simply falls away behind.
 */
export function updateBend(paths: TrackPath[] | null, d: number) {
  if (!paths || !paths.length) {
    bendUniforms.wbOn.value = 0
    return
  }
  bendUniforms.wbOn.value = 1
  paths[0].at(d, tmp)
  frame.x0 = tmp.x
  frame.z0 = tmp.z
  frame.h0 = tmp.heading
  frame.y0 = tmp.y
  frame.cos = Math.cos(tmp.heading)
  frame.sin = Math.sin(tmp.heading)
  for (let slot = 0; slot < SLOTS; slot++) fill(paths[slot] ?? paths[0], d, slot * 2)
  tex.needsUpdate = true
}

function fill(path: TrackPath, d: number, row: number) {
  for (let i = 0; i < N; i++) {
    const z = Z_MIN + i * STEP_T
    path.at(d + z, tmp)
    const dx = tmp.x - frame.x0
    const dz = tmp.z - frame.z0
    const rx = dx * frame.cos - dz * frame.sin
    const rz = dx * frame.sin + dz * frame.cos
    const phi = tmp.heading - frame.h0
    const o = (row * N + i) * 4
    data[o] = rx
    data[o + 1] = rz
    data[o + 2] = Math.cos(phi)
    data[o + 3] = Math.sin(phi)
    const o2 = ((row + 1) * N + i) * 4
    data[o2] = tmp.y - frame.y0
    data[o2 + 1] = tmp.k
    data[o2 + 2] = bankFor(tmp.k)
    data[o2 + 3] = 0
  }
}

/** CPU twin of wbBend (camera targets, HUD). Reads the current table. */
export function bendPoint(x: number, y: number, z: number, out: THREE.Vector3) {
  if (bendUniforms.wbOn.value < 0.5) return out.set(x, y, z)
  const f = Math.min(Math.max((z - Z_MIN) / STEP_T, 0), N - 1.001)
  const i = Math.floor(f)
  const t = f - i
  const g = (row: number, c: number) => data[(row * N + i) * 4 + c] + (data[(row * N + i + 1) * 4 + c] - data[(row * N + i) * 4 + c]) * t
  const ax = g(0, 0), az = g(0, 1), c = g(0, 2), s = g(0, 3)
  const h = g(1, 0), bank = g(1, 2)
  return out.set(ax + c * x, y + h + Math.max(-6, Math.min(6, x)) * bank, az - s * x)
}

/** Ground-plane position of a slot's trail centre at focus z (in the runner's frame). */
export function slotPoint(slot: number, z: number, out: { x: number; z: number }) {
  const f = Math.min(Math.max((z - Z_MIN) / STEP_T, 0), N - 1.001)
  const i = Math.floor(f)
  out.x = data[(slot * 2 * N + i) * 4]
  out.z = data[(slot * 2 * N + i) * 4 + 1]
  return out
}

/** Distance (m) between two branches at focus z (0 when they run together). */
export function branchGap(z: number, a = 0, b = 1) {
  const A = slotPoint(a, z, { x: 0, z: 0 })
  const B = slotPoint(b, z, { x: 0, z: 0 })
  return Math.hypot(A.x - B.x, A.z - B.z)
}

/** Relative heading (rad) of the trail at focus z. */
export function headingAt(z: number) {
  if (bendUniforms.wbOn.value < 0.5) return 0
  const f = Math.min(Math.max((z - Z_MIN) / STEP_T, 0), N - 1.001)
  const i = Math.floor(f)
  return Math.atan2(data[i * 4 + 3], data[i * 4 + 2])
}
