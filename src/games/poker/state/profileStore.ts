import { create } from 'zustand'
import { DEFAULT_EQUIPPED, cosmetic, type CosmeticSlot } from '../data/cosmetics'
import type { PortraitKey } from '../data/regulars'
import type { Card } from '../engine/cards'
import { levelInfo } from '../data/progression'
import { ApiError, api, hasSession, setTokens } from '../net/api'
import { connectLive, disconnectLive, onLive } from '../net/live'

export * from '../data/progression'

/*
 * The signed-in player, as the club server sees them. The server owns the balance, ledger, stats,
 * missions and entitlements; this store caches /v1/me and calls the API for every change.
 * Only "try it on" previews stay on the device.
 */

export type LedgerType = 'STARTER_GRANT' | 'DAILY_GRANT' | 'MISSION_REWARD' | 'HAND_SETTLEMENT' | 'ADMIN_CORRECTION' | 'RESET'

export interface LedgerEntry {
  id: number
  type: LedgerType
  amount: number
  balance: number
  reason: string
  correlationId: string
  at: number
}

export interface HandSummary {
  id: string
  at: number
  table: string
  mode: string
  hole: Card[]
  board: Card[]
  hand: string | null
  net: number
  won: boolean
  pot: number
}

export interface TourneyResult {
  id: string
  tournamentId: string
  name: string
  place: number
  field: number
  prize: number
  at: number
}

export interface Notice {
  id: string
  title: string
  body: string
  at: number
  read: boolean
}

export interface RpcSettings {
  sound: boolean
  music: boolean
  vibration: boolean
  reducedMotion: boolean
  fourColorDeck: boolean
  largeText: boolean
  showOnline: boolean
  autoCheckFold: boolean
}

export const DEFAULT_SETTINGS: RpcSettings = { sound: true, music: true, vibration: true, reducedMotion: false, fourColorDeck: false, largeText: false, showOnline: true, autoCheckFold: false }

/** GET /v1/me */
export interface Me {
  id: string
  kind: 'email' | 'guest' | 'google' | 'facebook' | 'apple'
  email: string | null
  name: string
  avatar: PortraitKey
  role: string
  inviteCode: string
  createdAt: number
  ageConfirmedAt: number | null
  tutorialDone: boolean
  xp: number
  balance: number
  stats: { hands: number; wins: number; showdowns: number; biggestPot: number; totalWon: number; tournaments: number; tourneyCashes: number; tourneyWins: number }
  achievements: Record<string, number>
  owned: string[]
  equipped: Record<CosmeticSlot, string>
  vip: boolean
  vipUntil: number
  missions: { day: string; progress: Record<string, number>; claimed: string[] }
  daily: { lastClaim: number; streak: number }
  adGrants: { day: string; count: number }
  levelBonusClaimed: number
  registered: string[]
  settings: RpcSettings
  mutedUntil: number
  notices: Notice[]
}

export type RpcProfile = Me & {
  preview: Partial<Record<CosmeticSlot, string>>
  history: HandSummary[]
  ledger: LedgerEntry[]
  tourneyResults: TourneyResult[]
}

export interface ServerConfig {
  social: { google: boolean; facebook: boolean; apple: boolean }
  purchases: boolean
  products: string[]
}

interface RpcState {
  status: 'loading' | 'signedOut' | 'ready' | 'offline'
  profile: RpcProfile | null
  config: ServerConfig | null
  seenSplash: boolean
}

type Err = string | null
const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong')

interface Actions {
  boot: () => Promise<void>
  refreshMe: () => Promise<void>
  signUp: (name: string, email: string, password: string, ageConfirmed: boolean) => Promise<Err>
  logIn: (email: string, password: string) => Promise<Err>
  playAsGuest: () => Promise<Err>
  socialSignIn: (provider: 'google' | 'facebook' | 'apple', token: string) => Promise<Err>
  logOut: () => Promise<void>
  deleteAccount: () => Promise<Err>
  patchMe: (body: Record<string, unknown>) => Promise<Err>
  setSetting: (k: keyof RpcSettings, v: boolean) => void
  setPreview: (slot: CosmeticSlot, id: string | null) => void
  markNoticesRead: () => void
  markSplashSeen: () => void
  claimDaily: () => Promise<number>
  claimAd: () => Promise<boolean>
  claimMission: (id: string) => Promise<boolean>
  claimLevelBonus: () => Promise<number>
  loadHistory: () => Promise<void>
  loadLedger: () => Promise<void>
  loadTourneys: () => Promise<void>
  upgradeGuest: (email: string, password: string) => Promise<Err>
  changePassword: (current: string, next: string) => Promise<Err>
}

const device = () => (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : '')
const seen = () => {
  try {
    return localStorage.getItem('rpc-seen-splash') === '1'
  } catch {
    return false
  }
}

