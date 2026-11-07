import { ZONE_LEN, biomeAt, type BiomeId } from '../engine/content'
import { hash01 } from './props'
import { laneX } from '../engine/run'

/*
 * The winding trail. Gameplay stays on a straight line (distance d, lanes across it); this module only
 * decides where that line goes in the world: straights, gentle curves, sharp 90° turns, S-bends, rolling
 * slopes and a little banking. Curvature ramps in and out over transition lengths (clothoids), so the trail
 * never kinks. Everything is sampled every STEP metres and integrated once, then cached.
 *
 * Heading 0 points down +Z; positive curvature turns toward +X (screen-left in the chase camera).
 */

export const STEP = 0.5

interface Bend {
  /** start distance */
  s: number
  /** transition (ramp) length at each end */
  ramp: number
  /** full-curvature length between the ramps */
  hold: number
  /** signed curvature (1/m) */
  k: number
}

export type TurnKind = 'straight' | 'gentle' | 'sharp' | 's-bend' | 'fork'

/** what the path needs to know about a route choice */
export interface ForkRef {
  d: number
  /** index of the picked route, -1 before the choice */
  picked: number
  routes: { dir: number; lane: number }[]
}
const FORK_R = 38
/**
 * Every zone boundary (every 400 m) is a sharp 90-degree corner, left or right: the new place starts round a hard
 * cut, not along a sweeping bend. The corner is tight (radius CORNER_R) and centred on the boundary, which the
 * generator keeps free of obstacles.
 */
export const CORNER_R = 6
const CORNER_RAMP = 1
const CORNER_HOLD = (Math.PI / 2) * CORNER_R - CORNER_RAMP
export const CORNER_LEN = CORNER_HOLD + CORNER_RAMP * 2
const FORK_ANG = (38 * Math.PI) / 180

/** Signed curvature at distance s for a list of bends. */
function curvature(bends: Bend[], s: number): number {
  let k = 0
  for (const b of bends) {
    const u = s - b.s
    const len = b.ramp * 2 + b.hold
    if (u < 0 || u > len) continue
    const r = u < b.ramp ? u / b.ramp : u > b.ramp + b.hold ? (len - u) / b.ramp : 1
    k += b.k * (r * r * (3 - 2 * r))
  }
  return k
}

/** Hill amplitude (m) for each world: flat on bridges, rolling in the forest, real slopes on the mountain path. */
const HILL: Record<BiomeId, number> = { forest: 1.4, waterfall: 0.7, hills: 3.6, river: 0, ruins: 0.9, jungle: 1.1, moonlit: 1.6, bamboo: 0.8, pine: 2.4, autumn: 1.5, snow: 2.0, savannah: 1.2, desert: 1.8, canyon: 0.8, swamp: 0, volcanic: 1.6, coast: 0, blossom: 1.6, ice: 1.0, birch: 1.3, flower: 1.2, mossy: 1.4, giantroot: 1.2, mist: 1.6, redwood: 1.8, fern: 1.2, baobab: 1.0, grassland: 1.4, mangrove: 0, jacaranda: 1.4, cedar: 1.8, lakeside: 0.6, temple: 0.6, railway: 0.8, cliffside: 1.0, glow: 1.0, beach: 0, thaw: 1.6, deadwood: 1.4, lagoon: 0 }

export class TrackPath {
  private bends: Bend[] = []
  private planEnd = 0
  private n = 0
  // per-sample world values
  private X = new Float64Array(0)
  private Z = new Float64Array(0)
  private H = new Float64Array(0)
  private K = new Float32Array(0)
  private Y = new Float32Array(0)
  private turns: { s: number; e: number; kind: TurnKind; dir: number }[] = []

  private seed: number
  /** false: a straight, flat trail (menus) */
  private enabled: boolean
  private getForks: () => ForkRef[]
  /** the branch bend after each split (its direction is the choice) */
  private forkBends: { d: number; s: number; ramp: number; hold: number }[] = []
  private forkDir = new Map<number, number>()
  /** this path takes a given direction at a split that is not chosen yet (the two branches drawn before a choice) */
  private override: { d: number; dir: number; lane: number } | null = null
  /**
   * Sideways shift of the trail centre after each split: every road starts on its own side of the trail
   * (the left road from the left lane, the right road from the right lane) and curves away from there.
   */
  private forkOff = new Map<number, number>()
  constructor(seed: number, enabled = true, getForks: () => ForkRef[] = () => []) {
    this.seed = seed
    this.enabled = enabled
    this.getForks = getForks
  }

  /** A copy that takes direction dir at the split at distance d (samples past the split are recomputed). */
  branch(d: number, dir: number, lane = 1): TrackPath {
    const t = new TrackPath(this.seed, this.enabled, this.getForks)
    t.bends = this.bends.slice()
    t.turns = this.turns.slice()
    t.planEnd = this.planEnd
    t.forkBends = this.forkBends.slice()
    t.forkDir = new Map(this.forkDir)
    t.forkOff = new Map(this.forkOff)
    t.override = { d, dir, lane }
    t.X = this.X.slice()
    t.Z = this.Z.slice()
    t.H = this.H.slice()
    t.K = this.K.slice()
    t.Y = this.Y.slice()
    t.n = Math.min(this.n, Math.max(1, Math.floor(d / STEP) - 1))
    return t
  }

