import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/*
 * A high-wing bush plane (the kind that lands on dirt strips), built in code: a lathed fuselage with a painted
 * cheat line and a pale belly, a glazed cabin, a long strut-braced wing, a tail with fin and stabiliser, sprung main
 * gear on fat tyres and a two-blade propeller. Units are metres, nose along +Z, wheels on y = 0. The runner stands
 * on top of the wing, centred on the origin (its top surface is at PLANE_DECK in the engine).
 */

export interface BushPlane {
  group: THREE.Group
  /** spin this about its local Z */
  prop: THREE.Object3D
  /** the spinning blur disc in front of the prop (fades in with prop speed) */
  disc: THREE.Mesh
}

// expedition livery: warm white, deep oxblood red, navy pinstripes, a grey-blue belly
const CREAM = new THREE.Color('#efebe2')
const BELLY = new THREE.Color('#9aa1a3')
const STRIPE = new THREE.Color('#8a1c16')
const STRIPE2 = new THREE.Color('#1b2a3a')

/**
 * The fuselage paint as a texture (the lathe's u runs round the body from the belly, v from tail to nose), so the
 * cheat line, pinstripe, red cowling and panel lines are crisp at any distance instead of smeared across big faces.
 */
function hullTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  // y on the canvas = 1 - v (the tail at the bottom, the nose at the top)
  const V = (v: number) => (1 - v) * H
  g.fillStyle = '#efebe2'
  g.fillRect(0, 0, W, H)
  // belly: grey-blue round the bottom (u near 0 and 1), soft edged
  for (const [a, b] of [[0, 0.16], [0.84, 1]] as const) {
    const grad = g.createLinearGradient(a * W, 0, b * W, 0)
    const lo = a === 0
    grad.addColorStop(0, lo ? '#9aa1a3' : 'rgba(154,161,163,0)')
    grad.addColorStop(0.7, lo ? '#9aa1a3' : '#9aa1a3')
    grad.addColorStop(1, lo ? 'rgba(154,161,163,0)' : '#9aa1a3')
    g.fillStyle = grad
    g.fillRect(a * W, 0, (b - a) * W, H)
  }
  // cheat line along each side (u 0.25 and 0.75), with a navy pinstripe beneath it
  for (const side of [0.25, 0.75]) {
    const below = side < 0.5 ? -1 : 1
    g.fillStyle = '#8a1c16'
    g.fillRect((side - 0.028) * W, 0, 0.056 * W, H)
    g.fillStyle = '#1b2a3a'
    g.fillRect((side + below * 0.048 - 0.006) * W, 0, 0.012 * W, H)
  }
  // a red top spine from the windscreen back to the fin
  g.fillStyle = '#8a1c16'
  g.fillRect(0.47 * W, V(0.62), 0.06 * W, V(0) - V(0.62))
  // the red cowling round the nose, a navy ring where it meets the cabin
  g.fillStyle = '#8a1c16'
  g.fillRect(0, 0, W, V(0.84))
  g.fillStyle = '#1b2a3a'
  g.fillRect(0, V(0.84), W, 5)
  // panel lines and rivet rows (faint), a cabin door outline on each side
  g.strokeStyle = 'rgba(30, 26, 22, 0.22)'
  g.lineWidth = 2
  for (const v of [0.18, 0.32, 0.46, 0.6, 0.72]) {
    g.beginPath()
    g.moveTo(0, V(v))
    g.lineTo(W, V(v))
    g.stroke()
  }
  for (const side of [0.25, 0.75]) g.strokeRect((side - 0.09) * W, V(0.7), 0.18 * W, V(0.55) - V(0.7))
  g.fillStyle = 'rgba(30, 26, 22, 0.25)'
  for (const v of [0.18, 0.32, 0.46, 0.6, 0.72]) for (let u = 0; u < 1; u += 0.012) g.fillRect(u * W, V(v) - 5, 2, 2)
  // registration on both sides of the rear fuselage (written along the body)
  for (const side of [0.25, 0.75]) {
    g.save()
    g.translate((side + (side < 0.5 ? 0.11 : -0.11)) * W, V(0.36))
    g.rotate(side < 0.5 ? -Math.PI / 2 : Math.PI / 2)
    g.fillStyle = '#1b2a3a'
    g.font = 'bold 34px sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('PP-WLD', 0, 0)
    g.restore()
  }
  // weathering: exhaust soot along the belly behind the nose, a little dust low down
  const soot = g.createLinearGradient(0, V(0.86), 0, V(0.55))
  soot.addColorStop(0, 'rgba(40,36,32,0.35)')
  soot.addColorStop(1, 'rgba(40,36,32,0)')
  g.fillStyle = soot
  g.fillRect(0.08 * W, V(0.86), 0.12 * W, V(0.55) - V(0.86))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

