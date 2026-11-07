import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useSave } from '../state/progress'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import type { AnimalId } from '../engine/content'

/*
 * One of the ten Wildbound animals: a rigged GLB from /models/wildbound, measured in its running pose,
 * scaled to its height and turned to face +Z. Jump height is applied by the parent.
 *
 * Animals with a full motion set (Sonic: Idle, Walk, Gallop, Sprint, Jump, Land, Slide, Roll, Hit, Victory,
 * plus the stride of each gait in the glTF extras) are driven by a gait controller: the walk/gallop/sprint
 * blend follows the ground speed and the cycle phase advances by  speed / stride, so the planted paws move
 * exactly with the trail and never slide. The others play their gallop clip with the older pose shaping.
 */

export type WildPose = 'idle' | 'run' | 'jump' | 'slide' | 'roll' | 'dead' | 'victory'

export interface WildPoseState {
  pose: WildPose
  /** ground speed in m/s (drives the gait and its rate) */
  speed: number
  /** 0..1 through the current jump/slide/roll */
  t: number
  /** 0 visible .. 1 ghost (stealth dash) */
  ghost?: number
  /** frosty tint (frost sprint) */
  frost?: boolean
}

interface ModelDef {
  url: string
  /** overall height in metres (top of head to paws) */
  height: number
  /** extra yaw after the automatic long-axis turn (radians) */
  yaw: number
  /** gallop clip playback at 9 m/s (animals without stride data) */
  runRate: number
  /** exaggerate the run clip's bone rotations around their mean pose (turns a walk cycle into a run) */
  amp?: number
  /** body bob (fraction of height) per footfall pair, for clips that have none */
  bob?: number
}

const M = '/models/wildbound'
export const MODELS: Record<AnimalId, ModelDef> = {
  sonic: { url: `${M}/sonic.glb`, height: 1.0, yaw: 0, runRate: 1.25 },
  leo: { url: `${M}/leo.glb`, height: 1.3, yaw: 0, runRate: 1.1 },
  raja: { url: `${M}/raja.glb`, height: 1.2, yaw: 0, runRate: 0.85 },
  shadow: { url: `${M}/shadow.glb`, height: 1.05, yaw: 0, runRate: 0.85 },
  jax: { url: `${M}/jax.glb`, height: 1.0, yaw: 0, runRate: 1.0 },
  arctic: { url: `${M}/arctic.glb`, height: 1.1, yaw: 0, runRate: 1.25 },
  bruno: { url: `${M}/bruno.glb`, height: 1.35, yaw: 0, runRate: 1.0 },
  // the elephant's clip is two cycles of a walk (1.6 s each): played ~2.6x faster with a wider leg swing it becomes a heavy run
  titan: { url: `${M}/titan.glb`, height: 1.95, yaw: Math.PI, runRate: 4.2, amp: 1.7, bob: 0.025 },
  koda: { url: `${M}/koda.glb`, height: 0.62, yaw: Math.PI, runRate: 1.4 },
  snow: { url: `${M}/snow.glb`, height: 0.95, yaw: 0, runRate: 1.0 },
}

export function preloadAnimal(id: AnimalId) {
  useGLTF.preload(MODELS[id].url)
}

const FROST = new THREE.Color('#9fd8ff')
const tmpBox = new THREE.Box3()
const tmpV = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpQ2 = new THREE.Quaternion()
const FWD = new THREE.Vector3(0, 0, 1)

const GAIT_CLIPS = ['Idle', 'Walk', 'Gallop', 'Sprint', 'Jump', 'Land', 'Slide', 'Roll', 'Hit', 'Victory'] as const
type GaitClip = (typeof GAIT_CLIPS)[number]
/** physical duration of the landing absorb (s) */
const LAND_S = 0.22
/** highest stride frequency (cycles/s) for the gait controller */
const MAX_HZ = 5.6

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Shift a clip so its first key is at t = 0 (Blender exports start at frame 1). */
function zeroClip(c: THREE.AnimationClip) {
  // the clips are cached and shared by every mount, so do this once per clip
  if (c.userData?.zeroed) return
  c.userData = { ...(c.userData ?? {}), zeroed: true }
  // GLTFLoader gives every channel that shares a glTF input accessor the SAME times array, and the Blender
  // exporter shares those accessors across clips too: shift each array exactly once (shifting per track pushed
  // the keys to negative times and froze the clips on their last pose)
  let start = Infinity
  for (const tr of c.tracks) if (!SHIFTED.has(tr.times)) start = Math.min(start, tr.times[0] ?? 0)
  if (start > 1e-6 && Number.isFinite(start)) {
    for (const tr of c.tracks) {
      if (SHIFTED.has(tr.times)) continue
      SHIFTED.add(tr.times)
      for (let i = 0; i < tr.times.length; i++) tr.times[i] -= start
    }
  }
  c.resetDuration()
}
const SHIFTED = new WeakSet<object>()

