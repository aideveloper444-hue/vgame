import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import type { GLTF } from 'three-stdlib'
import { applyRimLight } from '@/games/shared/three/protagonistAssets'
import { COLOR_GLOW, type LudoColor } from './ludoBoardLayout'
import { carriesShield, makeArmShield, makeBoot, makeKnightGuard, makeKnightKit, makeVanguardGuard, makeVanguardKit, type HeroLandmarks } from './ludoHeroGear'
import type { CharacterStyleId } from './ludoThemes'

// Realistic-proportioned fantasy rangers by Quaternius (CC0, see public/models/ludo/heroes/LICENSE.txt):
// Universal Base Characters wearing the Modular Fantasy ranger outfit (hood, pauldron, bracers, belts,
// boots) with PBR textures, animated by the Universal Animation Library. These replaced the chunky
// low-poly casual figures, which read as toys. Both bodies share the Unreal-style skeleton the clips use.
const HEROES = '/models/ludo/heroes/'
const URL = {
  male: `${HEROES}ranger-male.glb`,
  female: `${HEROES}ranger-female.glb`,
  anims: `${HEROES}anims.glb`,
  // the same realistic bodies in a fitted bodysuit: the base for the Vanguard and Knight styles
  baseMale: `${HEROES}base-male.glb`,
  baseFemale: `${HEROES}base-female.glb`,
} as const

export const CHARACTER_URLS: string[] = [URL.male, URL.female, URL.anims, URL.baseMale, URL.baseFemale]

type Build = 'female' | 'male'

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

/** Team dye for the ranger's leather and cloth: deep, so the outfit keeps its texture detail. */
const OUTFIT_DYE: Record<LudoColor, string> = {
  RED: '#c4283a',
  GREEN: '#2f9a4a',
  YELLOW: '#e0b040',
  BLUE: '#3c63d8',
  PURPLE: '#7a46c8',
  ORANGE: '#d8742a',
  CYAN: '#2aa6b8',
  PINK: '#cc3c8c',
}

/** Display height of a character in world units (a board cell is about 0.64). */
export const CHARACTER_HEIGHT = 1.42

export const CLIP = {
  idle: 'Idle_Loop',
  idleAlt: 'Idle_Talking_Loop',
  run: 'Jog_Fwd_Loop',
  attack: 'Sword_Attack',
  hit: 'Hit_Chest',
  death: 'Death01',
  celebrate: 'Dance_Loop',
  ready: 'Sword_Idle',
} as const

export const HAND_BONE = 'hand_r'

export function useHeroAssets(): GLTF[] {
  return useGLTF(CHARACTER_URLS) as unknown as GLTF[]
}

/** Ranger and Shadow wear the ranger outfit; Vanguard and Knight start from the bodysuit. */
function bodyUrl(color: LudoColor, style: CharacterStyleId): string {
  const female = TEAM_BUILD[color] === 'female'
  if (style === 'vanguard' || style === 'knight') return female ? URL.baseFemale : URL.baseMale
  return female ? URL.female : URL.male
}

function bodyFor(assets: GLTF[], color: LudoColor, style: CharacterStyleId): GLTF {
  return assets[CHARACTER_URLS.indexOf(bodyUrl(color, style))]
}

let clipCache: THREE.AnimationClip[] | null = null
/**
 * The shared animation clips. The jog's root bone travels forward; the board moves the warrior itself,
 * so the root's position track is dropped to keep the character in place on its cell.
 */
export function heroAnimations(assets: GLTF[], _color: LudoColor = 'RED'): THREE.AnimationClip[] {
  void _color
  clipCache ??= assets[CHARACTER_URLS.indexOf(URL.anims)].animations.map((clip) => {
    const c = clip.clone()
    c.tracks = c.tracks.filter((t) => t.name !== 'root.position')
    return c
  })
  return clipCache
}

// ---------- materials ----------

const materialCache = new Map<string, THREE.Material>()

/**
 * Dyes a textured garment: the texture's brightness becomes grey detail that `hex` is multiplied over, so
 * grain, stitching and shading survive while the colour is entirely the dye's.
 */
function dye(mat: THREE.MeshStandardMaterial, hex: string, rimColor: string, rimStrength: number, lift = 2.6) {
  mat.color = new THREE.Color(hex)
  applyRimLight(mat, rimColor, rimStrength)
  const rim = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    rim(shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        float dyeLum = dot( sampledDiffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
        diffuseColor.rgb *= mix( sampledDiffuseColor.rgb, vec3( min( 1.0, dyeLum * ${lift.toFixed(2)} ) ), 0.88 );
        diffuseColor.a *= sampledDiffuseColor.a;
      #endif`,
    )
  }
  const rimKey = mat.customProgramCacheKey
  mat.customProgramCacheKey = () => `dye-${lift}-${rimKey()}`
}

function heroMaterial(color: LudoColor, source: THREE.Material, style: CharacterStyleId): THREE.Material {
  const key = `${color}:${style}:${source.uuid}`
  const hit = materialCache.get(key)
  if (hit) return hit
  const mat = (source as THREE.MeshStandardMaterial).clone()
  mat.envMapIntensity = 1
  // the board camera sees the warriors at a slant: strong anisotropic filtering keeps leather, stitching
  // and armour crisp instead of smearing into mip blur
  for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]) {
    if (tex) tex.anisotropy = 8
  }
  const std = mat as THREE.MeshStandardMaterial
  if (/Ranger/i.test(source.name)) {
    if (style === 'shadow') {
      // near-black leather; the team shows only as a strong glowing edge light
      dye(std, '#2a2a34', COLOR_GLOW[color], 0.75, 2.2)
      std.roughness = Math.min(std.roughness, 0.55)
    } else {
      // team-dyed leather and cloth
      dye(std, OUTFIT_DYE[color], COLOR_GLOW[color], 0.18)
    }
  } else if (/Superhero/i.test(source.name)) {
    if (style === 'knight') {
      // charcoal undersuit beneath the plate armour
      dye(std, '#3a3d48', COLOR_GLOW[color], 0.12, 2.2)
    } else {
      // Vanguard: a dark tactical undersuit; the team colour is on the armour plates over it
      dye(std, '#2c3140', COLOR_GLOW[color], 0.16, 2.2)
      std.roughness = 0.5
    }
  } else {
    // skin and face: untouched textures, only a faint team rim so the figure separates from the board
    applyRimLight(mat, COLOR_GLOW[color], 0.08)
  }
  materialCache.set(key, mat)
  return mat
}

