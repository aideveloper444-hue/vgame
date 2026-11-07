import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { RoundedBoxGeometry, SkeletonUtils } from 'three-stdlib'
import type { GLTF } from 'three-stdlib'
import { applyRimLight } from '@/games/shared/three/protagonistAssets'
import { COLOR_GLOW, type LudoColor } from './ludoBoardLayout'
import { makeBreastplate, makeCape, makeHeadGear, makeLimbGuard, makePauldron, type HeroLandmarks } from './ludoHeroGear'

// Quaternius CC0 casual characters (see public/models/ludo/humans/LICENSE.txt): a hoodie guy, a casual
// guy and two women. All four share one 62-bone "CharacterArmature" skeleton and the same 24 clips, so
// any team can play any clip from any of the files.
const HUMANS = '/models/ludo/humans/'
const URL = {
  hoodie: `${HUMANS}red-hoodie.glb`,
  casual: `${HUMANS}green-casual.glb`,
  woman: `${HUMANS}yellow-casual.glb`,
  dress: `${HUMANS}blue-dress.glb`,
} as const
type Outfit = keyof typeof URL

export const CHARACTER_URLS: string[] = Object.values(URL)

type Build = 'female' | 'male'

/** Which outfit each team wears, and the material in that file that is the outfit's main garment. */
const TEAM_OUTFIT: Record<LudoColor, Outfit> = {
  RED: 'hoodie',
  GREEN: 'hoodie',
  YELLOW: 'casual',
  BLUE: 'woman',
  PURPLE: 'dress',
  ORANGE: 'casual',
  CYAN: 'hoodie',
  PINK: 'woman',
}
const GARMENT: Record<Outfit, string> = { hoodie: 'Purple', casual: 'LightBrown', woman: 'White', dress: 'LimeGreen' }

/** Deep, saturated garment colors — bright tints read as pastel under the board's glow. */
const GARMENT_COLOR: Record<LudoColor, string> = {
  RED: '#b3101e',
  GREEN: '#0c7d27',
  YELLOW: '#e3a300',
  BLUE: '#1238b3',
  PURPLE: '#5a1aa8',
  ORANGE: '#c45200',
  CYAN: '#04788a',
  PINK: '#b0126a',
}

/** Recolors that turn the woman model into the dark-haired, dark-jeans look; keyed by source material name. */
const WOMAN_RECOLOR: Record<string, string> = { Hair_Blond: '#24130a', Hair_Brown: '#24130a', Orange: '#141c33' }

export const TEAM_BUILD: Record<LudoColor, Build> = {
  RED: 'male',
  GREEN: 'male',
  YELLOW: 'male',
  BLUE: 'female',
  PURPLE: 'female',
  ORANGE: 'male',
  CYAN: 'male',
  PINK: 'female',
}

/** Display height of a character in world units (a board cell is 0.62). */
export const CHARACTER_HEIGHT = 1.42

export const CLIP = {
  idle: 'CharacterArmature|Idle',
  idleAlt: 'CharacterArmature|Idle_Neutral',
  run: 'CharacterArmature|Run',
  attack: 'CharacterArmature|Punch_Right',
  hit: 'CharacterArmature|HitRecieve',
  death: 'CharacterArmature|Death',
  celebrate: 'CharacterArmature|Wave',
  ready: 'CharacterArmature|Idle_Neutral',
} as const

export const HAND_BONE = 'Wrist.R'

export function useHeroAssets(): GLTF[] {
  return useGLTF(CHARACTER_URLS) as unknown as GLTF[]
}

function gltfFor(assets: GLTF[], outfit: Outfit): GLTF {
  return assets[CHARACTER_URLS.indexOf(URL[outfit])]
}

/** A team's clips, taken from its own model: the rigs share bone names but not rest orientations. */
export function heroAnimations(assets: GLTF[], color: LudoColor = 'RED'): THREE.AnimationClip[] {
  return gltfFor(assets, TEAM_OUTFIT[color]).animations
}

