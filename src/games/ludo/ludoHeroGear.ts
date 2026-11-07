import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three-stdlib'
import type { LudoColor } from './ludoBoardLayout'

/*
 * Hero gear for the Ludo pieces, as in the lounge poster: red is a caped warrior with a headband, green
 * a hooded, masked rogue, blue a caped knight with goggles, yellow a golden knight with goggles. Every
 * piece built from bones' rest positions, so the gear sits right on both body types.
 */

export interface HeroLandmarks {
  /** Shoulder joints (UpperArm bones), model space. */
  shoulderL: THREE.Vector3
  shoulderR: THREE.Vector3
  /** Head bone (base of the skull), model space. */
  head: THREE.Vector3
  chest: THREE.Vector3
  /** Back surface of the torso at chest height (z). */
  backZ: number
}

interface TeamGear {
  cape: string | null
  capeLining: string
  metal: string
  metalRough: number
  metalness: number
  trim: string
  headband?: string
  hood?: string
  mask?: string
  goggles?: string
  /** Full knight's helmet (shell, brow ridge and crest) over the head. */
  helmet?: boolean
}

const GEAR: Record<LudoColor, TeamGear> = {
  RED: { cape: '#a30a1c', capeLining: '#3a0208', metal: '#5c0c16', metalRough: 0.32, metalness: 0.7, trim: '#f4c04a', headband: '#d4142a' },
  GREEN: { cape: '#0b4a1f', capeLining: '#04200c', metal: '#16301c', metalRough: 0.55, metalness: 0.35, trim: '#4ade80', hood: '#0d5a24', mask: '#0a1a10' },
  BLUE: { cape: '#123a9e', capeLining: '#071a4d', metal: '#22305e', metalRough: 0.25, metalness: 0.8, trim: '#7fc3ff', goggles: '#4fd8ff', helmet: true },
  YELLOW: { cape: '#c78a05', capeLining: '#5a3a02', metal: '#d9a521', metalRough: 0.22, metalness: 0.95, trim: '#fff2b0', goggles: '#4fd8ff', helmet: true },
  PURPLE: { cape: '#4a148f', capeLining: '#1d0640', metal: '#2e1658', metalRough: 0.3, metalness: 0.7, trim: '#d8b4fe' },
  ORANGE: { cape: '#b84a05', capeLining: '#4a1d02', metal: '#7a3a0c', metalRough: 0.3, metalness: 0.7, trim: '#ffd27a' },
  CYAN: { cape: '#04707f', capeLining: '#022e35', metal: '#0d3f48', metalRough: 0.3, metalness: 0.7, trim: '#8ff6ff', goggles: '#ffd24a' },
  PINK: { cape: '#a0125f', capeLining: '#430628', metal: '#5a0c37', metalRough: 0.3, metalness: 0.7, trim: '#ffc2e2' },
}

const matCache = new Map<string, THREE.Material>()
function mat(key: string, make: () => THREE.Material) {
  let m = matCache.get(key)
  if (!m) {
    m = make()
    matCache.set(key, m)
  }
  return m
}

function std(color: string, rough: number, metal: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  // the Ludo scene has no environment map, so fully metallic plates would render near-black; cap the
  // metalness and let the clear coat carry the polished highlights from the scene's lights instead
  const metalness = Math.min(metal, 0.5)
  const roughness = Math.max(rough, 0.3)
  return mat(`${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`, () => new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat: metal > 0.5 ? 0.8 : 0, clearcoatRoughness: 0.12, ...extra }))
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true
      c.receiveShadow = true
    }
  })
  return o
}

/**
 * A cape hanging from the shoulders: a bent grid that wraps the back, flares toward the hem and
 * falls in a few soft folds. Built in model space, behind the torso.
 */