/** Exaggerate every rotation track of a clip around its mean orientation (once per clip; clips are cached). */
function amplifyClip(c: THREE.AnimationClip, k: number) {
  if (c.userData?.amplified) return
  c.userData = { ...(c.userData ?? {}), amplified: true }
  const mean = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  const d = new THREE.Quaternion()
  for (const tr of c.tracks) {
    if (!tr.name.endsWith('.quaternion')) continue
    const v = tr.values
    const n = v.length / 4
    if (n < 2) continue
    // mean orientation (sign-aligned average)
    let mx = 0, my = 0, mz = 0, mw = 0
    for (let i = 0; i < n; i++) {
      const s = v[i * 4] * v[0] + v[i * 4 + 1] * v[1] + v[i * 4 + 2] * v[2] + v[i * 4 + 3] * v[3] < 0 ? -1 : 1
      mx += s * v[i * 4]; my += s * v[i * 4 + 1]; mz += s * v[i * 4 + 2]; mw += s * v[i * 4 + 3]
    }
    mean.set(mx, my, mz, mw).normalize()
    const inv = mean.clone().invert()
    for (let i = 0; i < n; i++) {
      q.fromArray(v as unknown as number[], i * 4)
      d.copy(inv).multiply(q) // offset from the mean
      if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
      const ang = 2 * Math.acos(Math.min(1, d.w))
      if (ang > 1e-5) {
        const s = Math.sin(ang / 2)
        const ax = new THREE.Vector3(d.x / s, d.y / s, d.z / s)
        d.setFromAxisAngle(ax, Math.min(Math.PI * 0.9, ang * k))
      }
      q.copy(mean).multiply(d)
      q.toArray(v as unknown as number[], i * 4)
    }
  }
}

// ---------------------------------------------------------------- realistic fur and metal

let furNormal: THREE.Texture | null = null
/**
 * A tiling normal map of fine hair strands (drawn once): short soft strokes running mostly one way, turned into
 * normals, so the coat breaks up the light like real short fur instead of reading as smooth plastic.
 */
