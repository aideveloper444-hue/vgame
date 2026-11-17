import { ANIMALS, ROSTER, type AnimalId } from './content'
import { BotBrain, type BotLevel } from './autopilot'
import { RunSim, raceStartZone, type Pose } from './run'

/*
 * Wildbound races: everyone runs the same seeded trail (same obstacles, same junctions) to a finish line.
 * Each device simulates only its own runner; computer rivals are simulated by the host, and every other
 * runner arrives as position updates. A crash is not the end in a race: the runner stumbles, loses a couple
 * of seconds and gets back up (a short shield after). First over the line wins; anyone still running when the
 * race closes is ranked by distance.
 */

export type RacerKind = 'local' | 'bot' | 'remote'
/** 0 = unlimited: no finish line, the last runner standing (see RaceSession.endless) */
export const RACE_LENGTHS = [1000, 2000, 4000, 0] as const
export type RaceLength = (typeof RACE_LENGTHS)[number]
/**
 * Race types: a distance race (first over the line), a timed race (farthest when the clock runs out) and a coin
 * rush (most coins when the clock runs out). Each comes in fixed sizes or unlimited: an unlimited race has no finish
 * line and no clock, a crash knocks a runner out (no stumble and get up), and it ends when everyone is out; places
 * go by distance (by coins in a coin rush).
 */
export type RaceMode = 'distance' | 'time' | 'coins'
export const RACE_MODES: RaceMode[] = ['distance', 'time', 'coins']
/** 0 = unlimited */
export const RACE_MINUTES = [1, 2, 4, 0] as const
/** the limit sent for an unlimited timed race or coin rush */
export const ENDLESS_LIMIT = -1
/** a distance race closes at this pace even if nobody finishes (generous: ~5.5 m/s plus a minute) */
export const distanceLimitMs = (length: number) => Math.round((length / 5.5) * 1000 + 60000)
/** how long a crash costs in a race (ms) */
export const STUMBLE_MS = 1800
/** after the first runner finishes, the others get this long before the race closes (ms) */
export const CLOSE_AFTER_MS = 30000
/** a remote runner that has sent nothing for this long has left (ms) */
export const STALE_MS = 6000

export const RACER_COLORS = ['#ffd84a', '#5ab8ff', '#ff6a8a', '#7dff6a', '#c08aff', '#ff9a3a']

export interface RaceSeat {
  id: string
  name: string
  avatarEmoji: string
  kind: RacerKind
  animalId: AnimalId
}

export interface Racer extends RaceSeat {
  color: string
  d: number
  x: number
  y: number
  pose: Pose
  poseT: number
  speed: number
  /** race clock (ms) when the runner crossed the line */
  finishMs: number | null
  /** stumbling after a crash until this race time */
  stumbleUntil: number
  stumbles: number
  coins: number
  /** last update (race clock) for remote runners */
  seen: number
  left: boolean
  /** knocked out by a crash (unlimited races only) */
  out: boolean
  /** crashed and waiting to get back up */
  down: boolean
}

/** Compact network form: [id, d, x, y, pose, poseT, speed, finishMs (-1), stumbling (0/1), animal index, coins, out (0/1)] */
export type NetRacer = [string, number, number, number, number, number, number, number, number, number, number, number?]
const POSES: Pose[] = ['run', 'jump', 'slide', 'roll', 'dead']

export class RaceSession {
  t = 0
  racers: Racer[]
  private bots = new Map<string, { sim: RunSim; brain: BotBrain }>()
  /** first finish on the race clock */
  firstFinish: number | null = null
  closed = false

