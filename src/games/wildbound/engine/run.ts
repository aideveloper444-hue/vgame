import {
  BIOMES,
  BIOME_NAME,
  POWER_KINDS,
  isPowerUp,
  type SectionKind,
  BREAKABLE,
  ESCAPES,
  OBSTACLES_BY_BIOME,
  ZONE_LEN,
  SECTION_MIN_TIER,
  SECTION_NO_REPEAT,
  tierAt,
  tierName,
  biomeAt,
  GRIP,
  gripOf,
  type Grip,
  getAnimal,
  isObstacle,
  powerUp,
  type AbilityKind,
  type AnimalDef,
  type AnimalId,
  type BiomeId,
  type ItemKind,
  type ObstacleKind,
  type PowerUpKind,
} from './content'

/*
 * Wildbound endless-run simulation. Deterministic for a seed and an input sequence, no rendering: the 3D
 * scene and HUD read `state` and `items` every frame.
 *
 * World: metres; the trail runs along +d. Lanes 0 (left) 1 (centre) 2 (right) as the player sees them.
 * Generation is seeded and fair: every row leaves at least one way through, rows are spaced by a reaction
 * window that grows with speed, and the 10 m around every 100 m section boundary (and so every 400 m zone boundary) stays clear.
 */

export const LANE_W = 2.1
export const laneX = (lane: number) => (1 - lane) * LANE_W // camera looks down +Z, so +X is screen-left

export const BASE_SPEED = 9
export const MAX_SPEED = 22
export const ACCEL = 0.0065 // m/s per metre
export const JUMP_MS = 640
export const JUMP_H = 1.45
export const LOW_MS = 640
export const START_CLEAR = 32
export const MAGNET_RANGE = 6.5
export const REVIVE_GEMS = 50
/** how long a too-early jump is remembered (ms) */
export const INPUT_BUFFER_MS = 220
/** two slides this close together become a roll (ms) */
export const DOUBLE_MS = 320

export type Lane = 0 | 1 | 2
export type Pose = 'run' | 'jump' | 'slide' | 'roll' | 'dead'
export type Command = 'left' | 'right' | 'jump' | 'slide' | 'roll' | 'ability'

export interface Item {
  id: number
  d: number
  lane: Lane
  kind: ItemKind
  /** coin/gem height above the trail (arcs over jumps) */
  h: number
  /** half length along the trail for obstacles */
  len: number
  gone: boolean
  /** the runner is past it (counted for missions) */
  passed: boolean
  /** broken, pushed, frozen-shattered or knocked away by an ability */
  broken: boolean
  frozen: boolean
  /** boulders roll toward the runner once close */
  moving: number
  /** tutorial step this obstacle teaches */
  tut?: TutStep
  /** rockslide: drops from above as the runner comes near */
  fall?: boolean
  /** a trolley that has been ridden (parked at its buffer stop) */
  ridden?: boolean
  /** vine: where the swing lands (the far lip of the ravine) */
  swingTo?: number
  /** falling tree: this item draws the whole tree; its base stands on this side of the trail (+1 screen-left, lane 0) */
  topple?: 1 | -1
  /** falling tree: how many lanes the trunk covers */
  span?: number
}

/** pits and pools: jumped, carried over by a shield hop, never broken */
const PIT = (k: ObstacleKind) => k === 'gap' || k === 'stream' || k === 'quicksand'

/** A challenge section: railway, river crossing, broken bridge, rockslide or cave. */
export interface Section {
  kind: SectionKind
  from: number
  to: number
  /** railway: the lane the track runs in */
  lane: Lane
  built: boolean
  announced: boolean
}
/** the runner's height standing on a trolley */
export const RIDE_H = 0.95
/** the runner's height standing on the plane's back, parked on the ground */
export const PLANE_DECK = 1.45
/** cruising height of a flight (the runner's feet above the trail) */
export const FLY_H = 5.6
/** The flight profile: the runner's height at progress p (0 board .. 1 land): climb out, cruise with a gentle swell, glide in. */
export function flightAlt(p: number) {
  const q = Math.min(1, Math.max(0, p))
  const up = q < 0.2 ? (q / 0.2) ** 2 * (3 - 2 * (q / 0.2)) : 1
  const down = q > 0.82 ? 1 - ((q - 0.82) / 0.18) ** 2 * (3 - 2 * ((q - 0.82) / 0.18)) : 1
  return PLANE_DECK + FLY_H * Math.min(up, down) * (1 + 0.06 * Math.sin(q * Math.PI * 4))
}
export type RideKind = 'trolley' | 'plane' | 'minecart' | 'raft' | 'jeep'
/** vehicles that are steered: a lane change moves the vehicle (track, channel or line) instead of hopping off */
export const STEERED: RideKind[] = ['minecart', 'raft', 'jeep']
export const isSteered = (k?: RideKind | null) => !!k && STEERED.includes(k)
/** parked vehicles that board when the runner runs into them */
const BOARDS: ObstacleKind[] = ['minecart', 'raft', 'jeep']
/** the rider's height on each vehicle (the raft sits low on the water) */
const RIDE_BASE: Partial<Record<RideKind, number>> = { raft: 0.42, jeep: 1.05 }

/** zipline cables: height at the start gantry and how far they fall to the far one */
export const ZIP_TOP = 6.2
export const ZIP_DROP = 2.0
/** from the paws to the zipline handle */
export const ZIP_HANG = 1.75
/** the cable's height at progress p (0 start gantry .. 1 far gantry) */
export const zipCable = (p: number) => ZIP_TOP - ZIP_DROP * Math.min(1, Math.max(0, p))
/** The rider's height on a zipline at progress p: lifted onto the line, riding the sagging cable, set down on the far lip. */
export function zipAlt(p: number) {
  const q = Math.min(1, Math.max(0, p))
  const ride = (x: number) => zipCable(x) - 0.5 * Math.sin(Math.PI * x) - ZIP_HANG
  const ease = (t: number) => t * t * (3 - 2 * t)
  if (q < 0.12) return SWING_BASE + (ride(0.12) - SWING_BASE) * ease(q / 0.12)
  if (q > 0.88) return ride(0.88) + (SWING_BASE - ride(0.88)) * ease((q - 0.88) / 0.12)
  return ride(q)
}

/** how high a vine swing carries the runner over a ravine */
export const SWING_H = 2.6
/** the runner's height where a swing starts and ends */
const SWING_BASE = 0.75

export type TutStep = 'lane' | 'jump' | 'slide' | 'roll' | 'coins' | 'ability' | 'done'
export const TUT_TEXT: Record<TutStep, string> = {
  lane: 'Swipe LEFT or RIGHT to change lane',
  jump: 'Swipe UP to jump',
  slide: 'Swipe DOWN to slide under',
  roll: 'Tap ROLL to roll under',
  coins: 'Collect the coins!',
  ability: 'Tap your ABILITY button',
  done: 'You are ready. Run!',
}

export type SimEvent =
  | { type: 'coin' | 'gem' | 'token'; d: number; lane: Lane }
  | { type: 'pickup'; kind: PowerUpKind }
  | { type: 'power'; kind: PowerUpKind }
  | { type: 'crash'; kind: ObstacleKind }
  | { type: 'saved'; by: 'shield' | 'loyal' | 'ability' | 'power' }
  | { type: 'break'; kind: ObstacleKind; d: number; lane: Lane }
  | { type: 'biome'; name: string; index: number; zone: number; from: number }
  | { type: 'ability'; kind: AbilityKind }
  | { type: 'milestone'; d: number }
  | { type: 'tutorial'; step: TutStep }
  | { type: 'fork'; fork: Fork }
  | { type: 'route'; fork: Fork; name: string; bonus: RouteBonus }
  | { type: 'section'; section: Section }
  | { type: 'ride'; on: boolean; kind?: RideKind }
  | { type: 'rockfall'; d: number; lane: Lane }
  | { type: 'nearmiss'; kind: ObstacleKind }
  | { type: 'surface'; grip: Grip }
  | { type: 'swing'; on: boolean; zip?: boolean }
  | { type: 'tier'; tier: number; name: string }

export interface RunStats {
  jumps: number
  slides: number
  rolls: number
  laneChanges: number
  powerupsUsed: number
  abilitiesUsed: number
  broken: number
  branchesUnder: number
  waterfallSections: number
  biomesSeen: number
  routesTaken: number
  nearMisses: number
  swings: number
}

export interface RunState {
  t: number
  d: number
  speed: number
  lane: Lane
  x: number
  y: number
  pose: Pose
  poseT: number
  actionAt: number
  actionMs: number
  alive: boolean
  coins: number
  gems: number
  tokens: number
  score: number
  crashKind: ObstacleKind | null
  shieldUntil: number
  magnetUntil: number
  speedUntil: number
  superJumpUntil: number
  megaJumpUntil: number
  boostUntil: number
  /** riding a rail trolley */
  ride: { lane: Lane; end: number; item: number; kind?: RideKind; from?: number } | null
  /** swinging on a vine over a ravine */
  /** a vine swing, or a zipline (zip: the runner can switch cables, lane by lane) */
  swing: { from: number; to: number; lane: Lane; zip?: boolean } | null
  /** how the trail under the paws handles (ice, snow, mud) */
  grip: Grip
  /** the last lane change: from which lane, when and where (close calls) */
  laneFrom: { lane: Lane; t: number; d: number }
  /** height of the ground under the runner (trolley deck), falls back to 0 after a dismount */
  base: number
  abilityUntil: number
  abilityReadyAt: number
  invulnUntil: number
  loyalUsed: boolean
  revives: number
  biomeIndex: number
  /** tutorial: the step being taught, and whether time is slowed waiting for the move */
  tutStep: TutStep | null
  tutWaiting: boolean
  stats: RunStats
}

export type RouteBonus = 'coins' | 'treasure' | 'gems' | 'power' | 'speed' | 'easy'
export type RouteRisk = 'safe' | 'normal' | 'risky'
export const ROUTE_BONUS_TEXT: Record<RouteBonus, string> = { coins: 'More coins', treasure: 'Hidden treasure', gems: 'Bonus gems', power: 'Power-up', speed: 'High-speed run', easy: 'Easier path' }
export const ROUTE_RISK_TEXT: Record<RouteRisk, string> = { safe: 'Safe', normal: 'Normal', risky: 'Dangerous' }