  /** total sideways shift of the centre line at s from the splits behind it */
  private offsetAt(s: number) {
    if (!this.enabled) return 0
    let o = 0
    for (const b of this.forkBends) {
      if (s < b.d) continue
      if (this.override && this.override.d === b.d) {
        o += laneX(this.override.lane)
        continue
      }
      if (!this.forkOff.has(b.d)) {
        const f = this.getForks().find((x) => x.d === b.d)
        if (f && f.picked >= 0) this.forkOff.set(b.d, laneX(f.routes[f.picked].lane))
      }
      o += this.forkOff.get(b.d) ?? 0
    }
    return o
  }

  private dirOf(d: number) {
    if (this.override && this.override.d === d) return this.override.dir
    const f = this.getForks().find((x) => x.d === d)
    if (f && f.picked >= 0) this.forkDir.set(d, f.routes[f.picked].dir)
    return this.forkDir.get(d) ?? 0
  }

  /** +1 the corner at boundary b turns left (toward +X), -1 right, 0 no corner (menus, the start) */
  cornerDir(b: number): number {
    if (!this.enabled || b < ZONE_LEN || b % ZONE_LEN !== 0) return 0
    return hash01(b / ZONE_LEN + this.seed * 131, 77) < 0.5 ? 1 : -1
  }

  private cornerCurvature(s: number) {
    const b = Math.round(s / ZONE_LEN) * ZONE_LEN
    const dir = this.cornerDir(b)
    if (!dir) return 0
    const u = s - (b - CORNER_LEN / 2)
    if (u < 0 || u > CORNER_LEN) return 0
    const r = u < CORNER_RAMP ? u / CORNER_RAMP : u > CORNER_RAMP + CORNER_HOLD ? (CORNER_LEN - u) / CORNER_RAMP : 1
    return (dir / CORNER_R) * (r * r * (3 - 2 * r))
  }

  private forkCurvature(s: number) {
    let k = 0
    for (const b of this.forkBends) {
      const u = s - b.s
      const len = b.ramp * 2 + b.hold
      if (u < 0 || u > len) continue
      const dir = this.dirOf(b.d)
      if (!dir) continue
      const r = u < b.ramp ? u / b.ramp : u > b.ramp + b.hold ? (len - u) / b.ramp : 1
      k += (dir / FORK_R) * (r * r * (3 - 2 * r))
    }
    return k
  }

  private rnd(i: number, salt: number) {
    return hash01(i * 7919 + this.seed * 31, salt)
  }

  /** Lay out bends up to distance s. */
  private plan(to: number) {
    let i = this.bends.length + this.turns.length
    if (this.planEnd === 0) this.planEnd = 45 // a straight start
    while (this.planEnd < to) {
      const s = this.planEnd
      const r = this.rnd(i, 1)
      const dir = this.rnd(i, 2) < 0.5 ? -1 : 1
      if (!this.enabled) {
        this.planEnd += 200
        continue
      }
      // a split coming up: run straight into it, then the branch bend, then straight on
      const fork = this.getForks().find((f) => f.d + 70 > s && !this.forkBends.some((b) => b.d === f.d))
      const room = fork ? fork.d - 30 - s : Infinity
      if (fork && room < 30) {
        const ramp = 10
        this.forkBends.push({ d: fork.d, s: fork.d + 2, ramp, hold: Math.max(0, FORK_ANG * FORK_R - ramp) })
        this.turns.push({ s, e: fork.d + 70, kind: 'fork', dir: 0 })
        this.planEnd = Math.max(s + 1, fork.d + 70)
        i++
        continue
      }
      // the next piece, then check it fits before a split (a gentle curve sized to the room if not)
      type Piece = { kind: TurnKind; len: number; bends: Bend[]; gap: number }
      let piece: Piece
      if (r < 0.3) {
        piece = { kind: 'straight', len: 30 + this.rnd(i, 3) * 50, bends: [], gap: 0 }
      } else if (r < 0.62) {
        // gentle curve: 25-55 degrees on a 60-95 m radius
        const R = 60 + this.rnd(i, 4) * 35
        const ang = ((25 + this.rnd(i, 5) * 30) * Math.PI) / 180
        const ramp = 14
        const hold = Math.max(0, ang * R - ramp)
        piece = { kind: 'gentle', len: ramp * 2 + hold, bends: [{ s, ramp, hold, k: dir / R }], gap: 8 }
      } else if (r < 0.82) {
        // sharp turn: ~90 degrees on a 26-32 m radius
        const R = 26 + this.rnd(i, 6) * 6
        const ang = ((80 + this.rnd(i, 7) * 15) * Math.PI) / 180
        const ramp = 10
        const hold = Math.max(0, ang * R - ramp)
        piece = { kind: 'sharp', len: ramp * 2 + hold, bends: [{ s, ramp, hold, k: dir / R }], gap: 14 }
      } else {
        // S-bend: two opposite curves
        const R = 45 + this.rnd(i, 8) * 25
        const ang = ((30 + this.rnd(i, 9) * 20) * Math.PI) / 180
        const ramp = 12
        const hold = Math.max(0, ang * R - ramp)
        const len = ramp * 2 + hold
        piece = { kind: 's-bend', len: len * 2, bends: [{ s, ramp, hold, k: dir / R }, { s: s + len, ramp, hold, k: -dir / R }], gap: 8 }
      }
      if (piece.len + piece.gap > room) {
        if (room >= 40) {
          const ramp = 14
          const hold = Math.max(0, room - ramp * 2 - 6)
          piece = { kind: 'gentle', len: ramp * 2 + hold, bends: [{ s, ramp, hold, k: dir / 70 }], gap: 6 }
        } else piece = { kind: 'straight', len: room, bends: [], gap: 0 }
      }
      this.bends.push(...piece.bends)
      this.turns.push({ s, e: s + piece.len, kind: piece.kind, dir: piece.kind === 'straight' ? 0 : dir })
      this.planEnd += piece.len + piece.gap
      i++
    }
  }

