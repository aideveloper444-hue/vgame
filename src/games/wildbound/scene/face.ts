import * as THREE from 'three'

/*
 * Facial animation for animals whose model carries a full face rig (the wolf body: jaw, lips, lids, brows, nose,
 * teeth, tongue and five-bone ears, all hanging off one `face` bone). Runs after the animation mixer every frame and
 * moves the real face bones — the skinned mesh deforms, nothing is faked with textures.
 *
 * Face space (the `face` bone's frame): +x across the head, +y up, +z out along the muzzle. A rotation about +x by a
 * positive angle swings the muzzle down (so it opens the jaw) and tips the ears forward.
 *
 * Expressions are sets of targets blended smoothly; the game picks one from what the animal is doing (running,
 * sprinting, jumping, crashing, the start-line howl, resting in the menu) or the character screen chooses one.
 */

export type Expression = 'normal' | 'alert' | 'aggressive' | 'angry' | 'howl' | 'happy' | 'exhausted' | 'surprised'
export const EXPRESSIONS: Expression[] = ['normal', 'alert', 'aggressive', 'angry', 'howl', 'happy', 'exhausted', 'surprised']

interface Targets {
  /** jaw open (rad) */
  jaw: number
  /** rhythmic panting: 0 none .. 1 hard (adds to jaw and moves the tongue in time) */
  pant: number
  /** tongue out over the lower teeth, 0..1 */
  tongue: number
  /** upper lid closed 0..1 (squint) */
  lid: number
  /** eyes opened wide 0..1 (upper lid lifted, brows up) */
  wide: number
  /** ears tipped forward (+) or pinned back (-), rad */
  ears: number
  /** ears spread out to the sides (relaxed / drooping), rad */
  earsOut: number
  /** upper lip raised off the teeth and the nose wrinkled, 0..1 */
  snarl: number
  /** head lifted (+) or lowered (-), rad */
  head: number
}

const ZERO: Targets = { jaw: 0.02, pant: 0, tongue: 0, lid: 0, wide: 0, ears: 0, earsOut: 0, snarl: 0, head: 0 }
const EXPR: Record<Expression, Partial<Targets>> = {
  normal: {},
  alert: { ears: 0.28, earsOut: -0.08, wide: 0.45, head: 0.14 },
  aggressive: { snarl: 0.7, jaw: 0.1, ears: -0.38, lid: 0.3, head: -0.16 },
  angry: { snarl: 1, jaw: 0.2, ears: -0.55, lid: 0.35, head: -0.08 },
  howl: { jaw: 0.36, ears: -0.3, lid: 0.55, head: 0.95 },
  happy: { jaw: 0.24, pant: 0.45, tongue: 0.55, ears: -0.12, earsOut: 0.16, lid: 0.18 },
  exhausted: { jaw: 0.3, pant: 1, tongue: 0.85, ears: -0.3, earsOut: 0.32, lid: 0.5, head: -0.18 },
  surprised: { wide: 1, ears: 0.38, head: 0.22, jaw: 0.08 },
}

export interface FaceInput {
  pose: 'idle' | 'run' | 'jump' | 'slide' | 'roll' | 'dead' | 'victory'
  speed: number
  /** 0..1 through the start action, when it is a howl */
  howl?: number
  /** the character screen's choice (overrides what the game would pick) */
  expression?: Expression | null
}

const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
const m1 = new THREE.Matrix4()
const m2 = new THREE.Matrix4()
const m3 = new THREE.Matrix4()
const mInvFace = new THREE.Matrix4()
const vTmp = new THREE.Vector3()
const sTmp = new THREE.Vector3()
const v3 = new THREE.Matrix3()

type Bone = THREE.Object3D

/**
 * A bone's name without its exporter index or separators: three.js deletes the dots from names when it loads a
 * model ('ear.L_22' arrives as 'earL_22'), so 'ear_L', 'ear.L' and 'earL_22' all become 'earL'.
 */
export const boneKey = (name: string) => name.replace(/_\d+$/, '').replace(/[._]/g, '')

/** the eyelid ring: how far each bone moves (face-space y, model units) when the eye closes fully */
const LID_CLOSE: [string, number][] = [
  ['lid_T_%_001', -0.01], ['lid_T_%_002', -0.016], ['lid_T_%_003', -0.01],
  ['lid_B_%', 0], ['lid_B_%_001', 0.003], ['lid_B_%_002', 0.003], ['lid_B_%_003', 0.002],
]
/** lifting the upper lid when the eyes open wide */
const LID_WIDE: [string, number][] = [['lid_T_%_001', 0.003], ['lid_T_%_002', 0.005], ['lid_T_%_003', 0.003], ['lid_B_%', 0]]

