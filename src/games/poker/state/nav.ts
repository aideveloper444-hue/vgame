import { create } from 'zustand'

/*
 * In-app navigation for the club. Kept in a store (not the URL) because the whole club lives at one VIBO
 * route; the device back button is wired to back() through the history stack in RoyalPokerApp.
 */

export type ScreenName =
  | 'splash'
  | 'auth'
  | 'onboard'
  | 'home'
  | 'poker'
  | 'table'
  | 'tournament'
  | 'shop'
  | 'rewards'
  | 'profile'
  | 'friends'
  | 'history'
  | 'points'
  | 'settings'
  | 'achievements'
  | 'help'
  | 'room'

export interface Route {
  name: ScreenName
  params?: Record<string, string>
}

export const TABS: ScreenName[] = ['home', 'poker', 'shop', 'rewards', 'profile']

interface NavState {
  stack: Route[]
  go: (name: ScreenName, params?: Record<string, string>) => void
  replace: (name: ScreenName, params?: Record<string, string>) => void
  back: () => boolean
  tab: (name: ScreenName) => void
  reset: (name: ScreenName) => void
}

export const useNav = create<NavState>((set, get) => ({
  stack: [{ name: 'splash' }],
  go: (name, params) => set((s) => ({ stack: [...s.stack, { name, params }] })),
  replace: (name, params) => set((s) => ({ stack: [...s.stack.slice(0, -1), { name, params }] })),
  back: () => {
    const { stack } = get()
    if (stack.length <= 1) return false
    set({ stack: stack.slice(0, -1) })
    return true
  },
  tab: (name) => set({ stack: name === 'home' ? [{ name: 'home' }] : [{ name: 'home' }, { name }] }),
  reset: (name) => set({ stack: [{ name }] }),
}))

export const useRoute = () => useNav((s) => s.stack[s.stack.length - 1])
