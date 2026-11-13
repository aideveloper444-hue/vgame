import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AnimalFace, boneKey, type Expression } from './face'
import { useGLTF } from '@react-three/drei'
import { useSave } from '../state/progress'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import type { AnimalId } from '../engine/content'
import { run as runState } from './runController'
import { sfx } from '../ui/sfx'

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
  /** 0..1 through the start action during the countdown (the runner only) */
  intro?: number
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
  /** false: keep the hand-tuned runRate instead of locking the clip to the measured paw speed */
  lock?: boolean
  /** stand on the gallop's most grounded frame instead of playing the model's Idle clip */
  standFromGallop?: boolean
  /** menu camera distance multiplier for long or bulky animals (default 1) */
  view?: number
  /** scales the gallop's stride rate after the paw lock (heavier animals stride slower; default 1) */
  cadence?: number
  /** narrows the tail across its length (1 = as modelled), e.g. a lion's slim tail on the tiger's model */
  tailThin?: number
  /** reshape parts of a shared body for its species: bone name, matched ignoring dots, underscores and the exporter's index -> scale [x, y, z] (bones run along local Y) */
  shape?: Record<string, [number, number, number]>
}

const M = '/models/wildbound'
export const MODELS: Record<AnimalId, ModelDef> = {
  sonic: { url: `${M}/sonic.glb`, height: 1.0, yaw: 0, runRate: 1.25 },
  // realistic male lion (Tarun.Teja, CC-BY 4.0) with the tiger's gallop retargeted onto its skeleton and its own
  // roar as the start action (clips: Gallop, Intro); see public/models/wildbound/CREDITS.txt
  leo: { url: `${M}/leo.glb`, height: 1.3, yaw: 0, runRate: 0.9, standFromGallop: true },
  raja: { url: `${M}/raja.glb`, height: 1.2, yaw: 0, runRate: 0.85 },
  // the big cats share the tiger's realistic body, skeleton and gallop; each gets its own coat painted on the
  // 3D surface (BIGCAT coats below) and its own build
  shadow: { url: `${M}/raja.glb`, height: 1.02, yaw: 0, runRate: 0.85, cadence: 1.04, shape: { 'Bip01 Head': [0.93, 0.93, 0.93] } },
  jax: { url: `${M}/raja.glb`, height: 1.04, yaw: 0, runRate: 0.85, cadence: 1.02, shape: { 'Bip01 Head': [1.04, 1.04, 1.04] } },
  arctic: { url: `${M}/arctic.glb`, height: 1.1, yaw: 0, runRate: 1.25 },
  // its Idle clip leans far back (reads as falling): it stands on the gallop's most grounded frame instead
  bruno: { url: `${M}/bruno.glb`, height: 1.35, yaw: 0, runRate: 1.0, standFromGallop: true },
  // realistic African elephant (theogilat, CC-BY 4.0) with its own run, idle, trumpet and death (clips: Gallop, Idle,
  // Death, Intro); see public/models/wildbound/CREDITS.txt
  titan: { url: `${M}/titan.glb`, height: 1.95, yaw: 0, runRate: 1.0 },
  koda: { url: `${M}/koda.glb`, height: 0.62, yaw: Math.PI, runRate: 1.4 },
  snow: { url: `${M}/raja.glb`, height: 0.96, yaw: 0, runRate: 0.85, cadence: 1.05, tailThin: 1.4, shape: { 'Bip01 Head': [0.9, 0.9, 0.9] } },
  // new species built on the best models, recoloured (see COATS): their bodies, skeletons and gallops are the originals'
  nova: { url: `${M}/raja.glb`, height: 1.22, yaw: 0, runRate: 0.85 },
  blaze: { url: `${M}/raja.glb`, height: 1.0, yaw: 0, runRate: 0.85, cadence: 1.08, tailThin: 0.7, shape: { 'Bip01 Head': [0.84, 0.84, 0.84] } },
  zara: { url: `${M}/raja.glb`, height: 1.12, yaw: 0, runRate: 0.85, cadence: 0.92, tailThin: 0.6 },
  // a grey wolf's ears are shorter and set wider than the arctic wolf body's tall, dog-like ones
  ash: { url: `${M}/arctic.glb`, height: 1.08, yaw: 0, runRate: 1.25, shape: { 'ear.L': [0.9, 0.78, 0.9], 'ear.R': [0.9, 0.78, 0.9] } },
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

const UP = new THREE.Vector3(0, 1, 0)
const RIGHT = new THREE.Vector3(1, 0, 0)

/**
 * What each animal does on the start line while the countdown runs, the way the real animal would announce itself:
 * the dog spins round with its tail going, big cats crouch back and roar, wolves sit back and howl, the stalkers
 * sink low with a swishing tail and spring, the heavyweights rear up and stomp, the red panda hops about.
 */
type IntroKind = 'turn' | 'roar' | 'howl' | 'crouch' | 'stomp' | 'hop'
const INTRO: Record<AnimalId, IntroKind> = {
  sonic: 'turn', leo: 'roar', raja: 'roar', nova: 'roar', zara: 'crouch', shadow: 'crouch', jax: 'crouch', blaze: 'crouch',
  snow: 'crouch', arctic: 'howl', ash: 'howl', bruno: 'stomp', titan: 'stomp', koda: 'hop',
}

let starTex: THREE.Texture | null = null
/** a soft golden cartoon star (the "seeing stars" daze after a crash) */
function starTexture() {
  if (starTex) return starTex
  const S = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  const glow = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2)
  glow.addColorStop(0, 'rgba(255,240,170,0.9)')
  glow.addColorStop(1, 'rgba(255,200,60,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, S, S)
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? S * 0.17 : S * 0.4
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r)
  }
  g.closePath()
  g.fillStyle = '#ffd84a'
  g.fill()
  g.strokeStyle = '#fff6c8'
  g.lineWidth = 2
  g.stroke()
  starTex = new THREE.CanvasTexture(cv)
  starTex.colorSpace = THREE.SRGBColorSpace
  return starTex
}
const tmpQ3 = new THREE.Quaternion()
const tmpQ4 = new THREE.Quaternion()
/** Rotate a bone about a world axis (its parents may be rotated). */
function rotateWorld(b: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  if (!b.parent || !angle) return
  b.parent.getWorldQuaternion(tmpQ4)
  const r = new THREE.Quaternion().setFromAxisAngle(axis, angle)
  // local' = P^-1 · R · P · local
  b.quaternion.premultiply(tmpQ4.clone().invert().multiply(r).multiply(tmpQ4))
}

interface Rig {
  feet: THREE.Bone[]
  head: THREE.Bone | null
  tail: THREE.Bone[]
  /** each tail bone's rest rotation, restored every frame when no clip drives that bone */
  tailRest: (THREE.Quaternion | null)[]
  /** the head's rest rotation when no clip drives it (so start actions and the death droop don't accumulate) */
  headRest: THREE.Quaternion | null
  /** how fast a planted paw sweeps back in the gallop clip at normal playback (model units / s), if measurable */
  vNative: number | null
  /** the gallop time (s) where all paws are lowest together: a natural standing pose */
  standT: number
}

/**
 * Finds the feet, head and tail of any rig (names differ per model: Foot / Hand / Paw, Head, Tail…), and measures
 * the gallop: sampled over one loop, each foot's planted phase (the lowest 15% of its height) moves backwards
 * relative to the body at the clip's own ground speed. Playing the clip at  world speed / that  locks the paws.
 */
