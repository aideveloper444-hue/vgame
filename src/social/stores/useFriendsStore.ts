import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { GameId } from '@/games/registry'
import { connect, onMessage, onPeerOpen, sendTo, send, useHub, type PeerProfile } from '@/net/hub'
import { myNetId, parseFriendCode } from '@/net/identity'
import { useNotificationStore } from './useNotificationStore'
import { sfx } from '@/lib/sound'

/*
 * Real friends, added with each other's friend code. Adding someone sends them a request; once they accept,
 * both sides list each other. Online state and "Playing …" come live from the social hub.
 */

export interface Friend {
  /** the friend's net id (their friend code without the dash) */
  id: string
  name: string
  avatarEmoji: string
  level: number
  online: boolean
  activity: string | null
  currentGameId: GameId | null
  inParty: boolean
  /** 'pending' until they accept a request we sent */
  status: 'pending' | 'friend'
  addedAt: number
}

export interface FriendRequest {
  id: string
  name: string
  avatarEmoji: string
  level: number
  at: number
}

interface FriendsState {
  friends: Friend[]
  requests: FriendRequest[]
  /** players this device ignores completely: no requests, messages, invites or party chat */
  blocked: { id: string; name: string; at: number }[]
  addByCode: (raw: string) => { ok: boolean; message: string }
  acceptRequest: (id: string) => void
  declineRequest: (id: string) => void
  removeFriend: (id: string) => void
  block: (id: string, name: string) => void
  unblock: (id: string) => void
  setInParty: (friendId: string, inParty: boolean) => void
  setActivity: (friendId: string, activity: string | null, gameId: GameId | null) => void
}

const GAME_IDS: GameId[] = ['ludo', 'city', 'poker', 'wildbound']

function applyProfile(f: Friend, p: PeerProfile) {
  f.name = p.name
  f.avatarEmoji = p.avatarEmoji
  f.level = p.level
  f.online = true
  f.activity = p.activity
  f.currentGameId = p.gameId && GAME_IDS.includes(p.gameId as GameId) ? (p.gameId as GameId) : null
}

export const useFriendsStore = create<FriendsState>()(
  persist(
    immer((set, get) => ({
      friends: [],
      requests: [],
      blocked: [],

      addByCode: (raw) => {
        const id = parseFriendCode(raw)
        if (!id) return { ok: false, message: 'That doesn\'t look like a friend code. It has 8 letters and numbers, like AB12-CD34.' }
        if (id === myNetId()) return { ok: false, message: 'That\'s your own code — share it with a friend instead.' }
        if (isBlocked(id)) return { ok: false, message: 'You blocked this player. Unblock them in Settings first.' }
        const existing = get().friends.find((f) => f.id === id)
        if (existing?.status === 'friend') return { ok: false, message: `${existing.name} is already your friend.` }
        if (get().requests.some((r) => r.id === id)) {
          get().acceptRequest(id)
          return { ok: true, message: 'You\'re now friends!' }
        }
        if (!existing) {
          set((s) => {
            s.friends.push({ id, name: 'Waiting…', avatarEmoji: '⏳', level: 1, online: false, activity: null, currentGameId: null, inParty: false, status: 'pending', addedAt: Date.now() })
          })
        }
        const peer = useHub.getState().peers[id]
        if (peer) set((s) => {
          const f = s.friends.find((x) => x.id === id)
          if (f) applyProfile(f, peer)
        })
        void sendTo(id, { t: 'friend-req' })
        return { ok: true, message: 'Request sent! They\'ll see it next time they open the app.' }
      },

      acceptRequest: (id) => {
        const req = get().requests.find((r) => r.id === id)
        if (!req) return
        set((s) => {
          s.requests = s.requests.filter((r) => r.id !== id)
          const f = s.friends.find((x) => x.id === id)
          if (f) f.status = 'friend'
          else
            s.friends.push({ id, name: req.name, avatarEmoji: req.avatarEmoji, level: req.level, online: !!useHub.getState().peers[id], activity: null, currentGameId: null,
              inParty: false, status: 'friend', addedAt: Date.now() })
        })
        void sendTo(id, { t: 'friend-ok' })
      },

      declineRequest: (id) =>
        set((s) => {
          s.requests = s.requests.filter((r) => r.id !== id)
        }),

      removeFriend: (id) => {
        set((s) => {
          s.friends = s.friends.filter((f) => f.id !== id)
        })
        send(id, { t: 'friend-remove' })
      },

      block: (id, name) => {
        send(id, { t: 'friend-remove' })
        set((s) => {
          s.friends = s.friends.filter((f) => f.id !== id)
          s.requests = s.requests.filter((r) => r.id !== id)
          if (!s.blocked.some((b) => b.id === id)) s.blocked.push({ id, name, at: Date.now() })
        })
      },

      unblock: (id) =>
        set((s) => {
          s.blocked = s.blocked.filter((b) => b.id !== id)
        }),

      setInParty: (friendId, inParty) =>
        set((s) => {
          const f = s.friends.find((x) => x.id === friendId)
          if (f) f.inParty = inParty
        }),

      setActivity: (friendId, activity, gameId) =>
        set((s) => {
          const f = s.friends.find((x) => x.id === friendId)
          if (f) {
            f.activity = activity
            f.currentGameId = gameId
          }
        }),
    })),
    {
      name: 'mw-friends',
      partialize: (s) => ({
        friends: s.friends.map((f) => ({ ...f, online: false, activity: null, currentGameId: null, inParty: false })),
        requests: s.requests,
        blocked: s.blocked,
      }),
    },
  ),
)

