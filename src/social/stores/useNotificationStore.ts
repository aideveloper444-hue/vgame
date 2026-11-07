import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { makeId } from '@/lib/id'

export type NotificationDeepLink =
  | { screen: 'friends' }
  | { screen: 'chat'; conversationId?: string }
  | { screen: 'rewards' }
  | { screen: 'me' }
  | { screen: 'games' }

export interface AppNotification {
  id: string
  title: string
  body: string
  icon: string
  createdAt: number
  read: boolean
  deepLink: NotificationDeepLink
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: () => number
  push: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    immer((set, get) => ({
      notifications: [],
      unreadCount: () => get().notifications.filter((n) => !n.read).length,
      push: (n) =>
        set((state) => {
          state.notifications.unshift({ ...n, id: makeId('notif'), createdAt: Date.now(), read: false })
          state.notifications.splice(40)
        }),
      markRead: (id) =>
        set((state) => {
          const n = state.notifications.find((n) => n.id === id)
          if (n) n.read = true
        }),
      markAllRead: () =>
        set((state) => {
          state.notifications.forEach((n) => (n.read = true))
        }),
    })),
    { name: 'mw-notifications-v2' },
  ),
)