// ---------- accessories ----------

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

const heightCache = new Map<string, number>()

export interface Hero {
  root: THREE.Group
  /** Uniform scale that makes the hero stand CHARACTER_HEIGHT tall. */
  scale: number
  hand: THREE.Bone | null
}

/** A fresh, team-dyed copy of the team's ranger with its own skeleton and team gear. */
export function buildHero(color: LudoColor, assets: GLTF[], style: CharacterStyleId = 'ranger'): Hero {
  const source = bodyFor(assets, color, style)
  const root = SkeletonUtils.clone(source.scene) as THREE.Group
  const bones: Record<string, THREE.Object3D> = {}
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o
  })
  const hand = (bones[HAND_BONE] as THREE.Bone | undefined) ?? null
  root.updateMatrixWorld(true)
  const toModel = root.matrixWorld.clone().invert()
  const at = (o: THREE.Object3D | undefined, fallback: [number, number, number]) =>
    o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel) : new THREE.Vector3(...fallback)
  const chest = bones.spine_03
  const chestPos = at(chest, [0, 1.35, 0])
  const lm: HeroLandmarks = {
    shoulderL: at(bones.upperarm_l, [0.18, 1.42, 0]),
    shoulderR: at(bones.upperarm_r, [-0.18, 1.42, 0]),
    head: at(bones.Head, [0, 1.6, 0]),
    chest: chestPos,
    // the back of the torso at chest height
    backZ: chestPos.z - 0.12,
  }
  // Knight: steel great helm with a team plume, steel pauldrons, breastplate and limb guards
  if (style === 'knight') {
    const kit = makeKnightKit(color, lm)
    attachToBone(root, bones.Head, kit.helm)
    attachToBone(root, chest, kit.breastplate)
    attachToBone(root, bones.upperarm_l, kit.pauldronL)
    attachToBone(root, bones.upperarm_r, kit.pauldronR)
    for (const side of ['l', 'r'] as const) {
      for (const [a, b, r] of [[`lowerarm_${side}`, `hand_${side}`, 0.045], [`calf_${side}`, `foot_${side}`, 0.062]] as const) {
        const ja = bones[a]
        const jb = bones[b]
        if (ja && jb) attachToBone(root, ja, makeKnightGuard(color, at(ja, [0, 0, 0]), at(jb, [0, 0, 0]), r))
      }
    }
  }
  // Vanguard: tactical helmet with a glowing visor, team chest rig, shoulder pads and limb guards
  if (style === 'vanguard') {
    const kit = makeVanguardKit(color, lm)
    attachToBone(root, bones.Head, kit.helm)
    attachToBone(root, chest, kit.rig)
    attachToBone(root, bones.upperarm_l, kit.padL)
    attachToBone(root, bones.upperarm_r, kit.padR)
    for (const side of ['l', 'r'] as const) {
      for (const [a, b, r] of [[`lowerarm_${side}`, `hand_${side}`, 0.042], [`calf_${side}`, `foot_${side}`, 0.058]] as const) {
        const ja = bones[a]
        const jb = bones[b]
        if (ja && jb) attachToBone(root, ja, makeVanguardGuard(color, at(ja, [0, 0, 0]), at(jb, [0, 0, 0]), r))
      }
    }
  }
  // the bodysuit models are barefoot: armoured boots for Knight (steel) and Vanguard (black)
  if (style === 'knight' || style === 'vanguard') {
    for (const side of ['l', 'r'] as const) {
      const foot = bones[`foot_${side}`]
      const ball = bones[`ball_${side}`]
      if (foot && ball) attachToBone(root, foot, makeBoot(at(foot, [0, 0, 0]), at(ball, [0, 0, 0]), style === 'knight'))
    }
  }
  // the team shield on the off-hand forearm (the sword hand is HAND_BONE): knights always, others for shield teams
  if (style === 'knight' || (style === 'ranger' && carriesShield(color))) {
    const off = HAND_BONE.endsWith('_r') ? 'l' : 'r'
    const elbow = bones[`lowerarm_${off}`]
    const wrist = bones[`hand_${off}`]
    if (elbow && wrist) {
      const e = at(elbow, [0, 0, 0])
      attachToBone(root, elbow, makeArmShield(color, e, at(wrist, [0, 0, 0]), Math.sign(e.x) || 1))
    }
  }
  for (const mesh of skinnedMeshes(root)) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => heroMaterial(color, m, style)) : heroMaterial(color, mesh.material, style)
  }
  const hk = bodyUrl(color, style)
  let height = heightCache.get(hk)
  if (height === undefined) {
    height = new THREE.Box3().setFromObject(source.scene).getSize(new THREE.Vector3()).y
    heightCache.set(hk, height)
  }
  return { root, scale: CHARACTER_HEIGHT / Math.max(0.001, height), hand }
}

export function preloadCharacters() {
  for (const url of CHARACTER_URLS) useGLTF.preload(url)
}
