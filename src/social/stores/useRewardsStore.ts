import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

export interface Challenge {
  id: string
  label: string
  target: number
  progress: number
  rewardCoins: number
  rewardXp: number
  claimed: boolean
}

interface RewardsState {
  dailyDay: number
  lastClaimedDate: string | null
  challenges: Challenge[]
  /** rewarded ads watched today, to cap them per day */
  adWatch: { day: string; count: number }
  adsLeftToday: (limit: number) => number
  recordAdWatch: () => void
  canClaimDaily: () => boolean
  claimDaily: () => { coins: number; xp: number } | null
  bumpChallenge: (id: string, amount: number) => void
  claimChallenge: (id: string) => { coins: number; xp: number } | null
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

const DEFAULT_CHALLENGES: Challenge[] = [
  { id: 'play-2', label: 'Play 2 games', target: 2, progress: 0, rewardCoins: 150, rewardXp: 100, claimed: false },
  { id: 'win-1', label: 'Win one game', target: 1, progress: 0, rewardCoins: 300, rewardXp: 250, claimed: false },
  { id: 'play-friend', label: 'Play with a friend', target: 1, progress: 0, rewardCoins: 200, rewardXp: 150, claimed: false },
]

export const useRewardsStore = create<RewardsState>()(
  persist(
    immer((set, get) => ({
      dailyDay: 1,
      lastClaimedDate: null,
      challenges: DEFAULT_CHALLENGES,
      adWatch: { day: '', count: 0 },

      adsLeftToday: (limit) => {
        const w = get().adWatch
        return w.day === todayKey() ? Math.max(0, limit - w.count) : limit
      },

      recordAdWatch: () =>
        set((state) => {
          const today = todayKey()
          state.adWatch = state.adWatch.day === today ? { day: today, count: state.adWatch.count + 1 } : { day: today, count: 1 }
        }),

      canClaimDaily: () => get().lastClaimedDate !== todayKey(),

      claimDaily: () => {
        if (!get().canClaimDaily()) return null
        const coins = 500
        set((state) => {
          state.lastClaimedDate = todayKey()
          state.dailyDay = state.dailyDay >= 7 ? 1 : state.dailyDay + 1
        })
        return { coins, xp: 0 }
      },

      bumpChallenge: (id, amount) =>
        set((state) => {
          const c = state.challenges.find((c) => c.id === id)
          if (c && !c.claimed) c.progress = Math.min(c.target, c.progress + amount)
        }),

      claimChallenge: (id) => {
        const c = get().challenges.find((c) => c.id === id)
        if (!c || c.claimed || c.progress < c.target) return null
        set((state) => {
          const target = state.challenges.find((c) => c.id === id)
          if (target) target.claimed = true
        })
        return { coins: c.rewardCoins, xp: c.rewardXp }
      },
    })),
    { name: 'mw-rewards' },
  ),
)
