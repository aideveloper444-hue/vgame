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
  // the scene now has a studio environment to reflect, so plates can be properly metallic; a small cap
  // keeps the darkest metals from going black where the environment is dim
  const metalness = Math.min(metal, 0.85)
  const roughness = Math.max(rough, 0.2)
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
  // these never rendered until the bone lookup was fixed; at full size they swallowed the head from above
  group.scale.setScalar(0.68)
  group.position.set(at.x + side * 0.015, at.y + 0.02, at.z)
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

/* ------------------------------------------------------------------ back gear */

/** What each team carries on its back: knights a shield and a sword, the rogue a quiver of arrows. */
const BACK_KIT: Record<LudoColor, 'knight' | 'rogue'> = {
  RED: 'knight',
  GREEN: 'rogue',
  BLUE: 'knight',
  YELLOW: 'knight',
  PURPLE: 'knight',
  ORANGE: 'rogue',
  CYAN: 'knight',
  PINK: 'rogue',
}

function glowMat(key: string, color: string, k = 2.2) {
  return mat(key, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }))
}

/** A five-pointed star outline, used for the shield emblem. */
function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? inner : outer
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i) s.lineTo(x, y)
    else s.moveTo(x, y)
  }
  s.closePath()
  return s
}

/** Round team shield: metal face, gold rim and boss, and a glowing star. Built facing +Z, centred on 0. */
function makeShield(color: LudoColor): THREE.Group {
  const g = GEAR[color]
  const group = new THREE.Group()
  const R = 0.135
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.022, 40), std(g.metal, g.metalRough, g.metalness))
  face.rotation.x = Math.PI / 2
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.014, 10, 48), std(g.trim, 0.2, 1))
  rim.position.z = 0.006
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(g.trim, 0.2, 1))
  boss.rotation.x = Math.PI / 2
  boss.position.z = 0.011
  const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.085, 0.036)), glowMat(`star-${color}`, g.trim))
  star.position.z = 0.0125
  // a ring of studs inside the rim
  const studMat = std(g.trim, 0.25, 1)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), studMat)
    stud.position.set(Math.cos(a) * (R - 0.022), Math.sin(a) * (R - 0.022), 0.012)
    group.add(stud)
  }
  group.add(face, rim, star, boss)
  return group
}

/** Sheathed sword: scabbard along +Y with the hilt above it. Built centred on the scabbard. */
function makeSheathedSword(color: LudoColor): THREE.Group {
  const g = GEAR[color]
  const group = new THREE.Group()
  const leather = std('#2a1a10', 0.7, 0.05)
  const gold = std(g.trim, 0.2, 1)
  const scabbard = new THREE.Mesh(new RoundedBoxGeometry(0.048, 0.56, 0.026, 2, 0.012), leather)
  const chape = new THREE.Mesh(new RoundedBoxGeometry(0.054, 0.06, 0.03, 2, 0.012), gold)
  chape.position.y = -0.27
  const locket = new THREE.Mesh(new RoundedBoxGeometry(0.056, 0.04, 0.032, 2, 0.01), gold)
  locket.position.y = 0.26
  const guard = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.028, 0.036, 2, 0.01), gold)
  guard.position.y = 0.3
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 10), std('#3b2415', 0.8, 0))
  grip.position.y = 0.375
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), gold)
  pommel.position.y = 0.448
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), glowMat(`gem-${color}`, g.goggles ?? g.trim, 2.6))
  gem.position.set(0, 0.3, 0.02)
  group.add(scabbard, chape, locket, guard, grip, pommel, gem)
  return group
}

/** Leather quiver along +Y with a fan of arrows whose fletching glows in the team color. */
function makeQuiver(color: LudoColor): THREE.Group {
  const g = GEAR[color]
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.4, 16), std('#3a2414', 0.75, 0.05))
  const gold = std(g.trim, 0.25, 1)
  for (const y of [-0.17, 0.17]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(y > 0 ? 0.053 : 0.044, 0.007, 6, 20), gold)
    band.rotation.x = Math.PI / 2
    band.position.y = y
    group.add(band)
  }
  const shaftMat = std('#c9a26a', 0.6, 0)
  const fletch = glowMat(`fletch-${color}`, g.trim, 1.8)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const ox = Math.cos(a) * 0.022
    const oz = Math.sin(a) * 0.022
    const top = 0.27 + (i % 2) * 0.03
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 6), shaftMat)
    shaft.position.set(ox, top - 0.07, oz)
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.06, 0.004), fletch)
    vane.position.set(ox, top, oz)
    vane.rotation.y = a
    group.add(shaft, vane)
  }
  group.add(body)
  return group
}

