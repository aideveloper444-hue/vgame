import { create } from 'zustand'
import {
  MAGNET_MS,
  MAGNET_RANGE,
  TrackGen,
  getAnimal,
  isObstacle,
  jumpMs,
  mulberry32,
  slideMs,
  speedAt,
  type ObstacleKind,
  type TrackItem,
} from './amazonTrackData'

/*
 * Amazon Wild Run race simulation. The live state sits in the mutable `sim` object, which the 3D scene
 * reads every frame; the React HUD gets a throttled copy through useAmazonUI.
 *
 * Every device simulates its own runner on the shared seeded trail (instant controls even online).
 * The host also simulates the computer runners; other people's runners are mirrored from the network.
 */

export type RunnerKind = 'local' | 'bot' | 'remote'
export type RunnerAction = 'run' | 'jump' | 'slide'
export type RaceMode = 'solo' | 'bots' | 'online'
export type SimPhase = 'idle' | 'countdown' | 'running' | 'over'

export interface Runner {
  id: string
  name: string
  avatarEmoji: string
  kind: RunnerKind
  animalId: string
  lane: 0 | 1 | 2
  action: RunnerAction
  actionAt: number
  alive: boolean
  distance: number
  speed: number
  coins: number
  shield: boolean
  magnetUntil: number
  invulnUntil: number
  crashKind: ObstacleKind | null
  /** Items this runner already picked up (coins and power-ups are per runner). */
  got: Set<number>
  // computer runners
  botLimit: number
  botMiss: number
  plan: { id: number; fail: boolean } | null
  // mirrored runners
  netD: number | null
}

export interface RaceSeat {
  id: string
  name: string
  avatarEmoji: string
  kind: RunnerKind
  animalId: string
}

export interface ResultRow {
  id: string
  name: string
  avatarEmoji: string
  animalId: string
  distance: number
  coins: number
  kind: RunnerKind
}

export interface BoardRow {
  id: string
  name: string
  animalId: string
  distance: number
  alive: boolean
  kind: RunnerKind
}

const COUNTDOWN_MS = 3000
const REVIVE_WINDOW_MS = 6000
export const REVIVE_COST = 100

export const sim = {
  phase: 'idle' as SimPhase,
  mode: 'solo' as RaceMode,
  host: true,
  seed: 1,
  track: new TrackGen(1),
  runners: [] as Runner[],
  localId: '',
  /** ms since GO (negative during the countdown) */
  t: 0,
  botRng: Math.random,
  botLevel: 'smart' as 'easy' | 'smart',
  reviveDeadline: 0,
  reviveUsed: false,
  uiAt: 0,
  /** Bumped whenever the visible set of track items changes, so the scene re-lists them. */
  itemsVersion: 0,
}

interface AmazonUI {
  phase: SimPhase
  countdown: number
  distance: number
  coins: number
  shield: boolean
  magnetLeft: number
  rank: number
  total: number
  board: BoardRow[]
  toast: { id: number; text: string } | null
  /** Seconds left to revive, or null when no revive is on offer. */
  revive: number | null
  spectating: string | null
  results: ResultRow[] | null
}

const UI_IDLE: AmazonUI = {
  phase: 'idle',
  countdown: 3,
  distance: 0,
  coins: 0,
  shield: false,
  magnetLeft: 0,
  rank: 1,
  total: 1,
  board: [],
  toast: null,
  revive: null,
  spectating: null,
  results: null,
}

export const useAmazonUI = create<AmazonUI>(() => ({ ...UI_IDLE }))

let toastId = 0
function toast(text: string) {
  useAmazonUI.setState({ toast: { id: ++toastId, text } })
}

export function localRunner(): Runner | undefined {
  return sim.runners.find((r) => r.id === sim.localId)
}

/** The runner the camera follows: you, or the leader once you are out. */
export function focusRunner(): Runner | undefined {
  const me = localRunner()
  if (!me) return sim.runners[0]
  if (me.alive || sim.reviveDeadline > sim.t || sim.phase !== 'running') return me
  const leader = sim.runners.filter((r) => r.alive).sort((a, b) => b.distance - a.distance)[0]
  return leader ?? me
}

