import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ANIMALS, ANIMAL_PRICE_INR, RETIRED, getAnimal, type AnimalId, type PowerUpKind, powerUp } from '../engine/content'

/*
 * Wildbound save game on this device: currencies, roster, power-ups, records, missions, achievements,
 * the Jungle Festival event and settings.
 *
 * Rules: Sonic is free. The other nine unlock with 499 gems or a store purchase, never with coins.
 * Coins buy power-up upgrades and gem-free conversions; gems buy power-up charges, revives and animals.
 */

export interface RunResult {
  animalId: AnimalId
  distance: number
  score: number
  coins: number
  gems: number
  tokens: number
  revives: number
  biomeIndex: number
  stats: { jumps: number; slides: number; rolls: number; laneChanges: number; powerupsUsed: number; abilitiesUsed: number; broken: number; branchesUnder: number; waterfallSections: number; biomesSeen: number; nearMisses?: number; swings?: number }
  tutorial?: boolean
  /** the run's challenge sections (ChallengeHud tally) and the difficulty tier it reached */
  challenges?: { cleared: number; stars: number; perfect: number; tier: number; kinds?: string[]; gauntlets?: number }
  /** a daily run (seeded by the date) */
  daily?: boolean
}

export interface RunRecord {
  at: number
  animalId: AnimalId
  distance: number
  score: number
  coins: number
}

export interface Settings {
  sound: boolean
  music: boolean
  haptics: boolean
  /** swipe distance multiplier: lower = more sensitive */
  sensitivity: number
  /** accessibility: how quickly a lane change moves (0.8 gentle, 1 normal, 1.2 quick); solo runs */
  steer?: number
  leftHanded: boolean
  reducedMotion: boolean
  /** graphics profile: low (no shadows), medium, high (soft shadows), ultra (bloom, light shafts, anti-aliasing) */
  quality: Quality
  /** HUD and menu text size */
  textScale: number
  /** accessibility: jumps and slides are timed for you (solo runs) */
  assist: boolean
  /** accessibility: hazard markers on the trail in colour-blind-safe colours with shapes */
  colorSafe: boolean
}
export type Quality = 'low' | 'medium' | 'high' | 'ultra'
export const QUALITIES: Quality[] = ['low', 'medium', 'high', 'ultra']

// ---------------------------------------------------------------- levels

export const xpForLevel = (level: number) => 400 + level * 300
export function levelOf(xp: number) {
  let level = 1
  let rest = xp
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level)
    level++
  }
  return { level, xp: rest, need: xpForLevel(level) }
}
export const LEVEL_REWARD = { gems: 50, coins: 500 }

// ---------------------------------------------------------------- missions

export type MissionType = 'coins' | 'run' | 'powerups' | 'level' | 'branches' | 'waterfall'
export interface MissionDef {
  type: MissionType
  icon: 'trophy' | 'run' | 'bolt' | 'star'
  label: (target: number) => string
  /** target and gem reward for tier t (0-based) */
  target: (t: number) => number
  reward: (t: number) => number
}
export const MISSIONS: MissionDef[] = [
  { type: 'coins', icon: 'trophy', label: (n) => `Collect ${n.toLocaleString('en-IN')} Coins`, target: (t) => 500 * 2 ** t, reward: (t) => 50 + 25 * t },
  { type: 'run', icon: 'run', label: (n) => `Run ${n.toLocaleString('en-IN')} Meters`, target: (t) => 1000 + 750 * t, reward: (t) => 100 + 25 * t },
  { type: 'powerups', icon: 'bolt', label: (n) => `Use ${n} Power-Ups`, target: (t) => 3 + 3 * t, reward: (t) => 75 + 15 * t },
  { type: 'level', icon: 'star', label: (n) => `Reach Level ${n}`, target: (t) => 5 + 5 * t, reward: (t) => 100 + 50 * t },
  { type: 'branches', icon: 'run', label: (n) => `Slide under ${n} branches`, target: (t) => 10 + 10 * t, reward: (t) => 60 + 10 * t },
  { type: 'waterfall', icon: 'trophy', label: (n) => `Complete ${n} waterfall sections`, target: (t) => 3 + 3 * t, reward: (t) => 80 + 20 * t },
]