export interface Route {
  biome: BiomeId
  bonus: RouteBonus
  risk: RouteRisk
  /** which way the branch bends: +1 left, 0 straight on, -1 right */
  dir: number
  /** the lane that takes this route at the split */
  lane: Lane
}
/**
 * A junction: the trail splits into two (left/right, a rocky island blocks the centre lane) or three (left,
 * straight on, right) routes. Each route runs through its own world with its own obstacles, collectibles,
 * difficulty and reward until the next 100 m world boundary after `end`. The lane the runner is in at the
 * split picks the route; nothing on a route is generated until it is picked.
 */
export interface Fork {
  d: number
  routes: Route[]
  /** index into routes once picked, -1 before */
  picked: number
  /** the runner's distance where the route section ends (back to the main world) */
  end: number
  announced: boolean
}
/** items stay off the trail from the split to here, so each route's content can appear once it is chosen */
export const FORK_CLEAR_AFTER = 45
/** the route the runner is in at the moment (the lane mapping for a fork) */
export function routeForLane(f: Fork, x: number): number {
  if (f.routes.length === 3) return Math.max(0, Math.min(2, Math.round(1 - x / LANE_W)))
  return x >= 0 ? 0 : 1
}

export interface RunOptions {
  seed: number
  animalId: AnimalId
  eventActive?: boolean
  upgrades?: Partial<Record<PowerUpKind, number>>
  tutorial?: boolean
  /** ms to accelerate from a trot to full speed at the start (the runner visibly sets off) */
  rampMs?: number
  /** the zone (0-99) the run starts in: every run starts somewhere new; distance and difficulty still count from 0 */
  startZone?: number
  /** development: plant this challenge 70 m into the run (screenshots and playtests) */
  debugSection?: SectionKind
  debugSectionAt?: number
}

/** A race's start zone, the same on every device (from the race's seed). */
export const raceStartZone = (seed: number) => (seed >>> 0) % 100
/** A fresh start zone for a solo run. */
export const randomStartZone = () => Math.floor(Math.random() * 100)