function measureRig(root: THREE.Object3D, mixer: THREE.AnimationMixer, run: THREE.AnimationAction | null, alongX: boolean, fwdSign: number): Rig {
  const bones: THREE.Bone[] = []
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone)
  })
  const depth = (b: THREE.Object3D) => {
    let d = 0
    for (let p = b.parent; p; p = p.parent) d++
    return d
  }
  const feet = bones.filter((b) => /foot|hand|paw|ankle/i.test(b.name) && !/nub|end|toe|finger|index|middle|ring|pinky|extra|digit/i.test(b.name)).slice(0, 6)
  const head = bones.find((b) => /head/i.test(b.name) && !/nub|end|top|fore|mane|bottom/i.test(b.name)) ?? null
  const tail = bones.filter((b) => /tail/i.test(b.name) && !/nub|end/i.test(b.name)).sort((a, b) => depth(a) - depth(b))
  let vNative: number | null = null
  let standT = 0
  if (run && feet.length >= 2) {
    const T = run.getClip().duration
    const N = 72
    root.updateMatrixWorld(true)
    const inv = root.matrixWorld.clone().invert()
    const f = feet.map(() => [] as number[])
    const h = feet.map(() => [] as number[])
    const v = new THREE.Vector3()
    run.play()
    for (let i = 0; i < N; i++) {
      run.time = (i / N) * T
      mixer.update(0)
      root.updateMatrixWorld(true)
      feet.forEach((b, j) => {
        b.getWorldPosition(v).applyMatrix4(inv)
        f[j].push((alongX ? v.x : v.z) * fwdSign)
        h[j].push(v.y)
      })
    }
    // standing frame: the lowest total paw height over the loop
    let best = Infinity
    for (let i = 0; i < N; i++) {
      const sum = feet.reduce((acc, _, j) => acc + h[j][i], 0)
      if (sum < best) {
        best = sum
        standT = (i / N) * T
      }
    }
    const speeds: number[] = []
    feet.forEach((_, j) => {
      const lo = Math.min(...h[j])
      const hi = Math.max(...h[j])
      const thr = lo + (hi - lo) * 0.15
      for (let i = 0; i < N; i++) {
        const n = (i + 1) % N
        if (h[j][i] <= thr && h[j][n] <= thr) {
          const d = f[j][i] - f[j][n]
          if (d > 0) speeds.push(d / (T / N))
        }
      }
    })
    if (speeds.length >= 4) {
      speeds.sort((a, b) => a - b)
      vNative = speeds[Math.floor(speeds.length / 2)]
    }
  }
  const animated = new Set<string>()
  for (const a of [run?.getClip()]) for (const tr of a?.tracks ?? []) animated.add(tr.name.replace(/\.[a-z]+$/i, '').replace(/^.*\//, ''))
  const tailRest = tail.map((b) => (animated.has(b.name) ? null : b.quaternion.clone()))
  const headRest = head && !animated.has(head.name) ? head.quaternion.clone() : null
  return { feet, head, tail, tailRest, headRest, vNative, standT }
}

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
 * New species painted onto the models they are built on (linear light). Each body reads the base texture as \`t\`
 * with its luminance \`l\` and writes the new coat colour into \`c\`.
 */
/** A wolf coat painted by anatomy on the arctic wolf's body (measured body frame); the palette sets the colours. */
interface WolfPalette { base: string; saddleA: string; saddleB: string; under: string; bib: string; legs: string; cheek: string; bridge: string; earA: string; earB: string; tailTop: string; tailTip: string }
const WOLF = (P: WolfPalette) => `
    vec3 q = vCoatPos - vec3(0.00088, 0.0389, -0.2261);
    float along = clamp((dot(q, vec3(0.1124, 0.397, -0.9109)) + 0.4408) / 0.8121, 0.0, 1.0); // 0 tail tip .. 1 nose
    float up = clamp((dot(q, vec3(-0.0579, 0.9178, 0.3929)) + 0.3059) / 0.499, 0.0, 1.0);   // 0 paws .. 1 ear tips
    float facing = dot(normalize(vCoatNrm), vec3(-0.0579, 0.9178, 0.3929));                 // +1 faces up, -1 down
    float head = smoothstep(0.74, 0.8, along);
    float tail = 1.0 - smoothstep(0.13, 0.2, along);
    float legs = (1.0 - smoothstep(0.3, 0.42, up)) * (1.0 - tail) * (1.0 - head);
    vec3 grain2 = texture2D(uCoatFur, vMapUv * 23.0 + 0.11).rgb;
    float grizzle = grain2.r;
    // base: agouti grey with a faint warm cast
    vec3 coat = ${P.base};
    // the saddle: darker, grizzled with black-tipped guard hairs along the back and shoulders
    float saddle = smoothstep(-0.05, 0.45, facing) * smoothstep(0.3, 0.46, up) * (1.0 - head * 0.6);
    coat = mix(coat, mix(${P.saddleA}, ${P.saddleB}, grizzle * grizzle), saddle);
    // cream underparts: belly, chest, throat, inner legs
    float under = smoothstep(0.05, -0.55, facing) * (1.0 - tail);
    coat = mix(coat, ${P.under}, under * 0.9);
    // the throat and chest bib: cream on the front of the neck and chest, below the jaw
    float bib = smoothstep(0.58, 0.68, along) * (1.0 - smoothstep(0.8, 0.86, along)) * smoothstep(0.35, 0.45, up) * (1.0 - smoothstep(0.66, 0.74, up))
              * smoothstep(0.2, 0.6, dot(normalize(vCoatNrm), vec3(0.1124, 0.397, -0.9109)));
    coat = mix(coat, ${P.bib}, bib * 0.85);
    // legs: cinnamon-tawny on the outside, paler toward the paws' inner side
    coat = mix(coat, ${P.legs}, legs * 0.6 * (1.0 - under * 0.6));
    // head: grey crown, cream cheeks / lips / muzzle sides, a darker bridge on top of the muzzle, tawny ear backs
    float cheek = head * smoothstep(0.62, 0.5, up) * (1.0 - smoothstep(0.55, 0.85, facing));
    coat = mix(coat, ${P.cheek}, cheek * 0.9);
    float bridge = smoothstep(0.88, 0.95, along) * smoothstep(0.5, 0.9, facing);
    coat = mix(coat, ${P.bridge}, bridge * 0.7);
    float ear = head * smoothstep(0.8, 0.88, up);
    coat = mix(coat, mix(${P.earA}, ${P.earB}, smoothstep(0.95, 1.0, up)), ear * 0.75);
    // tail: grey above, dark along the top, a black tip
    coat = mix(coat, ${P.tailTop}, tail * smoothstep(-0.1, 0.6, facing) * 0.7);
    coat = mix(coat, ${P.tailTip}, 1.0 - smoothstep(0.035, 0.07, along));
    // keep the source's shading (gentle, so its soft greys never turn into blotches); eyes, nose and mouth stay as drawn
    float shade = clamp(0.55 + 0.5 * l, 0.72, 1.05);
    c = coat * shade * mix(0.9, 1.08, grizzle);
    c = mix(t * vec3(0.32, 0.3, 0.28), c, smoothstep(0.05, 0.16, l));`
const v3 = (r: number, g: number, b: number) => `vec3(${r}, ${g}, ${b})`

/**
 * A big-cat coat on the tiger's body: the tiger's stripes are washed out (the texture read blurred, keeping only its
 * light belly and shading), a base colour and a cream belly go on, then a pattern is drawn with 3D cellular noise in
 * the body's own rest space, so spots and rosettes wrap the animal with no texture seams. In \`pattern\`:
 * d = distance to the nearest spot centre (cells are ~1 across), o = offset from it, h = that spot's random values,
 * coat = colour so far; ring() and gaps() shape broken rosettes. Eyes and mouth keep the tiger's texture (tinted).
 */
function BIGCAT(freq: number, base: string, belly: string, pattern: string, eyeTint = 'vec3(1.0)') {
  return `
    vec3 tb = texture2D(map, vMapUv, 3.5).rgb;
    float lb = dot(tb, vec3(0.2126, 0.7152, 0.0722));
    float cream = smoothstep(0.24, 0.48, lb);
    vec3 coat = mix(${base}, ${belly}, cream) * mix(0.88, 1.06, smoothstep(0.015, 0.3, l));
    const vec3 INK = vec3(0.018, 0.015, 0.012);
    // the tiger mesh is ~240 units nose to tail: normalise, warp a little so spots aren't perfectly round
    vec3 cp = vCoatPos / 240.0 * ${freq.toFixed(1)};
    cp += 0.22 * sin(cp.yzx * 1.7 + cp.zxy * 0.9);
    vec3 o; vec3 h;
    float d = wbCell(cp, o, h);
    ${pattern}
    c = coat * mix(0.94, 1.04, h.x);
    float eye = 1.0 - smoothstep(0.03, 0.05, distance(vMapUv, vec2(0.25, 0.815)));
    float tmx = max(t.r, max(t.g, t.b));
    float orange = smoothstep(0.3, 0.5, (tmx - min(t.r, min(t.g, t.b))) / max(tmx, 1e-4)) * step(t.b, t.g);
    float keep = max(eye, step(0.9, vMapUv.y) * (1.0 - orange));
    c = mix(c, t * ${eyeTint}, keep);`
}
const CELL_GLSL = /* glsl */ `
vec3 wbHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
// F1 cellular noise: distance to the nearest feature point, its offset and its random values
float wbCell(vec3 p, out vec3 o, out vec3 h) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float best = 8.0;
  o = vec3(0.0);
  h = vec3(0.0);
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      for (int z = -1; z <= 1; z++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 r = wbHash3(i + g);
        vec3 v = g + 0.15 + 0.7 * r - f;
        float dd = dot(v, v);
        if (dd < best) { best = dd; o = v; h = r; }
      }
  return sqrt(best);
}
float ring(float d, float a, float b) { return smoothstep(a - 0.04, a, d) * (1.0 - smoothstep(b - 0.05, b, d)); }
// breaks a ring into n arcs (a rosette), with a random twist per spot
float gaps(vec3 o, vec3 h, float n, float open) { return step(open, fract(atan(o.y + o.z * 0.5, o.x) / 6.2832 * n + h.x)); }
`

const COATS: Partial<Record<AnimalId, string>> = {
  // African elephant: the source texture is sandy; real skin is a dusty grey-brown
  titan: `
    c = mix(vec3(l), t, 0.38) * vec3(0.93, 0.9, 0.86) * 1.04;`,
  // Sonic, as the real dog: a deep, glossy black coat with rich mahogany-tan markings
  sonic: `
    float smx = max(t.r, max(t.g, t.b));
    float ssat = (smx - min(t.r, min(t.g, t.b))) / max(smx, 1e-4);
    float tan = smoothstep(0.05, 0.17, l) * smoothstep(0.16, 0.48, ssat);
    // muted mahogany: take the colour out first, then tint (tinting the already-orange texture made the legs glow)
    // one even hue with only gentle shading from the texture, so the source's speckle doesn't read as blotches
    vec3 rust = vec3(0.34, 0.17, 0.08) * mix(0.72, 1.12, smoothstep(0.05, 0.4, l));
    c = mix(t * vec3(0.42, 0.4, 0.4), rust, tan);`,
  // white tiger: the orange becomes a warm cream-white, the stripes stay a deep brown-black, the eyes turn icy blue
  nova: `
    float stripe = 1.0 - smoothstep(0.025, 0.1, l);
    c = mix(vec3(0.82, 0.78, 0.7) * (0.85 + 0.25 * smoothstep(0.08, 0.45, l)), vec3(0.025, 0.018, 0.014), stripe);
    float eye = 1.0 - smoothstep(0.03, 0.05, distance(vMapUv, vec2(0.25, 0.815)));
    float tmx = max(t.r, max(t.g, t.b));
    float orange = smoothstep(0.3, 0.5, (tmx - min(t.r, min(t.g, t.b))) / max(tmx, 1e-4)) * step(t.b, t.g);
    float keep = max(eye, step(0.9, vMapUv.y) * (1.0 - orange));
    c = mix(c, t * vec3(0.55, 0.85, 1.35), eye);
    c = mix(c, t, keep * (1.0 - eye));`,
  // cheetah: tawny gold with a cream belly and small, dense, solid black spots
  blaze: BIGCAT(27.0, 'vec3(0.64, 0.43, 0.19)', 'vec3(0.82, 0.74, 0.6)', `
    float ink = 1.0 - smoothstep(0.17, 0.23, d);
    coat = mix(coat, INK, ink);`),
  // jaguar: rich gold with large, broken black rosettes, each with a darker centre and often a dot inside
  jax: BIGCAT(12.0, 'vec3(0.6, 0.36, 0.11)', 'vec3(0.84, 0.76, 0.62)', `
    coat = mix(coat, coat * vec3(0.78, 0.66, 0.55), (1.0 - smoothstep(0.22, 0.27, d)) * step(0.25, h.z));
    coat = mix(coat, INK, ring(d, 0.24, 0.39) * gaps(o, h, 3.0, 0.3));
    coat = mix(coat, INK, (1.0 - smoothstep(0.06, 0.1, d)) * step(0.55, h.y));`),
  // black panther (a melanistic leopard): a near-black glossy coat; the rosettes only show as a faint pattern
  shadow: BIGCAT(15.0, 'vec3(0.024, 0.022, 0.021)', 'vec3(0.034, 0.031, 0.029)', `
    coat = mix(coat, vec3(0.012, 0.011, 0.01), ring(d, 0.2, 0.36) * gaps(o, h, 3.0, 0.3) * 0.85);`, 'vec3(0.9, 1.0, 0.7)'),
  // snow leopard: smoky grey over white, big open charcoal rosettes, pale grey-green eyes
  snow: BIGCAT(11.5, 'vec3(0.47, 0.46, 0.43)', 'vec3(0.82, 0.81, 0.77)', `
    coat = mix(coat, vec3(0.07, 0.07, 0.075), ring(d, 0.26, 0.4) * gaps(o, h, 4.0, 0.22));
    coat = mix(coat, vec3(0.07, 0.07, 0.075), (1.0 - smoothstep(0.12, 0.17, d)) * step(0.7, h.y));`, 'vec3(0.75, 0.95, 0.9)'),
  // lioness: the tiger's coat, stripes lifted into a plain golden tan with a lighter belly
  zara: `
    vec3 tb = texture2D(map, vMapUv, 3.5).rgb;
    float lb = dot(tb, vec3(0.2126, 0.7152, 0.0722));
    float cream = smoothstep(0.22, 0.45, lb) * 0.7;
    c = mix(vec3(0.55, 0.3, 0.1), vec3(0.7, 0.5, 0.28), cream) * mix(0.94, 1.05, smoothstep(0.015, 0.3, l));
    float eye = 1.0 - smoothstep(0.03, 0.05, distance(vMapUv, vec2(0.25, 0.815)));
    float tmx = max(t.r, max(t.g, t.b));
    float orange = smoothstep(0.3, 0.5, (tmx - min(t.r, min(t.g, t.b))) / max(tmx, 1e-4)) * step(t.b, t.g);
    float keep = max(eye, step(0.9, vMapUv.y) * (1.0 - orange));
    c = mix(c, t, keep);`,
  // grey wolf (a real Canis lupus coat, painted by anatomy on the arctic wolf's body): agouti grey with a warm
  // undertone, a grizzled charcoal saddle down the back into a black-tipped tail, cream cheeks, throat, chest and
  // belly, cinnamon legs and ear backs. The body frame (along / up / across, rest pose) was measured from the mesh;
  // the white source texture now only supplies fine shading, and its darkest parts (eyes, nose, lips) stay dark.
  ash: WOLF({ base: v3(0.118, 0.121, 0.127), saddleA: v3(0.012, 0.012, 0.012), saddleB: v3(0.12, 0.118, 0.115), under: v3(0.5, 0.48, 0.43), bib: v3(0.52, 0.5, 0.45), legs: v3(0.24, 0.19, 0.14), cheek: v3(0.6, 0.57, 0.5), bridge: v3(0.07, 0.065, 0.06), earA: v3(0.24, 0.17, 0.11), earB: v3(0.04, 0.035, 0.03), tailTop: v3(0.06, 0.056, 0.052), tailTip: v3(0.012, 0.011, 0.01) }),
  // arctic wolf: the same anatomy in off-white: a faintly grizzled saddle, cream legs, a soft grey muzzle bridge
  arctic: WOLF({ base: v3(0.6, 0.585, 0.55), saddleA: v3(0.4, 0.39, 0.37), saddleB: v3(0.66, 0.645, 0.61), under: v3(0.74, 0.72, 0.67), bib: v3(0.8, 0.78, 0.72), legs: v3(0.66, 0.6, 0.52), cheek: v3(0.8, 0.78, 0.72), bridge: v3(0.5, 0.48, 0.45), earA: v3(0.58, 0.53, 0.46), earB: v3(0.36, 0.33, 0.3), tailTop: v3(0.52, 0.5, 0.47), tailTip: v3(0.58, 0.56, 0.52) }),
}

/**
 * The lion's mane (a mesh built in Blender from the head and neck, material 'Lion_Mane'): a golden fringe framing the
 * face, tawny over the crown, darkening toward the shoulders and down the chest, in long locks with dark gaps.
 * Body space: the mesh's rest position in metres, y up (paws 0 .. head top 1.61), z along the body (nose +1.24 ..
 * tail -1.97).
 */
const MANE = `
    float Z = vCoatPos.z;
    float Y = vCoatPos.y;
    float back = 1.0 - smoothstep(0.5, 0.98, Z);
    float low = 1.0 - smoothstep(0.58, 1.22, Y);
    float fringe = smoothstep(0.86, 1.04, Z);
    vec3 gold = vec3(0.58, 0.38, 0.16);
    vec3 tawny = vec3(0.36, 0.22, 0.09);
    vec3 dark = vec3(0.1, 0.06, 0.03);
    vec3 col = mix(tawny, dark, clamp(back * 0.8 + low * 0.45, 0.0, 1.0));
    col = mix(col, gold, clamp(fringe * 0.9 + (1.0 - back) * smoothstep(1.27, 1.6, Y) * 0.5, 0.0, 1.0));
    // each strand darkens to the root and catches light at the tip (the strand texture's brightness runs root to tip)
    float grainM = texture2D(uCoatFur, vMapUv * vec2(3.0, 0.7) + vCoatPos.xy * 2.0).r;
    c = col * mix(0.55, 1.15, l) * mix(0.9, 1.1, grainM);`
/** world length of the mane's layered fur (m) */
const MANE_LEN = 0.11

/** The coat's velvet sheen per species (the default tan would warm a white tiger or a grey wolf). */
const COAT_SHEEN: Partial<Record<AnimalId, string>> = { sonic: '#7a6e64', nova: '#d6d2ca', blaze: '#c49a62', zara: '#c49a62', ash: '#6f7378', jax: '#c49a62', snow: '#c8c8c4', shadow: '#4e535b', arctic: '#e6e2da', titan: '#2c2a27' }

/** Paint a species coat (COATS) over the base model's texture, on the body or on its fur layers. */
function speciesCoat(sh: THREE.WebGLProgramParametersWithUniforms, id: AnimalId, override?: string) {
  const body = override ?? COATS[id]
  if (!body) return
  sh.uniforms.uCoatFur = { value: furStrands() }
  // where on the body this point sits, in the model's own (rest pose) space, so a coat can follow anatomy
  // (a darker back, a pale belly) instead of only the texture's brightness
  sh.vertexShader = 'varying vec3 vCoatPos;\nvarying vec3 vCoatNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCoatPos = position;\n  vCoatNrm = normal;')
  sh.fragmentShader =
    'uniform sampler2D uCoatFur;\nvarying vec3 vCoatPos;\nvarying vec3 vCoatNrm;\n' +
    (body.includes('wbCell') ? CELL_GLSL : '') +
    sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        vec3 t = diffuseColor.rgb;
        float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
        vec3 c = t;
        ${body}
        // a fine fur grain, so a repainted coat never looks flat
        float grain = texture2D(uCoatFur, vMapUv * 38.0).r * 0.6 + texture2D(uCoatFur, vMapUv * 11.0 + 0.37).r * 0.4;
        diffuseColor.rgb = c * (0.88 + 0.2 * grain);
      }`,
    )
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
  if (/eye/i.test(name) && !src.map && src.transparent && src.opacity < 0.5) {
    // a cornea: the clear, wet layer over a textured eye. It must stay see-through (forcing it opaque painted a
    // blue-white cap over the lion's eyes); it only adds the sharp highlight of a living eye.
    const m = new THREE.MeshPhysicalMaterial({ name, color: '#ffffff', metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.2 })
    m.userData.cornea = true
    return m
  }
  if (/eye/i.test(name) && !src.map) {
    // a wet eye: a glossy clear-coated cornea that picks up a small, sharp sky highlight
    return new THREE.MeshPhysicalMaterial({
      name,
      color: src.color.clone(),
      metalness: 0,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.1,
    })
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
    roughness: 0.8,
    metalness: 0,
    // hair keratin reflects a little, slightly warm: a touch of specular tint instead of a plastic white glint
    specularIntensity: 0.32,
    specularColor: new THREE.Color('#f2e8dc'),
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#b8a48c'),
    envMapIntensity: 0.6,
  } as THREE.MeshPhysicalMaterialParameters)
  if (src.normalMap) m.normalScale.copy(src.normalScale)
  return m
}