export function makeCape(color: LudoColor, lm: HeroLandmarks): THREE.Object3D | null {
  const g = GEAR[color]
  if (!g.cape) return null
  const topY = Math.max(lm.shoulderL.y, lm.shoulderR.y) + 0.03
  const bottomY = 0.42
  const halfTop = Math.abs(lm.shoulderL.x - lm.shoulderR.x) / 2 + 0.035
  const cols = 14
  const rows = 16
  const geo = new THREE.PlaneGeometry(1, 1, cols, rows)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5 // 0..1 across
    const v = 0.5 - pos.getY(i) // 0 at top, 1 at hem
    const half = halfTop * (1 + v * 0.85)
    const x = (u * 2 - 1) * half
    const across = u * 2 - 1
    // wraps around the back at the top, hangs out behind the legs lower down, with folds
    const wrap = (1 - across * across) * 0.07 * (1 - v * 0.4)
    const folds = Math.sin(across * Math.PI * 3) * 0.018 * v
    const z = lm.backZ - 0.025 - wrap - v * v * 0.16 + folds
    const y = topY - v * (topY - bottomY)
    pos.setXYZ(i, x, y, z)
  }
  geo.computeVertexNormals()
  const outer = new THREE.Mesh(geo, std(g.cape, 0.55, 0.05, { sheen: 1, sheenColor: new THREE.Color(g.cape).multiplyScalar(1.6), side: THREE.FrontSide }))
  const inner = new THREE.Mesh(geo, std(g.capeLining, 0.7, 0, { side: THREE.BackSide }))
  const group = new THREE.Group()
  group.add(outer, inner)
  // gold clasps where the cape meets the shoulders
  for (const sh of [lm.shoulderL, lm.shoulderR]) {
    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), std(g.trim, 0.2, 1))
    clasp.position.set(sh.x * 0.82, topY - 0.01, lm.backZ + 0.05)
    group.add(clasp)
  }
  return shadowed(group)
}

/** Rounded armour plate over a shoulder joint (parent it to the upper arm). */
export function makePauldron(color: LudoColor, at: THREE.Vector3, side: 1 | -1): THREE.Object3D {
  const g = GEAR[color]
  const group = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), std(g.metal, g.metalRough, g.metalness))
  shell.scale.set(1.15, 0.85, 1.2)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.014, 10, 32), std(g.trim, 0.25, 1))
  rim.rotation.x = Math.PI / 2
  rim.scale.set(1.15, 1.2, 1)
  rim.position.y = 0.012
  // a second, lower lame overlapping the first gives the layered plate look
  const lame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 10, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.22), std(g.metal, g.metalRough, g.metalness, { side: THREE.DoubleSide }))
  lame.scale.set(1.15, 0.85, 1.2)
  lame.position.y = -0.03
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.005, 6, 32), mat(`pglow-${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(g.trim).multiplyScalar(2.2), toneMapped: false })))
  glow.rotation.x = Math.PI / 2
  glow.scale.set(1.15, 1.2, 1)
  glow.position.y = 0.035
  group.add(shell, rim, lame, glow)
  group.position.set(at.x + side * 0.02, at.y + 0.025, at.z)
  group.rotation.z = side * -0.35
  return shadowed(group)
}

/** Breastplate with a glowing emblem, on the chest (parent it to the chest bone). */
export function makeBreastplate(color: LudoColor, lm: HeroLandmarks): THREE.Object3D {
  const g = GEAR[color]
  const group = new THREE.Group()
  const w = Math.abs(lm.shoulderL.x - lm.shoulderR.x) * 0.78
  const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.2, 0.05, 3, 0.022), std(g.metal, g.metalRough, g.metalness))
  const frontZ = lm.backZ + 0.205
  plate.position.set(0, lm.chest.y - 0.02, frontZ)
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.028, 24), mat(`emb-${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(g.trim).multiplyScalar(2), toneMapped: false })))
  emblem.position.set(0, lm.chest.y - 0.005, frontZ + 0.027)
  const belt = new THREE.Mesh(new RoundedBoxGeometry(w * 1.05, 0.045, 0.2, 2, 0.02), std('#2a1d12', 0.6, 0.2))
  belt.position.set(0, lm.chest.y - 0.27, lm.backZ + 0.1)
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.04, 0.012, 2, 0.006), std(g.trim, 0.2, 1))
  buckle.position.set(0, lm.chest.y - 0.27, lm.backZ + 0.205)
  group.add(plate, emblem, belt, buckle)
  return shadowed(group)
}

/**
 * A tapered armour guard wrapped around a limb segment (forearm or shin), running from `from` toward `to`
 * in model space, with a trim band and a glowing seam (parent it to the segment's bone).
 */