  readonly seed: number
  readonly length: number
  readonly localId: string
  readonly botLevel: BotLevel
  readonly mode: RaceMode
  /** the race clock's limit (ms): when it runs out the race closes and the standings are final */
  readonly limitMs: number
  /** an unlimited race: no finish line, no clock, a crash is out, it ends when everyone is out */
  readonly endless: boolean
  constructor(seed: number, length: number, seats: RaceSeat[], localId: string, botLevel: BotLevel = 'smart', mode: RaceMode = 'distance', limitMs = 0) {
    this.seed = seed
    this.mode = mode
    this.endless = mode === 'distance' ? length <= 0 : limitMs < 0
    // a timed race or coin rush has no finish line: the clock decides
    this.length = mode === 'distance' && !this.endless ? length : 1e7
    this.limitMs = this.endless ? Infinity : limitMs > 0 ? limitMs : distanceLimitMs(length)
    this.localId = localId
    this.botLevel = botLevel
    this.racers = seats.map((s, i) => ({ ...s, color: RACER_COLORS[i % RACER_COLORS.length], d: 0, x: 0, y: 0, pose: 'run', poseT: 0, speed: 0, finishMs: null, stumbleUntil: 0, stumbles: 0, coins: 0, seen: 0, left: false, down: false, out: false }))
    seats.forEach((s, i) => {
      if (s.kind !== 'bot') return
      const sim = new RunSim({ seed, animalId: s.animalId, rampMs: 1500, startZone: raceStartZone(seed) })
      this.bots.set(s.id, { sim, brain: new BotBrain(botLevel, (seed ^ (i * 0x9e3779b1)) >>> 0) })
    })
  }

  get local() {
    return this.racers.find((r) => r.id === this.localId)!
  }
  botSim(id: string) {
    return this.bots.get(id)?.sim ?? null
  }

  /** Advance the race clock and the computer runners; mirror the local runner from its simulation. */
  step(dtMs: number, local: RunSim | null) {
    if (this.closed) return
    this.t += dtMs
    if (local) this.mirror(this.local, local)
    for (const [id, b] of this.bots) {
      const r = this.racers.find((x) => x.id === id)!
      if (r.finishMs !== null || r.out) continue
      this.runStumble(r, b.sim)
      if (r.out) continue
      b.brain.step(b.sim)
      b.sim.step(dtMs)
      b.sim.events.length = 0
      this.mirror(r, b.sim)
    }
    // remote runners keep moving between updates, so they glide instead of hopping
    for (const r of this.racers) {
      if (r.kind !== 'remote' || r.finishMs !== null || r.left || r.out) continue
      if (this.t - r.seen > STALE_MS && r.seen > 0) r.left = true
      else if (this.t >= r.stumbleUntil) r.d += (r.speed * dtMs) / 1000
    }
    if (this.firstFinish === null) {
      const f = this.racers.filter((r) => r.finishMs !== null).map((r) => r.finishMs!)
      if (f.length) this.firstFinish = Math.min(...f)
    }
    if (this.firstFinish !== null && (this.t - this.firstFinish > CLOSE_AFTER_MS || this.racers.every((r) => r.finishMs !== null || r.left))) this.closed = true
    // the clock: a timed race or coin rush ends here; a distance race too if nobody has made it by then
    if (this.t >= this.limitMs) this.closed = true
    // unlimited: over when nobody is left running
    if (this.endless && this.racers.every((r) => r.out || r.left)) this.closed = true
  }

  /** A runner's place can't change any more: the race is over, they crossed the line, or (unlimited) they are out
   * and everyone still running is already ahead of them. */
  settled(r: Racer) {
    if (this.closed || r.finishMs !== null) return true
    if (!this.endless || !r.out) return false
    return this.racers.every((o) => o === r || o.out || o.left || (this.mode === 'coins' ? o.coins > r.coins : o.d > r.d))
  }

  /** A crash in a race: stumble, then get back up with a short shield (call every frame for the runner). */
  runStumble(r: Racer, sim: RunSim) {
    const s = sim.state
    if (s.alive || r.finishMs !== null || s.crashKind === null || r.out) return
    // unlimited race: a crash is the end of this runner's race
    if (this.endless) {
      r.out = true
      r.speed = 0
      return
    }
    if (!r.down) {
      r.down = true
      r.stumbleUntil = this.t + STUMBLE_MS
      r.stumbles++
    } else if (this.t >= r.stumbleUntil) {
      r.down = false
      sim.revive()
    }
  }