// ---------------------------------------------------------------- Sonic's real collar and tag

/** Woven nylon webbing, dark olive with khaki threads and stitched edges, like Sonic's own collar. */
function collarTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#23241a'
  g.fillRect(0, 0, 1024, 128)
  // twill weave: rows of short khaki floats that step along, with a little irregularity
  for (let y = 4; y < 124; y += 5) {
    for (let x = (y * 1.6) % 8; x < 1024; x += 8) {
      const k = 0.35 + 0.4 * Math.random()
      g.fillStyle = `rgba(122,116,84,${k})`
      g.fillRect(x, y, 4, 2)
    }
  }
  // worn spots and a darker grain
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.15})`
    g.fillRect(Math.random() * 1024, Math.random() * 128, 2 + Math.random() * 6, 1)
  }
  // stitched edges
  g.strokeStyle = 'rgba(150,142,108,0.6)'
  g.lineWidth = 2
  g.setLineDash([7, 5])
  for (const y of [11, 117]) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(1024, y)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** The engraving on Sonic's silver flower tag: brushed silver, his face in fine lines and "Sonic" below it. */
function tagTexture() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // brushed silver
  const grd = g.createLinearGradient(0, 0, S, S)
  grd.addColorStop(0, '#f2f3f4')
  grd.addColorStop(0.5, '#c9ccd0')
  grd.addColorStop(1, '#e6e8ea')
  g.fillStyle = grd
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,95,100'},${0.05 + Math.random() * 0.08})`
    g.beginPath()
    const y = Math.random() * S
    g.moveTo(0, y)
    g.lineTo(S, y + (Math.random() - 0.5) * 6)
    g.stroke()
  }
  // a dog's face, engraved (light etched lines)
  g.strokeStyle = 'rgba(70,64,52,0.75)'
  g.lineWidth = 3
  g.lineCap = 'round'
  const cx = 128, cy = 92
  g.beginPath()
  g.ellipse(cx, cy, 34, 30, 0, 0, Math.PI * 2) // head
  g.moveTo(cx - 30, cy - 14)
  g.quadraticCurveTo(cx - 52, cy - 4, cx - 44, cy + 22) // ear
  g.moveTo(cx + 30, cy - 14)
  g.quadraticCurveTo(cx + 52, cy - 4, cx + 44, cy + 22)
  g.stroke()
  g.fillStyle = 'rgba(70,64,52,0.8)'
  for (const x of [cx - 12, cx + 12]) {
    g.beginPath()
    g.arc(x, cy - 6, 3.5, 0, Math.PI * 2) // eyes
    g.fill()
  }
  g.beginPath()
  g.ellipse(cx, cy + 10, 8, 5.5, 0, 0, Math.PI * 2) // nose
  g.fill()
  g.beginPath()
  g.moveTo(cx, cy + 15)
  g.quadraticCurveTo(cx - 9, cy + 23, cx - 15, cy + 19)
  g.moveTo(cx, cy + 15)
  g.quadraticCurveTo(cx + 9, cy + 23, cx + 15, cy + 19)
  g.stroke()
  // the name
  g.fillStyle = 'rgba(58,52,42,0.9)'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = 'italic 600 46px "Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive'
  g.fillText('Sonic', cx, 172)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** A flower-shaped tag outline (six round petals), in 0..1 so its caps map the engraving straight on. */