function furNormalMap() {
  if (furNormal) return furNormal
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#808080'
  g.fillRect(0, 0, S, S)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const l = 3 + rnd() * 7
    const a = Math.PI / 2 + (rnd() - 0.5) * 0.7
    const v = 90 + rnd() * 120
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`
    g.lineWidth = 0.7 + rnd() * 0.8
    g.beginPath()
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.moveTo(x + ox, y + oy)
      g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l)
    }
    g.stroke()
  }
  const h = g.getImageData(0, 0, S, S).data
  const out = g.createImageData(S, S)
  const H = (x: number, y: number) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2
      const dy = (H(x, y + 1) - H(x, y - 1)) * 2.2
      const n = new THREE.Vector3(-dx, -dy, 1).normalize()
      const o = (y * S + x) * 4
      out.data[o] = (n.x * 0.5 + 0.5) * 255
      out.data[o + 1] = (n.y * 0.5 + 0.5) * 255
      out.data[o + 2] = (n.z * 0.5 + 0.5) * 255
      out.data[o + 3] = 255
    }
  g.putImageData(out, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(14, 14)
  t.colorSpace = THREE.NoColorSpace
  furNormal = t
  return t
}

/**
 * Physically based look for the animals: fur gets a soft sheen (the velvet-like glow real fur has at grazing
 * angles), low specular and fine strand normals; gold collars and tags become polished, clear-coated metal; the
 * tongue is wet and glossy.
 */
function realMaterial(src: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const name = src.name ?? ''
  if (/gold/i.test(name)) {
    const m = new THREE.MeshPhysicalMaterial({
      name,
      color: src.color.clone(),
      metalness: 1,
      roughness: /engrav/i.test(name) ? 0.5 : 0.35,
      clearcoat: /engrav/i.test(name) ? 0.2 : 0.5,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.0,
    })
    return m
  }
  if (/tongue/i.test(name)) {
    const m = src.clone()
    m.roughness = 0.18
    m.envMapIntensity = 1.2
    return m
  }
  if (!src.map) {
    const m = src.clone()
    m.envMapIntensity = 0.75
    return m
  }
  const m = new THREE.MeshPhysicalMaterial({
    name,
    map: src.map,
    color: src.color.clone(),
    normalMap: src.normalMap ?? furNormalMap(),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.78,
    metalness: 0,
    specularIntensity: 0.35,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#b8a48c'),
    envMapIntensity: 0.6,
  } as THREE.MeshPhysicalMaterialParameters)
  if (src.normalMap) m.normalScale.copy(src.normalScale)
  return m
}

// ---------------------------------------------------------------- Sonic's round collar with his name on it

function collarTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const g = c.getContext('2d')!
  // polished gold band with darker rims
  const grd = g.createLinearGradient(0, 0, 0, 128)
  grd.addColorStop(0, '#7a5414')
  grd.addColorStop(0.18, '#f2c86a')
  grd.addColorStop(0.5, '#ffe7a8')
  grd.addColorStop(0.82, '#d9a640')
  grd.addColorStop(1, '#6a4610')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 128)
  // studs along the band
  for (let i = 0; i < 24; i++) {
    const x = 21 + i * 42.6
    if ((x > 140 && x < 380) || (x > 652 && x < 892)) continue
    const r = g.createRadialGradient(x - 3, 61, 1, x, 64, 11)
    r.addColorStop(0, '#fff8e0')
    r.addColorStop(1, '#8a6420')
    g.fillStyle = r
    g.beginPath()
    g.arc(x, 64, 10, 0, Math.PI * 2)
    g.fill()
  }
  // the name, engraved: front (u 0.25) and back (u 0.75) of the neck
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '900 76px Arial Black, Arial, sans-serif'
  for (const x of [256, 768]) {
    g.fillStyle = 'rgba(255,240,200,0.65)'
    g.fillText('SONIC', x + 2, 68)
    g.fillStyle = '#3a2406'
    g.fillText('SONIC', x, 66)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/**
 * Sonic's collar: the exported ring is widened into a proper round band and wrapped (cylindrical mapping
 * around the neck) in a gold texture with studs and SONIC engraved at the front and the back, so his name reads
 * from the chase camera too. The tag stays on its pendant bone.
 */
function sonicCollar(mesh: THREE.Mesh, root: THREE.Object3D): THREE.MeshStandardMaterial {
  const geo = mesh.geometry.clone()
  const pos = geo.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const c = new THREE.Vector3()
  for (let i = 0; i < n; i++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i))
  c.divideScalar(n)
  // the neck axis is the direction the ring is thinnest along (smallest spread of the vertices)
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const v = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).sub(c)
    const a = [v.x, v.y, v.z]
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) cov[r * 3 + k] += a[r] * a[k]
  }
  const m3 = new THREE.Matrix3().fromArray(cov)
  // inverse power iteration gives the smallest-variance direction
  const inv = m3.clone().invert()
  const axis = new THREE.Vector3(0.3, 0.8, 0.5)
  for (let it = 0; it < 30; it++) axis.applyMatrix3(inv).normalize()
  // "front" points to the tag
  const tag = root.getObjectByName('Sonic_Tag') as THREE.Mesh | undefined
  let front = new THREE.Vector3(0, -1, 1)
  if (tag?.geometry) {
    tag.geometry.computeBoundingBox()
    front = tag.geometry.boundingBox!.getCenter(new THREE.Vector3()).sub(c)
  }
  front.addScaledVector(axis, -front.dot(axis)).normalize()
  const side = new THREE.Vector3().crossVectors(axis, front).normalize()
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < n; i++) {
    const h = v.fromBufferAttribute(pos, i).sub(c).dot(axis)
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
  }
  const half = Math.max(1e-4, (hi - lo) / 2)
  // widen the band: a collar about 1.6x as deep, a touch rounder (pushed out from the neck)
  const uv = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).sub(c)
    const h = v.dot(axis)
    const rad = v.clone().addScaledVector(axis, -h)
    const ang = Math.atan2(rad.dot(side), rad.dot(front))
    const out = rad.multiplyScalar(1.04).addScaledVector(axis, h * 1.6)
    pos.setXYZ(i, c.x + out.x, c.y + out.y, c.z + out.z)
    uv[i * 2] = 0.25 + ang / (Math.PI * 2)
    uv[i * 2 + 1] = (h - lo) / (2 * half)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  mesh.geometry = geo
  const map = collarTexture()
  map.wrapS = THREE.RepeatWrapping
  const old = mesh.material as THREE.Material
  mesh.material = new THREE.MeshPhysicalMaterial({ name: 'SonicCollar', map, metalness: 0.75, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.9 })
  old.dispose()
  const mat = mesh.material as THREE.MeshStandardMaterial
  // the frost / ghost effects tint from this
  mat.userData.baseColor = mat.color.clone()
  return mat
}

/** world-space fur length per coat (m); 0 = no fur shells (the elephant's skin) */
const FUR_LEN: Record<AnimalId, number> = { sonic: 0.009, leo: 0.016, raja: 0.014, shadow: 0.008, jax: 0.009, arctic: 0.024, bruno: 0.02, titan: 0, koda: 0.022, snow: 0.024 }
const FUR_SHELLS = 12
let furTex: THREE.Texture | null = null
/** tiling strand mask: thousands of soft dots of random strength (each one a hair seen end-on) */
function furStrands() {
  if (furTex) return furTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.floor(Math.random() * 165)
    g.fillStyle = `rgb(${v},${v},${v})`
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 0.6 + Math.random() * 0.8
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.beginPath()
      g.arc(x + ox, y + oy, r, 0, Math.PI * 2)
      g.fill()
    }
  }
  furTex = new THREE.CanvasTexture(c)
  furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping
  furTex.colorSpace = THREE.NoColorSpace
  return furTex
}

/**
 * Real layered fur (Ultra): FUR_SHELLS copies of each furred body mesh, sharing its geometry and skeleton, each
 * pushed a little further out along the skinned normal; every layer keeps only the strands that reach it, so the
 * coat gets depth, soft edges against the light and a fuzzy silhouette. Strands darken towards the root (self-shadow).
 */
function addFurShells(root: THREE.Object3D, animalId: AnimalId, fitScale: number, mats: THREE.MeshStandardMaterial[]) {
  const len = FUR_LEN[animalId]
  if (!len) return
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.furShell || Array.isArray(m.material)) return
    const mat = m.material as THREE.MeshStandardMaterial
    // only the coat: textured, not metal (collar, tag), not the tongue / eyes
    if (!mat.map || mat.metalness > 0.5 || /collar|tag|pendant|tongue|eye|teeth|claw/i.test(m.name + ' ' + mat.name)) return
    meshes.push(m)
  })
  const ws = new THREE.Vector3()
  for (const m of meshes) {
    const src = m.material as THREE.MeshStandardMaterial
    m.getWorldScale(ws)
    const objLen = len / Math.max(1e-6, fitScale * ws.y)
    for (let i = 1; i <= FUR_SHELLS; i++) {
      const k = i / FUR_SHELLS
      const mat = new THREE.MeshStandardMaterial({ name: 'furShell', map: src.map, color: src.color.clone(), roughness: 0.92, metalness: 0, envMapIntensity: 0.5 })
      mat.userData.baseColor = mat.color.clone()
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFurOff = { value: objLen * k }
        sh.uniforms.uFurK = { value: k }
        sh.uniforms.uFurTex = { value: furStrands() }
        sh.vertexShader = 'uniform float uFurOff;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize(objectNormal) * uFurOff;')
        sh.fragmentShader =
          'uniform float uFurK;\nuniform sampler2D uFurTex;\n' +
          sh.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float fs = texture2D(uFurTex, vMapUv * 46.0).r;
            if (fs < 0.28 + uFurK * 0.66) discard;
            diffuseColor.rgb *= mix(0.62, 1.08, uFurK);`,
          )
      }
      mat.customProgramCacheKey = () => 'wbfurshell'
      mats.push(mat)
      let shell: THREE.Mesh
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = m as THREE.SkinnedMesh
        const c = new THREE.SkinnedMesh(sm.geometry, mat)
        c.bind(sm.skeleton, sm.bindMatrix)
        shell = c
      } else shell = new THREE.Mesh(m.geometry, mat)
      shell.userData.furShell = true
      shell.castShadow = false
      shell.receiveShadow = false
      shell.frustumCulled = false
      shell.name = m.name + '_fur' + i
      shell.position.copy(m.position)
      shell.quaternion.copy(m.quaternion)
      shell.scale.copy(m.scale)
      m.parent?.add(shell)
    }
  }
}