export class AnimalFace {
  private face: Bone
  private bones = new Map<string, Bone>()
  /** the clip's pose of every bone this touches (re-read each frame unless the clip left it as we wrote it) */
  private base = new Map<Bone, { p: THREE.Vector3; q: THREE.Quaternion; wp: THREE.Vector3; wq: THREE.Quaternion }>()
  private cur: Targets = { ...ZERO }
  private t = 0
  private blinkIn = 2
  private blinkT = -1
  private flick = { side: 0, t: -1, wait: 3 }
  private menu = { expr: 'normal' as Expression, left: 4, i: 0 }
  private deadT = 0

  private constructor(face: Bone, root: THREE.Object3D) {
    this.face = face
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(boneKey(o.name), o)
    })
  }

  /** a face controller for this model, or null if it has no face rig */
  static find(root: THREE.Object3D): AnimalFace | null {
    let face: Bone | null = null
    root.traverse((o) => {
      if (!face && (o as THREE.Bone).isBone && /^face(_\d+)?$/.test(o.name)) face = o
    })
    if (!face) return null
    const f = new AnimalFace(face, root)
    return f.b('jaw') && f.b('lip_T_L') && f.b('ear_L') ? f : null
  }

  private b(name: string) {
    return this.bones.get(boneKey(name)) ?? null
  }

  private pick(inp: FaceInput, dt: number): Targets {
    const T: Targets = { ...ZERO }
    const add = (e: Partial<Targets>, w: number) => {
      for (const k in e) {
        const key = k as keyof Targets
        T[key] += ((e[key] as number) - (key === 'jaw' ? ZERO.jaw : 0)) * w
      }
    }
    if (inp.pose === 'dead') this.deadT += dt
    else this.deadT = 0
    if (inp.expression) {
      add(EXPR[inp.expression], 1)
      return T
    }
    switch (inp.pose) {
      case 'run': {
        // running: the mouth a little open, panting with the stride, ears back more the faster it goes
        const sprint = THREE.MathUtils.clamp((inp.speed - 11) / 9, 0, 1)
        T.jaw = 0.08 + 0.13 * sprint
        T.pant = 0.45 + 0.4 * sprint
        T.tongue = 0.2 + 0.35 * sprint
        T.ears = -0.15 - 0.4 * sprint
        T.lid = 0.08
        T.head = -0.04 * sprint
        break
      }
      case 'jump':
        // eyes on the landing, ears swept back, mouth nearly shut
        T.jaw = 0.05
        T.ears = -0.42
        T.wide = 0.35
        T.head = -0.12
        break
      case 'slide':
      case 'roll':
        T.ears = -0.6
        T.lid = 0.55
        T.jaw = 0.04
        break
      case 'dead':
        // the shock of the crash, then exhausted panting
        add(EXPR[this.deadT < 0.7 ? 'surprised' : 'exhausted'], 1)
        break
      case 'victory':
        add(EXPR.happy, 1)
        break
      default: {
        if (inp.howl !== undefined && inp.howl > 0) {
          // the start-line howl: the head rises, the mouth rounds open and holds, then settles
          const w = THREE.MathUtils.smoothstep(inp.howl, 0.2, 0.42) * (1 - THREE.MathUtils.smoothstep(inp.howl, 0.85, 1))
          add(EXPR.alert, 1 - w)
          add(EXPR.howl, w)
          break
        }
        // resting (menus): relaxed most of the time, now and then alert or panting happily
        const m = this.menu
        m.left -= dt
        if (m.left <= 0) {
          const cycle: Expression[] = ['normal', 'alert', 'normal', 'happy', 'normal', 'alert']
          m.i = (m.i + 1) % cycle.length
          m.expr = cycle[m.i]
          m.left = m.expr === 'normal' ? 3.5 : 3
        }
        add(EXPR[m.expr], 1)
      }
    }
    return T
  }

  update(inp: FaceInput, dt: number) {
    if (dt <= 0) return
    this.t += dt
    // ease toward the chosen expression (faster for sudden ones: a crash, a jump)
    const want = this.pick(inp, dt)
    const rate = inp.pose === 'jump' || inp.pose === 'dead' ? 10 : 5
    const c = this.cur
    for (const k in want) {
      const key = k as keyof Targets
      c[key] += (want[key] - c[key]) * Math.min(1, dt * rate)
    }

    // blinking: every 2-6 s, a 0.16 s close-and-open (often a double blink at rest)
    this.blinkIn -= dt
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0
      this.blinkIn = 2 + Math.random() * 4 + (Math.random() < 0.2 ? -1.8 : 0)
    }
    let blink = 0
    if (this.blinkT >= 0) {
      this.blinkT += dt
      blink = Math.sin(Math.min(1, this.blinkT / 0.16) * Math.PI)
      if (this.blinkT >= 0.16) this.blinkT = -1
    }
    // an ear flick now and then at rest (one ear turns and springs back)
    const f = this.flick
    if (inp.pose === 'idle') {
      f.wait -= dt
      if (f.wait <= 0 && f.t < 0) {
        f.t = 0
        f.side = Math.random() < 0.5 ? -1 : 1
        f.wait = 2.5 + Math.random() * 4
      }
    }
    let flick = 0
    if (f.t >= 0) {
      f.t += dt
      flick = Math.sin(Math.min(1, f.t / 0.35) * Math.PI) * 0.35
      if (f.t >= 0.35) f.t = -1
    }
    // panting rhythm: quicker the harder it pants
    const pantHz = 2.2 + 2.2 * Math.min(1, c.pant)
    const pantW = 0.5 + 0.5 * Math.sin(this.t * pantHz * Math.PI * 2)
    const jaw = Math.max(0, c.jaw + c.pant * 0.07 * pantW)
    const lid = Math.min(1, Math.max(c.lid, blink))

    this.restoreBase()
    const face = this.face
    face.updateMatrixWorld(true)
    mInvFace.copy(face.matrixWorld).invert()

    // head: lift or lower the whole head at the neck
    const neck = face.parent
    if (neck && Math.abs(c.head) > 1e-4) {
      neck.updateMatrixWorld(true)
      const neckAt = new THREE.Vector3().setFromMatrixPosition(m1.multiplyMatrices(mInvFace, neck.matrixWorld))
      this.rotateAbout(neck, X, -c.head * 0.6, neckAt)
      face.updateMatrixWorld(true)
      mInvFace.copy(face.matrixWorld).invert()
      this.rotateAbout(face, X, -c.head * 0.4, new THREE.Vector3())
      face.updateMatrixWorld(true)
      mInvFace.copy(face.matrixWorld).invert()
    }

    // jaw: the lower jaw, lower lips, lower teeth and tongue swing together about the hinge
    const hinge = new THREE.Vector3(0.001, -0.046, -0.029)
    for (const n of ['jaw', 'lip_B_L', 'lip_B_R', 'teeth_B']) {
      const bn = this.b(n)
      if (bn) this.rotateAbout(bn, X, jaw, hinge)
    }
    // the side jaw lines from the temples follow most of the way
    for (const n of ['jaw_L_001', 'jaw_R_001']) {
      const bn = this.b(n)
      if (bn) this.rotateAbout(bn, X, jaw * 0.8, hinge)
    }
    // tongue: rides the jaw, slides forward over the teeth and droops at the tip as it pants
    const tongue = this.b('tongue')
    if (tongue) {
      const out = c.tongue * (0.75 + 0.25 * pantW)
      this.rotateAbout(tongue, X, jaw * 0.9 + out * 0.35, hinge)
      this.translateFace(tongue, new THREE.Vector3(0, -0.012 * out, 0.042 * out))
    }

    // snarl: the upper lip lifts off the canines, pulls back at the corners; the nose bunches up
    if (c.snarl > 1e-3) {
      for (const s of ['L', 'R']) {
        const front = this.b(`lip_T_${s}`)
        const side = this.b(`lip_T_${s}_001`)
        if (front) this.translateFace(front, new THREE.Vector3(0, 0.007 * c.snarl, -0.004 * c.snarl))
        if (side) this.translateFace(side, new THREE.Vector3(0, 0.008 * c.snarl, -0.006 * c.snarl))
        const cheek = this.b(`cheek_T_${s}`)
        if (cheek) this.translateFace(cheek, new THREE.Vector3(0, 0.004 * c.snarl, -0.003 * c.snarl))
        const brow = this.b(`brow_B_${s}`)
        if (brow) this.translateFace(brow, new THREE.Vector3(0, -0.004 * c.snarl, 0.002 * c.snarl))
      }
      const nose = this.b('nose')
      if (nose) this.translateFace(nose, new THREE.Vector3(0, 0.004 * c.snarl, -0.005 * c.snarl))
    }

    // eyes: lids close (blink, squint) or lift (wide), each bone of the ring by its share
    for (const s of ['L', 'R']) {
      const amount = new Map<string, number>()
      for (const [n, d] of LID_CLOSE) amount.set(n.replace('%', s), d * lid)
      for (const [n, d] of LID_WIDE) amount.set(n.replace('%', s), (amount.get(n.replace('%', s)) ?? 0) + d * c.wide * (1 - lid))
      // the ring is one chain: each bone moves by its own amount minus what its parent already moved
      let parentMoved = 0
      for (const n of ['lid_T_%_001', 'lid_T_%_002', 'lid_T_%_003', 'lid_B_%', 'lid_B_%_001', 'lid_B_%_002', 'lid_B_%_003']) {
        const name = n.replace('%', s)
        const bn = this.b(name)
        const want = amount.get(name) ?? 0
        if (bn) this.translateFace(bn, vTmp.set(0, want - parentMoved, 0).clone())
        parentMoved = want
      }
      const brow = this.b(`brow_B_${s}`)
      if (brow && c.wide > 1e-3) this.translateFace(brow, new THREE.Vector3(0, 0.004 * c.wide, 0))
    }

    // ears: tipped forward / pinned back, spread out, plus the occasional flick
    for (const s of ['L', 'R'] as const) {
      const ear = this.b(`ear_${s}`)
      if (!ear) continue
      const side = s === 'L' ? 1 : -1
      const pivot = ear.position.clone()
      const fl = (side === f.side ? flick : 0)
      this.rotateAbout(ear, X, c.ears + fl * 0.6, pivot)
      this.rotateAbout(ear, Z, -side * (c.earsOut + fl * 0.3), pivot)
    }

    this.saveWritten()
  }

  // ---------------------------------------------------------------- bone helpers

  /** put every touched bone back to the clip's pose, so offsets never pile up when no clip drives the face */
  private restoreBase() {
    for (const [bn, s] of this.base) {
      // a clip wrote a new pose this frame: that is the new base; otherwise go back to the last base
      if (bn.position.equals(s.wp) && bn.quaternion.equals(s.wq)) {
        bn.position.copy(s.p)
        bn.quaternion.copy(s.q)
      } else {
        s.p.copy(bn.position)
        s.q.copy(bn.quaternion)
      }
    }
  }

  private track(bn: Bone) {
    if (!this.base.has(bn)) this.base.set(bn, { p: bn.position.clone(), q: bn.quaternion.clone(), wp: new THREE.Vector3(NaN), wq: new THREE.Quaternion() })
  }

  private saveWritten() {
    for (const [bn, s] of this.base) {
      s.wp.copy(bn.position)
      s.wq.copy(bn.quaternion)
    }
  }

  /** rotate a bone about a face-space axis through a face-space pivot */
  private rotateAbout(bn: Bone, axis: THREE.Vector3, angle: number, pivot: THREE.Vector3) {
    if (Math.abs(angle) < 1e-5 || !bn.parent) return
    this.track(bn)
    bn.updateMatrixWorld(true)
    // the bone in face space
    m1.multiplyMatrices(mInvFace, bn.matrixWorld)
    // rotate about the pivot (when the bone is the face itself, its own space is used)
    m2.makeTranslation(pivot.x, pivot.y, pivot.z)
    m3.makeRotationAxis(axis, angle)
    m2.multiply(m3)
    m3.makeTranslation(-pivot.x, -pivot.y, -pivot.z)
    m2.multiply(m3)
    if (bn === this.face) {
      // rotating the face in its own frame: post-multiply its local matrix
      m1.copy(bn.matrix).multiply(m2)
      m1.decompose(bn.position, bn.quaternion, sTmp)
      bn.updateMatrixWorld(true)
      return
    }
    m1.premultiply(m2)
    // back to the parent's space: local = (face->parent)^-1 * faceSpace
    m3.multiplyMatrices(mInvFace, bn.parent.matrixWorld).invert()
    m1.premultiply(m3)
    m1.decompose(bn.position, bn.quaternion, sTmp)
    bn.updateMatrixWorld(true)
  }

  /** move a bone by a face-space offset */
  private translateFace(bn: Bone, d: THREE.Vector3) {
    if (!bn.parent || d.lengthSq() < 1e-12) return
    this.track(bn)
    // face-space direction into the parent's space (rotation and scale of face->parent)
    m3.multiplyMatrices(mInvFace, bn.parent.matrixWorld).invert()
    v3.setFromMatrix4(m3)
    bn.position.add(d.clone().applyMatrix3(v3))
    bn.updateMatrixWorld(true)
  }
}