export const useRpc = create<RpcState & Actions>()((set, get) => {
  const setMe = (me: Me) => {
    const prev = get().profile
    set({ status: 'ready', profile: { history: [], ledger: [], tourneyResults: [], ...prev, ...me, settings: { ...DEFAULT_SETTINGS, ...me.settings }, preview: prev?.preview ?? {} } })
  }
  const enter = (r: { accessToken: string; refreshToken: string; me: Me }) => {
    setTokens({ accessToken: r.accessToken, refreshToken: r.refreshToken })
    setMe(r.me)
    connectLive()
  }
  const attempt = async (fn: () => Promise<void>): Promise<Err> => {
    try {
      await fn()
      return null
    } catch (e) {
      return message(e)
    }
  }

  return {
    status: 'loading',
    profile: null,
    config: null,
    seenSplash: seen(),

    boot: async () => {
      api<ServerConfig>('/config', { auth: false })
        .then((config) => set({ config }))
        .catch(() => {})
      if (!hasSession()) return set({ status: 'signedOut' })
      try {
        setMe(await api<Me>('/me'))
        connectLive()
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) set({ status: 'offline' })
        else {
          setTokens(null)
          set({ status: 'signedOut', profile: null })
        }
      }
    },
    refreshMe: async () => {
      try {
        setMe(await api<Me>('/me'))
      } catch {
        /* keep the cached profile */
      }
    },
    signUp: (handle, email, password, ageConfirmed) => attempt(async () => enter(await api('/auth/register', { body: { handle, email, password, ageConfirmed, termsAccepted: ageConfirmed, device: device() }, auth: false }))),
    logIn: (email, password) => attempt(async () => enter(await api('/auth/login', { body: { email, password, device: device() }, auth: false }))),
    playAsGuest: () => attempt(async () => enter(await api('/auth/guest', { body: { ageConfirmed: true, device: device() }, auth: false }))),
    socialSignIn: (provider, token) => attempt(async () => enter(await api('/auth/social', { body: { provider, token, ageConfirmed: true, device: device() }, auth: false }))),
    logOut: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {})
      setTokens(null)
      disconnectLive()
      set({ status: 'signedOut', profile: null })
    },
    deleteAccount: () =>
      attempt(async () => {
        await api('/me', { method: 'DELETE' })
        setTokens(null)
        disconnectLive()
        set({ status: 'signedOut', profile: null })
      }),
    patchMe: (body) => attempt(async () => setMe(await api<Me>('/me', { method: 'PATCH', body }))),
    setSetting: (k, v) => {
      const p = get().profile
      if (!p) return
      set({ profile: { ...p, settings: { ...p.settings, [k]: v } } })
      void api<Me>('/me', { method: 'PATCH', body: { settings: { [k]: v } } }).catch(() => {})
    },
    setPreview: (slot, id) => {
      const p = get().profile
      if (!p) return
      const preview = { ...p.preview }
      if (id) preview[slot] = id
      else delete preview[slot]
      set({ profile: { ...p, preview } })
    },
    markNoticesRead: () => {
      const p = get().profile
      if (!p || !p.notices.some((n) => !n.read)) return
      set({ profile: { ...p, notices: p.notices.map((n) => ({ ...n, read: true })) } })
      void api('/me/notices/read', { method: 'POST' }).catch(() => {})
    },
    markSplashSeen: () => {
      try {
        localStorage.setItem('rpc-seen-splash', '1')
      } catch {
        /* fine */
      }
      set({ seenSplash: true })
    },
    claimDaily: async () => {
      const r = await api<{ amount: number; me: Me }>('/rewards/daily', { method: 'POST' })
      setMe(r.me)
      return r.amount
    },
    claimAd: async () => {
      const r = await api<{ amount: number; me: Me }>('/rewards/ad', { method: 'POST' })
      setMe(r.me)
      return r.amount > 0
    },
    claimMission: async (id) => {
      const r = await api<{ amount: number; me: Me }>(`/rewards/missions/${id}`, { method: 'POST' })
      setMe(r.me)
      return r.amount > 0
    },
    claimLevelBonus: async () => {
      const r = await api<{ amount: number; me: Me }>('/rewards/level', { method: 'POST' })
      setMe(r.me)
      return r.amount
    },
    loadHistory: async () => {
      const history = await api<HandSummary[]>('/me/hands').catch(() => null)
      const p = get().profile
      if (history && p) set({ profile: { ...p, history } })
    },
    loadLedger: async () => {
      const ledger = await api<LedgerEntry[]>('/me/ledger').catch(() => null)
      const p = get().profile
      if (ledger && p) set({ profile: { ...p, ledger } })
    },
    loadTourneys: async () => {
      const tourneyResults = await api<TourneyResult[]>('/me/tournaments').catch(() => null)
      const p = get().profile
      if (tourneyResults && p) set({ profile: { ...p, tourneyResults } })
    },
    upgradeGuest: (email, password) => attempt(async () => setMe(await api<Me>('/auth/upgrade', { body: { email, password } }))),
    changePassword: (current, next) => attempt(async () => void (await api('/auth/password', { body: { current, next } }))),
  }
})

// balance, notices, missions… change on the server during play
onLive((m) => {
  if (m.type === 'ME_CHANGED' || m.type === 'TOURNEY_RESULT') void useRpc.getState().refreshMe()
})

export const useProfile = () => useRpc((s) => s.profile)
export const currentProfile = () => useRpc.getState().profile

/** What the player sees: a try-on preview wins over the equipped item. */
export function shown(p: RpcProfile | null, slot: CosmeticSlot): string {
  const id = p?.preview?.[slot] ?? p?.equipped?.[slot] ?? DEFAULT_EQUIPPED[slot]
  return cosmetic(id) ? id : DEFAULT_EQUIPPED[slot]
}

export function canEquip(p: RpcProfile, id: string): boolean {
  const c = cosmetic(id)
  if (!c) return false
  if (p.owned.includes(id)) return true
  if (c.vipOnly) return p.vip
  if (c.unlockLevel) return levelInfo(p.xp).level >= c.unlockLevel
  return false
}

export const today = () => new Date().toISOString().slice(0, 10)