export default function WildAnimal({
  animalId,
  poseOf,
  castShadow = true,
  onStep,
  fur = false,
}: {
  animalId: AnimalId
  poseOf: () => WildPoseState
  castShadow?: boolean
  /** a paw touched the ground (world position, ground speed) — for dust */
  onStep?: (at: THREE.Vector3, speed: number) => void
  /** layered fur shells (only drawn on Ultra) */
  fur?: boolean
}) {
  const def = MODELS[animalId]
  const { scene, animations } = useGLTF(def.url)
  const body = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)

  const built = useMemo(() => {
    const root = SkeletonUtils.clone(scene) as THREE.Object3D
    // realistic fur and metal everywhere but the Low graphics setting
    const realistic = useSave.getState().settings.quality !== 'low'
    const mats: THREE.MeshStandardMaterial[] = []
    let strides: Record<string, number> | null = null
    root.traverse((o) => {
      const wb = (o.userData as { wb?: string }).wb
      if (wb) {
        try {
          strides = (JSON.parse(wb) as { stride: Record<string, number> }).stride
        } catch {
          strides = null
        }
      }
      const m = o as THREE.SkinnedMesh
      if (!m.isMesh) return
      m.castShadow = castShadow
      m.receiveShadow = false
      m.frustumCulled = false
      const src = Array.isArray(m.material) ? m.material : [m.material]
      const out = src.map((x) => {
        const mat = realistic ? realMaterial(x as THREE.MeshStandardMaterial) : (x as THREE.MeshStandardMaterial).clone()
        if (!realistic) mat.envMapIntensity = /gold/i.test(mat.name) ? 1.6 : 0.75
        // some sources export opaque fur as BLEND, which turns depth writes off and lets the trail draw over the body
        mat.transparent = false
        mat.depthWrite = true
        mat.opacity = 1
        mat.userData.baseColor = mat.color.clone()
        mats.push(mat)
        return mat
      })
      m.material = Array.isArray(m.material) ? out : out[0]
      if (/collar/i.test(m.name) && !Array.isArray(m.material)) {
        // swap the collar's material in the blink / ghost list too
        const old = m.material as THREE.MeshStandardMaterial
        const now = sonicCollar(m, root)
        mats.splice(mats.indexOf(old), 1, now)
      }
    })
    for (const c of animations) zeroClip(c)
    if (def.amp) for (const c of animations) if (c.name === 'Gallop') amplifyClip(c, def.amp)
    // gallop in place: remove any root motion (a steady drift of the top bone across the clip)
    for (const c of animations) {
      for (const tr of c.tracks) {
        if (!tr.name.endsWith('.position')) continue
        const node = root.getObjectByName(tr.name.slice(0, -'.position'.length).replace(/^.*\//, ''))
        if (!node || !(node as THREE.Bone).isBone || (node.parent as THREE.Bone)?.isBone) continue
        const n = tr.times.length
        if (n < 2) continue
        const span = tr.times[n - 1] - tr.times[0] || 1
        const d = [0, 1, 2].map((k) => tr.values[(n - 1) * 3 + k] - tr.values[k])
        for (let i = 0; i < n; i++) {
          const f = (tr.times[i] - tr.times[0]) / span
          for (let k = 0; k < 3; k++) tr.values[i * 3 + k] -= d[k] * f
        }
      }
    }
    const mixer = new THREE.AnimationMixer(root)
    const clip = (name: string) => animations.find((c) => c.name === name)
    const actions = {
      run: clip('Gallop') ? mixer.clipAction(clip('Gallop')!) : null,
      idle: clip('Idle') ? mixer.clipAction(clip('Idle')!) : null,
      jump: clip('Gallop_Jump') ? mixer.clipAction(clip('Gallop_Jump')!) : null,
      dead: clip('Death') ? mixer.clipAction(clip('Death')!) : null,
    }
    if (actions.jump) {
      actions.jump.setLoop(THREE.LoopOnce, 1)
      actions.jump.clampWhenFinished = true
    }
    if (actions.dead) {
      actions.dead.setLoop(THREE.LoopOnce, 1)
      actions.dead.clampWhenFinished = true
    }
    // the full motion set: every clip is played at once and driven by weight and explicit time
    const gait = strides && GAIT_CLIPS.every((n) => clip(n)) ? (Object.fromEntries(GAIT_CLIPS.map((n) => [n, mixer.clipAction(clip(n)!)])) as Record<GaitClip, THREE.AnimationAction>) : null
    // measure the running pose, not the bind pose (some rigs only stand up once animated)
    actions.run?.play()
    mixer.update(0.01)
    root.updateMatrixWorld(true)
    tmpBox.setFromObject(root, true)
    const size = tmpBox.getSize(new THREE.Vector3())
    const center = tmpBox.getCenter(new THREE.Vector3())
    const scale = def.height / Math.max(0.01, size.y)
    const alongX = size.x > size.z
    // face the head down +Z: find the head bone (or failing that the far end the neck points to)
    let yaw = (alongX ? -Math.PI / 2 : 0) + def.yaw
    let head: THREE.Object3D | undefined
    root.traverse((o) => {
      if (!head && (o as THREE.Bone).isBone && /head/i.test(o.name) && !/end|top|nub/i.test(o.name)) head = o
    })
    if (head) {
      const hp = head.getWorldPosition(new THREE.Vector3()).sub(center)
      const forward = alongX ? hp.x : hp.z // the -90° yaw turns local +x into +Z
      if (forward < 0) yaw += Math.PI
    } else console.warn('WildAnimal: no head bone in', animalId)
    actions.run?.stop()
    if (gait) {
      for (const a of Object.values(gait)) {
        a.setLoop(THREE.LoopRepeat, Infinity)
        a.play()
        a.setEffectiveWeight(0)
        a.timeScale = 0
      }
    }
    // paws (dust) and the name tag (sways on lane changes)
    const paws: THREE.Object3D[] = []
    let pendant: THREE.Bone | null = null
    root.traverse((o) => {
      if (/^(toe|fpaw)[._]?[LR]$/.test(o.name)) paws.push(o)
      if ((o as THREE.Bone).isBone && o.name === 'pendant') pendant = o as THREE.Bone
    })
    if (fur && (window as unknown as { __wbFur?: boolean }).__wbFur !== false && useSave.getState().settings.quality === 'ultra') addFurShells(root, animalId, scale, mats)
    return { root, mats, mixer, actions, gait, strides: strides as Record<string, number> | null, paws, pendant: pendant as THREE.Bone | null, fit: { scale, yaw, lift: -tmpBox.min.y * scale, cx: center.x, cz: center.z } }
  }, [scene, animations, castShadow, def.height, def.yaw, animalId, fur])
  const { root, mats, mixer, actions, gait, strides, paws, pendant, fit } = built

  const current = useRef<WildPose | null>(null)
  useEffect(() => {
    current.current = null
    return () => void mixer.stopAllAction()
  }, [mixer])
  const squash = useRef(0)
  const fall = useRef(0)
  // gait controller state
  const ctl = useRef({
    phase: 0,
    weights: Object.fromEntries(GAIT_CLIPS.map((n) => [n, n === 'Idle' ? 1 : 0])) as Record<GaitClip, number>,
    clock: 0,
    hitT: 0,
    landT: 1e9,
    prevPose: 'idle' as WildPose,
    contact: [] as boolean[],
    swing: 0,
    swingV: 0,
    prevX: NaN,
    prevVx: 0,
  })

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const st = poseOf()
    const pose = st.pose
    const g = body.current
    const sp = spin.current
    if (gait && strides) driveGait(st, dt)
    else driveSimple(st, dt)
    if (!g || !sp) return
    fall.current += ((pose === 'dead' ? 1 : 0) - fall.current) * Math.min(1, dt * (gait ? 3 : 6))
    if (gait) {
      // the clips shape the body; the game adds the roll spin and the tip onto the side after a crash
      g.scale.setScalar(fit.scale)
      g.position.y = fit.lift
      sp.rotation.x = pose === 'roll' ? -Math.PI * 2 * smooth(0.1, 0.9, st.t) : 0
      sp.position.y = pose === 'roll' ? def.height * 0.3 * Math.sin(Math.PI * st.t) : 0
      sp.rotation.z = fall.current * (Math.PI / 2.3) * smooth(0.25, 0.7, ctl.current.hitT / 1.2)
      footfalls(st)
      swingTag(dt)
    } else {
      const low = pose === 'slide' || pose === 'roll' ? 1 : 0
      squash.current += (low - squash.current) * Math.min(1, dt * 16)
      const k = squash.current
      g.scale.set(fit.scale * (1 + k * 0.08), fit.scale * (1 - k * (pose === 'roll' ? 0.35 : 0.45)), fit.scale * (1 + k * 0.1))
      g.position.y = fit.lift * (1 - k * 0.3)
      // weight bob with every footfall pair (the clip holds two cycles, two pairs each)
      if (def.bob && pose === 'run' && actions.run) {
        const u = actions.run.time / Math.max(0.01, actions.run.getClip().duration)
        g.position.y += def.height * def.bob * (0.5 - 0.5 * Math.cos(2 * Math.PI * 4 * u))
      }
      // roll: tuck and spin once; jump: nose up then down; crash: tip onto the side
      sp.rotation.x = pose === 'roll' ? -Math.PI * 2 * st.t : pose === 'jump' ? -0.22 * Math.sin(Math.PI * st.t) : 0
      sp.rotation.z = fall.current * (Math.PI / 2.3)
      sp.position.y = pose === 'roll' ? def.height * 0.25 : 0
    }
    const ghost = st.ghost ?? 0
    for (const m of mats) {
      const transparent = ghost > 0.01
      if (m.transparent !== transparent) {
        m.transparent = transparent
        m.needsUpdate = true
      }
      m.opacity = 1 - ghost * 0.65
      const base = m.userData.baseColor as THREE.Color
      if (st.frost) m.color.copy(base).lerp(FROST, 0.45)
      else m.color.copy(base)
    }
  })

  /** Older animals: one gallop clip, rate from speed. */
  function driveSimple(st: WildPoseState, dt: number) {
    const pose = st.pose
    if (pose !== current.current) {
      const want = pose === 'idle' || pose === 'victory' ? (actions.idle ?? actions.run) : pose === 'jump' ? (actions.jump ?? actions.run) : pose === 'dead' ? (actions.dead ?? null) : actions.run
      for (const a of [actions.run, actions.idle, actions.jump, actions.dead]) if (a && a !== want && a.isRunning()) a.fadeOut(0.15)
      if (want) {
        if (pose === 'jump' || pose === 'dead' || !want.isRunning()) want.reset()
        want.fadeIn(current.current ? 0.15 : 0).play()
      }
      current.current = pose
    }
    const run = actions.run
    if (run) run.timeScale = (pose === 'idle' || pose === 'victory') && !actions.idle ? 0.12 : Math.max(0.7, (st.speed / 9) * def.runRate)
    if (pose === 'dead' && !actions.dead && run) run.timeScale = 0
    mixer.update(dt)
  }

  /** Sonic: weights and times of every clip set explicitly each frame. */
  function driveGait(st: WildPoseState, dt: number) {
    const c = ctl.current
    const A = gait!
    const S = strides!
    const pose = st.pose
    const v = Math.max(0, st.speed)
    c.clock += dt
    // jump just ended: absorb the landing, then the gallop resumes from the hind-touchdown phase
    if (c.prevPose === 'jump' && pose === 'run') {
      c.landT = 0
      const sWorld = S.Gallop * fit.scale
      c.phase = (1 - (LAND_S * v) / Math.max(0.1, sWorld) + 10) % 1
    }
    if (pose === 'dead' && c.prevPose !== 'dead') c.hitT = 0
    if (pose === 'victory' && c.prevPose !== 'victory') c.clock = 0
    c.prevPose = pose
    c.landT += dt
    c.hitT += dt

    // target weights
    const target = Object.fromEntries(GAIT_CLIPS.map((n) => [n, 0])) as Record<GaitClip, number>
    let rate = 14
    if (pose === 'run') {
      const walk = 1 - smooth(2.2, 4.2, v)
      // the sprint has the long stride: blend it in early so the cadence stays dog-like (3.5-5.5 Hz) at game speeds
      const sprint = smooth(10, 17, v)
      const idle = 1 - smooth(0.15, 0.6, v)
      const land = c.landT < LAND_S ? 1 - smooth(0.35, 1, c.landT / LAND_S) : 0
      const loco = (1 - land) * (1 - idle)
      target.Walk = walk * loco
      target.Sprint = sprint * (1 - walk) * loco
      target.Gallop = Math.max(0, 1 - walk - sprint * (1 - walk)) * loco
      target.Land = land
      target.Idle = idle * (1 - land)
      rate = c.landT < 0.05 ? 40 : 10
    } else if (pose === 'idle') target.Idle = 1
    else if (pose === 'victory') target.Victory = 1
    else if (pose === 'jump') {
      target.Jump = 1
      rate = 22
    } else if (pose === 'slide') {
      target.Slide = 1
      rate = 22
    } else if (pose === 'roll') {
      target.Roll = 1
      rate = 22
    } else if (pose === 'dead') {
      target.Hit = 1
      rate = 30
    }
    const k = Math.min(1, dt * rate)
    let sum = 0
    for (const n of GAIT_CLIPS) {
      c.weights[n] += (target[n] - c.weights[n]) * k
      if (c.weights[n] < 1e-3) c.weights[n] = 0
      sum += c.weights[n]
    }

    // phase: one cycle per stride of ground travelled (blended stride of the active gaits)
    const wl = c.weights.Walk + c.weights.Gallop + c.weights.Sprint
    if (wl > 1e-3 && v > 0.05) {
      const stride = ((c.weights.Walk * S.Walk + c.weights.Gallop * S.Gallop + c.weights.Sprint * S.Sprint) / wl) * fit.scale
      // paws are locked to the trail up to ~23 m/s; above that (speed power-up) a real dog's legs can't cycle faster
      c.phase = (c.phase + Math.min((v * dt) / Math.max(0.05, stride), MAX_HZ * dt)) % 1
    }
    const at = (n: GaitClip, f: number) => {
      const a = A[n]
      a.time = Math.min(1, Math.max(0, f)) * a.getClip().duration * 0.9999
    }
    at('Walk', c.phase)
    at('Gallop', c.phase)
    at('Sprint', c.phase)
    at('Jump', pose === 'jump' ? st.t : 1)
    at('Slide', pose === 'slide' ? st.t : 1)
    at('Roll', pose === 'roll' ? st.t : 1)
    at('Land', Math.min(1, c.landT / LAND_S))
    at('Hit', Math.min(1, c.hitT / 1.2))
    A.Idle.time = c.clock % A.Idle.getClip().duration
    A.Victory.time = c.clock % A.Victory.getClip().duration
    for (const n of GAIT_CLIPS) A[n].setEffectiveWeight(sum > 0 ? c.weights[n] / sum : n === 'Idle' ? 1 : 0)
    mixer.update(0)
    if (import.meta.env.DEV) {
      const w = window as unknown as { __wbGait?: Record<string, unknown> }
      w.__wbGait = { ...(w.__wbGait ?? {}), [animalId]: { pose, v, phase: c.phase, weights: { ...c.weights }, times: Object.fromEntries(GAIT_CLIPS.map((n) => [n, +A[n].time.toFixed(3)])), eff: Object.fromEntries(GAIT_CLIPS.map((n) => [n, +A[n].getEffectiveWeight().toFixed(2)])), run: A.Gallop.isRunning(), enabled: A.Gallop.enabled } }
    }
  }

  /** Paw touchdowns (world height crosses the ground) → dust. */
  function footfalls(st: WildPoseState) {
    if (!onStep || !paws.length) return
    const c = ctl.current
    const on = def.height * 0.075
    const off = def.height * 0.11
    for (let i = 0; i < paws.length; i++) {
      paws[i].getWorldPosition(tmpV)
      const was = c.contact[i] ?? true
      if (!was && tmpV.y < on) {
        c.contact[i] = true
        if (st.speed > 1) onStep(tmpV.clone(), st.speed)
      } else if (was && tmpV.y > off) c.contact[i] = false
    }
  }

  /** The tag swings sideways when Sonic changes lane (its fore/aft swing is baked into the clips). */
  function swingTag(dt: number) {
    if (!pendant || !spin.current || dt <= 0) return
    const c = ctl.current
    spin.current.getWorldPosition(tmpV)
    const vx = Number.isNaN(c.prevX) ? 0 : (tmpV.x - c.prevX) / dt
    const ax = (vx - c.prevVx) / dt
    c.prevX = tmpV.x
    c.prevVx = vx
    const w = 2 * Math.PI * 2.2
    c.swingV += (-w * w * c.swing - 2 * 0.25 * w * c.swingV - ax * 0.06) * dt
    c.swing += c.swingV * dt
    c.swing = Math.max(-0.7, Math.min(0.7, c.swing))
    const parent = pendant.parent
    if (!parent) return
    parent.getWorldQuaternion(tmpQ)
    // rotate about the world forward axis, expressed in the bone's parent space
    tmpQ2.setFromAxisAngle(FWD, c.swing)
    pendant.quaternion.premultiply(tmpQ.clone().invert().multiply(tmpQ2).multiply(tmpQ))
  }

  return (
    <group ref={spin}>
      <group ref={body}>
        <group rotation={[0, fit.yaw, 0]}>
          <primitive object={root} position={[-fit.cx, 0, -fit.cz]} />
        </group>
      </group>
    </group>
  )
}