let shared: {
  body: THREE.BufferGeometry
  wing: THREE.BufferGeometry
  tail: THREE.BufferGeometry
  glass: THREE.BufferGeometry
  metal: THREE.BufferGeometry
  tyre: THREE.BufferGeometry
  blades: THREE.BufferGeometry
  mats: Record<'hull' | 'paint' | 'glass' | 'metal' | 'tyre' | 'blade' | 'disc', THREE.Material>
} | null = null

/** colour every vertex of a geometry by height (and a stripe band), so one material can carry the livery */
function livery(g: THREE.BufferGeometry, centreY: number, stripeAt: number, opts: { tipsFrom?: number } = {}) {
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - centreY
    const x = Math.abs(pos.getX(i))
    c.copy(CREAM)
    if (y < -0.32) c.lerp(BELLY, Math.min(1, (-0.32 - y) / 0.12))
    if (Math.abs(y - stripeAt) < 0.07) c.copy(STRIPE)
    else if (Math.abs(y - stripeAt + 0.11) < 0.025) c.copy(STRIPE2)
    if (opts.tipsFrom !== undefined && x > opts.tipsFrom) c.copy(STRIPE)
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

function build() {
  // ---- fuselage: a lathe profile (radius along the length), squashed a touch sideways, nose to +Z
  const FY = 0.75
  const prof: [number, number][] = [
    [0.02, -3.35], [0.1, -3.2], [0.22, -2.6], [0.36, -1.7], [0.5, -0.9], [0.6, -0.2], [0.63, 0.6], [0.63, 1.5], [0.6, 2.1], [0.55, 2.55], [0.5, 2.85], [0.36, 3.05], [0.02, 3.12],
  ]
  const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28)
  body.rotateX(Math.PI / 2)
  body.scale(0.9, 1, 1)
  // the tail cone sweeps up to the fin
  {
    const p = body.attributes.position
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      if (z < -0.6) p.setY(i, p.getY(i) + ((-0.6 - z) / 2.75) ** 1.6 * 0.42)
    }
  }
  body.translate(0, FY, 0)
  body.computeVertexNormals()

  // ---- wing: a long straight wing with a rounded leading edge, a dihedral, red tips; on top of the cabin
  const WY = FY + 0.6
  const halves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const panel = new THREE.BoxGeometry(4.7, 0.1, 1.45, 12, 1, 1)
    const p = panel.attributes.position
    for (let i = 0; i < p.count; i++) {
      // a thicker front, thin trailing edge (an airfoil in two strokes)
      const zz = p.getZ(i)
      if (p.getY(i) > 0) p.setY(i, p.getY(i) + 0.05 * Math.max(0, 1 - Math.abs(zz - 0.25) / 0.75))
    }
    panel.translate(side * 2.45, 0, 0)
    panel.rotateZ(side * 0.03)
    halves.push(panel)
    const edge = new THREE.CylinderGeometry(0.075, 0.075, 4.7, 10).rotateZ(Math.PI / 2).translate(side * 2.45, 0.005, 0.72)
    edge.rotateZ(side * 0.03)
    halves.push(edge)
  }
  halves.push(new THREE.BoxGeometry(0.9, 0.14, 1.5).translate(0, 0.02, 0))
  const wing = mergeGeometries(halves.map((g) => g.toNonIndexed()))!
  wing.translate(0, WY, 0.2)
  wing.computeVertexNormals()
  livery(wing, -10, 99, { tipsFrom: 3.75 })

  // ---- tail: stabiliser and a swept fin with a rudder line
  const stab = new THREE.BoxGeometry(3.3, 0.06, 0.85).translate(0, FY + 0.38, -2.95)
  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0)
  finShape.lineTo(1.25, 0)
  finShape.lineTo(0.95, 1.25)
  finShape.lineTo(0.45, 1.3)
  finShape.lineTo(0, 0)
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.07, bevelEnabled: false })
  fin.rotateY(Math.PI / 2)
  fin.translate(-0.035, FY + 0.42, -2.1)
  const tail = mergeGeometries([stab.toNonIndexed(), fin.index ? fin.toNonIndexed() : fin])!
  tail.computeVertexNormals()
  // the tail: white stabiliser, the fin red above a navy stripe
  {
    const pos = tail.attributes.position
    const col = new Float32Array(pos.count * 3)
    const cc = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) - (FY + 0.42)
      cc.copy(y > 0.62 ? STRIPE : y > 0.5 ? STRIPE2 : CREAM)
      col.set([cc.r, cc.g, cc.b], i * 3)
    }
    tail.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }

  // ---- glazing: windscreen, cabin side windows, a skylight
  const glassParts = [
    new THREE.BoxGeometry(1.0, 0.42, 0.06).rotateX(-0.95).translate(0, FY + 0.4, 1.32),
    new THREE.BoxGeometry(0.04, 0.38, 1.25).translate(0.565, FY + 0.28, 0.5),
    new THREE.BoxGeometry(0.04, 0.38, 1.25).translate(-0.565, FY + 0.28, 0.5),
    new THREE.BoxGeometry(0.04, 0.3, 0.55).translate(0.5, FY + 0.26, -0.45),
    new THREE.BoxGeometry(0.04, 0.3, 0.55).translate(-0.5, FY + 0.26, -0.45),
  ]
  const glass = mergeGeometries(glassParts.map((g) => g.toNonIndexed()))!

  // ---- metal: wing struts, gear legs, cowling ring, exhaust, spinner
  const strut = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.035) => {
    const a = new THREE.Vector3(x0, y0, z0)
    const b = new THREE.Vector3(x1, y1, z1)
    const len = a.distanceTo(b)
    const g = new THREE.CylinderGeometry(r, r, len, 8)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    g.applyQuaternion(q)
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    return g.toNonIndexed()
  }
  const metalParts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    metalParts.push(strut(s * 0.5, FY - 0.35, 0.55, s * 2.55, WY - 0.06, 0.55))
    metalParts.push(strut(s * 0.5, FY - 0.35, 0.3, s * 2.55, WY - 0.06, -0.05))
    // sprung main gear
    metalParts.push(strut(s * 0.45, FY - 0.45, 0.95, s * 1.0, 0.27, 1.0, 0.045))
  }
  metalParts.push(strut(0, FY - 0.15, -3.0, 0, 0.12, -3.1, 0.025))
  metalParts.push(new THREE.TorusGeometry(0.47, 0.05, 8, 24).translate(0, FY, 2.9).toNonIndexed())
  metalParts.push(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6).rotateX(Math.PI / 2).translate(0.32, FY - 0.42, 2.35).toNonIndexed())
  metalParts.push(new THREE.ConeGeometry(0.17, 0.42, 16).rotateX(Math.PI / 2).translate(0, FY, 3.32).toNonIndexed())
  const metal = mergeGeometries(metalParts)!

  // ---- tyres: fat tundra tyres on the main gear, a small tail wheel
  const tyreParts = [
    new THREE.TorusGeometry(0.2, 0.1, 10, 20).rotateY(Math.PI / 2).translate(1.02, 0.3, 1.0),
    new THREE.TorusGeometry(0.2, 0.1, 10, 20).rotateY(Math.PI / 2).translate(-1.02, 0.3, 1.0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.16, 14).rotateZ(Math.PI / 2).translate(1.02, 0.3, 1.0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.16, 14).rotateZ(Math.PI / 2).translate(-1.02, 0.3, 1.0),
    new THREE.TorusGeometry(0.07, 0.04, 6, 12).rotateY(Math.PI / 2).translate(0, 0.1, -3.12),
  ]
  const tyre = mergeGeometries(tyreParts.map((g) => g.toNonIndexed()))!

  // ---- propeller: two slim, twisted blades
  const blade = (dir: number) => {
    const g = new THREE.BoxGeometry(0.15, 0.95, 0.035, 1, 6, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      const k = (y + 0.475) / 0.95
      // taper to the tip and twist along the span
      p.setX(i, p.getX(i) * (1 - 0.45 * k))
      const a = 0.5 - 0.35 * k
      const x = p.getX(i)
      const z = p.getZ(i)
      p.setX(i, x * Math.cos(a) - z * Math.sin(a))
      p.setZ(i, x * Math.sin(a) + z * Math.cos(a))
    }
    g.translate(0, 0.55, 0)
    g.rotateZ(dir)
    return g.toNonIndexed()
  }
  const blades = mergeGeometries([blade(0), blade(Math.PI)])!
  blades.computeVertexNormals()

  const mats = {
    hull: new THREE.MeshPhysicalMaterial({ map: hullTexture(), roughness: 0.3, metalness: 0.02, clearcoat: 0.8, clearcoatRoughness: 0.16 }),
    paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#1b2328', roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 }),
    metal: new THREE.MeshStandardMaterial({ color: '#7a7c7f', roughness: 0.35, metalness: 0.85 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9, metalness: 0 }),
    blade: new THREE.MeshStandardMaterial({ color: '#202224', roughness: 0.5, metalness: 0.4 }),
    disc: new THREE.MeshBasicMaterial({ color: '#2a2c2e', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  }
  shared = { body, wing, tail, glass, metal, tyre, blades, mats }
  return shared
}

/** A new bush plane (geometry and materials are shared between planes). */
export function makeBushPlane(castShadow = true): BushPlane {
  const s = shared ?? build()
  const group = new THREE.Group()
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m)
    mesh.castShadow = castShadow
    mesh.receiveShadow = false
    group.add(mesh)
    return mesh
  }
  add(s.body, s.mats.hull)
  add(s.wing, s.mats.paint)
  add(s.tail, s.mats.paint)
  add(s.glass, s.mats.glass)
  add(s.metal, s.mats.metal)
  add(s.tyre, s.mats.tyre)
  const prop = new THREE.Group()
  prop.position.set(0, 0.75, 3.3)
  const blades = new THREE.Mesh(s.blades, s.mats.blade)
  blades.castShadow = castShadow
  prop.add(blades)
  group.add(prop)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 32), s.mats.disc)
  disc.position.set(0, 0.75, 3.32)
  group.add(disc)
  group.traverse((o) => ((o as THREE.Mesh).frustumCulled = false))
  return { group, prop, disc }
}