/** True for teams that fight as knights (shield on the arm, sword on the back). */
export function carriesShield(color: LudoColor) {
  return BACK_KIT[color] === 'knight'
}

/**
 * Round team shield strapped to the outside of the off-hand forearm, facing forward, so it shows from the
 * front where the board camera sees the warriors. `from`/`to` are the forearm's elbow and wrist (model space);
 * `side` is +1/-1 for which side of the body that arm is on. Parent it to the forearm bone.
 */
export function makeArmShield(color: LudoColor, from: THREE.Vector3, to: THREE.Vector3, side: number): THREE.Object3D {
  const shield = makeShield(color)
  shield.scale.setScalar(1.05)
  const mid = from.clone().lerp(to, 0.55)
  // in front of the forearm and a touch outward, so it clears the hip when the arm hangs
  shield.position.set(mid.x + side * 0.025, mid.y, mid.z + 0.075)
  return shadowed(shield)
}

/**
 * Everything slung on the warrior's back, outside the cape: knights get a round team shield with a sword
 * behind it (the hilt rising over the right shoulder), rogues a quiver of glowing-fletched arrows. Every
 * warrior also wears a belt pouch. Parent it to the chest bone.
 */
export function makeBackGear(color: LudoColor, lm: HeroLandmarks): THREE.Object3D {
  const g = GEAR[color]
  const group = new THREE.Group()
  // which side is the warrior's right shoulder in model space
  const right = Math.sign(lm.shoulderR.x || -1)
  // the cape bulges about 0.1 behind the back surface; gear rides just outside it
  const capeOut = g.cape ? 0.105 : 0.03
  if (BACK_KIT[color] === 'knight') {
    // the shield rides on the off-hand forearm (see makeArmShield); the sword is sheathed on the back
    const sword = makeSheathedSword(color)
    sword.position.set(-right * 0.03, lm.chest.y - 0.05, lm.backZ - capeOut - 0.02)
    sword.rotation.z = right * -0.62
    group.add(sword)
  } else {
    const quiver = makeQuiver(color)
    quiver.position.set(right * 0.04, lm.chest.y - 0.02, lm.backZ - capeOut - 0.03)
    quiver.rotation.z = right * -0.5
    quiver.rotation.x = -0.12
    group.add(quiver)
  }
  // belt pouch on the left hip
  const w = Math.abs(lm.shoulderL.x - lm.shoulderR.x) * 0.78
  const pouch = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.07, 0.045, 2, 0.016), std('#3b2618', 0.75, 0.05))
  pouch.position.set(-right * w * 0.5, lm.chest.y - 0.32, lm.backZ + 0.12)
  const flap = new THREE.Mesh(new RoundedBoxGeometry(0.079, 0.026, 0.05, 2, 0.01), std(g.metal, g.metalRough, g.metalness))
  flap.position.set(-right * w * 0.5, lm.chest.y - 0.29, lm.backZ + 0.122)
  group.add(pouch, flap)
  return shadowed(group)
}

/* ------------------------------------------------------------------ knight kit */

/** Polished steel and darker blackened steel for the Knight style's plate armour. */
const steel = () => std('#c6cbd5', 0.26, 0.9)
const darkSteel = () => std('#4b515c', 0.35, 0.85)

/**
 * The Knight style's plate armour, built in model space from rest-pose landmarks: a great helm with a visor
 * slit, centre ridge, team trim and a team plume; a breastplate with a glowing team star; layered pauldrons.
 * Parent the helm to the head bone, the breastplate to the chest, each pauldron to its upper arm.
 */