function flowerShape() {
  const sh = new THREE.Shape()
  const petals = 6
  const N = 96
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2
    const r = 0.42 + 0.08 * Math.cos(petals * (a - Math.PI / 2))
    const x = 0.5 + Math.cos(a) * r
    const y = 0.5 + Math.sin(a) * r
    if (i === 0) sh.moveTo(x, y)
    else sh.lineTo(x, y)
  }
  return sh
}

/**
 * Sonic's tag as on his real collar: the exported gold bone tag becomes a brushed-silver flower tag with his face
 * and name engraved on the front, skinned to the same pendant bone (so it still swings) and the same size.
 */
function sonicTag(root: THREE.Object3D, mats: THREE.MeshStandardMaterial[]) {
  const parts: THREE.SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && /Sonic_Tag/i.test(o.name + ' ' + (o.parent?.name ?? ''))) parts.push(o as THREE.SkinnedMesh)
  })
  if (!parts.length) return
  const src = parts[0].geometry
  src.computeBoundingBox()
  const box = src.boundingBox!
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const d = Math.max(size.x, size.y) * 0.72
  const geo = new THREE.ExtrudeGeometry(flowerShape(), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 24 })
  // centre it, turn its engraved cap to the front (the tag faces -Z in the bind pose), size it and put it in place
  geo.translate(-0.5, -0.5, -0.0175)
  geo.rotateY(Math.PI)
  geo.scale(d, d, d)
  geo.translate(center.x, center.y, center.z)
  // every vertex rides the pendant bone, exactly as the old tag did
  const si = src.getAttribute('skinIndex') as THREE.BufferAttribute
  const swt = src.getAttribute('skinWeight') as THREE.BufferAttribute
  const n = geo.getAttribute('position').count
  const idx = new Uint16Array(n * 4)
  const wts = new Float32Array(n * 4)
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 4; k++) {
      idx[i * 4 + k] = si.getComponent(0, k)
      wts[i * 4 + k] = swt.getComponent(0, k)
    }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4))
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4))
  const silver = parts[0].material as THREE.MeshStandardMaterial
  silver.map = tagTexture()
  silver.color.set('#ffffff')
  // brushed silver that reads as silver even where nothing is around to reflect (menus, previews)
  silver.metalness = 0.55
  silver.roughness = 0.34
  silver.needsUpdate = true
  silver.userData.baseColor = silver.color.clone()
  parts[0].geometry = geo
  for (const p of parts.slice(1)) {
    p.visible = false
    const i = mats.indexOf(p.material as THREE.MeshStandardMaterial)
    if (i >= 0) mats.splice(i, 1)
  }
}