function makeRunner(seat: RaceSeat): Runner {
  const animal = getAnimal(seat.animalId)
  const easy = sim.botLevel === 'easy'
  const limit = (easy ? 220 + sim.botRng() * 900 : 450 + sim.botRng() * 1900) * (0.75 + animal.stamina / 20)
  return {
    ...seat,
    lane: 1,
    action: 'run',
    actionAt: -1e9,
    alive: true,
    distance: 0,
    speed: 0,
    coins: 0,
    shield: false,
    magnetUntil: -1e9,
    invulnUntil: -1e9,
    crashKind: null,
    got: new Set(),
    botLimit: limit,
    botMiss: easy ? 0.07 : 0.025,
    plan: null,
    netD: null,
  }
}

export function setupRace(opts: { seed: number; mode: RaceMode; host: boolean; localId: string; seats: RaceSeat[]; botLevel?: 'easy' | 'smart' }) {
  sim.mode = opts.mode
  sim.host = opts.host
  sim.seed = opts.seed >>> 0
  sim.track = new TrackGen(sim.seed)
  sim.botRng = mulberry32((opts.seed ^ 0x5bd1e995) >>> 0)
  sim.botLevel = opts.botLevel ?? 'smart'
  sim.localId = opts.localId
  sim.runners = opts.seats.map(makeRunner)
  // spread the pack across the lanes at the start (same order on every device)
  sim.runners.forEach((r, i) => (r.lane = ([1, 0, 2, 2, 0, 1] as const)[i % 6]))
  sim.t = -COUNTDOWN_MS
  sim.phase = 'countdown'
  sim.reviveDeadline = 0
  sim.reviveUsed = false
  sim.uiAt = 0
  sim.track.advance(140, -10)
  sim.itemsVersion++
  useAmazonUI.setState({ ...UI_IDLE, phase: 'countdown', total: sim.runners.length })
  pushUI(true)
}

export function resetRace() {
  sim.phase = 'idle'
  sim.runners = []
  sim.itemsVersion++
  useAmazonUI.setState({ ...UI_IDLE })
}

// ---------------------------------------------------------------- controls (local runner)

function canAct(r: Runner | undefined): r is Runner {
  return !!r && r.alive && sim.phase === 'running'
}

export function moveLane(delta: -1 | 1) {
  const r = localRunner()
  if (!canAct(r)) return
  r.lane = Math.max(0, Math.min(2, r.lane + delta)) as 0 | 1 | 2
}

export function jump() {
  const r = localRunner()
  if (!canAct(r)) return
  const a = getAnimal(r.animalId)
  if (r.action === 'jump' && sim.t - r.actionAt < jumpMs(a)) return
  r.action = 'jump'
  r.actionAt = sim.t
}

export function slide() {
  const r = localRunner()
  if (!canAct(r)) return
  const a = getAnimal(r.animalId)
  if (r.action === 'slide' && sim.t - r.actionAt < slideMs(a)) return
  r.action = 'slide'
  r.actionAt = sim.t
}

export function revive() {
  const r = localRunner()
  if (!r || r.alive || sim.reviveUsed || sim.reviveDeadline <= sim.t) return false
  r.alive = true
  r.crashKind = null
  r.action = 'run'
  r.invulnUntil = sim.t + 2200
  sim.reviveUsed = true
  sim.reviveDeadline = 0
  toast('Back in the race!')
  pushUI(true)
  return true
}

export function declineRevive() {
  if (sim.reviveDeadline > sim.t) sim.reviveDeadline = sim.t
}

// ---------------------------------------------------------------- simulation

function actionActive(r: Runner, kind: RunnerAction): boolean {
  if (r.action !== kind) return false
  const a = getAnimal(r.animalId)
  return sim.t - r.actionAt < (kind === 'jump' ? jumpMs(a) : slideMs(a))
}

function crash(r: Runner, kind: ObstacleKind) {
  if (r.shield) {
    r.shield = false
    r.invulnUntil = sim.t + 1200
    if (r.kind === 'local') toast('Shield saved you!')
    return
  }
  r.alive = false
  r.crashKind = kind
  r.action = 'run'
  if (r.kind === 'local') {
    if (!sim.reviveUsed) sim.reviveDeadline = sim.t + REVIVE_WINDOW_MS
  } else {
    toast(`${r.name} crashed at ${Math.round(r.distance)} m`)
  }
}