export function makeKnightKit(color: LudoColor, lm: HeroLandmarks) {
  const glow = GEAR[color].trim
  const team = std(GEAR[color].cape ?? GEAR[color].metal, 0.6, 0.05, { sheen: 1, sheenColor: new THREE.Color(glow) })
  const cx = lm.head.x
  const cy = lm.head.y + 0.1
  const cz = lm.head.z + 0.01

  // great helm: a steel cylinder capped by a dome
  const helm = new THREE.Group()
  const R = 0.128
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.2, 32), steel())
  barrel.position.set(cx, cy - 0.02, cz)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel())
  dome.position.set(cx, cy + 0.08, cz)
  const slit = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.02, 0.03, 2, 0.008), mat(`slit-${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(0.6) })))
  slit.position.set(cx, cy + 0.015, cz + R - 0.006)
  const ridge = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.24, 0.02, 2, 0.006), steel())
  ridge.position.set(cx, cy + 0.04, cz + R + 0.004)
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.05, 0.012, 8, 40), glowMat(`kband-${color}`, glow, 1.6))
  band.rotation.x = Math.PI / 2
  band.position.set(cx, cy - 0.115, cz)
  // breathing holes on the cheek plates
  for (let i = 0; i < 6; i++) {
    for (const k of [-1, 1]) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.006, 8), darkSteel())
      const a = k * (0.55 + (i % 3) * 0.12)
      hole.position.set(cx + Math.sin(a) * (R + 0.002), cy - 0.04 - Math.floor(i / 3) * 0.025, cz + Math.cos(a) * (R + 0.002))
      hole.rotation.y = a
      helm.add(hole)
    }
  }
  // plume: a team-coloured crest sweeping back over the dome
  for (let i = 0; i < 5; i++) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.03 - i * 0.003, 0.16, 10), team)
    const t = i / 4
    tuft.position.set(cx, cy + 0.2 - t * 0.04, cz - 0.02 - t * 0.1)
    tuft.rotation.x = -0.5 - t * 0.7
    helm.add(tuft)
  }
  helm.add(barrel, dome, slit, ridge, band)

  // breastplate with a raised medial ridge and a glowing team star
  const breastplate = new THREE.Group()
  const w = Math.abs(lm.shoulderL.x - lm.shoulderR.x) * 0.82
  const frontZ = lm.chest.z + 0.1
  const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.27, 0.07, 4, 0.03), steel())
  plate.position.set(lm.chest.x, lm.chest.y - 0.05, frontZ)
  const medial = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.25, 0.02, 2, 0.008), steel())
  medial.position.set(lm.chest.x, lm.chest.y - 0.05, frontZ + 0.037)
  const starMesh = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.045, 0.019)), glowMat(`kstar-${color}`, glow, 2))
  starMesh.position.set(lm.chest.x, lm.chest.y - 0.01, frontZ + 0.049)
  const fauld = new THREE.Mesh(new RoundedBoxGeometry(w * 0.92, 0.07, 0.08, 3, 0.025), darkSteel())
  fauld.position.set(lm.chest.x, lm.chest.y - 0.22, frontZ - 0.01)
  breastplate.add(plate, medial, starMesh, fauld)

  const pauldron = (at: THREE.Vector3, side: number) => {
    const g = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const lame = new THREE.Mesh(new THREE.SphereGeometry(0.085 - i * 0.008, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), i ? darkSteel() : steel())
      lame.scale.set(1.15, 0.7, 1.15)
      lame.position.set(side * i * 0.012, -i * 0.028, 0)
      g.add(lame)
    }
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.093, 0.008, 6, 32), glowMat(`ktrim-${color}`, glow, 1.6))
    trim.rotation.x = Math.PI / 2
    trim.scale.set(1.12, 1.12, 1)
    g.add(trim)
    g.position.set(at.x + side * 0.02, at.y + 0.03, at.z)
    g.rotation.z = side * -0.3
    return g
  }
  const sideL = Math.sign(lm.shoulderL.x) || 1
  return {
    helm: shadowed(helm),
    breastplate: shadowed(breastplate),
    pauldronL: shadowed(pauldron(lm.shoulderL, sideL)),
    pauldronR: shadowed(pauldron(lm.shoulderR, -sideL)),
  }
}

/** A steel guard around a forearm or shin, with a glowing team band; `from`/`to` are the segment's joints. */
export function makeKnightGuard(color: LudoColor, from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.Object3D {
  const group = new THREE.Group()
  const dir = to.clone().sub(from)
  const len = dir.length() * 0.75
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.95, radius * 1.12, len, 18, 1, true), std('#c6cbd5', 0.26, 0.9, { side: THREE.DoubleSide }))
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.13, radius * 0.14, 8, 24), glowMat(`kguard-${color}`, GEAR[color].trim, 1.6))
  band.rotation.x = Math.PI / 2
  band.position.y = -len / 2
  group.add(guard, band)
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate())
  group.position.copy(from).addScaledVector(dir, 0.55)
  return shadowed(group)
}

/* ------------------------------------------------------------------ vanguard kit */

/**
 * The Vanguard style: a sci-fi trooper. A glossy team-coloured tactical helmet with a glowing visor band,
 * a team chest rig with a light strip, and compact shoulder plates, worn over a dark undersuit.
 */
export function makeVanguardKit(color: LudoColor, lm: HeroLandmarks) {
  const glow = GEAR[color].trim
  const shell = std(GEAR[color].cape ?? GEAR[color].metal, 0.28, 0.55, { clearcoat: 1, clearcoatRoughness: 0.08 })
  const dark = std('#1d2029', 0.45, 0.4)
  const cx = lm.head.x
  const cy = lm.head.y + 0.1
  const cz = lm.head.z + 0.01

  const helm = new THREE.Group()
  const R = 0.13
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), shell)
  dome.scale.set(1, 1.08, 1.1)
  dome.position.set(cx, cy + 0.01, cz)
  // visor: a glowing band wrapped across the front of the helmet
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.042, 32, 1, true, -Math.PI * 0.42, Math.PI * 0.84), glowMat(`visor-${color}`, glow, 2.2))
  visor.scale.set(1, 1, 1.1)
  visor.position.set(cx, cy + 0.005, cz)
  const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.16, 3, 0.025), dark)
  jaw.position.set(cx, cy - 0.07, cz + 0.02)
  const fin = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.05, 0.2, 2, 0.008), glowMat(`fin-${color}`, glow, 1.6))
  fin.position.set(cx, cy + 0.15, cz - 0.01)
  helm.add(dome, visor, jaw, fin)

  const rig = new THREE.Group()
  const w = Math.abs(lm.shoulderL.x - lm.shoulderR.x) * 0.78
  const frontZ = lm.chest.z + 0.095
  const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.24, 0.06, 4, 0.025), shell)
  plate.position.set(lm.chest.x, lm.chest.y - 0.04, frontZ)
  const strip = new THREE.Mesh(new RoundedBoxGeometry(w * 0.7, 0.014, 0.012, 1, 0.005), glowMat(`strip-${color}`, glow, 2.2))
  strip.position.set(lm.chest.x, lm.chest.y - 0.02, frontZ + 0.032)
  const belt = new THREE.Mesh(new RoundedBoxGeometry(w * 0.95, 0.05, 0.2, 2, 0.02), dark)
  belt.position.set(lm.chest.x, lm.chest.y - 0.26, lm.chest.z)
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.035, 0.012, 2, 0.006), glowMat(`buckle-${color}`, glow, 1.8))
  buckle.position.set(lm.chest.x, lm.chest.y - 0.26, lm.chest.z + 0.103)
  rig.add(plate, strip, belt, buckle)

  const pad = (at: THREE.Vector3, side: number) => {
    const g = new THREE.Group()
    const shellPad = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), shell)
    shellPad.scale.set(1.2, 0.65, 1.15)
    const line = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.005, 6, 28), glowMat(`padl-${color}`, glow, 1.8))
    line.rotation.x = Math.PI / 2
    line.scale.set(1.18, 1.12, 1)
    g.add(shellPad, line)
    g.position.set(at.x + side * 0.018, at.y + 0.028, at.z)
    g.rotation.z = side * -0.3
    return g
  }
  const sideL = Math.sign(lm.shoulderL.x) || 1
  return {
    helm: shadowed(helm),
    rig: shadowed(rig),
    padL: shadowed(pad(lm.shoulderL, sideL)),
    padR: shadowed(pad(lm.shoulderR, -sideL)),
  }
}

/** A team-coloured guard (forearm or shin) for the Vanguard, glossy with a glowing seam. */
export function makeVanguardGuard(color: LudoColor, from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.Object3D {
  const group = new THREE.Group()
  const dir = to.clone().sub(from)
  const len = dir.length() * 0.7
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.95, radius * 1.1, len, 18, 1, true), std(GEAR[color].cape ?? GEAR[color].metal, 0.28, 0.55, { side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.08 }))
  const seam = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.1, radius * 0.08, 6, 24), glowMat(`vseam-${color}`, GEAR[color].trim, 2))
  seam.rotation.x = Math.PI / 2
  seam.position.y = len * 0.2
  group.add(guard, seam)
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate())
  group.position.copy(from).addScaledVector(dir, 0.55)
  return shadowed(group)
}

/** An armoured boot over the foot, from the ankle (`from`) toward the ball of the foot (`to`). */
export function makeBoot(from: THREE.Vector3, to: THREE.Vector3, metal: boolean): THREE.Object3D {
  const group = new THREE.Group()
  const dir = to.clone().sub(from)
  const len = dir.length()
  const material = metal ? std('#9aa1ad', 0.3, 0.85) : std('#191b22', 0.5, 0.3)
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.1, len * 1.35, 0.085, 3, 0.035), material)
  foot.position.y = len * 0.45
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.1, 16), material)
  cuff.position.y = -0.02
  group.add(foot, cuff)
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  group.position.copy(from)
  return shadowed(group)
}