  private height(s: number) {
    if (!this.enabled) return 0
    // amplitude follows the world, blended across the 100 m boundaries
    const a0 = HILL[biomeAt(s).biome.id]
    const into = s % 100
    const aN = into > 85 ? HILL[biomeAt(s + 20).biome.id] : a0
    const aP = into < 15 && s > 20 ? HILL[biomeAt(s - 20).biome.id] : a0
    const t = into > 85 ? (into - 85) / 30 : into < 15 ? 0.5 + into / 30 : 1
    const amp = into > 85 ? a0 + (aN - a0) * t : into < 15 ? aP + (a0 - aP) * t : a0
    const p1 = this.rnd(0, 11) * 6.28
    const p2 = this.rnd(0, 12) * 6.28
    const start = Math.min(1, s / 60)
    return amp * start * (0.6 * Math.sin((2 * Math.PI * s) / 230 + p1) + 0.4 * Math.sin((2 * Math.PI * s) / 115 + p2))
  }

  /** Make sure samples cover [0, s]. */
  ensure(s: number) {
    const need = Math.ceil(s / STEP) + 2
    if (need <= this.n) return
    this.plan(s + 200)
    if (need > this.X.length) {
      const cap = Math.max(need, this.X.length * 2, 1024)
      const grow = <T extends Float64Array | Float32Array>(a: T, C: new (n: number) => T) => {
        const b = new C(cap)
        b.set(a)
        return b
      }
      this.X = grow(this.X, Float64Array)
      this.Z = grow(this.Z, Float64Array)
      this.H = grow(this.H, Float64Array)
      this.K = grow(this.K, Float32Array)
      this.Y = grow(this.Y, Float32Array)
    }
    for (let i = this.n; i < need; i++) {
      const sp = i * STEP
      const k = curvature(this.bends, sp) + this.forkCurvature(sp) + this.cornerCurvature(sp)
      this.K[i] = k
      this.Y[i] = this.height(sp)
      if (i === 0) {
        this.X[0] = this.Z[0] = this.H[0] = 0
        continue
      }
      // midpoint integration of the heading
      const km = (k + this.K[i - 1]) / 2
      const h = this.H[i - 1] + km * STEP
      const hm = (h + this.H[i - 1]) / 2
      this.H[i] = h
      this.X[i] = this.X[i - 1] + Math.sin(hm) * STEP
      this.Z[i] = this.Z[i - 1] + Math.cos(hm) * STEP
    }
    this.n = need
  }

  /** World-space sample at s (linear between samples). */
  at(s: number, out: { x: number; z: number; heading: number; y: number; k: number }) {
    const f = Math.max(0, s) / STEP
    this.ensure(Math.max(0, s) + STEP * 2)
    const i = Math.floor(f)
    const t = f - i
    const L = (a: ArrayLike<number>) => a[i] + (a[i + 1] - a[i]) * t
    out.x = L(this.X)
    out.z = L(this.Z)
    out.heading = L(this.H)
    out.y = L(this.Y)
    out.k = L(this.K)
    const off = this.offsetAt(s)
    if (off) {
      out.x += Math.cos(out.heading) * off
      out.z -= Math.sin(out.heading) * off
    }
    if (s < 0) {
      // before the start: straight back
      out.x = Math.sin(this.H[0]) * s
      out.z = Math.cos(this.H[0]) * s
    }
    return out
  }

  /** The turn (if any) at distance s, for the HUD and scenery. */
  turnAt(s: number) {
    this.plan(s + 50)
    for (const t of this.turns) if (s >= t.s && s < t.e) return t
    return null
  }
}

/** Banking (rad) for a curvature: lean into the turn, a little more on sharp ones. */
export const bankFor = (k: number) => Math.max(-0.07, Math.min(0.07, -k * 1.6))