// ---------------------------------------------------------------- achievements

export interface AchievementDef {
  id: string
  name: string
  desc: string
  gems: number
  done: (s: SaveState) => boolean
}
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-run', name: 'First Run', desc: 'Finish your first run', gems: 10, done: (s) => s.totals.runs >= 1 },
  { id: 'explorer', name: 'Forest Explorer', desc: 'Reach all five worlds in one run (500 m)', gems: 40, done: (s) => s.best.distance >= 500 },
  { id: 'waterfall', name: 'Waterfall Survivor', desc: 'Complete 10 waterfall sections', gems: 40, done: (s) => s.totals.waterfall >= 10 },
  { id: 'coins', name: 'Coin Collector', desc: 'Collect 10,000 coins in total', gems: 60, done: (s) => s.totals.coins >= 10000 },
  { id: 'dodge', name: 'Perfect Dodge', desc: 'Make 500 lane changes', gems: 40, done: (s) => s.totals.laneChanges >= 500 },
  { id: '1k', name: '1K Runner', desc: 'Run 1,000 m in one run', gems: 50, done: (s) => s.best.distance >= 1000 },
  { id: '5k', name: '5K Runner', desc: 'Run 5,000 m in one run', gems: 150, done: (s) => s.best.distance >= 5000 },
  { id: 'ability', name: 'Ability Master', desc: 'Use 50 animal abilities', gems: 60, done: (s) => s.totals.abilities >= 50 },
  { id: 'norevive', name: 'No-Revive Champion', desc: 'Run 1,000 m without a revive', gems: 80, done: (s) => s.best.noRevive >= 1000 },
  { id: 'race1', name: 'Pack Runner', desc: 'Finish a race with friends or rivals', gems: 20, done: (s) => s.races.played >= 1 },
  { id: 'racewin', name: 'Alpha of the Pack', desc: 'Win 5 races', gems: 80, done: (s) => s.races.wins >= 5 },
  { id: 'vines', name: 'Vine Swinger', desc: 'Swing across 15 ravines on vines', gems: 40, done: (s) => s.totals.swings >= 15 },
  { id: 'closecall', name: 'Close Call', desc: 'Make 50 last-second dodges', gems: 50, done: (s) => s.totals.nearMisses >= 50 },
  // challenge sections (design brief §7: challenge stars)
  { id: 'challenger', name: 'Challenger', desc: 'Clear 25 challenges', gems: 40, done: (s) => (s.totals.challenges ?? 0) >= 25 },
  { id: 'stars', name: 'Star Collector', desc: 'Earn 150 challenge stars', gems: 80, done: (s) => (s.totals.stars ?? 0) >= 150 },
  { id: 'flawless', name: 'Flawless', desc: 'Clear 10 challenges with all three stars', gems: 60, done: (s) => (s.totals.perfect ?? 0) >= 10 },
  { id: 'gauntlet', name: 'Gauntlet Champion', desc: 'Conquer the Final Jungle Gauntlet', gems: 100, done: (s) => (s.totals.gauntlets ?? 0) >= 1 },
  { id: 'legend', name: 'Legend of the Wild', desc: 'Reach the Legend tier in one run', gems: 150, done: (s) => (s.best.tier ?? 1) >= 5 },
]

// ---------------------------------------------------------------- the Jungle Festival (weekly)

export const EVENT_TIERS = [
  { tokens: 25, coins: 500, gems: 0 },
  { tokens: 75, coins: 0, gems: 50 },
  { tokens: 150, coins: 2000, gems: 0 },
  { tokens: 300, coins: 0, gems: 150 },
]

/** The festival runs Friday 00:00 to Monday 00:00 local time, every week. */
export function festival(now = Date.now()) {
  const d = new Date(now)
  const day = d.getDay() // 0 Sun .. 6 Sat
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((day + 2) % 7)) // back to the latest Friday
  const end = new Date(start)
  end.setDate(end.getDate() + 3)
  const active = now >= start.getTime() && now < end.getTime()
  const nextStart = new Date(start)
  if (!active) nextStart.setDate(nextStart.getDate() + 7)
  return { id: `jf-${start.toISOString().slice(0, 10)}`, active, endsAt: end.getTime(), startsAt: active ? start.getTime() : nextStart.getTime() }
}