/**
 * A hang-glider for the canopy launches: a swept fabric wing in two tones over an aluminium keel and leading edges,
 * a control A-frame below and a hang strap. The rider hangs under it, so the wing sits above the origin (the engine
 * puts the rider at the craft's height plus PLANE_DECK; the wing is drawn that much higher).
 */
export function makeHangGlider(castShadow = true): THREE.Group {
  const group = new THREE.Group()
  const sail = new THREE.MeshStandardMaterial({ color: '#2f3a3c', roughness: 0.7, side: THREE.DoubleSide })
  const sailHi = new THREE.MeshStandardMaterial({ color: '#c9b37c', roughness: 0.65, side: THREE.DoubleSide })
  const tube = new THREE.MeshStandardMaterial({ color: '#b8bcc0', metalness: 0.85, roughness: 0.3 })
  const strap = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 })
  // the sail: nose at +Z, wingtips swept back, a gentle anhedral
  const half = (side: number, mat: THREE.Material) => {
    const g = new THREE.BufferGeometry()
    const p = [0, 0, 1.6, side * 4.2, -0.15, -0.9, 0, 0.05, -1.4]
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.computeVertexNormals()
    return new THREE.Mesh(g, mat)
  }
  const add = (m: THREE.Mesh) => {
    m.castShadow = castShadow
    group.add(m)
    return m
  }
  add(half(1, sail))
  add(half(-1, sail))
  // a lighter stripe along each leading edge
  const stripe = (side: number) => {
    const g = new THREE.BufferGeometry()
    const p = [0, 0.004, 1.6, side * 4.2, -0.146, -0.9, side * 3.5, -0.11, -0.55, 0, 0.004, 1.15]
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.setIndex(side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])
    g.computeVertexNormals()
    return new THREE.Mesh(g, sailHi)
  }
  add(stripe(1))
  add(stripe(-1))
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    return add(new THREE.Mesh(g, m))
  }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  rod(V(0, -0.02, 1.6), V(0, 0.03, -1.4), 0.035, tube)
  rod(V(0, -0.02, 1.6), V(4.2, -0.17, -0.9), 0.03, tube)
  rod(V(0, -0.02, 1.6), V(-4.2, -0.17, -0.9), 0.03, tube)
  // control frame and hang strap down to the rider
  rod(V(0, -0.02, 0.3), V(0.75, -1.6, 0.55), 0.022, tube)
  rod(V(0, -0.02, 0.3), V(-0.75, -1.6, 0.55), 0.022, tube)
  rod(V(-0.75, -1.6, 0.55), V(0.75, -1.6, 0.55), 0.022, tube)
  rod(V(0, -0.02, 0.1), V(0, -1.75, 0.1), 0.02, strap)
  group.traverse((o) => ((o as THREE.Mesh).frustumCulled = false))
  return group
}
