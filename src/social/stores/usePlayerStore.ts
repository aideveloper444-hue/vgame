import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { GameId } from '@/games/registry'

export interface GameStats {
  played: number
  wins: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt: number | null
}

export interface PlayerProfile {
  id: string
  name: string
  avatarEmoji: string
  title: string
  level: number
  xp: number
  coins: number
  gems: number
  energy: number
  maxEnergy: number
  premium: boolean
}

interface PlayerSettings {
  soundOn: boolean
  musicOn: boolean
  notificationsOn: boolean
}

interface PlayerState {
  profile: PlayerProfile
  stats: Record<GameId, GameStats>
  achievements: Achievement[]
  recentGames: { gameId: GameId; playedAt: number }[]
  settings: PlayerSettings
  /** set once the player has picked a name and avatar */
  onboarded: boolean
  completeOnboarding: () => void
  awardRewards: (coins: number, xp: number) => void
  spendCoins: (amount: number) => boolean
  recordGamePlayed: (gameId: GameId, won: boolean) => void
  unlockAchievement: (id: string) => void
  upgradeToPremium: () => void
  updateSettings: (patch: Partial<PlayerSettings>) => void
  setAvatar: (emoji: string) => void
  setName: (name: string) => void
}

export function xpForLevel(level: number): number {
  return 800 + (level - 1) * 250
}

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', name: 'First Win', description: 'Win any game for the first time.', icon: '🏆', unlocked: false, unlockedAt: null },
  { id: 'ludo-master', name: 'Ludo Master', description: 'Win 5 games of Ludo.', icon: '🎲', unlocked: false, unlockedAt: null },
  { id: 'party-player', name: 'Party Player', description: 'Play a game with a full party of friends.', icon: '👥', unlocked: false, unlockedAt: null },
  { id: 'tycoon', name: 'City Tycoon', description: 'Win a game of City.', icon: '🏙️', unlocked: false, unlockedAt: null },
]

function emptyStats(): Record<GameId, GameStats> {
  return {
    ludo: { played: 0, wins: 0 },
    city: { played: 0, wins: 0 },
    poker: { played: 0, wins: 0 },
    wildbound: { played: 0, wins: 0 },
  }
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    immer((set, get) => ({
      profile: {
        id: 'you',
        name: 'Player',
        avatarEmoji: '🧑‍🚀',
        title: 'Explorer',
        level: 1,
        xp: 0,
        coins: 1000,
        gems: 50,
        energy: 20,
        maxEnergy: 20,
        premium: false,
      },
      stats: emptyStats(),
      achievements: DEFAULT_ACHIEVEMENTS,
      recentGames: [],
      settings: { soundOn: true, musicOn: true, notificationsOn: true },
      onboarded: false,

      completeOnboarding: () =>
        set((state) => {
          state.onboarded = true
        }),

      awardRewards: (coins, xp) =>
        set((state) => {
          state.profile.coins += coins
          state.profile.xp += xp
          let need = xpForLevel(state.profile.level)
          while (state.profile.xp >= need) {
            state.profile.xp -= need
            state.profile.level += 1
            need = xpForLevel(state.profile.level)
          }
        }),

      spendCoins: (amount) => {
        const ok = get().profile.coins >= amount
        if (ok) {
          set((state) => {
            state.profile.coins -= amount
          })
        }
        return ok
      },

      recordGamePlayed: (gameId, won) =>
        set((state) => {
          state.stats[gameId].played += 1
          if (won) state.stats[gameId].wins += 1
          state.recentGames = [
            { gameId, playedAt: Date.now() },
            ...state.recentGames.filter((r) => r.gameId !== gameId),
          ].slice(0, 5)

          const unlock = (id: string) => {
            const a = state.achievements.find((a) => a.id === id)
            if (a && !a.unlocked) {
              a.unlocked = true
              a.unlockedAt = Date.now()
            }
          }
          if (won) {
            unlock('first-win')
            if (gameId === 'ludo' && state.stats.ludo.wins >= 5) unlock('ludo-master')
            if (gameId === 'city') unlock('tycoon')
          }
        }),

      unlockAchievement: (id) =>
        set((state) => {
          const a = state.achievements.find((a) => a.id === id)
          if (a && !a.unlocked) {
            a.unlocked = true
            a.unlockedAt = Date.now()
          }
        }),

      upgradeToPremium: () =>
        set((state) => {
          state.profile.premium = true
        }),

      updateSettings: (patch) =>
        set((state) => {
          Object.assign(state.settings, patch)
        }),

      setAvatar: (emoji) =>
        set((state) => {
          state.profile.avatarEmoji = emoji
        }),

      setName: (name) =>
        set((state) => {
          state.profile.name = name
        }),
    })),
    {
      name: 'mw-player',
      // Saves from before a game was added lack its stats entry; backfill so every GameId is present.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PlayerState>
        return { ...current, ...saved, stats: { ...emptyStats(), ...saved.stats } }
      },
    },
  ),
)
