/*
 * Amazon Wild Run data: the animals, the endless jungle trail and its seeded generator.
 * World units are metres. The trail runs along +Z; the camera sits behind the runner looking down +Z.
 */

export interface AnimalDef {
  id: string
  name: string
  /** 1-10. Top speed: faster animals pull ahead in a race. */
  speed: number
  /** 1-10. Longer, higher jumps (more forgiving timing). */
  jump: number
  /** 1-10. Longer slides; computer runners with stamina last longer. */
  stamina: number
  /** Coins to unlock; 0 = free. */
  price: number
  /** Rewarded ads that unlock it instead of coins (phones only). */
  ads?: number
  model: string
  portrait: string
  /** Model scale so every animal reads at its real-world size. */
  scale: number
  blurb: string
}

const M = '/models/amazon'

export const ANIMALS: AnimalDef[] = [
  { id: 'wolf', name: 'Grey Wolf', speed: 7, jump: 6, stamina: 8, price: 0, model: `${M}/wolf.glb`, portrait: `${M}/portraits/wolf.png`, scale: 1, blurb: 'Steady and tireless' },
  { id: 'hyena', name: 'Hyena', speed: 6, jump: 5, stamina: 9, price: 0, model: `${M}/hyena.glb`, portrait: `${M}/portraits/hyena.png`, scale: 0.95, blurb: 'Never gives up' },
  { id: 'leopard', name: 'Leopard', speed: 8, jump: 8, stamina: 5, price: 300, ads: 2, model: `${M}/leopard.glb`, portrait: `${M}/portraits/leopard.png`, scale: 0.95, blurb: 'Agile jumper' },
  { id: 'cheetah', name: 'Cheetah', speed: 10, jump: 5, stamina: 4, price: 500, ads: 1, model: `${M}/cheetah.glb`, portrait: `${M}/portraits/cheetah.png`, scale: 0.95, blurb: 'Fastest on four legs' },
  { id: 'tiger', name: 'Tiger', speed: 8, jump: 7, stamina: 6, price: 400, model: `${M}/tiger.glb`, portrait: `${M}/portraits/tiger.png`, scale: 1.05, blurb: 'Power and speed' },
  { id: 'lion', name: 'Lion', speed: 7, jump: 6, stamina: 9, price: 800, model: `${M}/lion.glb`, portrait: `${M}/portraits/lion.png`, scale: 1.05, blurb: 'King of endurance' },
  { id: 'panther', name: 'Black Panther', speed: 9, jump: 9, stamina: 6, price: 1200, model: `${M}/panther.glb`, portrait: `${M}/portraits/panther.png`, scale: 1, blurb: 'Shadow of the jungle' },
]

export function getAnimal(id: string | null | undefined): AnimalDef {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0]
}

// ---- trail ----

/** Lane centres, left to right as seen from behind the runner (the camera looks down +Z, so +X is screen-left). */
export const LANE_X = [1.7, 0, -1.7] as const
export const TRAIL_WIDTH = 6

export const BASE_SPEED = 9 // m/s at the start
export const MAX_SPEED = 21
export const SPEED_ACCEL = 0.0055 // m/s gained per metre run
export const START_CLEAR = 30 // first obstacle distance

export function speedAt(distance: number, animal: AnimalDef): number {
  const base = Math.min(MAX_SPEED, BASE_SPEED + distance * SPEED_ACCEL)
  return base * (0.94 + animal.speed * 0.01)
}

export function jumpMs(animal: AnimalDef) {
  return 560 + animal.jump * 18
}

export function slideMs(animal: AnimalDef) {
  return 520 + animal.stamina * 16
}

export const JUMP_HEIGHT = 1.35
export const MAGNET_MS = 8000
export const MAGNET_RANGE = 4.5

export type ObstacleKind = 'rock' | 'log' | 'branch'
export type ItemKind = 'coin' | ObstacleKind | 'magnet' | 'shield'

export interface TrackItem {
  id: number
  d: number
  lane: 0 | 1 | 2
  kind: ItemKind
}

export function isObstacle(kind: ItemKind): kind is ObstacleKind {
  return kind === 'rock' || kind === 'log' || kind === 'branch'
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer hash -> [0,1), for placing scenery deterministically by segment index. */
export function hash01(n: number, salt = 0): number {
  let h = (n * 374761393 + salt * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Seeded trail: every device that shares the seed builds the identical obstacle sequence, so friends
 * race the same jungle. Every row leaves at least one lane that can be passed.
 */
export class TrackGen {
  private rng: () => number
  private next = START_CLEAR
  private nextId = 1
  items: TrackItem[] = []

  constructor(seed: number) {
    this.rng = mulberry32(seed)
  }

  private lane(): 0 | 1 | 2 {
    return Math.floor(this.rng() * 3) as 0 | 1 | 2
  }

  private push(d: number, lane: 0 | 1 | 2, kind: ItemKind) {
    this.items.push({ id: this.nextId++, d, lane, kind })
  }

  /** Generate up to `ahead`, and drop items before `behind`. */
  advance(ahead: number, behind: number) {
    const r = this.rng
    while (this.next < ahead) {
      const d = this.next
      // obstacles get closer together the further you run
      const gap = Math.max(11, 22 - d / 160)
      const roll = r()
      if (roll < 0.06 && d > 120) {
        this.push(d, this.lane(), r() < 0.5 ? 'magnet' : 'shield')
        this.next = d + gap * 0.6
        continue
      }
      if (roll < 0.3) {
        // coin trail, sometimes over a log so you jump for them
        const lane = this.lane()
        const n = 5 + Math.floor(r() * 4)
        for (let k = 0; k < n; k++) this.push(d + k * 2, lane, 'coin')
        this.next = d + n * 2 + gap * 0.5
        continue
      }
      const kinds: ObstacleKind[] = ['rock', 'log', 'branch']
      const a = this.lane()
      const ka = kinds[Math.floor(r() * 3)]
      this.push(d, a, ka)
      const doubleChance = Math.min(0.55, 0.12 + d / 1500)
      if (r() < doubleChance) {
        let b = this.lane()
        if (b === a) b = ((a + 1 + Math.floor(r() * 2)) % 3) as 0 | 1 | 2
        this.push(d, b, kinds[Math.floor(r() * 3)])
      }
      // a few coins in a free lane after the obstacle as a reward
      if (r() < 0.35) {
        const used = new Set(this.items.filter((i) => i.d === d).map((i) => i.lane))
        const free = ([0, 1, 2] as const).find((l) => !used.has(l))
        if (free !== undefined) for (let k = 1; k <= 3; k++) this.push(d + k * 2, free, 'coin')
      }
      this.next = d + gap * (0.8 + r() * 0.5)
    }
    if (this.items.length && this.items[0].d < behind) this.items = this.items.filter((i) => i.d >= behind)
  }
}