  private mirror(r: Racer, sim: RunSim) {
    const s = sim.state
    r.d = Math.min(sim.runD(), this.length)
    r.x = s.x
    r.y = s.y
    r.pose = s.pose
    r.poseT = s.poseT
    r.speed = s.alive ? s.speed : 0
    r.coins = s.coins
    if (r.finishMs === null && sim.runD() >= this.length) {
      r.finishMs = this.t
      // over the line: the runner celebrates (a clean stop, not a crash)
      s.alive = false
      s.crashKind = null
      s.pose = 'run'
    }
  }

  /** ms left on the race clock */
  get timeLeft() {
    return Math.max(0, this.limitMs - this.t)
  }

  /** Places: finishers by time, then everyone else by distance (timed race), or by coins (coin rush). */
  standings(): Racer[] {
    if (this.mode !== 'distance' || this.endless)
      return [...this.racers].sort((a, b) => {
        if (a.left !== b.left) return a.left ? 1 : -1
        return this.mode === 'coins' ? b.coins - a.coins || b.d - a.d : b.d - a.d
      })
    return [...this.racers].sort((a, b) => {
      if (a.finishMs !== null && b.finishMs !== null) return a.finishMs - b.finishMs
      if (a.finishMs !== null) return -1
      if (b.finishMs !== null) return 1
      if (a.left !== b.left) return a.left ? 1 : -1
      return b.d - a.d
    })
  }
  placeOf(id: string) {
    return this.standings().findIndex((r) => r.id === id) + 1
  }

  // ---------------------------------------------------------------- network

  pack(r: Racer): NetRacer {
    const stumbling = this.t < r.stumbleUntil ? 1 : 0
    return [r.id, +r.d.toFixed(2), +r.x.toFixed(2), +r.y.toFixed(2), Math.max(0, POSES.indexOf(r.pose)), +r.poseT.toFixed(2), +r.speed.toFixed(2), r.finishMs ?? -1, stumbling, Math.max(0, ANIMALS.findIndex((a) => a.id === r.animalId)), r.coins, r.out ? 1 : 0]
  }
  /** Apply a runner update from the network (never overwrites runners this device simulates). */
  apply(n: NetRacer) {
    if (!Array.isArray(n) || typeof n[0] !== 'string') return
    const r = this.racers.find((x) => x.id === n[0])
    if (!r || r.kind !== 'remote') return
    const num = (v: unknown, lo: number, hi: number, dflt = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt)
    r.d = num(n[1], 0, this.length)
    r.x = num(n[2], -3, 3)
    r.y = num(n[3], 0, 12)
    r.pose = POSES[num(n[4], 0, 4) | 0]
    r.poseT = num(n[5], 0, 1)
    r.speed = num(n[6], 0, 60)
    const f = num(n[7], -1, 1e8, -1)
    if (r.finishMs === null && f >= 0) r.finishMs = f
    r.stumbleUntil = n[8] ? this.t + 200 : 0
    r.animalId = ANIMALS[num(n[9], 0, ANIMALS.length - 1) | 0].id
    r.coins = num(n[10], 0, 1e6)
    if (n[11] === 1) r.out = true
    r.seen = this.t
    r.left = false
  }
}

/** Animals for computer rivals: different from the player's and from each other where possible. */
export function pickBotAnimals(n: number, mine: AnimalId, rnd: () => number = Math.random): AnimalId[] {
  const pool = ROSTER.map((a) => a.id).filter((id) => id !== mine)
  const out: AnimalId[] = []
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0] ?? mine)
  return out
}

/** Race rewards: a podium bonus on top of what was collected, the same for every animal. */
export function raceReward(place: number, field: number, length: number) {
  const base = Math.round(length / 20)
  const podium = field > 1 ? [3, 2, 1.4][place - 1] ?? 1 : 1
  return { coins: Math.round(base * podium), xp: Math.round((length / 10) * podium) }
}