/**
 * Sonic's collar: the exported ring is widened into a proper round band and wrapped (cylindrical mapping around
 * the neck) in woven olive nylon webbing like his real collar. The tag (sonicTag) hangs on its pendant bone.
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
  // woven nylon: matte fabric with a soft thread sheen, no metal
  mesh.material = new THREE.MeshPhysicalMaterial({ name: 'SonicCollar', map, metalness: 0, roughness: 0.93, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color('#8a8566'), envMapIntensity: 0.4 } as THREE.MeshPhysicalMaterialParameters)
  old.dispose()
  const mat = mesh.material as THREE.MeshStandardMaterial
  // the frost / ghost effects tint from this
  mat.userData.baseColor = mat.color.clone()
  return mat
}

/** world-space fur length per coat (m); 0 = no fur shells (the elephant's skin) */
const FUR_LEN: Record<AnimalId, number> = { sonic: 0.009, leo: 0, raja: 0.014, shadow: 0.008, jax: 0.009, arctic: 0.024, bruno: 0.02, titan: 0, koda: 0.022, snow: 0.024, nova: 0.016, blaze: 0.009, zara: 0.012, ash: 0.024 }
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
function addFurShells(root: THREE.Object3D, animalId: AnimalId, fitScale: number, mats: THREE.MeshStandardMaterial[], shells = FUR_SHELLS) {
  const bodyLen = FUR_LEN[animalId]
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.furShell || Array.isArray(m.material)) return
    const mat = m.material as THREE.MeshStandardMaterial
    // only the coat: textured, not metal (collar, tag), not the tongue / eyes
    if (!mat.map || mat.metalness > 0.5 || /collar|tag|pendant|tongue|eye|teeth|claw/i.test(m.name + ' ' + mat.name)) return
    // the mane has its own hair cards: no shells on it
    if (!bodyLen || /mane/i.test(mat.name)) return
    meshes.push(m)
  })
  const ws = new THREE.Vector3()
  for (const m of meshes) {
    const src = m.material as THREE.MeshStandardMaterial
    const isMane = /mane/i.test(src.name)
    m.getWorldScale(ws)
    const objLen = (isMane ? MANE_LEN : bodyLen) / Math.max(1e-6, fitScale * ws.y)
    for (let i = 1; i <= shells; i++) {
      const k = i / shells
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
            // root self-shadow, and tips that catch a little more light; neighbouring strands differ slightly in tone
            float tone = texture2D(uFurTex, vMapUv * 7.0 + 0.53).r;
            diffuseColor.rgb *= mix(0.6, 1.1, uFurK * uFurK * (3.0 - 2.0 * uFurK)) * mix(0.95, 1.04, tone);`,
          )
        // a repainted species (or the mane): its coat first, then this layer's root darkening on top
        speciesCoat(sh, animalId, isMane ? MANE : undefined)
      }
      mat.customProgramCacheKey = () => (isMane ? 'wbfurshell-mane' : COATS[animalId] ? `wbfurshell-${animalId}` : 'wbfurshell')
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
  expression,
}: {
  animalId: AnimalId
  poseOf: () => WildPoseState
  castShadow?: boolean
  /** a paw touched the ground (world position, ground speed) — for dust */
  onStep?: (at: THREE.Vector3, speed: number) => void
  /** layered fur shells (only drawn on Ultra) */
  fur?: boolean
  /** the character screen's chosen facial expression (animals with a face rig); otherwise the game picks one */
  expression?: () => Expression | null
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
        // (a cornea is the one layer that must stay see-through)
        if (!mat.userData.cornea) {
          mat.transparent = false
          mat.depthWrite = true
          mat.opacity = 1
        }
        mat.userData.baseColor = mat.color.clone()
        mats.push(mat)
        return mat
      })
      m.material = Array.isArray(m.material) ? out : out[0]
      if (/raja\.glb$/.test(def.url) && !Array.isArray(m.material)) {
        // the tiger's cheek-fur tufts are alpha cards: cut them out instead of drawing their empty parts black
        ;(m.material as THREE.MeshStandardMaterial).alphaTest = 0.45
      }
      if (!Array.isArray(m.material) && /mane/i.test((m.material as THREE.Material).name) && (m.material as THREE.MeshStandardMaterial).map) {
        const mat = m.material as THREE.MeshStandardMaterial
        // the mane: hair cards (strand alpha, both sides) over a darker under-layer
        const cards = /manehair/i.test(mat.name)
        if (cards) {
          mat.alphaTest = 0.38
          mat.side = THREE.DoubleSide
        }
        mat.onBeforeCompile = (sh) => speciesCoat(sh, animalId, cards ? MANE : MANE + '\n    c *= mix(0.95, 0.5, back);')
        mat.customProgramCacheKey = () => (cards ? 'coat-mane' : 'coat-manebase')
        const sheen = (mat as THREE.MeshPhysicalMaterial).sheenColor
        if (sheen) sheen.set('#8a6a42')
      } else if (COATS[animalId] && !Array.isArray(m.material) && (m.material as THREE.MeshStandardMaterial).map) {
        const mat = m.material as THREE.MeshStandardMaterial
        mat.onBeforeCompile = (sh) => speciesCoat(sh, animalId)
        mat.customProgramCacheKey = () => `coat-${animalId}`
        const sheen = (mat as THREE.MeshPhysicalMaterial).sheenColor
        if (sheen && COAT_SHEEN[animalId]) sheen.set(COAT_SHEEN[animalId]!)
      }
      if (/collar/i.test(m.name) && !Array.isArray(m.material)) {
        // swap the collar's material in the blink / ghost list too
        const old = m.material as THREE.MeshStandardMaterial
        const now = sonicCollar(m, root)
        mats.splice(mats.indexOf(old), 1, now)
      }
    })
    if (animalId === 'sonic') sonicTag(root, mats)
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
      // a model's own start action (the lion's roar, the elephant's trumpet), scrubbed by the countdown
      intro: clip('Intro') ? mixer.clipAction(clip('Intro')!) : null,
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
    let fwdSign = 1
    root.traverse((o) => {
      if (!head && (o as THREE.Bone).isBone && /head/i.test(o.name) && !/end|top|nub/i.test(o.name)) head = o
    })
    if (head) {
      const hp = head.getWorldPosition(new THREE.Vector3()).sub(center)
      const forward = alongX ? hp.x : hp.z // the -90° yaw turns local +x into +Z
      if (forward < 0) yaw += Math.PI
      fwdSign = forward < 0 ? -1 : 1
    } else console.warn('WildAnimal: no head bone in', animalId)
    const rig = measureRig(root, mixer, actions.run, alongX, fwdSign)
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
    // layered fur: the full 12 layers on Ultra, 10 on High (only the runner and the preview ask for fur)
    const q = useSave.getState().settings.quality
    if (fur && (window as unknown as { __wbFur?: boolean }).__wbFur !== false && (q === 'ultra' || q === 'high')) addFurShells(root, animalId, scale, mats, q === 'ultra' ? FUR_SHELLS : 10)
    return { root, mats, mixer, actions, gait, strides: strides as Record<string, number> | null, paws, pendant: pendant as THREE.Bone | null, rig, face: AnimalFace.find(root), fit: { scale, yaw, lift: -tmpBox.min.y * scale, cx: center.x, cz: center.z } }
  }, [scene, animations, castShadow, def.height, def.yaw, animalId, fur])
  const { root, mats, mixer, actions, gait, strides, paws, pendant, rig, face, fit } = built
  // dev-only: the mounted runner's rig, for animation checks (an effect, so it is the copy React kept)
  useEffect(() => {
    if (!import.meta.env.DEV || !fur) return
    const w = window as unknown as { __wbRig?: Record<string, unknown> }
    w.__wbRig = { ...(w.__wbRig ?? {}), [animalId]: { feet: rig.feet, head: rig.head?.name, tail: rig.tail.length, vNative: rig.vNative, scale: fit.scale } }
  }, [rig, fur, animalId, fit.scale])
  // secondary motion state: lean, steer, steadied head, sprung tail, landing squash
  const sec = useRef({ prevX: NaN, vx: 0, ax: 0, lean: 0, steer: 0, tail: 0, tailV: 0, headQ: null as THREE.Quaternion | null, t: 0, prevPose: 'idle' as WildPose, landT: 9, deadT: 0, cued: false })
  // the idle life: where the animal is looking (a target it holds, then shifts to), an ear flick now and then
  const life = useRef({ next: 0.8 + Math.random() * 1.5, gy: 0, gp: 0, hy: 0, hp: 0, hyV: 0, hpV: 0, earT: 9, earNext: 2 + Math.random() * 4, earSide: 0, seed: Math.random() * 100, undo: new Map<THREE.Object3D, [THREE.Quaternion, THREE.Quaternion]>() })
  const lifeBones = useMemo(() => {
    let neck: THREE.Bone | null = null
    const ears: THREE.Bone[] = []
    root.traverse((o) => {
      const b = o as THREE.Bone
      if (!b.isBone) return
      if (!neck && /neck/i.test(b.name) && !/end|nub|top/i.test(b.name)) neck = b
      // the root bone of each ear only (its children follow)
      if (/ear/i.test(b.name) && !/end|nub|top|tip|year|bear|gear|rear/i.test(b.name) && !(b.parent && /ear/i.test(b.parent.name))) ears.push(b)
    })
    return { neck: neck as THREE.Bone | null, ears: ears.slice(0, 2) }
  }, [root])
  // the daze after a crash: three stars circling over the head
  const stars = useMemo(() => {
    const grp = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false, toneMapped: false }))
      sp.scale.setScalar(def.height * 0.14)
      grp.add(sp)
    }
    grp.visible = false
    return grp
  }, [def.height])

  const current = useRef<WildPose | 'intro' | null>(null)
  useEffect(() => {
    current.current = null
    return () => void mixer.stopAllAction()
  }, [mixer])
  const squash = useRef(0)
  const shapeBones = useRef<{ root: THREE.Object3D; list: [THREE.Object3D, [number, number, number]][] } | null>(null)
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
      sp.rotation.x = pose === 'roll' ? -Math.PI * 2 * st.t : pose === 'jump' ? -0.24 * Math.sin(2 * Math.PI * Math.min(1, st.t)) : 0
      sp.rotation.z = fall.current * (Math.PI / 2.3)
      sp.position.y = pose === 'roll' ? def.height * 0.25 : 0
      // a model without a skeleton or clips can't move its legs: give the whole body a bounding gallop instead
      // (a bounce per stride and a fore-aft rock, in time with the ground speed)
      if (!actions.run && !actions.idle && pose === 'run') {
        const c = ctl.current
        c.phase = (c.phase + dt * Math.min(3.2, Math.max(0.6, st.speed / 3.4))) % 1
        const w = Math.sin(c.phase * 2 * Math.PI)
        g.position.y += def.height * 0.05 * Math.abs(w)
        sp.rotation.x += 0.075 * w
      }
    }
    secondary(st, dt, g, sp)
    // a living face: expressions, blinking, panting, ears (models with a face rig)
    face?.update({ pose, speed: st.speed, howl: INTRO[animalId] === 'howl' ? st.intro : undefined, expression: expression?.() ?? null }, dt)
    const ghost = st.ghost ?? 0
    for (const m of mats) {
      if (m.userData.cornea) continue
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

  /**
   * Life on top of the clips, every animal: lean into lane changes and turn toward the new lane, a head held steady
   * while the body gallops under it, a tail that trails and swings with the motion, breathing at rest and a
   * squash on landing. Applied after the mixer each frame, so nothing accumulates.
   */
  function secondary(st: WildPoseState, dt: number, g: THREE.Group, sp: THREE.Group) {
    if (dt <= 0) return
    const c = sec.current
    const pose = st.pose
    c.t += dt
    sp.getWorldPosition(tmpV)
    const vx = Number.isNaN(c.prevX) ? 0 : (tmpV.x - c.prevX) / dt
    c.ax += ((vx - c.vx) / dt - c.ax) * Math.min(1, dt * 12)
    c.vx = vx
    c.prevX = tmpV.x
    const moving = pose === 'run' || pose === 'jump' || pose === 'slide'
    const leanT = moving ? THREE.MathUtils.clamp(-c.ax * 0.011, -0.2, 0.2) : 0
    const steerT = moving ? THREE.MathUtils.clamp(c.vx * 0.045, -0.28, 0.28) : 0
    c.lean += (leanT - c.lean) * Math.min(1, dt * 9)
    c.steer += (steerT - c.steer) * Math.min(1, dt * 7)
    g.rotation.set(0, c.steer, c.lean)
    // landing squash (animals with a Land clip absorb it in the clip)
    if (c.prevPose === 'jump' && pose === 'run') c.landT = 0
    c.prevPose = pose
    c.landT += dt
    if (!gait && c.landT < 0.24) {
      const k = 1 - c.landT / 0.24
      g.scale.y *= 1 - 0.1 * k
      g.scale.x *= 1 + 0.04 * k
      g.scale.z *= 1 + 0.05 * k
    }
    if (pose === 'idle' || pose === 'victory') {
      // breathing: the ribcage fills (wider and a touch taller), slow like a big animal at rest
      const br = Math.sin(c.t * 1.75)
      g.scale.y *= 1 + 0.011 * br
      g.scale.x *= 1 + 0.009 * Math.max(0, br)
      // weight shifting from one side to the other, never perfectly still
      sp.rotation.z += 0.014 * Math.sin(c.t * 0.41 + life.current.seed) + 0.006 * Math.sin(c.t * 1.13 + life.current.seed * 2)
    }

    // ---- start action on the start line (countdown)
    const u = pose === 'idle' && st.intro !== undefined ? st.intro : -1
    let yaw = 0, pitch = 0, lift = 0, fwdOff = 0, squashY = 1, headPitch = 0, tailExtra = 0
    if (u >= 0) {
      const ss = (a: number, b: number) => smooth(a, b, u)
      const bump = (a: number, b: number) => Math.max(0, Math.sin(Math.PI * THREE.MathUtils.clamp((u - a) / (b - a), 0, 1)))
      const kind = INTRO[animalId]
      if (u < 0.05) c.cued = false
      const clipIntro = !!actions.intro
      if (clipIntro) {
        // the model performs its own start action; the roar / trumpet sound and the shake still land on the beat
        if (fur && u >= 0.35 && !c.cued) {
          c.cued = true
          if (kind === 'roar') sfx.roar()
          else sfx.smash()
          runState.shake = Math.max(runState.shake, 0.6)
        }
      } else if (kind === 'turn') {
        yaw = 2 * Math.PI * ss(0.05, 0.6)
        lift = 0.07 * bump(0.62, 0.8)
        tailExtra = 0.45 * Math.sin(c.t * 16)
      } else if (kind === 'roar') {
        const crouch = ss(0, 0.25) * (1 - ss(0.3, 0.4))
        const roar = ss(0.3, 0.42) * (1 - ss(0.8, 0.95))
        squashY = 1 - 0.08 * crouch
        fwdOff = -0.08 * crouch + 0.1 * roar
        pitch = 0.06 * crouch - 0.16 * roar
        headPitch = 0.15 * crouch - 0.5 * roar
        tailExtra = 0.3 * roar * Math.sin(c.t * 9)
        if (fur && u >= 0.32 && !c.cued) {
          c.cued = true
          sfx.roar()
          runState.shake = Math.max(runState.shake, 0.6)
        }
      } else if (kind === 'howl') {
        const h = ss(0.1, 0.3) * (1 - ss(0.85, 0.98))
        pitch = -0.14 * h
        headPitch = -0.85 * h
        squashY = 1 - 0.04 * h
      } else if (kind === 'crouch') {
        const k = ss(0, 0.3) * (1 - ss(0.65, 0.75))
        const spring = bump(0.68, 0.88)
        squashY = 1 - 0.14 * k
        headPitch = 0.25 * k
        lift = 0.09 * spring
        pitch = -0.14 * spring
        fwdOff = 0.08 * spring
        tailExtra = 0.5 * k * Math.sin(c.t * 6)
      } else if (kind === 'stomp') {
        const r = ss(0.1, 0.42) * (1 - ss(0.45, 0.52))
        pitch = -0.42 * r
        lift = 0.1 * r
        if (fur && u >= 0.5 && !c.cued) {
          c.cued = true
          sfx.smash()
          runState.shake = Math.max(runState.shake, 0.8)
        }
      } else if (kind === 'hop') {
        lift = u < 0.7 ? 0.12 * Math.abs(Math.sin((Math.PI * 2 * u) / 0.7)) : 0
      }
    }

    // ---- crash: a shiver, the head sinks to the ground, the tail goes limp, slow heavy breaths, stars circle
    if (pose === 'dead' && c.prevPose !== 'dead') c.deadT = 0
    const dead = pose === 'dead'
    if (dead) {
      c.deadT += dt
      sp.position.x += Math.sin(c.deadT * 55) * 0.012 * def.height * Math.exp(-c.deadT * 3.5)
      headPitch += 0.55 * smooth(0.3, 1.1, c.deadT)
      g.scale.y *= 1 + 0.025 * Math.sin(c.deadT * 2.6) * smooth(0.8, 1.4, c.deadT)
    }
    sp.rotation.y = yaw
    sp.rotation.x += pitch
    g.position.y += lift * def.height
    g.position.z = fwdOff * def.height
    g.scale.y *= squashY
    g.updateMatrixWorld(true)
    // steady head: real runners keep the eyes level while the spine pumps
    const head = rig.head
    if (head?.parent && moving) {
      head.getWorldQuaternion(tmpQ)
      if (!c.headQ) c.headQ = tmpQ.clone()
      else c.headQ.slerp(tmpQ, Math.min(1, dt * 5))
      tmpQ2.copy(tmpQ).slerp(c.headQ, 0.55)
      head.parent.getWorldQuaternion(tmpQ3)
      head.quaternion.copy(tmpQ3.invert().multiply(tmpQ2))
      head.updateMatrixWorld(true)
    } else if (!moving) c.headQ = null
    if (head?.parent && (headPitch || rig.headRest)) {
      if (rig.headRest) head.quaternion.copy(rig.headRest)
      if (headPitch) rotateWorld(head, RIGHT, headPitch)
      head.updateMatrixWorld(true)
    }
    idleLife(pose, u, dt, head)
    // (the cartoon daze stars are retired: a realistic crash is the fall, the shiver and the laboured breathing)
    stars.visible = false
    if (stars.visible) {
      const center = new THREE.Vector3()
      if (head) head.getWorldPosition(center)
      else g.getWorldPosition(center).add(new THREE.Vector3(0, def.height, 0))
      center.y += def.height * 0.3
      stars.children.forEach((star, k) => {
        const a = c.t * 3.2 + (k * Math.PI * 2) / 3
        const wp = center.clone().add(new THREE.Vector3(Math.cos(a) * def.height * 0.2, Math.sin(a * 2) * def.height * 0.03, Math.sin(a) * def.height * 0.2))
        star.position.copy(sp.worldToLocal(wp))
        ;(star as THREE.Sprite).material.opacity = 0.75 + 0.25 * Math.sin(c.t * 9 + k)
      })
    }
    // tail: a damped spring pushed by the sideways acceleration, plus a swing with the stride
    if (rig.tail.length) {
      const w = 2 * Math.PI * 1.5
      c.tailV += (-w * w * c.tail - 2 * 0.28 * w * c.tailV - c.ax * 0.025) * dt
      c.tail = THREE.MathUtils.clamp(c.tail + c.tailV * dt, -0.6, 0.6)
      const sway = dead ? 0 : (moving ? 0.13 : 0.06) * Math.sin(c.t * (moving ? 7 : 1.6)) + tailExtra
      if (dead) c.tail *= Math.exp(-dt * 3)
      const n = rig.tail.length
      rig.tail.forEach((b, i) => {
        const rest = rig.tailRest[i]
        if (rest) b.quaternion.copy(rest)
      })
      // a slimmer tail: the chain's bones run along local X, so narrow the root across Y/Z and the rest inherit it
      if (def.tailThin) rig.tail[0].scale.set(1, def.tailThin, def.tailThin)
      rig.tail.forEach((b, i) => rotateWorld(b, UP, (c.tail + sway * (0.5 + i / n)) * (1.4 / n) * (0.6 + i / n)))
    }
    // species reshaping of a shared body (after the mixer, so clips never undo it)
    if (def.shape) {
      if (shapeBones.current?.root !== root) {
        const list: [THREE.Object3D, [number, number, number]][] = []
        const want = new Map(Object.entries(def.shape).map(([n, sc]) => [boneKey(n), sc] as const))
        root.traverse((o) => {
          const sc = (o as THREE.Bone).isBone ? want.get(boneKey(o.name)) : undefined
          if (sc) list.push([o, sc])
        })
        shapeBones.current = { root, list }
      }
      for (const [b, sc] of shapeBones.current.list) b.scale.set(sc[0], sc[1], sc[2])
    }
  }

  /**
   * Idle life for every animal standing still: it looks around (holds a gaze for a few seconds, then turns its head
   * to a new point with a quick, damped move, the neck carrying part of it), and flicks an ear now and then.
   * Bones the clips don't drive are restored before each frame's offsets, so nothing accumulates.
   */
  function idleLife(pose: WildPose, u: number, dt: number, head: THREE.Bone | null) {
    const L = life.current
    // undo last frame's offsets on bones nothing else reset (the mixer overwrites the ones it drives)
    for (const [b, [before, after]] of L.undo) if (b.quaternion.equals(after)) b.quaternion.copy(before)
    L.undo.clear()
    const calm = (pose === 'idle' || pose === 'victory') && u < 0
    // choose a new point of interest after a hold; mostly small glances, sometimes a real turn
    L.next -= dt
    if (calm && L.next <= 0) {
      const big = Math.random() < 0.3
      L.gy = (Math.random() * 2 - 1) * (big ? 0.55 : 0.22)
      L.gp = (Math.random() * 2 - 1) * 0.1 + (Math.random() < 0.15 ? 0.22 : 0)
      L.next = 1.2 + Math.random() * 3.2
    }
    if (!calm) {
      L.gy = 0
      L.gp = 0
    }
    // a critically damped spring: quick start, soft arrival, like a real head turn
    const w = calm ? 7 : 10
    L.hyV += (w * w * (L.gy - L.hy) - 2 * w * L.hyV) * dt
    L.hpV += (w * w * (L.gp - L.hp) - 2 * w * L.hpV) * dt
    L.hy += L.hyV * dt
    L.hp += L.hpV * dt
    const apply = (b: THREE.Object3D | null, yaw: number, pitch: number) => {
      if (!b?.parent || (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4)) return
      const before = b.quaternion.clone()
      rotateWorld(b, UP, yaw)
      rotateWorld(b, RIGHT, pitch)
      b.updateMatrixWorld(true)
      L.undo.set(b, [before, b.quaternion.clone()])
    }
    if (Math.abs(L.hy) > 1e-4 || Math.abs(L.hp) > 1e-4) {
      const neck = lifeBones.neck && lifeBones.neck !== head ? lifeBones.neck : null
      apply(neck, L.hy * 0.4, L.hp * 0.35)
      apply(head, L.hy * (neck ? 0.6 : 1), L.hp * (neck ? 0.65 : 1))
    }
    // an ear flick (models with a face rig move their ears through it instead)
    if (!face && lifeBones.ears.length) {
      L.earNext -= dt
      if (calm && L.earNext <= 0) {
        L.earT = 0
        L.earSide = Math.random() < 0.5 ? 0 : 1
        L.earNext = 2.5 + Math.random() * 5
      }
      L.earT += dt
      const e = L.earT < 0.28 ? Math.sin((Math.PI * L.earT) / 0.28) : 0
      const ear = lifeBones.ears[L.earSide] ?? lifeBones.ears[0]
      if (e > 0 && ear) {
        const before = ear.quaternion.clone()
        ear.rotateX(-0.32 * e)
        ear.rotateZ((L.earSide ? 1 : -1) * 0.14 * e)
        L.undo.set(ear, [before, ear.quaternion.clone()])
      }
    }
  }

  /** Older animals: one gallop clip, rate from speed. */
  function driveSimple(st: WildPoseState, dt: number) {
    const pose = st.pose
    const intro = actions.intro
    if (intro && pose === 'idle' && st.intro !== undefined) {
      // the start action: the model's own clip, held at the countdown's progress
      if (current.current !== 'intro') {
        for (const a of [actions.run, actions.idle, actions.jump, actions.dead]) if (a?.isRunning()) a.fadeOut(0.2)
        intro.reset().setLoop(THREE.LoopOnce, 1)
        intro.clampWhenFinished = true
        intro.fadeIn(0.2).play()
        current.current = 'intro'
      }
      intro.timeScale = 0
      intro.time = Math.min(1, st.intro) * intro.getClip().duration * 0.999
      mixer.update(dt)
      return
    }
    if (intro && current.current === 'intro') {
      intro.fadeOut(0.25)
      current.current = null
    }
    const still = pose === 'idle' || pose === 'victory'
    // no Idle clip: stand on the gallop's most grounded frame (a slow-motion gallop on the spot read as a statue
    // shuffling); the procedural idle in secondary() brings it to life
    const standOnGallop = still && (def.standFromGallop || !actions.idle) && actions.run
    if (pose !== current.current) {
      const want = standOnGallop ? actions.run : still ? (actions.idle ?? actions.run) : pose === 'jump' ? (actions.jump ?? actions.run) : pose === 'dead' ? (actions.dead ?? null) : actions.run
      for (const a of [actions.run, actions.idle, actions.jump, actions.dead]) if (a && a !== want && a.isRunning()) a.fadeOut(0.15)
      if (want) {
        if (pose === 'jump' || pose === 'dead' || !want.isRunning()) want.reset()
        want.fadeIn(current.current ? 0.15 : 0).play()
      }
      current.current = pose
    }
    const run = actions.run
    if (run) {
      let rate = Math.max(0.7, (st.speed / 9) * def.runRate)
      // paws locked to the trail: the clip plays at the speed its planted paws sweep back at (measured on load);
      // a measurement far from the hand-tuned rate is ignored
      if (def.lock !== false && rig.vNative && pose === 'run' && !(import.meta.env.DEV && (window as unknown as { __wbNoLock?: boolean }).__wbNoLock)) {
        const locked = st.speed / (rig.vNative * fit.scale)
        if (locked > rate * 0.4 && locked < rate * 2.5) rate = Math.min(3.2, Math.max(0.35, locked))
      }
      if (pose === 'run' && def.cadence) rate *= def.cadence
      // no jump clip: the legs gather and hang through the flight instead of galloping on thin air
      if (import.meta.env.DEV && fur && pose === 'run') {
        const w = window as unknown as { __wbRate?: Record<string, unknown> }
        w.__wbRate = { ...(w.__wbRate ?? {}), [animalId]: { old: +Math.max(0.7, (st.speed / 9) * def.runRate).toFixed(2), used: +rate.toFixed(2), locked: rig.vNative ? +(st.speed / (rig.vNative * fit.scale)).toFixed(2) : null } }
      }
      if (pose === 'jump' && !actions.jump) rate = 0.25
      run.timeScale = (pose === 'idle' || pose === 'victory') && !actions.idle ? 0.12 : rate
      if (standOnGallop) {
        run.timeScale = 0
        run.time = rig.standT
      }
    }
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
      <primitive object={stars} />
      <group ref={body}>
        <group rotation={[0, fit.yaw, 0]}>
          <primitive object={root} position={[-fit.cx, 0, -fit.cz]} />
        </group>
      </group>
    </group>
  )
}
