import type { GameId } from '@/games/registry'
import type { Achievement, GameStats } from '@/social/stores/usePlayerStore'

/*
 * Profile badges, worked out from what the app already tracks (wins and games per game, level, friends, a
 * connected account) so every player's history counts straight away. Most have bronze / silver / gold tiers.
 */

export type Tier = 0 | 1 | 2 | 3 // 0 = locked
export const TIER_NAME = ['Locked', 'Bronze', 'Silver', 'Gold'] as const
export const TIER_COLOR = ['#475569', '#cd7f32', '#cbd5e1', '#fbbf24'] as const

export interface Badge {
  id: string
  name: string
  icon: string
  /** what earns it, for the current/next tier */
  goal: string
  tier: Tier
  /** progress toward the next tier, 0..1 (1 when maxed) */
  progress: number
  value: number
  next: number | null
}

interface Inputs {
  stats: Record<GameId, GameStats>
  level: number
  friends: number
  connected: boolean
  achievements: Achievement[]
}

function tiered(id: string, name: string, icon: string, value: number, steps: [number, number, number], what: (n: number) => string): Badge {
  const tier = steps.filter((s) => value >= s).length as Tier
  const all: number[] = steps
  const next: number | null = tier < 3 ? all[tier] : null
  const prev = tier > 0 ? all[tier - 1] : 0
  return { id, name, icon, tier, value, next, goal: what(next ?? steps[2]), progress: next === null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev))) }
}

const GAME_BADGES: { game: GameId; name: string; icon: string; noun: string }[] = [
  { game: 'ludo', name: 'Ludo King', icon: '🎲', noun: 'Ludo' },
  { game: 'city', name: 'City Tycoon', icon: '🏙️', noun: 'City' },
  { game: 'poker', name: 'Card Shark', icon: '🃏', noun: 'Poker' },
  { game: 'wildbound', name: 'Trail Blazer', icon: '🐾', noun: 'Wildbound' },
]

// 'tycoon' (win a City game) is the City Tycoon badge's bronze tier, so it isn't listed twice
const KNOWN_ACHIEVEMENTS = new Set(['first-win', 'ludo-master', 'party-player'])

export function computeBadges({ stats, level, friends, connected, achievements }: Inputs): Badge[] {
  const played = Object.values(stats).reduce((s, g) => s + g.played, 0)
  const wins = Object.values(stats).reduce((s, g) => s + g.wins, 0)
  const gamesTried = Object.values(stats).filter((g) => g.played > 0).length
  const out: Badge[] = [
    ...GAME_BADGES.map((g) => tiered(`win-${g.game}`, g.name, g.icon, stats[g.game]?.wins ?? 0, [1, 10, 50], (n) => `Win ${n} ${g.noun} game${n === 1 ? '' : 's'}`)),
    tiered('champion', 'Champion', '🏆', wins, [5, 25, 100], (n) => `Win ${n} games in total`),
    tiered('veteran', 'Veteran', '🎮', played, [10, 50, 200], (n) => `Play ${n} games`),
    tiered('explorer', 'Explorer', '🧭', gamesTried, [2, 3, 4], (n) => `Play ${n} different games`),
    tiered('rising', 'Rising Star', '⭐', level, [5, 10, 25], (n) => `Reach level ${n}`),
    tiered('social', 'Social Butterfly', '🦋', friends, [1, 5, 20], (n) => `Have ${n} friend${n === 1 ? '' : 's'}`),
    { id: 'connected', name: 'Connected', icon: '🔗', goal: 'Sign in with Google or Facebook', tier: connected ? 3 : 0, progress: connected ? 1 : 0, value: connected ? 1 : 0, next: connected ? null : 1 },
  ]
  // one-off achievements show as gold badges once unlocked
  for (const a of achievements) {
    if (!KNOWN_ACHIEVEMENTS.has(a.id)) continue
    out.push({ id: `ach-${a.id}`, name: a.name, icon: a.icon, goal: a.description, tier: a.unlocked ? 3 : 0, progress: a.unlocked ? 1 : 0, value: a.unlocked ? 1 : 0, next: a.unlocked ? null : 1 })
  }
  return out
}

/** A title for the level, shown under the name. */
export function rankFor(level: number): { name: string; color: string } {
  if (level >= 35) return { name: 'Legend', color: '#fbbf24' }
  if (level >= 20) return { name: 'Master', color: '#f472b6' }
  if (level >= 10) return { name: 'Pro', color: '#a78bfa' }
  if (level >= 5) return { name: 'Challenger', color: '#38bdf8' }
  return { name: 'Rookie', color: '#94a3b8' }
}