// ---------- materials ----------

const materialCache = new Map<string, THREE.Material>()

function heroMaterial(color: LudoColor, outfit: Outfit, source: THREE.Material): THREE.Material {
  const key = `${color}:${outfit}:${source.uuid}`
  const hit = materialCache.get(key)
  if (hit) return hit
  const mat = (source as THREE.MeshStandardMaterial).clone()
  mat.envMapIntensity = 1.35
  const recolor = outfit === 'woman' ? WOMAN_RECOLOR[source.name] : undefined
  if (source.name === GARMENT[outfit]) {
    const team = new THREE.Color(GARMENT_COLOR[color])
    mat.color = team
    mat.roughness = 0.5
    mat.emissive = team.clone()
    mat.emissiveIntensity = 0.08
    applyRimLight(mat, COLOR_GLOW[color], 0.25)
  } else if (recolor) {
    mat.color = new THREE.Color(recolor)
    mat.roughness = 0.55
    mat.emissive = new THREE.Color('#000000')
    applyRimLight(mat, COLOR_GLOW[color], 0.15)
  } else {
    // the files ship very dark albedos; lift them so faces and jeans don't turn to silhouettes
    mat.color = mat.color.clone().multiplyScalar(1.6)
    mat.emissive = mat.color.clone()
    mat.emissiveIntensity = 0.1
    applyRimLight(mat, COLOR_GLOW[color], 0.3)
  }
  materialCache.set(key, mat)
  return mat
}

// ---------- accessories ----------

// Rest-pose landmarks of both models, in model space (metres, +Y up, +Z forward): chest height,
// the back of the torso at that height, and the back of the head.
const LANDMARK: Record<Outfit, { chestY: number; backZ: number; headY: number; headBackZ: number }> = {
  hoodie: { chestY: 1.347, backZ: -0.057, headY: 1.556, headBackZ: -0.027 },
  casual: { chestY: 1.347, backZ: -0.057, headY: 1.556, headBackZ: -0.027 },
  woman: { chestY: 1.34, backZ: -0.018, headY: 1.548, headBackZ: -0.047 },
  dress: { chestY: 1.34, backZ: -0.018, headY: 1.548, headBackZ: -0.047 },
}

let accessoryMats: { bag: THREE.Material; pocket: THREE.Material; strap: THREE.Material; hair: THREE.Material } | null = null
function accessoryMaterials() {
  accessoryMats ??= {
    bag: new THREE.MeshStandardMaterial({ color: '#2b2c31', roughness: 0.72, metalness: 0 }),
    pocket: new THREE.MeshStandardMaterial({ color: '#3d3f46', roughness: 0.66, metalness: 0 }),
    strap: new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.8, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ color: '#24130a', roughness: 0.42, metalness: 0.05 }),
  }
  return accessoryMats
}

function box(w: number, h: number, d: number, r: number, mat: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** Long dark hair falling from the crown past the shoulders, with a lock at each side of the face. */
function makeLongHair(outfit: Outfit) {
  const { headY, headBackZ } = LANDMARK[outfit]
  const m = accessoryMaterials()
  const g = new THREE.Group()
  g.add(box(0.22, 0.34, 0.08, 0.04, m.hair, 0, headY + 0.06, headBackZ - 0.02))
  for (const sx of [-1, 1]) g.add(box(0.05, 0.24, 0.07, 0.024, m.hair, sx * 0.11, headY + 0.04, headBackZ + 0.06))
  return g
}

/** Parents an accessory built in model space to a bone, keeping it where it was in the rest pose. */
function attachToBone(root: THREE.Object3D, bone: THREE.Object3D | undefined, accessory: THREE.Object3D) {
  if (!bone) return
  root.updateMatrixWorld(true)
  accessory.applyMatrix4(bone.matrixWorld.clone().invert().multiply(root.matrixWorld))
  bone.add(accessory)
}

// ---------- assembly ----------

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh)
  })
  return out
}