/** where the speed ramp tops out (run metres) and how long it takes to get there (seconds) */
const RAMP_D = (MAX_SPEED - BASE_SPEED) / ACCEL
const RAMP_T = Math.log(MAX_SPEED / BASE_SPEED) / ACCEL
/** Seconds of running to cover `rd` run metres on the normal speed ramp (the pacing director plans in run time). */
export function runTimeAt(rd: number) {
  const x = Math.max(0, rd)
  return x <= RAMP_D ? Math.log(1 + (ACCEL * x) / BASE_SPEED) / ACCEL : RAMP_T + (x - RAMP_D) / MAX_SPEED
}
/** The run metres reached after `t` seconds on the normal speed ramp. */
export function runDAtTime(t: number) {
  const x = Math.max(0, t)
  return x <= RAMP_T ? (BASE_SPEED * (Math.exp(ACCEL * x) - 1)) / ACCEL : RAMP_D + (x - RAMP_T) * MAX_SPEED
}
/** Pacing (design brief section 4): quiet onboarding, a first hook, then a major challenge every so often. */
export const PACING = {
  /** the first challenge comes this many seconds into the run (after the onboarding stretch) */
  firstHook: [30, 48] as const,
  /** seconds of plain running between challenges (junctions and obstacle rows fill the gap) */
  gap: [22, 38] as const,
  /** from Survivor on, sometimes two challenges are linked with only this short breather */
  linkedGap: [8, 12] as const,
  linkedChance: 0.3,
  /** after an Expert/Legend set-piece, a longer recovery run */
  recovery: 8,
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HALF_LEN: Record<ObstacleKind, number> = { log: 0.45, roots: 0.45, trap: 0.5, rock: 0.75, ruin: 0.8, branch: 0.35, barrier: 0.3, gap: 1.2, boulder: 0.9, trolley: 1.1, stream: 1.3, rubble: 0.45, stalactite: 0.35, plane: 1.6, quicksand: 1.3, darts: 0.3, swinglog: 0.4, minecart: 1.0, buffer: 0.4, beam: 0.3, bough: 0.4, raft: 1.1, jeep: 1.3 }
/** height the runner must be above the trail to clear a jump obstacle */
const CLEARANCE: Partial<Record<ObstacleKind, number>> = { log: 0.55, roots: 0.4, trap: 0.45, gap: 0.02, rock: 1.2, ruin: 1.5, boulder: 1.2, trolley: 1.2, stream: 0.02, rubble: 0.45, quicksand: 0.02 }

export class RunSim {
  readonly animal: AnimalDef
  readonly opts: RunOptions
  state: RunState
  items: Item[] = []
  events: SimEvent[] = []
  private rng: () => number
  /** gems, power-ups and tokens draw from their own stream, so every animal gets the same obstacle layout for a seed (races) */
  private lootRng: () => number
  private nextRow = START_CLEAR
  private nextId = 1
  private nextGem = 120
  private nextPower = 200
  private nextToken = 40
  private nextMilestone = 100
  /** where the last obstacle row was placed */
  private lastRowD = -1000
  private tutQueue: TutStep[] = []
  /** planned route choices (ahead of the runner) */
  forks: Fork[] = []
  private forkRng: () => number
  private nextForkAt = 0
  /** planned challenge sections */
  sections: Section[] = []
  private nextSectionAt = 290
  /** the challenges picked so far, newest last (no-repeat rule) */
  private sectionLog: SectionKind[] = []
  /** the last gap was a linked one (never link three in a row) */
  private linked = false
  /** the difficulty tier last announced */
  private tier = 1
  /** where on the 40 km world the run starts (metres); the run's own distance is state.d - origin */
  readonly origin: number

  constructor(opts: RunOptions) {
    this.opts = opts
    this.origin = opts.tutorial ? 0 : Math.max(0, Math.min(99, Math.floor(opts.startZone ?? 0))) * ZONE_LEN
    this.animal = getAnimal(opts.animalId)
    this.rng = mulberry32(opts.seed)
    this.lootRng = mulberry32((opts.seed ^ 0x2c1b3c6d) >>> 0)
    this.forkRng = mulberry32((opts.seed ^ 0x5f3759df) >>> 0)
    // onboarding: the first challenge waits for the first hook
    this.nextSectionAt = runDAtTime(PACING.firstHook[0] + this.rng() * (PACING.firstHook[1] - PACING.firstHook[0]))
    const startShield = this.animal.id === 'leo' || this.animal.id === 'titan' || this.animal.id === 'zara' ? 8000 : 0
    this.state = {
      t: 0,
      d: 0,
      speed: BASE_SPEED,
      lane: 1,
      x: 0,
      y: 0,
      pose: 'run',
      poseT: 0,
      actionAt: -1e9,
      actionMs: 0,
      alive: true,
      coins: 0,
      gems: 0,
      tokens: 0,
      score: 0,
      crashKind: null,
      shieldUntil: startShield,
      magnetUntil: 0,
      speedUntil: 0,
      superJumpUntil: 0,
      megaJumpUntil: 0,
      boostUntil: 0,
      ride: null,
      swing: null,
      grip: 'firm',
      laneFrom: { lane: 1, t: -1e9, d: 0 },
      base: 0,
      abilityUntil: 0,
      abilityReadyAt: 3000,
      invulnUntil: 0,
      loyalUsed: false,
      revives: 0,
      biomeIndex: 0,
      tutStep: null,
      tutWaiting: false,
      stats: { jumps: 0, slides: 0, rolls: 0, laneChanges: 0, powerupsUsed: 0, abilitiesUsed: 0, broken: 0, branchesUnder: 0, waterfallSections: 0, biomesSeen: 1, routesTaken: 0, nearMisses: 0, swings: 0 },
    }
    if (this.origin > 0) {
      const o = this.origin
      this.state.d = o
      this.nextRow += o
      this.nextGem += o
      this.nextPower += o
      this.nextToken += o
      this.nextMilestone += o
      this.nextSectionAt += o
      // the zone banner announces where this run starts
      this.state.biomeIndex = -1
      this.state.stats.biomesSeen = 0
    }
    if (opts.tutorial) this.buildTutorial()
    if (opts.debugSection && !opts.tutorial) {
      const from = this.origin + (opts.debugSectionAt ?? 70)
      this.sections.push({ kind: opts.debugSection, from, to: from + 90, lane: opts.debugSection === 'flight' ? 1 : 0, built: false, announced: false })
      this.nextSectionAt = from + 200
      this.nextForkAt = from + 300
    }
    this.generate()
  }

  /** metres run so far (the world position minus where the run started) */
  runD(d = this.state.d) {
    return d - this.origin
  }

  // ---------------------------------------------------------------- derived

  get abilityKind(): AbilityKind {
    return this.animal.ability.kind
  }
  abilityOn(kind?: AbilityKind) {
    return this.state.t < this.state.abilityUntil && (!kind || this.abilityKind === kind)
  }
  private until(kind: PowerUpKind) {
    const s = this.state
    switch (kind) {
      case 'shield':
        return s.shieldUntil
      case 'magnet':
        return s.magnetUntil
      case 'speed':
        return s.speedUntil
      case 'superjump':
        return s.superJumpUntil
      case 'megajump':
        return s.megaJumpUntil
      case 'boost':
        return s.boostUntil
    }
  }
  powerOn(kind: PowerUpKind) {
    return this.state.t < this.until(kind)
  }
  powerLeft(kind: PowerUpKind) {
    return Math.max(0, this.until(kind) - this.state.t)
  }
  /** The challenge section at a distance, if any. */
  sectionAt(d: number): Section | null {
    for (const x of this.sections) if (d >= x.from && d < x.to) return x
    return null
  }
  private dur(kind: PowerUpKind) {
    const lvl = this.opts.upgrades?.[kind] ?? 0
    let ms = powerUp(kind).durationMs * (1 + 0.15 * lvl)
    if (this.animal.id === 'arctic' || this.animal.id === 'ash') ms *= 1.15
    if (kind === 'shield' && this.animal.id === 'bruno') ms *= 1.25
    return ms
  }
  private jumpMs() {
    let ms = JUMP_MS
    if (this.animal.id === 'raja' || this.animal.id === 'snow' || this.animal.id === 'nova') ms *= 1.1
    if (this.powerOn('megajump')) ms *= 1.65
    else if (this.powerOn('superjump') || this.abilityOn('leap')) ms *= 1.25
    if (this.abilityOn('cliff')) ms *= 1.5
    return ms
  }
  private jumpH() {
    return JUMP_H * (this.powerOn('megajump') ? 2.6 : this.powerOn('superjump') || this.abilityOn('leap') ? 1.9 : this.abilityOn('cliff') ? 1.5 : 1)
  }
  private lowMs() {
    return this.animal.id === 'koda' ? LOW_MS * 0.8 : this.abilityOn('roll') ? LOW_MS * 0.7 : LOW_MS
  }
  private laneRate() {
    // m/s sideways; ice, snow and mud make turns slower (not on the trolley or a vine)
    const g = this.state.ride || this.state.swing ? 1 : GRIP[this.state.grip].lane
    return (this.animal.id === 'shadow' || this.animal.id === 'jax' || this.animal.id === 'blaze' ? 15 : 12) * g
  }
  speedFactor() {
    let f = 0.96 + this.animal.stats.speed * 0.012
    if (this.powerOn('speed')) f *= 1.6
    if (this.abilityOn('boost')) f *= 1.45
    if (this.abilityOn('frost')) f *= 1.15
    if (this.abilityOn('charge')) f *= 1.2
    if (this.powerOn('boost')) f *= 1.9
    if (this.state.ride) f *= 1.25
    else if (!this.state.swing) f *= GRIP[this.state.grip].speed
    return f
  }
  /** fully protected from collisions right now */
  untouchable() {
    const s = this.state
    return s.t < s.invulnUntil || this.powerOn('speed') || this.powerOn('boost') || this.abilityOn('boost') || this.abilityOn('stealth')
  }
  scoreMult() {
    return this.powerOn('speed') || this.powerOn('boost') ? 2 : 1
  }
  abilityCooldownLeft() {
    return Math.max(0, this.state.abilityReadyAt - this.state.t)
  }

  // ---------------------------------------------------------------- input

  /** a jump pressed while still in the air is kept this long and happens on landing */
  private buffered: { cmd: Command; at: number } | null = null

  input(cmd: Command) {
    const s = this.state
    if (!s.alive) return
    const busy = s.t - s.actionAt < s.actionMs
    if (cmd === 'jump' && busy && s.pose === 'jump') {
      this.buffered = { cmd, at: s.t }
      return
    }
    // flying: the plane does the flying; left / right steer it, nothing else
    if (s.ride?.kind === 'plane' && (cmd === 'jump' || cmd === 'slide' || cmd === 'roll')) return
    switch (cmd) {
      case 'left':
      case 'right': {
        const next = Math.max(0, Math.min(2, s.lane + (cmd === 'left' ? -1 : 1))) as Lane
        if (next !== s.lane) {
          // a trolley is left by changing lane; a mine cart switches track; a plane steers
          if (s.ride && s.ride.kind !== 'plane' && !isSteered(s.ride.kind)) this.dismount(false)
          if (s.swing && !s.swing.zip) break
          s.laneFrom = { lane: s.lane, t: s.t, d: s.d }
          s.lane = next
          if (s.ride && isSteered(s.ride.kind)) s.ride.lane = next
          if (s.swing?.zip) s.swing.lane = next
          s.stats.laneChanges++
          this.tutDone('lane')
        }
        break
      }
      case 'jump':
        if (busy && s.pose === 'jump') break
        s.pose = 'jump'
        s.actionAt = s.t
        s.actionMs = this.jumpMs()
        s.stats.jumps++
        this.tutDone('jump')
        break
      case 'slide':
      case 'roll':
        // dropping out of a jump turns into a fast fall then the slide
        s.pose = cmd
        s.actionAt = s.t
        s.actionMs = this.lowMs()
        if (cmd === 'slide') s.stats.slides++
        else s.stats.rolls++
        this.tutDone(cmd)
        break
      case 'ability':
        this.useAbility()
        break
    }
  }

  useAbility(): boolean {
    const s = this.state
    if (!s.alive || s.t < s.abilityReadyAt) return false
    const ab = this.animal.ability
    const stamina = 1 + (this.animal.stats.stamina - 3) * 0.05
    s.abilityUntil = s.t + ab.durationMs * stamina
    s.abilityReadyAt = s.t + ab.cooldownMs
    s.stats.abilitiesUsed++
    this.events.push({ type: 'ability', kind: ab.kind })
    if (ab.kind === 'roar') {
      for (const it of this.items) if (isObstacle(it.kind) && !it.broken && it.kind !== 'gap' && it.kind !== 'quicksand' && it.d > s.d && it.d < s.d + 40) this.breakItem(it)
    }
    if (ab.kind === 'roll') this.input('roll')
    this.tutDone('ability')
    return true
  }

  /** Use a power-up from the inventory (or a pickup on the trail). */
  activatePower(kind: PowerUpKind, fromPickup = false) {
    const s = this.state
    if (!s.alive) return
    const ms = this.dur(kind)
    if (kind === 'shield') s.shieldUntil = Math.max(s.shieldUntil, s.t) + ms
    if (kind === 'magnet') s.magnetUntil = Math.max(s.magnetUntil, s.t) + ms
    if (kind === 'speed') s.speedUntil = Math.max(s.speedUntil, s.t) + ms
    if (kind === 'superjump') s.superJumpUntil = Math.max(s.superJumpUntil, s.t) + ms
    if (kind === 'megajump') s.megaJumpUntil = Math.max(s.megaJumpUntil, s.t) + ms
    if (kind === 'boost') {
      s.boostUntil = Math.max(s.boostUntil, s.t) + ms
      // a moment of grace after the burst, so it never ends inside an obstacle
      s.invulnUntil = Math.max(s.invulnUntil, s.boostUntil + 1200)
    }
    s.stats.powerupsUsed++
    this.events.push(fromPickup ? { type: 'pickup', kind } : { type: 'power', kind })
  }

  /** Continue after a crash (paid with gems or a rewarded video by the caller). */
  revive() {
    const s = this.state
    if (s.alive) return
    s.alive = true
    s.revives++
    s.crashKind = null
    s.pose = 'run'
    s.actionMs = 0
    s.invulnUntil = s.t + 3000
    for (const it of this.items) if (isObstacle(it.kind) && it.d > s.d - 2 && it.d < s.d + 30) it.gone = true
  }

  // ---------------------------------------------------------------- simulation

  step(dtMs: number) {
    const s = this.state
    if (!s.alive) return
    // tutorial: slow time right before an obstacle until the player makes the move
    let scale = 1
    if (s.tutStep && s.tutWaiting) scale = 0.08
    let left = Math.min(dtMs, 100) * scale
    while (left > 0) {
      const h = Math.min(left, 16)
      this.tick(h)
      left -= h
      if (!s.alive) break
    }
  }

  private tick(ms: number) {
    const s = this.state
    const dt = ms / 1000
    s.t += ms
    const base = Math.min(MAX_SPEED, BASE_SPEED + this.runD() * ACCEL)
    const ramp = this.opts.rampMs ? Math.min(1, 0.1 + 0.9 * Math.pow(Math.min(1, s.t / this.opts.rampMs), 1.4)) : 1
    s.speed = (this.opts.tutorial ? Math.min(base, 9) : base) * this.speedFactor() * ramp
    s.d += s.speed * dt
    s.score += s.speed * dt * 10 * this.scoreMult()

    // lateral motion toward the lane centre
    const tx = laneX(s.lane)
    const step = this.laneRate() * dt
    s.x = Math.abs(tx - s.x) <= step ? tx : s.x + Math.sign(tx - s.x) * step

    // jump arc / slide timing
    const p = (s.t - s.actionAt) / Math.max(1, s.actionMs)
    if (s.pose !== 'run' && p >= 1) {
      s.pose = 'run'
      s.y = 0
      const b = this.buffered
      this.buffered = null
      if (b && s.t - b.at <= INPUT_BUFFER_MS) this.input(b.cmd)
    }
    s.poseT = Math.min(1, Math.max(0, p))
    // riding: stand on the trolley deck; after hopping off the ground drops away under the runner
    if (s.ride?.kind === 'plane') {
      // flying: the runner stands on the plane's back; the plane follows the flight profile and steers with the lane
      const from = s.ride.from ?? s.d
      const alt = flightAlt((s.d - from) / Math.max(1, s.ride.end - from))
      s.base += (alt - s.base) * Math.min(1, dt * 7)
      const pl = this.items.find((it) => it.id === s.ride!.item)
      if (pl) {
        pl.d = s.d + 0.1
        pl.h = s.base - PLANE_DECK
        pl.lane = s.lane
      }
      if (s.d >= s.ride.end - 1.5) this.dismount(true)
    } else if (s.ride) {
      s.base = RIDE_BASE[s.ride.kind ?? 'trolley'] ?? RIDE_H
      const tr = this.items.find((it) => it.id === s.ride!.item)
      if (tr) {
        tr.d = Math.min(s.ride.end, s.d + 0.15)
        if (isSteered(s.ride.kind)) tr.lane = s.lane
      }
      if (s.d >= s.ride.end - 1.5) this.dismount(true)
    } else if (s.base > 0) s.base = Math.max(0, s.base - dt * (s.pose === 'jump' ? 1.2 : 5))
    s.y = s.base + (s.pose === 'jump' ? 4 * this.jumpH() * s.poseT * (1 - s.poseT) : 0)
    this.swingTick()

    // rockslide: a rock drops onto the trail ahead
    for (const it of this.items) if (it.fall && !it.passed && it.h === 0 && it.d - s.d < 38) {
      it.h = 1
      this.events.push({ type: 'rockfall', d: it.d, lane: it.lane })
    }

    // a plane that has landed its rider takes off again and climbs away
    for (const it of this.items) if (it.kind === 'plane' && it.ridden && !it.gone) {
      it.d += dt * (s.speed + 9)
      it.h += dt * 3.2
      if (it.h > 40) it.gone = true
    }

    // rolling boulders
    for (const it of this.items) if (it.moving && !it.broken && it.d - s.d < 45 && it.d > s.d - 2) it.d -= it.moving * dt

    // ability side effects
    if (this.abilityOn('frost')) for (const it of this.items) if (isObstacle(it.kind) && it.kind !== 'gap' && it.d > s.d && it.d < s.d + 30) it.frozen = true
    if (this.abilityOn('dodge')) this.autoDodge()

    this.collide()
    this.collect()
    this.routes()
    this.world()
    this.tutorialTick()
    this.generate()
  }

  private autoDodge() {
    const s = this.state
    const threat = this.items.find((it) => isObstacle(it.kind) && !it.broken && !it.gone && it.lane === s.lane && it.d > s.d && it.d - s.d < 9)
    if (!threat) return
    const free = ([0, 1, 2] as Lane[]).filter((l) => l !== s.lane && !this.items.some((it) => isObstacle(it.kind) && !it.broken && !it.gone && it.lane === l && it.d > s.d - 1 && it.d - s.d < 12))
    if (free.length) {
      s.lane = free.sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0]
      s.stats.laneChanges++
    }
  }

  /** Leave the trolley: at the buffer stop (a hop forward) or by changing lane. */
  private dismount(atEnd: boolean) {
    const s = this.state
    if (!s.ride) return
    const tr = this.items.find((it) => it.id === s.ride!.item)
    if (tr) {
      if (tr.kind !== 'plane') tr.d = s.ride.end
      tr.ridden = true
    }
    if (s.ride.kind === 'plane') {
      s.base = Math.min(s.base, PLANE_DECK)
      // a flight flown to the end lands a bonus
      if (atEnd) s.score += 250
    }
    const kind = s.ride.kind ?? 'trolley'
    s.ride = null
    s.pose = 'jump'
    s.actionAt = s.t
    s.actionMs = atEnd ? JUMP_MS : JUMP_MS * 0.8
    this.events.push({ type: 'ride', on: false, kind })
  }

  private escapes(it: Item): boolean {
    const s = this.state
    const kind = it.kind as ObstacleKind
    const allowed = ESCAPES[kind]
    const airborne = s.pose === 'jump' || s.y > 0.3
    const low = (s.pose === 'slide' || s.pose === 'roll') && s.poseT > 0.03 && s.poseT < 0.97
    const bigJump = this.powerOn('superjump') || this.powerOn('megajump') || this.abilityOn('leap') || this.abilityOn('cliff')
    if (s.ride?.kind === 'plane') return true
    if (s.ride && isSteered(s.ride.kind)) {
      // in a vehicle: jump what is low (broken rails, gullies, floating logs), duck what is overhead (beams,
      // branches), steer away from anything else (buffer stops, rocks, boulders)
      if (BOARDS.includes(kind)) return true
      if (kind === 'gap' || kind === 'log') return s.pose === 'jump'
      if (kind === 'beam' || kind === 'branch') return low
      return false
    }
    if (PIT(kind) && (this.abilityOn('cliff') || s.ride || s.swing)) return true
    if (allowed.includes('jump') && airborne && s.y >= (CLEARANCE[kind] ?? 0.5)) return true
    if (bigJump && airborne && (kind === 'rock' || kind === 'ruin' || kind === 'boulder') && s.y >= (CLEARANCE[kind] ?? 1.2)) return true
    if (allowed.includes('low') && low) return true
    // an acrobat roll goes through anything on the ground
    if (this.abilityOn('roll') && s.pose === 'roll' && kind !== 'gap' && kind !== 'quicksand') return true
    return false
  }

  private collide() {
    const s = this.state
    // the runner is between lanes while switching; it hits what is under its body
    const bodyLane = Math.round(1 - s.x / LANE_W) as Lane
    for (const it of this.items) {
      if (it.gone || it.broken || !isObstacle(it.kind)) continue
      if (Math.abs(it.d - s.d) > it.len + 0.45) {
        if (!it.passed && it.d < s.d - it.len - 0.45) {
          it.passed = true
          this.nearMiss(it)
          if (it.kind === 'branch' && it.lane === bodyLane) s.stats.branchesUnder++
        }
        continue
      }
      if (it.lane !== bodyLane || Math.abs(s.x - laneX(it.lane)) > LANE_W * 0.55) continue
      if (it.kind === 'plane') {
        // run into the plane to board it (any pose); it never hurts the runner
        if (!it.ridden && !s.ride && !s.swing) {
          const sec = this.sectionAt(it.d)
          s.ride = { lane: it.lane, end: sec ? sec.to - 6 : it.d + 90, item: it.id, kind: 'plane', from: it.d }
          s.pose = 'run'
          s.actionMs = 0
          this.events.push({ type: 'ride', on: true, kind: 'plane' })
        }
        continue
      }
      if (BOARDS.includes(it.kind as ObstacleKind)) {
        // run into a parked vehicle (any pose) to climb in; parked vehicles never hurt the runner
        if (!it.ridden && !s.ride && !s.swing) {
          const sec = this.sectionAt(it.d)
          const kind = it.kind as RideKind
          s.ride = { lane: it.lane, end: sec ? sec.to - 4 : it.d + 80, item: it.id, kind }
          s.pose = 'run'
          s.actionMs = 0
          this.events.push({ type: 'ride', on: true, kind })
        }
        continue
      }
      if (it.kind === 'trolley') {
        if (it.ridden || s.ride) continue
        // jump onto the trolley to ride it
        if (s.y > 0.25 && !this.powerOn('boost')) {
          const sec = this.sectionAt(it.d)
          s.ride = { lane: it.lane, end: sec ? sec.to - 4 : it.d + 50, item: it.id, kind: 'trolley' }
          s.pose = 'run'
          s.actionMs = 0
          this.events.push({ type: 'ride', on: true, kind: 'trolley' })
          continue
        }
      }
      if (it.fall && it.h === 0) continue
      if (this.escapes(it)) continue
      this.hit(it)
      if (!s.alive) return
    }
  }

  private hit(it: Item) {
    const s = this.state
    const kind = it.kind as ObstacleKind
    if (this.untouchable()) {
      if (!PIT(kind) && kind !== 'trolley') this.breakItem(it)
      return
    }
    if (it.frozen) {
      this.breakItem(it)
      return
    }
    if ((this.abilityOn('smash') || this.abilityOn('charge')) && BREAKABLE[kind]) {
      this.breakItem(it)
      return
    }
    if (this.powerOn('shield')) {
      if (PIT(kind)) {
        // the shield carries the runner over a gap with a short hop
        s.pose = 'jump'
        s.actionAt = s.t - JUMP_MS * 0.3
        s.actionMs = JUMP_MS
      } else this.breakItem(it)
      this.events.push({ type: 'saved', by: 'shield' })
      return
    }
    if (this.animal.id === 'sonic' && !s.loyalUsed) {
      s.loyalUsed = true
      s.invulnUntil = s.t + 2000
      if (!PIT(kind)) this.breakItem(it)
      this.events.push({ type: 'saved', by: 'loyal' })
      return
    }
    s.alive = false
    s.pose = 'dead'
    s.crashKind = kind
    this.events.push({ type: 'crash', kind })
  }

  private breakItem(it: Item) {
    it.broken = true
    this.state.stats.broken++
    this.events.push({ type: 'break', kind: it.kind as ObstacleKind, d: it.d, lane: it.lane })
  }

  private collect() {
    const s = this.state
    const magnet = this.powerOn('magnet') ? MAGNET_RANGE : this.animal.id === 'sonic' ? 2.4 : 0
    for (const it of this.items) {
      if (it.gone || isObstacle(it.kind) || it.kind === 'vine' || it.kind === 'zipline') continue
      const dd = Math.abs(it.d - s.d)
      const near = dd < 0.9 && Math.abs(laneX(it.lane) - s.x) < LANE_W * 0.6 && Math.abs(it.h - (s.y + 0.6)) < 1.0
      const pulled = (it.kind === 'coin' || it.kind === 'gem') && magnet > 0 && it.d > s.d - 1 && it.d - s.d < magnet && Math.abs(laneX(it.lane) - s.x) <= magnet
      if (!near && !pulled) continue
      it.gone = true
      switch (it.kind) {
        case 'coin':
          s.coins++
          s.score += 10
          this.events.push({ type: 'coin', d: it.d, lane: it.lane })
          this.tutDone('coins')
          break
        case 'gem':
          s.gems += this.animal.id === 'jax' || this.animal.id === 'snow' || this.animal.id === 'blaze' ? (this.lootRng() < 0.1 ? 2 : 1) : 1
          s.score += 100
          this.events.push({ type: 'gem', d: it.d, lane: it.lane })
          break
        case 'token':
          s.tokens++
          s.score += 50
          this.events.push({ type: 'token', d: it.d, lane: it.lane })
          break
        default:
          if (isPowerUp(it.kind)) this.activatePower(it.kind, true)
      }
    }
  }

  /** The fork a distance belongs to (the run-up to the split to the end of the routes), if any. */
  forkAt(d: number): Fork | null {
    for (const f of this.forks) if (d >= f.d - 30 && d < f.end) return f
    return null
  }
  /** The picked route at a distance, if the runner is on one. */
  routeAt(d: number): Route | null {
    const f = this.forkAt(d)
    return f && f.picked >= 0 && d >= f.d ? f.routes[f.picked] : null
  }
  /** The world at a distance, taking the chosen route into account. */
  biomeIdAt(d: number): BiomeId {
    return this.routeAt(d)?.biome ?? biomeAt(d).biome.id
  }

  private planForks(to: number) {
    if (this.opts.tutorial) return
    if (!this.nextForkAt) this.nextForkAt = this.origin + 230 + Math.floor(this.forkRng() * 3) * 10
    while (this.nextForkAt < to) {
      // keep the split clear of the world-boundary blend
      let d = this.nextForkAt
      const into = d % 100
      if (into < 15) d += 15 - into
      if (into > 40) d += 115 - into
      const rnd = this.forkRng
      const here = biomeAt(d).biome.id
      const pool = BIOMES.map((b) => b.id).filter((b) => b !== here)
      const take = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0]
      // every junction is a real decision: a safe route against a dangerous one that pays better,
      // and at a three-way junction a normal route straight on with a power-up or a fast run
      const three = this.forks.length > 0 && rnd() < 0.3
      const risky: Route = { biome: take(), bonus: (['coins', 'treasure', 'gems'] as RouteBonus[])[Math.floor(rnd() * 3)], risk: 'risky', dir: 0, lane: 0 }
      const safe: Route = { biome: take(), bonus: 'easy', risk: 'safe', dir: 0, lane: 0 }
      const sides = rnd() < 0.5 ? [risky, safe] : [safe, risky]
      const routes: Route[] = three ? [sides[0], { biome: take(), bonus: rnd() < 0.5 ? 'power' : 'speed', risk: 'normal', dir: 0, lane: 1 }, sides[1]] : sides
      routes[0].dir = 1
      routes[0].lane = 0
      routes[routes.length - 1].dir = -1
      routes[routes.length - 1].lane = 2
      const end = Math.ceil(d / 100) * 100 + 100
      this.forks.push({ d, routes, picked: -1, end, announced: false })
      this.nextForkAt = end + 180 + Math.floor(rnd() * 160)
    }
  }

  private routes() {
    const s = this.state
    for (const f of this.forks) {
      if (!f.announced && f.d - s.d < 110) {
        f.announced = true
        this.events.push({ type: 'fork', fork: f })
      }
      if (f.picked < 0 && s.d >= f.d) {
        f.picked = routeForLane(f, s.x)
        const r = f.routes[f.picked]
        // the picked road starts on the runner's side of the trail and curves away; re-express the runner on it
        // (same place in the world) and steer it into that road's middle lane
        s.x -= laneX(r.lane)
        s.lane = 1
        if (s.ride) this.dismount(false)
        s.stats.routesTaken++
        this.events.push({ type: 'route', fork: f, name: BIOME_NAME[r.biome], bonus: r.bonus })
        // the route's reward, just past the split
        const at = f.d + FORK_CLEAR_AFTER + 4
        if (r.bonus === 'power') this.add(at, 1, (['magnet', 'shield', 'superjump'] as PowerUpKind[])[Math.floor(this.lootRng() * 3)], 1.0)
        if (r.bonus === 'speed') this.add(at, 1, 'speed', 1.0)
        if (r.bonus === 'gems') for (let i = 0; i < 3; i++) this.add(at + i * 3, 1, 'gem', 0.9)
        if (r.bonus === 'treasure') {
          // a hidden stash halfway along: gems in an arc over a jump, coins around it
          const mid = Math.round((f.d + f.end) / 2)
          for (let i = 0; i < 5; i++) this.add(mid + i * 1.6, 1, 'gem', 0.7 + 4 * JUMP_H * ((i + 0.5) / 5) * (1 - (i + 0.5) / 5) * 0.9)
          for (const lane of [0, 2] as Lane[]) this.coinLine(mid - 4, lane, 6)
        }
        if (r.bonus === 'coins') for (const lane of [0, 2] as Lane[]) this.coinLine(at - 2, lane, 8)
      }
    }
    if (this.forks.length > 6) this.forks = this.forks.filter((f) => f.end > s.d - 60)
  }

  /** Grab a vine while jumping past it, then swing over the ravine to its far lip. */
  private swingTick() {
    const s = this.state
    if (!s.swing) {
      if (s.ride) return
      // zipline: the line is grabbed automatically at the start post, in whatever lane the runner's body is in
      const bodyLane = Math.round(1 - s.x / LANE_W) as Lane
      const zl = this.items.find((it) => it.kind === 'zipline' && !it.passed && it.lane === bodyLane && Math.abs(it.d - s.d) < 1.5)
      if (zl) {
        for (const it of this.items) if (it.kind === 'zipline' && Math.abs(it.d - zl.d) < 0.5) it.passed = true
        s.swing = { from: s.d, to: zl.swingTo ?? s.d + 30, lane: zl.lane, zip: true }
        s.score += 100
        this.events.push({ type: 'swing', on: true, zip: true })
        return
      }
      if (s.pose !== 'jump') return
      const v = this.items.find((it) => it.kind === 'vine' && !it.passed && it.lane === s.lane && Math.abs(it.d - s.d) < 1.5 && Math.abs(s.x - laneX(it.lane)) < LANE_W * 0.5)
      if (!v) return
      v.passed = true
      s.swing = { from: s.d, to: v.swingTo ?? s.d + 10, lane: v.lane }
      s.stats.swings++
      s.score += 100
      this.events.push({ type: 'swing', on: true })
      return
    }
    const p = (s.d - s.swing.from) / Math.max(1, s.swing.to - s.swing.from)
    if (p >= 1) {
      // let go: the last bit of a jump down onto the far side
      const zip = !!s.swing.zip
      s.swing = null
      s.pose = 'jump'
      s.actionMs = JUMP_MS
      s.actionAt = s.t - JUMP_MS * 0.85
      s.poseT = 0.85
      s.y = SWING_BASE
      this.events.push({ type: 'swing', on: false, zip })
      return
    }
    // hang on: the jump pose holds at its apex while the vine carries the runner in an arc
    s.pose = 'jump'
    s.actionAt = s.t
    s.actionMs = 1000
    s.poseT = 0.5
    s.y = s.swing.zip ? zipAlt(p) : SWING_BASE + SWING_H * Math.sin(Math.PI * p)
  }

  /** A close call: changing out of a lane at the last moment before an obstacle in it. */
  private nearMiss(it: Item) {
    const s = this.state
    const lf = s.laneFrom
    if (it.lane !== lf.lane || it.lane === s.lane || !s.alive) return
    if (s.t - lf.t > 750 || it.d < lf.d || it.d - it.len - lf.d > 6.5) return
    s.stats.nearMisses++
    s.score += 50
    this.events.push({ type: 'nearmiss', kind: it.kind as ObstacleKind })
  }

  private world() {
    const s = this.state
    const b = biomeAt(s.d)
    const grip = gripOf(this.biomeIdAt(s.d))
    if (grip !== s.grip) {
      s.grip = grip
      this.events.push({ type: 'surface', grip })
    }
    // on a chosen route the route's own world shows: the new zone is announced when the route rejoins it
    if (b.index !== s.biomeIndex && !this.routeAt(s.d)) {
      s.biomeIndex = b.index
      s.stats.biomesSeen++
      if (b.biome.id === 'waterfall') s.stats.waterfallSections++
      this.events.push({ type: 'biome', name: b.zone.name, index: b.index, zone: b.zone.n, from: b.index * ZONE_LEN })
    }
    for (const x of this.sections)
      if (!x.announced && x.from - s.d < 70) {
        x.announced = true
        this.events.push({ type: 'section', section: x })
      }
    if (!this.opts.tutorial) {
      const tier = tierAt(runTimeAt(this.runD()))
      if (tier > this.tier) {
        this.tier = tier
        this.events.push({ type: 'tier', tier, name: tierName(tier) })
      }
    }
    if (s.d >= this.nextMilestone) {
      this.events.push({ type: 'milestone', d: this.runD(this.nextMilestone) })
      this.nextMilestone += 100
    }
    // drop what is behind
    if (this.items.length > 400 || (this.items[0] && this.items[0].d < s.d - 25)) this.items = this.items.filter((it) => it.d > s.d - 25)
  }

  // ---------------------------------------------------------------- generation

  private add(d: number, lane: Lane, kind: ItemKind, h = 0.7, moving = 0, tut?: TutStep): Item {
    const it: Item = { id: this.nextId++, d, lane, kind, h, len: isObstacle(kind) ? HALF_LEN[kind] : 0.4, gone: false, passed: false, broken: false, frozen: false, moving, tut }
    this.items.push(it)
    return it
  }

  /** the reaction window: rows at least this far apart at the speed the runner will have there */
  rowGap(d: number) {
    const v = Math.min(MAX_SPEED, BASE_SPEED + Math.max(0, d - this.origin) * ACCEL) * 1.05
    return Math.max(13, v * 0.95 + 5)
  }

  private generate() {
    if (this.opts.tutorial) return
    const s = this.state
    this.planForks(s.d + 700)
    this.planSections(s.d + 400)
    // nothing is placed past an unresolved split: each route's content comes once it is chosen
    const pending = this.forks.find((f) => f.picked < 0)
    const horizon = Math.min(s.d + 170, pending ? pending.d - 8 : Infinity)
    while (this.nextRow < horizon) {
      const d = this.nextRow
      const fk = this.forkAt(d)
      if (fk && d < fk.d + FORK_CLEAR_AFTER) {
        if (d < fk.d - 8) {
          // coins lead into every route; a two-way split has a rocky island in the centre lane
          for (const r of fk.routes) this.coinLine(fk.d - 26, r.lane, 6)
          if (fk.routes.length === 2) this.add(fk.d - 2.2, 1, 'rock')
          this.nextRow = fk.d - 8
          continue
        }
        if (fk.picked < 0) break
        this.nextRow = fk.d + FORK_CLEAR_AFTER
        continue
      }
      const sec = this.sections.find((x) => !x.built && d + this.rowGap(d) > x.from + 4)
      if (sec) {
        this.buildSection(sec, Math.max(sec.from + 4, this.lastRowD + this.rowGap(this.lastRowD) + 1))
        this.nextRow = this.lastRowD + this.rowGap(this.lastRowD) + 2
        continue
      }
      // a clear blend strip at every zone boundary and where a junction's routes end
      if (this.atSeam(d)) {
        this.coinLine(d, (1 + Math.floor(this.rng() * 3) % 3) as Lane, 4)
        this.nextRow += 14
        continue
      }
      this.row(d)
      const risk = this.routeAt(d)?.risk
      this.nextRow += (this.rowGap(d) + this.rng() * 6) * (risk === 'risky' ? 0.85 : risk === 'safe' ? 1.15 : 1)
    }
    const ahead = horizon
    const skip = (d: number) => {
      const f = this.forkAt(d)
      return !!f && d < f.d + FORK_CLEAR_AFTER
    }
    while (this.nextGem < ahead) {
      if (skip(this.nextGem)) {
        this.nextGem += 80
        continue
      }
      this.add(this.nextGem, Math.floor(this.lootRng() * 3) as Lane, 'gem', 0.9)
      const freq = this.animal.id === 'raja' || this.animal.id === 'koda' || this.animal.id === 'nova' ? 0.8 : 1
      this.nextGem += (110 + this.lootRng() * 90) * freq
    }
    while (this.nextPower < ahead) {
      if (skip(this.nextPower)) {
        this.nextPower += 80
        continue
      }
      // the bigger powers are rarer on the trail
      const r = this.lootRng()
      const kind: PowerUpKind = r < 0.1 ? 'boost' : r < 0.22 ? 'megajump' : POWER_KINDS[Math.floor(this.lootRng() * 4)]
      this.add(this.nextPower, Math.floor(this.lootRng() * 3) as Lane, kind, 1.0)
      this.nextPower += 220 + this.lootRng() * 140
    }
    if (this.opts.eventActive)
      while (this.nextToken < ahead) {
        if (skip(this.nextToken)) {
          this.nextToken += 60
          continue
        }
        this.add(this.nextToken, Math.floor(this.lootRng() * 3) as Lane, 'token', 0.9)
        this.nextToken += 35 + this.lootRng() * 35
      }
  }

  /** One obstacle row. Pattern difficulty grows with distance; at least one lane is always passable. */
  private row(d: number) {
    const biome: BiomeId = this.biomeIdAt(d)
    const pool = OBSTACLES_BY_BIOME[biome]
    const risk = this.routeAt(d)?.risk ?? 'normal'
    // safe routes are much easier, dangerous ones block more lanes more often
    const hard = Math.min(1, Math.min(1, Math.max(0, d - this.origin) / 1500) * (risk === 'safe' ? 0.3 : 1) + (risk === 'risky' ? 0.3 : 0))
    const r = this.rng()
    // a boulder rolls toward the runner, so it eats into the gap behind the previous row: it only rolls with room to spare
    const roomToRoll = d - this.lastRowD >= this.rowGap(d) * 1.6
    const pick = (): ObstacleKind => {
      const k = pool[Math.floor(this.rng() * pool.length)]
      return k === 'boulder' && !roomToRoll ? 'rock' : k
    }
    const lanes: Lane[] = [0, 1, 2]
    const shuffled = lanes.sort(() => this.rng() - 0.5)
    let blocked: { lane: Lane; kind: ObstacleKind }[]
    if (r < 0.5 - hard * 0.25) {
      blocked = [{ lane: shuffled[0], kind: pick() }]
    } else if (r < 0.88 - hard * 0.1) {
      blocked = [
        { lane: shuffled[0], kind: pick() },
        { lane: shuffled[1], kind: pick() },
      ]
    } else {
      // all three lanes: everything must be passable by a move (jump or low), never only by changing lane
      const movable = pool.filter((k) => !ESCAPES[k].includes('lane'))
      const kind = movable.length ? movable[Math.floor(this.rng() * movable.length)] : 'log'
      blocked = lanes.map((lane) => ({ lane, kind }))
    }
    for (const b of blocked) this.add(d, b.lane, b.kind, 0, b.kind === 'boulder' ? 5 : 0)
    this.lastRowD = d
    // coins teach the route: a line in a free lane, or an arc over a jumpable obstacle
    const free = lanes.filter((l) => !blocked.some((b) => b.lane === l))
    if (free.length) {
      this.coinLine(d - 6, free[Math.floor(this.rng() * free.length)], 5)
      if (this.routeAt(d)?.risk === 'risky' && free.length > 1) this.coinLine(d - 6, free[(Math.floor(this.rng() * free.length) + 1) % free.length], 5)
    }
    else {
      const jumpable = blocked.find((b) => ESCAPES[b.kind].includes('jump'))
      if (jumpable) this.coinArc(d, jumpable.lane)
    }
  }

  // ---------------------------------------------------------------- challenge sections

  private planSections(to: number) {
    if (this.opts.tutorial) return
    let guard = 0
    while (this.nextSectionAt < to && guard++ < 20) {
      const d0 = this.nextSectionAt
      const z = biomeAt(d0)
      const kit = z.biome.id
      const W: [SectionKind, number][] = []
      const has = (list: string[]) => list.includes(kit)
      if (z.flavor === 'rail' || kit === 'railway') W.push(['rail', 5])
      else if (has(['forest', 'savannah', 'desert', 'canyon', 'ruins', 'birch', 'pine', 'autumn', 'moonlit', 'baobab', 'grassland', 'redwood'])) W.push(['rail', 1])
      if (has(['river', 'swamp', 'coast', 'jungle', 'forest', 'waterfall', 'blossom', 'mangrove', 'lakeside', 'lagoon', 'beach', 'thaw', 'flower', 'mist', 'fern']) || z.flavor === 'thaw') W.push(['river', 1.3])
      if (has(['river', 'waterfall', 'canyon', 'hills', 'swamp', 'jungle', 'mangrove', 'lagoon', 'cliffside', 'lakeside', 'giantroot'])) W.push(['bridge', 1.1])
      if (has(['hills', 'canyon', 'volcanic', 'snow', 'ice', 'waterfall', 'desert', 'cliffside', 'deadwood', 'cedar'])) W.push(['rockslide', 1.3])
      if (has(['hills', 'canyon', 'ice', 'volcanic', 'waterfall', 'ruins', 'moonlit', 'jungle', 'temple', 'mossy', 'glow', 'cliffside'])) W.push(['cave', 1])
      if (z.flavor === 'vines') W.push(['vines', 4])
      else if (has(['jungle', 'giantroot', 'forest', 'mangrove', 'temple', 'glow', 'fern', 'flower', 'cliffside', 'mossy', 'redwood'])) W.push(['vines', 1])
      // open country with room to take off: an airstrip and a bush plane
      if (has(['savannah', 'desert', 'coast', 'hills', 'canyon', 'grassland', 'beach', 'lakeside', 'blossom', 'birch', 'ice', 'snow', 'baobab'])) W.push(['flight', 1.4])
      // design brief challenges: falling trees in the woods, quicksand in sand and swamp, temple traps in ruins,
      // swinging log traps under the canopy
      if (has(['forest', 'jungle', 'pine', 'redwood', 'autumn', 'moonlit', 'giantroot', 'birch', 'cedar', 'deadwood', 'fern', 'mossy', 'bamboo'])) W.push(['treefall', 1.2])
      if (has(['desert', 'savannah', 'swamp', 'mangrove', 'coast', 'beach', 'canyon', 'baobab', 'lagoon'])) W.push(['quicksand', 1.2])
      if (has(['ruins', 'temple'])) W.push(['temple', 2.5])
      else if (has(['mossy', 'glow', 'jungle'])) W.push(['temple', 0.6])
      if (has(['jungle', 'forest', 'bamboo', 'giantroot', 'redwood', 'temple', 'ruins', 'pine', 'fern'])) W.push(['swinglog', 1])
      // mine carts in rocky country, ziplines across ravines in the big woods
      if (has(['canyon', 'hills', 'cliffside', 'volcanic', 'ruins', 'mossy', 'glow', 'deadwood'])) W.push(['minecart', 1.3])
      // white water in river country, a safari jeep in the open plains
      if (has(['river', 'swamp', 'mangrove', 'waterfall', 'lagoon', 'lakeside', 'jungle'])) W.push(['raft', 1.4])
      if (has(['savannah', 'desert', 'grassland', 'baobab', 'beach', 'coast'])) W.push(['jeep', 1.4])
      if (has(['forest', 'jungle', 'redwood', 'giantroot', 'cliffside', 'cedar', 'pine', 'fern'])) W.push(['zipline', 1.2])
      if (!W.length) W.push(['river', 1], ['rockslide', 1])
      const kind = this.pickSection(W, this.runD(d0), (z.flavor === 'rail' || kit === 'railway' ? 'rail' : z.flavor === 'vines' ? 'vines' : null))
      const rows = kind === 'minecart' || kind === 'raft' || kind === 'jeep' ? 8 : kind === 'flight' || kind === 'zipline' ? 6 : kind === 'cave' || kind === 'rail' || kind === 'temple' ? 4 : 3
      const len = (this.rowGap(d0 + 60) + 1) * rows + 40
      // keep inside the zone (clear of its 400 m boundaries) and clear of every junction
      let from = d0
      const into = from % ZONE_LEN
      if (into < 12) from += 12 - into
      if ((from % ZONE_LEN) + len > ZONE_LEN - 12) from = Math.ceil(from / ZONE_LEN) * ZONE_LEN + 12
      const clash = this.forks.find((f) => from + len > f.d - 45 && from < f.end + 10)
      if (clash || (this.nextForkAt && from + len > this.nextForkAt - 45 && from < this.nextForkAt + 200)) {
        this.nextSectionAt = Math.max(clash ? clash.end + 20 : 0, from + 60)
        continue
      }
      this.sections.push({ kind, from, to: from + len, lane: kind === 'flight' || kind === 'minecart' || kind === 'zipline' || kind === 'raft' || kind === 'jeep' ? 1 : this.rng() < 0.5 ? 0 : 2, built: false, announced: false })
      this.sectionLog.push(kind)
      if (this.sectionLog.length > 8) this.sectionLog.shift()
      this.nextSectionAt = this.nextChallengeAt(from + len)
    }
    if (this.sections.length > 8) this.sections = this.sections.filter((x) => x.to > this.state.d - 80)
  }

  /**
   * The pacing director's pick: weighted by the zone, limited to the run's difficulty tier, and never one of the
   * last few challenges again unless it is the zone's signature (zone 72's railway, the Hanging Vine zones).
   */
  private pickSection(W: [SectionKind, number][], rd: number, signature: SectionKind | null): SectionKind {
    const tier = tierAt(runTimeAt(rd))
    const recent = this.sectionLog.slice(-SECTION_NO_REPEAT)
    const allowed = W.filter(([k]) => SECTION_MIN_TIER[k] <= tier)
    let pool = allowed.filter(([k]) => k === signature || !recent.includes(k))
    // everything here ran recently: anything but the very last one
    if (!pool.length) pool = allowed.filter(([k]) => k !== recent[recent.length - 1])
    if (!pool.length) pool = allowed.length ? allowed : [['river', 1]]
    let r = this.rng() * pool.reduce((a, [, w]) => a + w, 0)
    for (const [k, w] of pool) if ((r -= w) <= 0) return k
    return pool[pool.length - 1][0]
  }

  /** Where the next challenge may start after one ending at `end`: a run-time gap, sometimes linked, with recovery after hard ones. */
  private nextChallengeAt(end: number) {
    const rd = this.runD(end)
    const t = runTimeAt(rd)
    const tier = tierAt(t)
    const span = (g: readonly [number, number]) => g[0] + this.rng() * (g[1] - g[0])
    let gap: number
    if (tier >= 3 && !this.linked && this.rng() < PACING.linkedChance) {
      gap = span(PACING.linkedGap)
      this.linked = true
    } else {
      gap = span(PACING.gap) + (this.linked && tier >= 4 ? PACING.recovery : 0)
      this.linked = false
    }
    return this.origin + runDAtTime(t + gap)
  }

  /** within the clear strip at a zone boundary (every 400 m) or at the end of a junction's routes */
  atSeam(d: number) {
    const into = d % ZONE_LEN
    if (into < 6 || into > ZONE_LEN - 6) return true
    for (const f of this.forks) if (Math.abs(d - f.end) < 6) return true
    return false
  }

  /** Lay out a section's content. Rows keep the normal reaction spacing and every row leaves a way through. */
  private buildSection(sec: Section, start: number) {
    sec.built = true
    const shift = Math.max(0, start - (sec.from + 4))
    sec.from += shift
    sec.to += shift
    const { from, to } = sec
    const others = ([0, 1, 2] as Lane[]).filter((l) => l !== sec.lane)
    const gapAt = (d: number) => this.rowGap(d) + 1
    switch (sec.kind) {
      case 'flight': {
        // a bush plane waits on the airstrip in the middle lane: run into it to take off. In the air the coins are
        // strung along the flight path, weaving across the lanes (steer to collect them). The ground lanes stay
        // runnable for anyone who skips the plane: one obstacle at a time, never both side lanes.
        const at = from + 6
        this.add(at, sec.lane, 'plane', 0)
        this.lastRowD = at
        const end = to - 6
        for (let d = at + 8, i = 0; d < end - 6; d += 2.4, i++) {
          const lane = Math.max(0, Math.min(2, Math.round(1 + Math.sin(i * 0.33) * 1.2))) as Lane
          this.add(d, lane, i % 17 === 8 ? 'gem' : 'coin', flightAlt((d - at) / Math.max(1, end - at)) + 0.6)
        }
        for (let d = at + gapAt(at) + 4; d < end - 8; d += gapAt(d)) {
          this.add(d, others[Math.floor(this.rng() * 2)], this.rng() < 0.5 ? 'log' : 'rock')
          this.lastRowD = d
        }
        break
      }
      case 'rail': {
        // the trolley waits at the start of the track; jump on to ride it to the buffer stop
        this.add(from + 4, sec.lane, 'trolley', 0)
        this.lastRowD = from + 4
        for (let d = from + 10; d < to - 6; d += 2.2) this.add(d, sec.lane, 'coin', RIDE_H + 0.7)
        this.add((from + to) / 2, sec.lane, 'gem', RIDE_H + 1.4)
        // the other lanes stay open but not empty: one obstacle at a time, never both lanes
        for (let d = from + 4 + gapAt(from); d < to - 8; d += gapAt(d)) {
          this.add(d, others[Math.floor(this.rng() * 2)], this.rng() < 0.5 ? 'log' : 'roots')
          this.lastRowD = d
        }
        break
      }
      case 'river': {
        // stepping stones: each row has water in two lanes and a stone in one (jump or step across); a full-width
        // channel to finish
        let stone = Math.floor(this.rng() * 3) as Lane
        let d = from + 4
        for (let i = 0; i < 3; i++, d += gapAt(d)) {
          for (const l of [0, 1, 2] as Lane[]) if (l !== stone) this.add(d, l, 'stream')
          this.coinArc(d, stone)
          stone = Math.max(0, Math.min(2, stone + (this.rng() < 0.5 ? -1 : 1))) as Lane
        }
        for (const l of [0, 1, 2] as Lane[]) this.add(d, l, 'stream')
        this.coinArc(d, 1)
        this.lastRowD = d
        sec.to = d + 8
        break
      }
      case 'bridge': {
        // broken bridge: missing planks in two lanes, then a full break to jump, then planks gone in one lane
        const gap = gapAt(from)
        const d1 = from + 4
        const keep = Math.floor(this.rng() * 3) as Lane
        for (const l of [0, 1, 2] as Lane[]) if (l !== keep) this.add(d1, l, 'gap')
        this.coinLine(d1 - 5, keep, 4)
        for (const l of [0, 1, 2] as Lane[]) this.add(d1 + gap, l, 'gap')
        this.coinArc(d1 + gap, keep)
        const hole = Math.floor(this.rng() * 3) as Lane
        this.add(d1 + gap * 2, hole, 'gap')
        this.add(d1 + gap * 2, ((hole + 1) % 3) as Lane, 'barrier')
        this.lastRowD = d1 + gap * 2
        sec.to = d1 + gap * 2 + 8
        break
      }
      case 'rockslide': {
        // rocks crash down ahead (their shadows show first); rubble can be jumped
        let d = from + 4
        for (let i = 0; i < 3; i++, d += gapAt(d)) {
          const lanes = ([0, 1, 2] as Lane[]).sort(() => this.rng() - 0.5)
          this.add(d, lanes[0], 'rock').fall = true
          if (this.rng() < 0.6) this.add(d, lanes[1], 'rock').fall = true
          else this.add(d, lanes[1], 'rubble')
          this.coinLine(d - 5, lanes[2], 4)
          this.lastRowD = d
        }
        for (const it of this.items) if (it.fall && it.h !== 1) it.h = 0
        sec.to = this.lastRowD + 8
        break
      }
      case 'vines': {
        // a ravine across two lanes with a vine hanging at its lip in each; the third lane keeps a fallen log as a
        // bridge (the safe way, no reward). Swinging carries the runner over the drop through an arc of coins.
        const d = from + 6
        const span = 9
        const bridge = Math.floor(this.rng() * 3) as Lane
        for (const l of [0, 1, 2] as Lane[]) {
          if (l === bridge) continue
          const g = this.add(d + span / 2, l, 'gap')
          g.len = span / 2
          const v = this.add(d - 1.2, l, 'vine', 0)
          v.swingTo = d + span + 1.5
          for (let i = 1; i < 7; i++) {
            const p = i / 7
            this.add(d - 1.2 + p * (span + 2.7), l, 'coin', SWING_BASE + 0.4 + SWING_H * Math.sin(Math.PI * p))
          }
        }
        this.add(d + span / 2, bridge, 'gem', 1.1)
        this.coinLine(d - 5, bridge, 3)
        this.lastRowD = d + span
        sec.to = d + span + 8
        break
      }
      case 'treefall': {
        // a chain of trees comes down across the trail, alternating sides. Each tree stands shaking at the trail edge,
        // falls when the runner is close (like the rockslide) and lies across two lanes – sometimes all three, to jump
        let d = from + 4
        let side: 1 | -1 = this.rng() < 0.5 ? 1 : -1
        for (let i = 0; i < 3; i++, d += gapAt(d)) {
          const span = i === 2 && this.rng() < 0.5 ? 3 : 2
          const lanes = (side > 0 ? [0, 1, 2] : [2, 1, 0]) as Lane[]
          lanes.slice(0, span).forEach((l, j) => {
            const it = this.add(d, l, 'log', 0)
            it.fall = true
            if (j === 0) {
              it.topple = side
              it.span = span
            }
          })
          if (span < 3) this.coinLine(d - 5, lanes[2], 4)
          else this.coinArc(d, 1)
          this.lastRowD = d
          side = side > 0 ? -1 : 1
        }
        sec.to = this.lastRowD + 8
        break
      }
      case 'quicksand': {
        // sinking sand across two lanes, firm ground in the third (it wanders a lane at a time); a full-width pool to
        // jump at the end
        let firm = Math.floor(this.rng() * 3) as Lane
        let d = from + 4
        for (let i = 0; i < 3; i++, d += gapAt(d)) {
          for (const l of [0, 1, 2] as Lane[]) if (l !== firm) this.add(d, l, 'quicksand')
          this.coinLine(d - 4, firm, 4)
          firm = Math.max(0, Math.min(2, firm + (this.rng() < 0.5 ? -1 : 1))) as Lane
        }
        for (const l of [0, 1, 2] as Lane[]) this.add(d, l, 'quicksand')
        this.coinArc(d, 1)
        this.lastRowD = d
        sec.to = d + 8
        break
      }
      case 'temple': {
        // a temple corridor: dart volleys across every lane (slide under) between rows of fallen pillars (steer to the
        // open lane), and the golden idol – a gem – waiting at the end
        let d = from + 4
        let free = Math.floor(this.rng() * 3) as Lane
        for (let i = 0; i < 4; i++, d += gapAt(d)) {
          if (i % 2 === 0) for (const l of [0, 1, 2] as Lane[]) this.add(d, l, 'darts')
          else {
            for (const l of [0, 1, 2] as Lane[]) if (l !== free) this.add(d, l, 'ruin')
            this.coinLine(d - 5, free, 5)
          }
          this.lastRowD = d
          if (i % 2 === 1) free = Math.floor(this.rng() * 3) as Lane
        }
        this.add(this.lastRowD + 6, free, 'gem', 1.1)
        sec.to = this.lastRowD + 10
        break
      }
      case 'swinglog': {
        // heavy logs swinging on ropes across the trail at head height: duck under them or take the open lane. The
        // middle row hangs in every lane; the last adds a fallen log to jump
        let d = from + 4
        for (let i = 0; i < 3; i++, d += gapAt(d)) {
          const order = ([0, 1, 2] as Lane[]).sort(() => this.rng() - 0.5)
          if (i === 1) for (const l of order) this.add(d, l, 'swinglog')
          else if (i === 0) {
            this.add(d, order[0], 'swinglog')
            this.add(d, order[1], 'swinglog')
            this.coinLine(d - 5, order[2], 4)
          } else {
            this.add(d, order[0], 'swinglog')
            this.add(d, order[1], 'log')
            this.coinArc(d, order[1])
          }
          this.lastRowD = d
        }
        sec.to = this.lastRowD + 8
        break
      }
      case 'minecart': {
        // an old mine line: a cart parked on each of three tracks (run into one to climb in). Riding, a lane change
        // switches track. Ahead: buffer stops where a track ends (switch away), broken rails (jump in the cart) and low
        // timber beams (duck in the cart). Every row leaves one clean track; rows sit 1.3x the reaction gap apart
        // because the cart is faster than running. Coins and gems ride along the clean track.
        const at = from + 5
        for (const l of [0, 1, 2] as Lane[]) this.add(at, l, 'minecart', 0)
        this.lastRowD = at
        const sp = (d: number) => gapAt(d) * 1.3
        let d = at + sp(at) + 2
        let clean = Math.floor(this.rng() * 3) as Lane
        for (let i = 0; i < 5; i++, d += sp(d)) {
          const others = ([0, 1, 2] as Lane[]).filter((l) => l !== clean)
          if (i === 2) {
            // a full-width hazard: every track has broken rails, or every track a low beam
            const k = this.rng() < 0.5 ? 'gap' : 'beam'
            for (const l of [0, 1, 2] as Lane[]) this.add(d, l, k)
            for (let c = -2; c <= 2; c++) this.add(d + c * 1.6, clean, 'coin', RIDE_H + 0.7 + (k === 'gap' ? 1.2 * (1 - (c / 2.5) ** 2) : -0.3))
          } else {
            this.add(d, others[0], 'buffer')
            // the second track is blocked, or only needs a jump or a duck
            const r = this.rng()
            this.add(d, others[1], r < 0.5 ? 'buffer' : r < 0.75 ? 'gap' : 'beam')
            for (let c = 0; c < 5; c++) this.add(d - 9 + c * 2.2, clean, c === 2 ? 'gem' : 'coin', RIDE_H + 0.7)
          }
          this.lastRowD = d
          // the clean track wanders, a track at a time
          clean = Math.max(0, Math.min(2, clean + (this.rng() < 0.5 ? -1 : 1))) as Lane
        }
        sec.to = this.lastRowD + 14
        break
      }
      case 'raft':
      case 'jeep': {
        // a vehicle run, like the mine line: a vehicle parked in every lane (run into one), then rows the rider steers
        // through. Raft: rocks in the rapids (steer), floating logs (jump the raft over), low branches (duck). Jeep:
        // boulders and acacia trunks (steer), gullies off a ramp (jump), low acacia boughs (duck). Every row leaves one
        // clean lane; rows are 1.3x the reaction gap apart because the vehicle is faster than running.
        const raft = sec.kind === 'raft'
        const at = from + 5
        for (const l of [0, 1, 2] as Lane[]) this.add(at, l, sec.kind as ObstacleKind, 0)
        this.lastRowD = at
        const sp = (d: number) => gapAt(d) * 1.3
        const H = RIDE_BASE[sec.kind as RideKind] ?? RIDE_H
        let d = at + sp(at) + 2
        let clean = Math.floor(this.rng() * 3) as Lane
        const wall: ObstacleKind = raft ? 'rock' : this.rng() < 0.5 ? 'rock' : 'boulder'
        const low: ObstacleKind = raft ? 'log' : 'gap'
        for (let i = 0; i < 6; i++, d += sp(d)) {
          const others = ([0, 1, 2] as Lane[]).filter((l) => l !== clean)
          if (i === 2 || i === 4) {
            // a full-width hazard: every lane low (jump) or every lane overhead (duck)
            const k: ObstacleKind = this.rng() < 0.5 ? low : 'branch'
            for (const l of [0, 1, 2] as Lane[]) this.add(d, l, k)
            for (let c = -2; c <= 2; c++) this.add(d + c * 1.6, clean, 'coin', H + 0.7 + (k === low ? 1.2 * (1 - (c / 2.5) ** 2) : -0.3))
          } else {
            const w = this.add(d, others[0], wall)
            w.moving = 0
            const r = this.rng()
            const k: ObstacleKind = r < 0.5 ? wall : r < 0.75 ? low : 'branch'
            this.add(d, others[1], k).moving = 0
            for (let c = 0; c < 5; c++) this.add(d - 9 + c * 2.2, clean, c === 2 ? 'gem' : 'coin', H + 0.7)
          }
          this.lastRowD = d
          clean = Math.max(0, Math.min(2, clean + (this.rng() < 0.5 ? -1 : 1))) as Lane
        }
        sec.to = this.lastRowD + 14
        break
      }
      case 'zipline': {
        // a zipline chain over two ravines: a cable over every lane, grabbed automatically at the start gantry (no
        // way to miss it). Halfway across, boughs hang over one or two cables: change lane to switch cable. A short
        // landing ledge between the two lines; coins strung along a clear cable.
        let d = from + 6
        for (let n = 0; n < 2; n++) {
          const span = gapAt(d) * 2 + 6
          for (const l of [0, 1, 2] as Lane[]) {
            const z = this.add(d, l, 'zipline', 0)
            z.swingTo = d + span + 1.5
            const g = this.add(d + 1 + span / 2, l, 'gap')
            g.len = span / 2
          }
          const order = ([0, 1, 2] as Lane[]).sort(() => this.rng() - 0.5)
          // a little past the middle, so the boughs are their own row (not the ravine's)
          const bd = d + 3.5 + span / 2
          this.add(bd, order[0], 'bough')
          if (n === 1 || this.rng() < 0.5) this.add(bd, order[1], 'bough')
          for (let i = 1; i < 10; i++) {
            const p = i / 10
            this.add(d + p * (span + 1.5), order[2], i === 5 ? 'gem' : 'coin', zipAlt(p) + 0.6)
          }
          this.lastRowD = d + span + 1.5
          d = this.lastRowD + Math.max(12, gapAt(d) * 0.8)
        }
        sec.to = this.lastRowD + 10
        break
      }
      case 'cave': {
        // a tunnel: rows of hanging rock spikes to slide under, between them fallen rocks to steer round
        let d = from + 4
        for (let i = 0; i < 4; i++, d += gapAt(d)) {
          if (i % 2 === 0) for (const l of [0, 1, 2] as Lane[]) this.add(d, l, 'stalactite')
          else {
            const free = Math.floor(this.rng() * 3) as Lane
            for (const l of [0, 1, 2] as Lane[]) if (l !== free) this.add(d, l, 'rock')
            this.coinLine(d - 5, free, 5)
          }
          this.lastRowD = d
        }
        sec.to = this.lastRowD + 10
        break
      }
    }
  }

  private coinLine(d: number, lane: Lane, n: number) {
    for (let i = 0; i < n; i++) this.add(d + i * 2.2, lane, 'coin', 0.7)
  }

  private coinArc(d: number, lane: Lane) {
    for (let i = -2; i <= 2; i++) {
      const p = (i + 2.5) / 5
      this.add(d + i * 1.6, lane, 'coin', 0.7 + 4 * JUMP_H * p * (1 - p) * 0.9)
    }
  }

  // ---------------------------------------------------------------- tutorial

  private buildTutorial() {
    const s = this.state
    s.tutStep = 'lane'
    this.tutQueue = ['lane', 'jump', 'slide', 'roll', 'coins', 'ability', 'done']
    this.add(36, 1, 'rock', 0, 0, 'lane')
    for (const lane of [0, 1, 2] as Lane[]) this.add(70, lane, 'log', 0, 0, 'jump')
    for (const lane of [0, 1, 2] as Lane[]) this.add(104, lane, 'branch', 0, 0, 'slide')
    for (const lane of [0, 1, 2] as Lane[]) this.add(138, lane, 'barrier', 0, 0, 'roll')
    for (const lane of [0, 1, 2] as Lane[]) this.coinLine(160, lane, 6)
    s.abilityReadyAt = 0
  }

  private tutDone(step: TutStep) {
    const s = this.state
    if (!this.opts.tutorial || s.tutStep !== step) return
    s.tutWaiting = false
    this.tutQueue.shift()
    s.tutStep = this.tutQueue[0] ?? null
    if (s.tutStep) this.events.push({ type: 'tutorial', step: s.tutStep })
  }

  private tutorialTick() {
    const s = this.state
    if (!this.opts.tutorial || !s.tutStep) return
    if (s.tutStep === 'coins' && s.d > 175) this.tutDone('coins')
    if (s.tutStep === 'ability') {
      s.tutWaiting = s.d > 190
      return
    }
    if (s.tutStep === 'done') {
      if (s.d > 215) {
        s.tutStep = null
        // the lesson ends with a clean finish
        s.alive = false
        s.crashKind = null
      }
      return
    }
    const next = this.items.find((it) => it.tut === s.tutStep && !it.gone && it.d > s.d)
    // freeze at the spot where the move works: half a jump before a log, just before a branch or barrier
    const at = s.tutStep === 'lane' ? 7 : s.tutStep === 'jump' ? (s.speed * this.jumpMs()) / 2000 + (next?.len ?? 0) * 0.5 : 1.3 + (next?.len ?? 0)
    s.tutWaiting = !!next && next.d - s.d < at
  }

  /** Points the run earned, for the results screen. */
  summary() {
    const s = this.state
    return { distance: Math.floor(this.runD()), score: Math.floor(s.score), coins: s.coins, gems: s.gems, tokens: s.tokens, stats: { ...s.stats }, biomeIndex: s.biomeIndex, revives: s.revives }
  }
}

export const tutorialStepText = (step: TutStep | null) => (step ? TUT_TEXT[step] : '')
export const reviveCost = (revives: number) => REVIVE_GEMS * (revives + 1)
export { biomeAt }