// ---------------------------------------------------------------- store

export const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------- daily run and weekly expedition (brief §5, §7)

/** today's daily run: the same seed and start zone for every player */
export const dailySeed = (date = today()) => {
  let h = 2166136261
  for (const c of `wildbound-daily-${date}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
export const DAILY_REWARD_GEMS = 30
/** the daily run counts once it reaches this far */
export const DAILY_MIN_M = 300

export interface ExpeditionDef {
  name: string
  blurb: string
  kinds: string[]
}
/** one theme a week, in rotation: clear its challenges for milestone rewards */
export const EXPEDITIONS: ExpeditionDef[] = [
  { name: 'Thunder River', blurb: 'River crossings, white water and broken bridges', kinds: ['river', 'raft', 'bridge', 'zipline'] },
  { name: 'Lost Temple Valley', blurb: 'Temple traps, swinging logs and falling trees', kinds: ['temple', 'swinglog', 'treefall', 'cave'] },
  { name: 'Jaguar Highlands', blurb: 'Rockslides, mine carts and caves', kinds: ['rockslide', 'minecart', 'cave', 'rail'] },
  { name: 'Emerald Canopy', blurb: 'Ziplines, vine swings and falling trees', kinds: ['zipline', 'vines', 'treefall', 'swinglog'] },
  { name: 'Open Plains', blurb: 'Safari jeeps, airstrips and quicksand', kinds: ['jeep', 'flight', 'quicksand', 'rail'] },
]
export const EXPEDITION_GOALS = [
  { clears: 3, coins: 500 },
  { clears: 8, gems: 40 },
  { clears: 15, gems: 100 },
] as { clears: number; coins?: number; gems?: number }[]
/** the week number (weeks start on Monday) */
export const weekId = (now = Date.now()) => Math.floor((now / 86400000 + 3) / 7)
export const expeditionOf = (week = weekId()) => EXPEDITIONS[week % EXPEDITIONS.length]
/** when this week's expedition ends */
export const expeditionEnds = (week = weekId()) => (week + 1) * 7 * 86400000 - 3 * 86400000

export interface SaveState {
  coins: number
  gems: number
  xp: number
  owned: AnimalId[]
  selected: AnimalId
  inventory: Record<PowerUpKind, number>
  upgrades: Record<PowerUpKind, number>
  best: { score: number; distance: number; noRevive: number; tier?: number }
  bestByAnimal: Partial<Record<AnimalId, { score: number; distance: number }>>
  runs: RunRecord[]
  totals: { runs: number; coins: number; gems: number; distance: number; powerups: number; laneChanges: number; abilities: number; waterfall: number; branches: number; nearMisses: number; swings: number; challenges?: number; stars?: number; perfect?: number; gauntlets?: number }
  /** races with friends, online or vs computer */
  races: { played: number; wins: number; podiums: number; bestTime: Partial<Record<number, number>> }
  missionTier: Record<MissionType, number>
  /** progress since the current tier started (coins, power-ups, branches, waterfall are counted) */
  missionProgress: Record<MissionType, number>
  achievements: Record<string, number>
  /** today's daily run: best score and whether the day's reward was paid */
  dailyRun?: { date: string; best: number; rewarded: boolean }
  /** this week's expedition: themed clears and claimed milestones */
  expedition?: { week: number; clears: number; claimed: number[] }
  event: { id: string; joined: boolean; tokens: number; claimed: number[] }
  daily: { lastClaim: string; streak: number }
  levelUps: number[]
  tutorialDone: boolean
  appliedOrders: string[]
  /** saves from before the ₹99 animal locks owned every animal (a testing switch): they start again from Sonic once */
  locksV2: boolean
  settings: Settings
}

/** true unlocks every animal (testing only). Off: Sonic is free, every other animal is a ₹99 purchase */
export const UNLOCK_ALL = false
const ALL_ANIMALS = ANIMALS.map((a) => a.id)

const ZERO: Record<PowerUpKind, number> = { magnet: 0, shield: 0, speed: 0, superjump: 0, megajump: 0, boost: 0 }

const INITIAL: SaveState = {
  coins: 500,
  gems: 50,
  xp: 0,
  owned: UNLOCK_ALL ? ALL_ANIMALS : ['sonic'],
  locksV2: true,
  // Sonic is the starting animal; the tiger is free too
  selected: 'sonic',
  inventory: { magnet: 1, shield: 1, speed: 1, superjump: 1, megajump: 1, boost: 1 },
  upgrades: { ...ZERO },
  best: { score: 0, distance: 0, noRevive: 0 },
  bestByAnimal: {},
  runs: [],
  totals: { runs: 0, coins: 0, gems: 0, distance: 0, powerups: 0, laneChanges: 0, abilities: 0, waterfall: 0, branches: 0, nearMisses: 0, swings: 0 },
  races: { played: 0, wins: 0, podiums: 0, bestTime: {} },
  missionTier: { coins: 0, run: 0, powerups: 0, level: 0, branches: 0, waterfall: 0 },
  missionProgress: { coins: 0, run: 0, powerups: 0, level: 0, branches: 0, waterfall: 0 },
  achievements: {},
  event: { id: '', joined: false, tokens: 0, claimed: [] },
  daily: { lastClaim: '', streak: 0 },
  levelUps: [],
  tutorialDone: false,
  appliedOrders: [],
  settings: { sound: true, music: true, haptics: true, sensitivity: 1, leftHanded: false, reducedMotion: false, quality: 'high', textScale: 1, assist: false, colorSafe: false },
}

export const UPGRADE_MAX = 5
export const upgradeCost = (level: number) => 750 * (level + 1)
export const DAILY_REWARDS = [{ coins: 200 }, { coins: 300 }, { gems: 10 }, { coins: 500 }, { gems: 20 }, { coins: 1000 }, { gems: 50 }] as { coins?: number; gems?: number }[]
export const COIN_PACKS = [
  { coins: 1000, gems: 20 },
  { coins: 5000, gems: 90 },
  { coins: 12000, gems: 200 },
]

type Result = { ok: true } | { ok: false; reason: string }

interface Actions {
  select: (id: AnimalId) => Result
  unlockWithGems: (id: AnimalId) => Result
  buyPowerUp: (kind: PowerUpKind) => Result
  upgradePowerUp: (kind: PowerUpKind) => Result
  usePowerUp: (kind: PowerUpKind) => boolean
  buyCoins: (index: number) => Result
  spendGems: (n: number) => boolean
  finishRun: (r: RunResult) => { coins: number; gems: number; xp: number; newBest: boolean; levelsGained: number }
  /** a race result: podium coins and XP on top of the run (call after finishRun) */
  recordRace: (r: { place: number; field: number; length: number; timeMs: number | null; coins: number; xp: number }) => void
  missionValue: (type: MissionType) => number
  claimMission: (type: MissionType) => Result
  claimExpedition: (i: number) => Result
  claimAchievement: (id: string) => Result
  claimDaily: () => { coins?: number; gems?: number } | null
  joinEvent: () => void
  claimEventTier: (i: number) => Result
  popLevelUp: () => number | null
  applyPurchase: (orderId: string, grant: { animals?: AnimalId[]; gems?: number }) => boolean
  setSettings: (patch: Partial<Settings>) => void
  completeTutorial: () => void
}

/** the daily-run record and the expedition count after a run (and the day's gems, paid once) */
function dailyAndExpedition(s: SaveState, r: RunResult): { patch: Partial<SaveState>; gems: number } {
  const out: Partial<SaveState> = {}
  let gems = 0
  const week = weekId()
  const theme = expeditionOf(week)
  const themed = (r.challenges?.kinds ?? []).filter((k) => theme.kinds.includes(k)).length
  const ex = s.expedition?.week === week ? s.expedition : { week, clears: 0, claimed: [] }
  if (themed || ex !== s.expedition) out.expedition = { ...ex, clears: ex.clears + themed }
  if (r.daily && !r.tutorial) {
    const d = today()
    const prev = s.dailyRun?.date === d ? s.dailyRun : { date: d, best: 0, rewarded: false }
    const pay = !prev.rewarded && r.distance >= DAILY_MIN_M
    out.dailyRun = { date: d, best: Math.max(prev.best, r.score), rewarded: prev.rewarded || pay }
    if (pay) gems = DAILY_REWARD_GEMS
  }
  return { patch: out, gems }
}

export const useSave = create<SaveState & Actions>()(
  persist(
    (set, get) => {
      const ok: Result = { ok: true }
      const no = (reason: string): Result => ({ ok: false, reason })
      const eventState = () => {
        const f = festival()
        const e = get().event
        return e.id === f.id ? e : { id: f.id, joined: false, tokens: 0, claimed: [] }
      }
      return {
        ...INITIAL,

        select: (id) => {
          if (!get().owned.includes(id)) return no(`${getAnimal(id).name} is locked`)
          set({ selected: id })
          return ok
        },

        unlockWithGems: (id) => {
          const a = getAnimal(id)
          const s = get()
          if (s.owned.includes(id)) return no('Already yours')
          if (a.free) return no('Already free')
          // animals are never sold for gems or coins: only the one-time store purchase unlocks them
          return no(`Unlock ${a.name} for ${ANIMAL_PRICE_INR} in the store`)
        },

        buyPowerUp: (kind) => {
          const price = powerUp(kind).gemPrice
          const s = get()
          if (s.gems < price) return no(`You need ${price} gems`)
          set({ gems: s.gems - price, inventory: { ...s.inventory, [kind]: s.inventory[kind] + 1 } })
          return ok
        },

        upgradePowerUp: (kind) => {
          const s = get()
          const lvl = s.upgrades[kind]
          if (lvl >= UPGRADE_MAX) return no('Fully upgraded')
          const cost = upgradeCost(lvl)
          if (s.coins < cost) return no(`You need ${cost.toLocaleString('en-IN')} coins`)
          set({ coins: s.coins - cost, upgrades: { ...s.upgrades, [kind]: lvl + 1 } })
          return ok
        },

        usePowerUp: (kind) => {
          const s = get()
          if (s.inventory[kind] <= 0) return false
          set({ inventory: { ...s.inventory, [kind]: s.inventory[kind] - 1 } })
          return true
        },

        buyCoins: (i) => {
          const p = COIN_PACKS[i]
          const s = get()
          if (!p) return no('Unknown pack')
          if (s.gems < p.gems) return no(`You need ${p.gems} gems`)
          set({ gems: s.gems - p.gems, coins: s.coins + p.coins })
          return ok
        },

        spendGems: (n) => {
          const s = get()
          if (s.gems < n) return false
          set({ gems: s.gems - n })
          return true
        },

        finishRun: (r) => {
          const s = get()
          const a = getAnimal(r.animalId)
          const coinBonus = a.id === 'leo' || a.id === 'bruno' || a.id === 'zara' ? 1.1 : 1
          const xpBonus = a.id === 'arctic' || a.id === 'titan' || a.id === 'ash' ? 1.1 : 1
          const coins = Math.round(r.coins * coinBonus)
          const xp = Math.round((r.distance * 0.5 + r.coins + r.gems * 10) * xpBonus)
          const before = levelOf(s.xp).level
          const after = levelOf(s.xp + xp).level
          const levelsGained = after - before
          const prevBest = s.bestByAnimal[r.animalId]
          const newBest = r.score > s.best.score
          const record: RunRecord = { at: Date.now(), animalId: r.animalId, distance: r.distance, score: r.score, coins }
          const runs = r.tutorial ? s.runs : [...s.runs, record].sort((x, y) => y.score - x.score).slice(0, 25)
          const levelUps = [...s.levelUps]
          for (let l = before + 1; l <= after; l++) levelUps.push(l)
          const ev = eventState()
          const mp = { ...s.missionProgress }
          mp.coins += coins
          mp.powerups += r.stats.powerupsUsed
          mp.branches += r.stats.branchesUnder
          mp.waterfall += r.stats.waterfallSections
          mp.run = Math.max(mp.run, r.distance)
          const de = dailyAndExpedition(s, r)
          set({
            coins: s.coins + coins + levelsGained * LEVEL_REWARD.coins,
            gems: s.gems + r.gems + levelsGained * LEVEL_REWARD.gems + de.gems,
            xp: s.xp + xp,
            best: {
              score: Math.max(s.best.score, r.score),
              distance: Math.max(s.best.distance, r.distance),
              noRevive: r.revives === 0 ? Math.max(s.best.noRevive, r.distance) : s.best.noRevive,
              tier: Math.max(s.best.tier ?? 1, r.challenges?.tier ?? 1),
            },
            bestByAnimal: { ...s.bestByAnimal, [r.animalId]: { score: Math.max(prevBest?.score ?? 0, r.score), distance: Math.max(prevBest?.distance ?? 0, r.distance) } },
            runs,
            totals: {
              runs: s.totals.runs + (r.tutorial ? 0 : 1),
              coins: s.totals.coins + coins,
              gems: s.totals.gems + r.gems,
              distance: s.totals.distance + r.distance,
              powerups: s.totals.powerups + r.stats.powerupsUsed,
              laneChanges: s.totals.laneChanges + r.stats.laneChanges,
              abilities: s.totals.abilities + r.stats.abilitiesUsed,
              waterfall: s.totals.waterfall + r.stats.waterfallSections,
              branches: s.totals.branches + r.stats.branchesUnder,
              nearMisses: (s.totals.nearMisses ?? 0) + (r.stats.nearMisses ?? 0),
              swings: (s.totals.swings ?? 0) + (r.stats.swings ?? 0),
              challenges: (s.totals.challenges ?? 0) + (r.challenges?.cleared ?? 0),
              stars: (s.totals.stars ?? 0) + (r.challenges?.stars ?? 0),
              perfect: (s.totals.perfect ?? 0) + (r.challenges?.perfect ?? 0),
              gauntlets: (s.totals.gauntlets ?? 0) + (r.challenges?.gauntlets ?? 0),
            },
            missionProgress: mp,
            levelUps,
            ...de.patch,
            event: ev.joined ? { ...ev, tokens: ev.tokens + r.tokens } : ev,
          })
          return { coins, gems: r.gems, xp, newBest, levelsGained }
        },

        recordRace: ({ place, field, length, timeMs, coins, xp }) => {
          const s = get()
          const before = levelOf(s.xp).level
          const after = levelOf(s.xp + xp).level
          const levelUps = [...s.levelUps]
          for (let l = before + 1; l <= after; l++) levelUps.push(l)
          const prev = s.races.bestTime[length]
          set({
            coins: s.coins + coins + (after - before) * LEVEL_REWARD.coins,
            gems: s.gems + (after - before) * LEVEL_REWARD.gems,
            xp: s.xp + xp,
            levelUps,
            races: {
              played: s.races.played + 1,
              wins: s.races.wins + (place === 1 && field > 1 ? 1 : 0),
              podiums: s.races.podiums + (place <= 3 && field > 1 ? 1 : 0),
              bestTime: timeMs !== null && (prev === undefined || timeMs < prev) ? { ...s.races.bestTime, [length]: timeMs } : s.races.bestTime,
            },
          })
        },

        missionValue: (type) => {
          const s = get()
          return type === 'level' ? levelOf(s.xp).level : s.missionProgress[type]
        },

        claimMission: (type) => {
          const s = get()
          const m = MISSIONS.find((x) => x.type === type)!
          const tier = s.missionTier[type]
          if (get().missionValue(type) < m.target(tier)) return no('Not finished yet')
          set({
            gems: s.gems + m.reward(tier),
            missionTier: { ...s.missionTier, [type]: tier + 1 },
            missionProgress: { ...s.missionProgress, [type]: 0 },
          })
          return ok
        },

        claimExpedition: (i) => {
          const s = get()
          const g = EXPEDITION_GOALS[i]
          const ex = s.expedition?.week === weekId() ? s.expedition : { week: weekId(), clears: 0, claimed: [] }
          if (!g) return no('No such reward')
          if (ex.claimed.includes(i)) return no('Already claimed')
          if (ex.clears < g.clears) return no('Not finished yet')
          set({ coins: s.coins + (g.coins ?? 0), gems: s.gems + (g.gems ?? 0), expedition: { ...ex, claimed: [...ex.claimed, i] } })
          return ok
        },

        claimAchievement: (id) => {
          const s = get()
          const a = ACHIEVEMENTS.find((x) => x.id === id)
          if (!a || s.achievements[id]) return no('Already claimed')
          if (!a.done(s)) return no('Not unlocked yet')
          set({ gems: s.gems + a.gems, achievements: { ...s.achievements, [id]: Date.now() } })
          return ok
        },

        claimDaily: () => {
          const s = get()
          if (s.daily.lastClaim === today()) return null
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
          // missing a day restarts the week without taking anything away
          const streak = s.daily.lastClaim === yesterday ? (s.daily.streak % 7) + 1 : 1
          const r = DAILY_REWARDS[streak - 1]
          set({ daily: { lastClaim: today(), streak }, coins: s.coins + (r.coins ?? 0), gems: s.gems + (r.gems ?? 0) })
          return r
        },

        joinEvent: () => set({ event: { ...eventState(), joined: true } }),

        claimEventTier: (i) => {
          const ev = eventState()
          const tier = EVENT_TIERS[i]
          if (!tier || ev.claimed.includes(i)) return no('Already claimed')
          if (ev.tokens < tier.tokens) return no(`Collect ${tier.tokens} tokens first`)
          const s = get()
          set({ event: { ...ev, claimed: [...ev.claimed, i] }, coins: s.coins + tier.coins, gems: s.gems + tier.gems })
          return ok
        },

        popLevelUp: () => {
          const [first, ...rest] = get().levelUps
          if (first === undefined) return null
          set({ levelUps: rest })
          return first
        },

        applyPurchase: (orderId, grant) => {
          const s = get()
          if (s.appliedOrders.includes(orderId)) return false // the same order never grants twice
          const owned = [...new Set([...s.owned, ...(grant.animals ?? [])])]
          set({ owned, gems: s.gems + (grant.gems ?? 0), appliedOrders: [...s.appliedOrders, orderId].slice(-200) })
          return true
        },

        setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
        completeTutorial: () => set({ tutorialDone: true }),
      }
    },
    {
      name: 'wildbound-save',
      version: 1,
      // saves from before Mega Jump and Super Boost: add the new power-ups (one free charge each)
      merge: (saved, current) => {
        const p = (saved ?? {}) as Partial<SaveState>
        return {
          ...current,
          ...p,
          inventory: { ...ZERO, megajump: 1, boost: 1, ...((p.inventory ?? current.inventory) as Partial<Record<PowerUpKind, number>>) },
          upgrades: { ...ZERO, ...(p.upgrades ?? current.upgrades) },
          // (animals a player already has stay theirs; Sonic is always included)
          // (a save from before the locks owned everything through the testing switch: it starts from Sonic, and
          // Restore purchases gives back anything bought on Google Play)
          owned: UNLOCK_ALL ? ALL_ANIMALS : p.locksV2 ? [...new Set<AnimalId>([...(p.owned ?? current.owned), 'sonic'])] : ['sonic'],
          locksV2: true,
          // a save that had a rested or no-longer-owned animal selected moves back to Sonic
          selected: p.selected && !RETIRED.has(p.selected) && (UNLOCK_ALL || (p.locksV2 && (p.owned ?? []).includes(p.selected)) || p.selected === 'sonic') ? p.selected : 'sonic',
          // newer settings (quality levels, text size, assist, colour-safe markers) and race records
          settings: { ...current.settings, ...(p.settings ?? {}) },
          totals: { ...current.totals, ...(p.totals ?? {}) },
          races: { ...current.races, ...(p.races ?? {}) },
        }
      },
    },
  ),
)

export const ownedCount = () => useSave.getState().owned.length
export const lockedAnimals = () => ANIMALS.filter((a) => !useSave.getState().owned.includes(a.id))
