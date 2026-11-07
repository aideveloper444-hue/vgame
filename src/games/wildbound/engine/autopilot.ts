import { ESCAPES, isObstacle, type ObstacleKind } from './content'
import { mulberry32, type Item, type Lane, type RunSim } from './run'

/*
 * Computer runners. `autopilot` is a near-perfect driver (the rules tests use it to prove every row has a way
 * through); `BotBrain` wraps it with human-like flaws for race rivals; `assistStep` is the accessibility
 * helper that only times jumps and slides while the player steers.
 */

const blocks = (sim: RunSim, l: number, from: number, to: number, onlyWalls = false) =>
  sim.items.some((it) => isObstacle(it.kind) && !it.gone && !it.broken && it.lane === l && it.d + it.len > from && it.d - it.len < to && (!onlyWalls || ESCAPES[it.kind as ObstacleKind].includes('lane')))

/** The next obstacle in the runner's lane within reach, if any. */
export function threatAhead(sim: RunSim, look = sim.state.speed * 0.55 + 4): Item | undefined {
  const s = sim.state
  return sim.items
    .filter((it) => isObstacle(it.kind) && !it.gone && !it.broken && it.kind !== 'trolley' && it.lane === s.lane && it.d + it.len > s.d - 0.3 && it.d - s.d < look)
    .sort((a, b) => a.d - b.d)[0]
}

/** One decision for a near-perfect runner. */
export function autopilot(sim: RunSim, threat = threatAhead(sim)) {
  const s = sim.state
  const look = s.speed * 0.55 + 4
  if (!threat) {
    // vines: a computer runner grabs the vine when it is on one
    const vine = sim.items.find((it) => it.kind === 'vine' && !it.gone && it.lane === s.lane && it.d - s.d > 0 && it.d - s.d < 2.2)
    if (vine && s.pose !== 'jump') sim.input('jump')
    return
  }
  const near = threat.d - s.d
  // nearest lane that is clear ahead; head for it one lane at a time while the lane in between is open here
  const crossing = s.speed * 0.45 + 2
  const clear = ([0, 1, 2] as Lane[]).filter((l) => l !== s.lane && !blocks(sim, l, s.d - 1, s.d + look + 4, true) && !blocks(sim, l, s.d - 1, s.d + crossing)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))
  const target = clear.find((l) => Math.abs(l - s.lane) === 1 || !blocks(sim, 1, s.d - 1, s.d + crossing))
  const safe = target === undefined ? undefined : ((s.lane + Math.sign(target - s.lane)) as Lane)
  const kind = threat.kind as ObstacleKind
  if (safe !== undefined && (ESCAPES[kind].includes('lane') || near > 6)) {
    sim.input(safe < s.lane ? 'left' : 'right')
    return
  }
  // already in a move that clears it: keep going
  if (s.pose === 'jump' && ESCAPES[kind].includes('jump')) return
  if ((s.pose === 'slide' || s.pose === 'roll') && ESCAPES[kind].includes('low')) return
  const lead = (s.speed * 0.64) / 2
  if (ESCAPES[kind].includes('jump') && near < lead + threat.len && s.pose !== 'jump') sim.input('jump')
  else if (ESCAPES[kind].includes('low') && near < 2.5 && s.pose !== 'slide') sim.input('slide')
  else if (ESCAPES[kind].includes('lane') && safe !== undefined) sim.input(safe < s.lane ? 'left' : 'right')
}

export type BotLevel = 'easy' | 'smart'

/** A race rival: the autopilot with a reaction delay, the odd misjudged obstacle and its own power timing. */
export class BotBrain {
  private rng: () => number
  private judged = new Map<number, boolean>()
  private seenAt = new Map<number, number>()
  readonly level: BotLevel
  constructor(level: BotLevel, seed: number) {
    this.level = level
    this.rng = mulberry32(seed)
  }
  step(sim: RunSim) {
    const s = sim.state
    if (!s.alive) return
    const t = threatAhead(sim)
    if (t) {
      if (!this.judged.has(t.id)) {
        // decide once per obstacle whether this one gets misread (the race stays winnable for people)
        const miss = this.level === 'easy' ? 0.075 : 0.03
        this.judged.set(t.id, this.rng() >= miss)
        this.seenAt.set(t.id, s.t)
      }
      if (!this.judged.get(t.id)) return
      // easy rivals react a little late
      const lag = this.level === 'easy' ? 110 : 40
      if (s.t - (this.seenAt.get(t.id) ?? 0) < lag) return
    }
    autopilot(sim, t)
    // use the animal's power every so often once it is ready
    if (sim.abilityCooldownLeft() <= 0 && this.rng() < (this.level === 'smart' ? 0.004 : 0.0015)) sim.useAbility()
    if (this.judged.size > 200) {
      this.judged.clear()
      this.seenAt.clear()
    }
  }
}

/**
 * Assisted controls (accessibility): times jumps and slides for the obstacle in the runner's lane. The player
 * still steers; lane-only obstacles (rocks, boulders) are left to them.
 */
export function assistStep(sim: RunSim) {
  const s = sim.state
  if (!s.alive) return
  const t = threatAhead(sim)
  if (!t) return
  const kind = t.kind as ObstacleKind
  const esc = ESCAPES[kind]
  const near = t.d - s.d
  if (s.pose === 'jump' && esc.includes('jump')) return
  if ((s.pose === 'slide' || s.pose === 'roll') && esc.includes('low')) return
  const lead = (s.speed * 0.64) / 2
  if (esc.includes('jump') && near < lead + t.len && s.pose !== 'jump') sim.input('jump')
  else if (esc.includes('low') && !esc.includes('jump') && near < 2.5) sim.input('slide')
}