function collide(r: Runner, from: number, to: number) {
  const magnet = r.magnetUntil > sim.t
  for (const item of sim.track.items) {
    if (item.d <= from - (magnet ? MAGNET_RANGE : 0) || item.d > to + (magnet ? MAGNET_RANGE : 0)) continue
    if (r.got.has(item.id)) continue
    if (item.kind === 'coin') {
      const inReach = item.lane === r.lane ? item.d > from && item.d <= to : magnet && Math.abs(item.d - to) < MAGNET_RANGE
      if (!inReach) continue
      r.got.add(item.id)
      r.coins += 1
      continue
    }
    if (item.d <= from || item.d > to || item.lane !== r.lane) continue
    if (item.kind === 'magnet') {
      r.got.add(item.id)
      r.magnetUntil = sim.t + MAGNET_MS
      if (r.kind === 'local') toast('Coin magnet!')
      continue
    }
    if (item.kind === 'shield') {
      r.got.add(item.id)
      r.shield = true
      if (r.kind === 'local') toast('Shield up!')
      continue
    }
    if (sim.t < r.invulnUntil) continue
    if (item.kind === 'log' && actionActive(r, 'jump')) continue
    if (item.kind === 'branch' && actionActive(r, 'slide')) continue
    crash(r, item.kind as ObstacleKind)
    return
  }
}

function obstacleAt(lane: number, d: number, window: number): TrackItem | undefined {
  return sim.track.items.find((i) => i.lane === lane && isObstacle(i.kind) && Math.abs(i.d - d) < window)
}

function botThink(r: Runner) {
  const a = getAnimal(r.animalId)
  const look = Math.max(10, r.speed * 0.75)
  const next = sim.track.items
    .filter((i) => i.lane === r.lane && isObstacle(i.kind) && i.d > r.distance && i.d - r.distance < look)
    .sort((x, y) => x.d - y.d)[0]
  if (!next) return
  if (!r.plan || r.plan.id !== next.id) {
    const tired = Math.max(0, (r.distance - r.botLimit) / 350)
    r.plan = { id: next.id, fail: sim.botRng() < r.botMiss + tired }
  }
  if (r.plan.fail) return
  const gap = next.d - r.distance
  if (next.kind === 'rock' || (gap < look * 0.6 && sim.botRng() < 0.02)) {
    // switch to the nearest lane that is clear around that spot
    const options = ([0, 1, 2] as const).filter((l) => l !== r.lane && !obstacleAt(l, next.d, 4)).sort((x, y) => Math.abs(x - r.lane) - Math.abs(y - r.lane))
    if (options.length) {
      r.lane = options[0]
      return
    }
  }
  if (next.kind === 'log' && gap < r.speed * (jumpMs(a) / 1000) * 0.5 && !actionActive(r, 'jump')) {
    r.action = 'jump'
    r.actionAt = sim.t
  } else if (next.kind === 'branch' && gap < r.speed * (slideMs(a) / 1000) * 0.5 && !actionActive(r, 'slide')) {
    r.action = 'slide'
    r.actionAt = sim.t
  }
}

function advanceRunner(r: Runner, dtMs: number) {
  if (!r.alive) return
  const a = getAnimal(r.animalId)
  r.speed = speedAt(r.distance, a)
  if (r.kind === 'remote') {
    // mirrored: run on locally, then ease toward the last reported distance
    r.distance += (r.speed * dtMs) / 1000
    if (r.netD !== null) {
      const err = r.netD - r.distance
      r.distance += Math.abs(err) > 12 ? err : err * 0.08
      r.netD += (r.speed * dtMs) / 1000
    }
    return
  }
  if (r.kind === 'bot') botThink(r)
  const from = r.distance
  r.distance += (r.speed * dtMs) / 1000
  collide(r, from, r.distance)
}

function isOver(): boolean {
  if (sim.reviveDeadline > sim.t) return false
  const me = localRunner()
  if (sim.mode === 'solo') return !!me && !me.alive
  return sim.runners.every((r) => !r.alive)
}

function finish() {
  sim.phase = 'over'
  const results: ResultRow[] = [...sim.runners]
    .sort((a, b) => b.distance - a.distance)
    .map((r) => ({ id: r.id, name: r.name, avatarEmoji: r.avatarEmoji, animalId: r.animalId, distance: Math.round(r.distance), coins: r.coins, kind: r.kind }))
  useAmazonUI.setState({ phase: 'over', results, revive: null })
}