const heightCache = new Map<Outfit, number>()

export interface Hero {
  root: THREE.Group
  /** Uniform scale that makes the hero stand CHARACTER_HEIGHT tall. */
  scale: number
  hand: THREE.Bone | null
}

/** A fresh, team-tinted copy of the team's character with its own skeleton. */
export function buildHero(color: LudoColor, assets: GLTF[]): Hero {
  const outfit = TEAM_OUTFIT[color]
  const source = gltfFor(assets, outfit)
  const root = SkeletonUtils.clone(source.scene) as THREE.Group
  let hand: THREE.Bone | null = null
  let chest: THREE.Object3D | undefined
  let head: THREE.Object3D | undefined
  let armL: THREE.Object3D | undefined
  let armR: THREE.Object3D | undefined
  const limbs: Record<string, THREE.Object3D> = {}
  root.traverse((o) => {
    if (/^(LowerArm|Wrist|LowerLeg|Foot)\.[LR]$/.test(o.name)) limbs[o.name] = o
    if ((o as THREE.Bone).isBone && o.name === HAND_BONE) hand = o as THREE.Bone
    if (o.name === 'Chest') chest = o
    if (o.name === 'Head') head = o
    if (o.name === 'UpperArm.L') armL = o
    if (o.name === 'UpperArm.R') armR = o
  })
  // hero gear, placed from the rest-pose bone positions so it fits either body
  root.updateMatrixWorld(true)
  const toModel = root.matrixWorld.clone().invert()
  const at = (o: THREE.Object3D | undefined, fallback: [number, number, number]) =>
    o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel) : new THREE.Vector3(...fallback)
  const { chestY, backZ, headY } = LANDMARK[outfit]
  const lm: HeroLandmarks = {
    shoulderL: at(armL, [0.18, chestY + 0.08, 0.02]),
    shoulderR: at(armR, [-0.18, chestY + 0.08, 0.02]),
    head: at(head, [0, headY, 0]),
    chest: at(chest, [0, chestY, 0.02]),
    backZ,
  }
  const cape = makeCape(color, lm)
  if (cape) attachToBone(root, chest, cape)
  attachToBone(root, chest, makeBreastplate(color, lm))
  attachToBone(root, armL, makePauldron(color, lm.shoulderL, lm.shoulderL.x >= 0 ? 1 : -1))
  attachToBone(root, armR, makePauldron(color, lm.shoulderR, lm.shoulderR.x >= 0 ? 1 : -1))
  // forearm and shin guards so every piece reads as an armoured warrior
  for (const side of ['L', 'R']) {
    for (const [joint, end, radius] of [['LowerArm', 'Wrist', 0.042], ['LowerLeg', 'Foot', 0.058]] as const) {
      const a = limbs[`${joint}.${side}`]
      const b = limbs[`${end}.${side}`]
      if (a && b) attachToBone(root, a, makeLimbGuard(color, at(a, [0, 0, 0]), at(b, [0, 0, 0]), radius))
    }
  }
  const headGear = makeHeadGear(color, lm)
  if (headGear) attachToBone(root, head, headGear)
  if (outfit === 'woman' || outfit === 'dress') attachToBone(root, head, makeLongHair(outfit))
  for (const mesh of skinnedMeshes(root)) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => heroMaterial(color, outfit, m)) : heroMaterial(color, outfit, mesh.material)
  }
  let height = heightCache.get(outfit)
  if (height === undefined) {
    height = new THREE.Box3().setFromObject(source.scene).getSize(new THREE.Vector3()).y
    heightCache.set(outfit, height)
  }
  return { root, scale: CHARACTER_HEIGHT / Math.max(0.001, height), hand }
}

export function preloadCharacters() {
  for (const url of CHARACTER_URLS) useGLTF.preload(url)
}
