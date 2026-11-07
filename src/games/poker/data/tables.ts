/*
 * Table and tournament configuration. Every amount is in free, non-transferable, non-redeemable points.
 * Tournaments are free to enter; prizes are points too.
 */

export type TableMode = 'classic' | 'vip' | 'practice' | 'tournament' | 'friends'

export interface TableTier {
  id: string
  name: string
  mode: 'classic' | 'vip' | 'practice'
  smallBlind: number
  bigBlind: number
  buyIn: number
  minLevel: number
  /** opponents seated with you */
  opponents: number
}

export const TABLE_TIERS: TableTier[] = [
  { id: 'practice', name: 'Practice Table', mode: 'practice', smallBlind: 50, bigBlind: 100, buyIn: 10000, minLevel: 1, opponents: 3 },
  { id: 'bronze', name: 'Bronze Room', mode: 'classic', smallBlind: 50, bigBlind: 100, buyIn: 10000, minLevel: 1, opponents: 4 },
  { id: 'silver', name: 'Silver Room', mode: 'classic', smallBlind: 250, bigBlind: 500, buyIn: 50000, minLevel: 3, opponents: 4 },
  { id: 'gold', name: 'Gold Room', mode: 'classic', smallBlind: 1000, bigBlind: 2000, buyIn: 200000, minLevel: 8, opponents: 4 },
  { id: 'vip-ruby', name: 'VIP Ruby Room', mode: 'vip', smallBlind: 2500, bigBlind: 5000, buyIn: 250000, minLevel: 10, opponents: 5 },
  { id: 'vip-crown', name: 'VIP Crown Room', mode: 'vip', smallBlind: 5000, bigBlind: 10000, buyIn: 500000, minLevel: 15, opponents: 5 },
]

export const tier = (id: string) => TABLE_TIERS.find((t) => t.id === id)

export const TURN_MS = 15000

export interface TournamentDef {
  id: string
  name: string
  prizePool: number
  field: number
  startingStack: number
  /** hands per blind level */
  handsPerLevel: number
  /** schedule: 'now' (sit & go) or a weekly/daily slot in local time */
  schedule: { kind: 'now' } | { kind: 'daily'; hour: number } | { kind: 'weekly'; weekday: number; hour: number }
  featured?: boolean
}

export const BLIND_LEVELS: [number, number][] = [
  [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [600, 1200], [800, 1600], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [5000, 10000],
]

export const TOURNAMENTS: TournamentDef[] = [
  { id: 'daily', name: 'Daily Poker Tournament', prizePool: 100000, field: 1000, startingStack: 10000, handsPerLevel: 5, schedule: { kind: 'daily', hour: 21 }, featured: true },
  { id: 'turbo', name: 'Turbo Sit & Go', prizePool: 20000, field: 18, startingStack: 5000, handsPerLevel: 4, schedule: { kind: 'now' } },
  { id: 'weekend', name: 'Weekend Special', prizePool: 50000, field: 500, startingStack: 10000, handsPerLevel: 5, schedule: { kind: 'weekly', weekday: 6, hour: 18 } },
  { id: 'mega', name: 'Mega Poker Cup', prizePool: 200000, field: 1000, startingStack: 15000, handsPerLevel: 6, schedule: { kind: 'weekly', weekday: 0, hour: 19 } },
  { id: 'royal', name: 'Royal Championship', prizePool: 500000, field: 2000, startingStack: 20000, handsPerLevel: 6, schedule: { kind: 'weekly', weekday: 3, hour: 20 } },
]

export const tournament = (id: string) => TOURNAMENTS.find((t) => t.id === id)

/** Next start time for a scheduled tournament (ms), or null for sit & go. */
export function nextStart(t: TournamentDef, now = Date.now()): number | null {
  const d = new Date(now)
  if (t.schedule.kind === 'now') return null
  const at = new Date(d)
  at.setMinutes(0, 0, 0)
  at.setHours(t.schedule.hour)
  if (t.schedule.kind === 'daily') {
    if (at.getTime() <= now) at.setDate(at.getDate() + 1)
    return at.getTime()
  }
  const add = (t.schedule.weekday - d.getDay() + 7) % 7
  at.setDate(at.getDate() + add)
  if (at.getTime() <= now) at.setDate(at.getDate() + 7)
  return at.getTime()
}

/** Registered field shown before start: entrants trickle in toward the cap as start approaches (computer field). */
export function registeredCount(t: TournamentDef, now = Date.now()): number {
  const start = nextStart(t, now)
  if (start == null) return t.field
  const hoursLeft = (start - now) / 3600000
  const window = t.schedule.kind === 'daily' ? 24 : 168
  const frac = Math.max(0.05, Math.min(1, 1 - hoursLeft / window))
  return Math.max(12, Math.round(t.field * frac * 0.9))
}

/** Paid places: top 10% (at least 3), weighted to the top. Returns points per place, 1-based. */
export function payouts(t: TournamentDef): number[] {
  const places = Math.max(3, Math.round(t.field * 0.1))
  const top = [0.3, 0.2, 0.12]
  const rest = (1 - top.reduce((a, b) => a + b, 0)) / Math.max(1, places - 3)
  return Array.from({ length: places }, (_, i) => Math.floor(t.prizePool * (top[i] ?? rest)))
}