/** Advance the race by dtMs. Called every animation frame by the game screen. */
export function step(dtMs: number) {
  if (sim.phase !== 'countdown' && sim.phase !== 'running') return
  const dt = Math.min(dtMs, 100)
  sim.t += dt
  if (sim.phase === 'countdown') {
    if (sim.t >= 0) {
      sim.phase = 'running'
      useAmazonUI.setState({ phase: 'running' })
    }
    pushUI()
    return
  }
  // small substeps keep fast runners from tunnelling through items
  const sub = Math.ceil(dt / 20)
  for (let k = 0; k < sub; k++) for (const r of sim.runners) advanceRunner(r, dt / sub)

  const alive = sim.runners.filter((r) => r.alive)
  const focus = focusRunner()
  const lead = Math.max(...sim.runners.map((r) => r.distance))
  const tail = Math.min(focus?.distance ?? 0, ...alive.map((r) => r.distance))
  const before = sim.track.items.length
  const firstBefore = sim.track.items[0]?.id
  sim.track.advance(lead + 140, tail - 25)
  if (sim.track.items.length !== before || sim.track.items[0]?.id !== firstBefore) sim.itemsVersion++

  if (isOver()) {
    finish()
    return
  }
  pushUI()
}

/** Host, after you are out: race the remaining computer runners to the end instantly. */
export function fastForwardBots() {
  if (!sim.host || sim.phase !== 'running') return
  if (sim.runners.some((r) => r.alive && r.kind !== 'bot')) return
  let guard = 0
  while (sim.phase === 'running' && guard++ < 60000) step(50)
}

function pushUI(force = false) {
  const now = performance.now()
  if (!force && now - sim.uiAt < 100) return
  sim.uiAt = now
  const me = localRunner()
  const sorted = [...sim.runners].sort((a, b) => b.distance - a.distance)
  const focus = focusRunner()
  useAmazonUI.setState({
    countdown: Math.max(0, Math.ceil(-sim.t / 1000)),
    distance: Math.round(me?.distance ?? 0),
    coins: me?.coins ?? 0,
    shield: !!me?.shield,
    magnetLeft: me ? Math.max(0, Math.ceil((me.magnetUntil - sim.t) / 1000)) : 0,
    rank: me ? sorted.indexOf(me) + 1 : 1,
    total: sim.runners.length,
    board: sorted.map((r) => ({ id: r.id, name: r.name, animalId: r.animalId, distance: Math.round(r.distance), alive: r.alive, kind: r.kind })),
    revive: me && !me.alive && sim.reviveDeadline > sim.t ? Math.ceil((sim.reviveDeadline - sim.t) / 1000) : null,
    spectating: me && !me.alive && sim.reviveDeadline <= sim.t && focus && focus.id !== me.id ? focus.name : null,
  })
}

// ---------------------------------------------------------------- network glue

/** Compact runner state: [id, distance, lane, action, actionAge, alive, coins]. */
export type NetRunner = [string, number, number, number, number, number, number]
const ACTIONS: RunnerAction[] = ['run', 'jump', 'slide']

export function packRunner(r: Runner): NetRunner {
  return [r.id, Math.round(r.distance * 100) / 100, r.lane, ACTIONS.indexOf(r.action), Math.round(sim.t - r.actionAt), r.alive ? 1 : 0, r.coins]
}

/** Apply a reported state to a mirrored runner (never to this device's own runner or the host's bots). */
export function applyNetRunner(n: NetRunner, allowBots: boolean) {
  const r = sim.runners.find((x) => x.id === n[0])
  if (!r || r.kind === 'local' || (r.kind === 'bot' && !allowBots)) return
  if (r.kind === 'bot') r.kind = 'remote' // guests mirror the host's computer runners
  const [, d, lane, act, age, alive, coins] = n
  r.netD = Number(d) || 0
  if (!r.alive && !alive) return
  r.lane = Math.max(0, Math.min(2, Number(lane) || 0)) as 0 | 1 | 2
  const action = ACTIONS[Number(act)] ?? 'run'
  if (action !== r.action || Math.abs(sim.t - Number(age) - r.actionAt) > 250) {
    r.action = action
    r.actionAt = sim.t - (Number(age) || 0)
  }
  r.coins = Number(coins) || 0
  if (r.alive && !alive) {
    r.alive = false
    r.distance = r.netD
    r.crashKind = 'rock'
    toast(`${r.name} crashed at ${Math.round(r.distance)} m`)
  } else if (!r.alive && alive) {
    r.alive = true
  }
}

/** A player left or the connection dropped: they finish where they are. */
export function dropRunner(id: string) {
  const r = sim.runners.find((x) => x.id === id)
  if (!r || !r.alive) return
  r.alive = false
  r.crashKind = 'rock'
  toast(`${r.name} left the race`)
}

if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __amazonSim: sim, __amazonApi: { step, jump, slide, moveLane, declineRevive, fastForwardBots } })