export function isBlocked(id: string): boolean {
  return useFriendsStore.getState().blocked.some((b) => b.id === id)
}

export function isFriend(id: string): boolean {
  return useFriendsStore.getState().friends.some((f) => f.id === id && f.status === 'friend')
}

/* ---------------- network wiring ---------------- */

const store = useFriendsStore

onMessage('hello', (from) => {
  const p = useHub.getState().peers[from]
  if (!p) return
  store.setState((s) => {
    const f = s.friends.find((x) => x.id === from)
    if (f) applyProfile(f, p)
    const r = s.requests.find((x) => x.id === from)
    if (r) {
      r.name = p.name
      r.avatarEmoji = p.avatarEmoji
      r.level = p.level
    }
  })
})

onMessage('disconnected', (from) => {
  store.setState((s) => {
    const f = s.friends.find((x) => x.id === from)
    if (f) {
      f.online = false
      f.activity = null
      f.currentGameId = null
    }
  })
})

onPeerOpen((id) => {
  // a request we sent while they were offline goes out as soon as they appear
  const f = store.getState().friends.find((x) => x.id === id)
  if (f?.status === 'pending') send(id, { t: 'friend-req' })
})

onMessage('friend-req', (from) => {
  if (isBlocked(from)) return
  const p = useHub.getState().peers[from]
  const f = store.getState().friends.find((x) => x.id === from)
  if (f) {
    // already friends (they reinstalled), or we both added each other
    store.setState((s) => {
      const x = s.friends.find((y) => y.id === from)
      if (x) x.status = 'friend'
    })
    send(from, { t: 'friend-ok' })
    return
  }
  if (store.getState().requests.some((r) => r.id === from)) return
  const name = p?.name ?? 'Someone'
  store.setState((s) => {
    s.requests.unshift({ id: from, name, avatarEmoji: p?.avatarEmoji ?? '🙂', level: p?.level ?? 1, at: Date.now() })
  })
  sfx.invite()
  useNotificationStore.getState().push({ title: 'Friend request', body: `${name} wants to be friends.`, icon: '🤝', deepLink: { screen: 'friends' } })
})

onMessage('friend-ok', (from) => {
  const f = store.getState().friends.find((x) => x.id === from)
  if (!f || f.status === 'friend') return
  store.setState((s) => {
    const x = s.friends.find((y) => y.id === from)
    if (x) x.status = 'friend'
  })
  const name = useHub.getState().peers[from]?.name ?? f.name
  useNotificationStore.getState().push({ title: 'New friend', body: `${name} accepted your friend request.`, icon: '🎉', deepLink: { screen: 'friends' } })
})

onMessage('friend-remove', (from) => {
  store.setState((s) => {
    s.friends = s.friends.filter((f) => f.id !== from)
  })
})

let presenceTimer: ReturnType<typeof setInterval> | undefined

/** Keep trying friends who aren't connected, so they show as online soon after they open the app. */
export function startPresence() {
  const sweep = () => {
    if (useHub.getState().status !== 'online') return
    for (const f of store.getState().friends) if (!useHub.getState().peers[f.id] && !isBlocked(f.id)) void connect(f.id, 7000)
  }
  clearInterval(presenceTimer)
  presenceTimer = setInterval(sweep, 25000)
  sweep()
}