export function makeLimbGuard(color: LudoColor, from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.Object3D {
  const g = GEAR[color]
  const group = new THREE.Group()
  const dir = to.clone().sub(from)
  const len = dir.length() * 0.78
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 1.12, len, 16, 1, true), std(g.metal, g.metalRough, g.metalness, { side: THREE.DoubleSide }))
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.14, radius * 0.16, 8, 24), std(g.trim, 0.25, 1))
  band.rotation.x = Math.PI / 2
  band.position.y = -len / 2
  const seam = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, radius * 0.06, 6, 24), mat(`lglow-${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(g.trim).multiplyScalar(2.2), toneMapped: false })))
  seam.rotation.x = Math.PI / 2
  seam.position.y = len * 0.15
  group.add(guard, band, seam)
  // cylinder axis is +y; point it from the joint down the limb, centred a little past the joint
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate())
  group.position.copy(from).addScaledVector(dir, 0.55)
  return shadowed(group)
}

/** Knight's helmet shell with a brow ridge and a crest, leaving the goggles' visor line open. */
function makeHelmet(color: LudoColor, cx: number, cy: number, cz: number): THREE.Object3D {
  const g = GEAR[color]
  const group = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), std(g.metal, g.metalRough, g.metalness))
  shell.scale.set(1, 1.08, 1.12)
  shell.position.set(cx, cy + 0.035, cz - 0.005)
  const brow = new THREE.Mesh(new THREE.TorusGeometry(0.133, 0.013, 8, 40, Math.PI), std(g.trim, 0.2, 1))
  brow.rotation.set(Math.PI / 2, 0, Math.PI)
  brow.scale.set(1, 1.12, 1)
  brow.position.set(cx, cy + 0.045, cz - 0.005)
  const crest = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.07, 0.24, 2, 0.012), std(g.trim, 0.2, 1))
  crest.position.set(cx, cy + 0.17, cz - 0.02)
  const crestGlow = new THREE.Mesh(new RoundedBoxGeometry(0.008, 0.012, 0.22, 1, 0.003), mat(`cglow-${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(g.goggles ?? g.trim).multiplyScalar(2.4), toneMapped: false })))
  crestGlow.position.set(cx, cy + 0.208, cz - 0.02)
  // cheek guards down the sides of the face
  for (const k of [-1, 1]) {
    const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.09, 0.11, 2, 0.012), std(g.metal, g.metalRough, g.metalness))
    cheek.position.set(cx + k * 0.125, cy - 0.04, cz + 0.02)
    group.add(cheek)
  }
  group.add(shell, brow, crest, crestGlow)
  return group
}

/** Head gear for the team: headband, hood and mask, or goggles (parent it to the head bone). */
export function makeHeadGear(color: LudoColor, lm: HeroLandmarks): THREE.Object3D | null {
  const g = GEAR[color]
  const cx = lm.head.x
  const cy = lm.head.y + 0.1
  const cz = lm.head.z + 0.01
  const group = new THREE.Group()
  if (g.headband) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.017, 10, 40), std(g.headband, 0.5, 0))
    band.rotation.x = Math.PI / 2
    band.scale.set(1, 1.12, 1)
    band.position.set(cx, cy + 0.035, cz)
    // the tails of the knot fly out behind
    for (const k of [-1, 1]) {
      const tail = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.11, 0.01, 2, 0.004), std(g.headband, 0.5, 0))
      tail.position.set(cx + k * 0.025, cy - 0.01, cz - 0.13)
      tail.rotation.set(0.5, 0, k * 0.35)
      group.add(tail)
    }
    group.add(band)
  }
  if (g.hood) {
    // a cowl around the back and sides of the head, open at the face, peaked on top
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.78), std(g.hood, 0.75, 0, { side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color('#2ee06a') }))
    hood.scale.set(1, 1.18, 1.05)
    hood.position.set(cx, cy + 0.015, cz - 0.005)
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 16), std(g.hood, 0.75, 0))
    peak.position.set(cx, cy + 0.16, cz - 0.06)
    peak.rotation.x = -0.6
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.108, 24, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.52, Math.PI * 0.34), std(g.mask!, 0.6, 0.1, { side: THREE.DoubleSide }))
    mask.scale.set(1, 1, 1.12)
    mask.position.set(cx, cy, cz + 0.005)
    group.add(hood, peak, mask)
  }
  if (g.helmet) group.add(makeHelmet(color, cx, cy, cz))
  if (g.goggles) {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.012, 8, 40), std('#1b1d24', 0.6, 0.2))
    strap.rotation.x = Math.PI / 2
    strap.scale.set(1, 1.12, 1)
    strap.position.set(cx, cy + 0.018, cz)
    const lensMat = mat(`lens-${g.goggles}`, () => new THREE.MeshPhysicalMaterial({ color: g.goggles, emissive: g.goggles, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.2, clearcoat: 1 }))
    const visor = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.045, 0.03, 3, 0.014), lensMat)
    visor.position.set(cx, cy + 0.018, cz + 0.112)
    const frame = new THREE.Mesh(new RoundedBoxGeometry(0.185, 0.058, 0.022, 3, 0.016), std('#d7dde8', 0.25, 1))
    frame.position.set(cx, cy + 0.018, cz + 0.104)
    group.add(strap, frame, visor)
  }
  return group.children.length ? shadowed(group) : null
}
