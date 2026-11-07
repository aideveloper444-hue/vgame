import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { GameId } from '@/games/registry'
import { getGame } from '@/games/registry'
import { connect, onMessage, send, sendTo, useHub } from '@/net/hub'
import { myNetId } from '@/net/identity'
import { makeId } from '@/lib/id'
import { isBlocked, isFriend, useFriendsStore } from './useFriendsStore'
import { usePlayerStore } from './usePlayerStore'
import { useNotificationStore } from './useNotificationStore'
import { PARTY_CONVERSATION, useChatStore } from './useChatStore'
import { sfx } from '@/lib/sound'

/*
 * A party is a group of friends who chat, talk and jump into games together. The leader's device holds the
 * party: members connect to it, and it relays chat, the member list, voice state and game calls to everyone.
 */

export interface PartyMember {
  /** net id; `isUser` marks this device */
  id: string
  name: string
  avatarEmoji: string
  level: number
  isUser: boolean
  isLeader: boolean
  inVoice: boolean
  micMuted: boolean
  /** kept for games that tell players and bots apart; party members are always people */
  isBot: false
  friendId: string | null
  ready: boolean
}

export interface PartyInvite {
  partyId: string
  leaderId: string
  fromId: string
  fromName: string
  fromEmoji: string
  at: number
}

export interface GameCall {
  gameId: GameId
  roomCode: string | null
  fromName: string
  at: number
}

export const MAX_PARTY = 8

interface PartyState {
  active: boolean
  partyId: string | null
  leaderId: string | null
  /** 'joining' while waiting for the leader to let us in */
  joinState: 'idle' | 'joining'
  members: PartyMember[]
  selectedGameId: GameId | null
  invites: PartyInvite[]
  gameCall: GameCall | null
  createParty: () => void
  inviteFriend: (friendId: string) => Promise<boolean>
  acceptInvite: (partyId: string) => Promise<boolean>
  declineInvite: (partyId: string) => void
  removeMember: (memberId: string) => void
  leaveParty: () => void
  selectGame: (gameId: GameId | null) => void
  /** call everyone into a game (optionally an online room to join) */
  launchGame: (gameId: GameId, roomCode?: string | null) => void
  dismissGameCall: () => void
  sendChat: (id: string, text: string) => void
  setMyVoice: (inVoice: boolean, micMuted: boolean) => void
}

type WireMember = Pick<PartyMember, 'id' | 'name' | 'avatarEmoji' | 'level' | 'inVoice' | 'micMuted'>

function meAsMember(leader: boolean, prev?: PartyMember): PartyMember {
  const p = usePlayerStore.getState().profile
  return {
    id: myNetId(), name: p.name, avatarEmoji: p.avatarEmoji, level: p.level, isUser: true, isLeader: leader,
    inVoice: prev?.inVoice ?? false, micMuted: prev?.micMuted ?? false, isBot: false, friendId: null, ready: true,
  }
}

function toMember(w: WireMember, leaderId: string): PartyMember {
  const me = w.id === myNetId()
  return {
    id: String(w.id), name: String(w.name).slice(0, 20), avatarEmoji: String(w.avatarEmoji).slice(0, 8), level: Number(w.level) || 1,
    isUser: me, isLeader: w.id === leaderId, inVoice: !!w.inVoice, micMuted: !!w.micMuted, isBot: false,
    friendId: me ? null : w.id, ready: true,
  }
}

const amLeader = () => {
  const s = usePartyStore.getState()
  return s.active && s.leaderId === myNetId()
}

function systemLine(text: string) {
  const chat = useChatStore.getState()
  chat.ensurePartyConversation()
  chat.receive(PARTY_CONVERSATION, { id: makeId('sys'), conversationId: PARTY_CONVERSATION, senderId: 'system', senderName: '', text, timestamp: Date.now(), system: true })
}

/** Leader only: send the member list to everyone. */
function broadcastState() {
  const s = usePartyStore.getState()
  if (!amLeader()) return
  const members: WireMember[] = s.members.map(({ id, name, avatarEmoji, level, inVoice, micMuted }) => ({ id, name, avatarEmoji, level, inVoice, micMuted }))
  const msg = { t: 'party-state', partyId: s.partyId, leaderId: s.leaderId, members, selectedGameId: s.selectedGameId }
  for (const m of s.members) if (!m.isUser) send(m.id, msg)
}

function syncFriendFlags() {
  const ids = new Set(usePartyStore.getState().members.map((m) => m.id))
  const fs = useFriendsStore.getState()
  for (const f of fs.friends) if (f.inParty !== ids.has(f.id)) fs.setInParty(f.id, ids.has(f.id))
}

const EMPTY = { active: false, partyId: null, leaderId: null, joinState: 'idle' as const, members: [], selectedGameId: null }

export const usePartyStore = create<PartyState>()(
  immer((set, get) => ({
    ...EMPTY,
    invites: [],
    gameCall: null,

    createParty: () => {
      if (get().active) return
      set((s) => {
        s.active = true
        s.partyId = makeId('party')
        s.leaderId = myNetId()
        s.members = [meAsMember(true)]
        s.selectedGameId = null
      })
      useChatStore.getState().clearConversation(PARTY_CONVERSATION)
      systemLine('You started a party. Invite friends to chat, talk and play together.')
    },

    inviteFriend: async (friendId) => {
      if (!get().active) get().createParty()
      if (get().members.some((m) => m.id === friendId)) return true
      const s = get()
      const me = usePlayerStore.getState().profile
      const ok = await sendTo(friendId, { t: 'party-invite', partyId: s.partyId, leaderId: s.leaderId, name: me.name, emoji: me.avatarEmoji })
      if (ok) {
        const f = useFriendsStore.getState().friends.find((x) => x.id === friendId)
        systemLine(`Invited ${f?.name ?? 'a friend'}.`)
      }
      return ok
    },

    acceptInvite: async (partyId) => {
      const inv = get().invites.find((i) => i.partyId === partyId)
      if (!inv) return false
      if (get().active) get().leaveParty()
      set((s) => {
        s.invites = s.invites.filter((i) => i.partyId !== partyId)
        s.joinState = 'joining'
      })
      const ok = await sendTo(inv.leaderId, { t: 'party-join', partyId })
      if (!ok) {
        set((s) => {
          s.joinState = 'idle'
        })
        useNotificationStore.getState().push({ title: 'Party not found', body: `${inv.fromName}'s party has closed.`, icon: '👥', deepLink: { screen: 'chat' } })
        return false
      }
      // the leader answers with party-state (or party-gone); give up if it never does
      setTimeout(() => {
        if (get().joinState === 'joining') set((s) => void (s.joinState = 'idle'))
      }, 10000)
      return true
    },

    declineInvite: (partyId) =>
      set((s) => {
        s.invites = s.invites.filter((i) => i.partyId !== partyId)
      }),

    removeMember: (memberId) => {
      if (!amLeader() || memberId === myNetId()) return
      const m = get().members.find((x) => x.id === memberId)
      send(memberId, { t: 'party-kick' })
      set((s) => {
        s.members = s.members.filter((x) => x.id !== memberId)
      })
      if (m) systemLine(`${m.name} was removed from the party.`)
      broadcastState()
      syncFriendFlags()
    },

    leaveParty: () => {
      const s = get()
      if (!s.active && s.joinState === 'idle') return
      if (amLeader()) {
        for (const m of s.members) if (!m.isUser) send(m.id, { t: 'party-end' })
      } else if (s.leaderId) send(s.leaderId, { t: 'party-leave' })
      set((st) => {
        Object.assign(st, EMPTY)
      })
      useChatStore.getState().clearConversation(PARTY_CONVERSATION)
      syncFriendFlags()
    },

    selectGame: (gameId) => {
      if (get().active && !amLeader()) return
      set((s) => {
        s.selectedGameId = gameId
      })
      broadcastState()
    },

    launchGame: (gameId, roomCode = null) => {
      const s = get()
      if (!s.active) return
      const msg = { t: 'party-game', gameId, roomCode, name: usePlayerStore.getState().profile.name }
      if (amLeader()) {
        set((st) => {
          st.selectedGameId = gameId
        })
        for (const m of s.members) if (!m.isUser) send(m.id, msg)
        broadcastState()
      } else if (s.leaderId) send(s.leaderId, msg)
      systemLine(`You called everyone to ${getGame(gameId)?.name ?? 'a game'}${roomCode ? ` (room ${roomCode})` : ''}.`)
    },

    dismissGameCall: () =>
      set((s) => {
        s.gameCall = null
      }),

    sendChat: (id, text) => {
      const s = get()
      if (!s.active) return
      const me = usePlayerStore.getState().profile
      const msg = { t: 'party-chat', id, from: myNetId(), name: me.name, text }
      if (amLeader()) { for (const m of s.members) if (!m.isUser) send(m.id, msg) }
      else if (s.leaderId) send(s.leaderId, msg)
    },

    setMyVoice: (inVoice, micMuted) => {
      set((s) => {
        const me = s.members.find((m) => m.isUser)
        if (me) {
          me.inVoice = inVoice
          me.micMuted = micMuted
        }
      })
      if (amLeader()) broadcastState()
      else if (get().leaderId) send(get().leaderId!, { t: 'party-voice', inVoice, micMuted })
    },
  })),
)

/* ---------------- network wiring ---------------- */

const store = usePartyStore

function resetWithNote(title: string, body: string) {
  store.setState((s) => {
    Object.assign(s, EMPTY)
  })
  useChatStore.getState().clearConversation(PARTY_CONVERSATION)
  useNotificationStore.getState().push({ title, body, icon: '👥', deepLink: { screen: 'chat' } })
  syncFriendFlags()
}

function receiveCall(gameId: string, roomCode: unknown, fromName: string) {
  const game = getGame(gameId)
  if (!game) return
  store.setState((s) => {
    s.gameCall = { gameId: game.id, roomCode: typeof roomCode === 'string' && /^[A-Z0-9]{5}$/.test(roomCode) ? roomCode : null, fromName, at: Date.now() }
  })
  systemLine(`${fromName} called everyone to ${game.name}.`)
  sfx.invite()
}

onMessage('party-invite', (from, msg) => {
  if (!isFriend(from) || isBlocked(from)) return
  const partyId = String(msg.partyId ?? '')
  const leaderId = String(msg.leaderId ?? '')
  if (!partyId || !/^[A-Z0-9]{8}$/.test(leaderId)) return
  if (store.getState().partyId === partyId) return
  const p = useHub.getState().peers[from]
  const fromName = p?.name ?? String(msg.name ?? 'A friend')
  store.setState((s) => {
    s.invites = [{ partyId, leaderId, fromId: from, fromName, fromEmoji: p?.avatarEmoji ?? '🙂', at: Date.now() }, ...s.invites.filter((i) => i.partyId !== partyId)].slice(0, 5)
  })
  sfx.invite()
  useNotificationStore.getState().push({ title: 'Party invite', body: `${fromName} invited you to their party.`, icon: '🎉', deepLink: { screen: 'chat' } })
})

/* leader side */

onMessage('party-join', (from, msg) => {
  const s = store.getState()
  if (!amLeader() || msg.partyId !== s.partyId) {
    send(from, { t: 'party-gone', partyId: msg.partyId })
    return
  }
  if (s.members.length >= MAX_PARTY && !s.members.some((m) => m.id === from)) {
    send(from, { t: 'party-full' })
    return
  }
  const p = useHub.getState().peers[from]
  if (!p || isBlocked(from)) {
    send(from, { t: 'party-gone', partyId: msg.partyId })
    return
  }
  store.setState((st) => {
    if (!st.members.some((m) => m.id === from))
      st.members.push(toMember({ id: from, name: p.name, avatarEmoji: p.avatarEmoji, level: p.level, inVoice: false, micMuted: false }, st.leaderId!))
  })
  systemLine(`${p.name} joined the party.`)
  broadcastState()
  syncFriendFlags()
})

function dropMember(from: string, text: string) {
  const m = store.getState().members.find((x) => x.id === from)
  if (!m) return
  store.setState((st) => {
    st.members = st.members.filter((x) => x.id !== from)
  })
  systemLine(`${m.name} ${text}`)
  broadcastState()
  syncFriendFlags()
}

onMessage('party-leave', (from) => {
  if (amLeader()) dropMember(from, 'left the party.')
})

onMessage('party-voice', (from, msg) => {
  if (!amLeader()) return
  store.setState((st) => {
    const m = st.members.find((x) => x.id === from)
    if (m) {
      m.inVoice = !!msg.inVoice
      m.micMuted = !!msg.micMuted
    }
  })
  broadcastState()
})

/* both sides */

onMessage('party-chat', (from, msg) => {
  const s = store.getState()
  if (!s.active) return
  const leader = amLeader()
  // members only accept chat relayed by the leader; the leader only from members
  if (leader ? !s.members.some((m) => m.id === from) : from !== s.leaderId) return
  const sender = String(msg.from ?? from)
  if (sender === myNetId() || isBlocked(sender)) return
  const text = String(msg.text ?? '').slice(0, 500)
  const id = String(msg.id ?? makeId('msg'))
  if (!text) return
  const name = s.members.find((m) => m.id === sender)?.name ?? String(msg.name ?? 'Player').slice(0, 20)
  if (leader) for (const m of s.members) if (!m.isUser && m.id !== from) send(m.id, { t: 'party-chat', id, from: sender, name, text })
  useChatStore.getState().ensurePartyConversation()
  useChatStore.getState().receive(PARTY_CONVERSATION, { id, conversationId: PARTY_CONVERSATION, senderId: sender, senderName: name, text, timestamp: Date.now() })
  sfx.message()
})

onMessage('party-game', (from, msg) => {
  const s = store.getState()
  if (!s.active) return
  const leader = amLeader()
  if (leader ? !s.members.some((m) => m.id === from) : from !== s.leaderId) return
  const name = String(msg.name ?? 'A friend').slice(0, 20)
  if (leader) {
    for (const m of s.members) if (!m.isUser && m.id !== from) send(m.id, msg)
    if (getGame(String(msg.gameId))) store.setState((st) => void (st.selectedGameId = getGame(String(msg.gameId))!.id))
    broadcastState()
  }
  receiveCall(String(msg.gameId), msg.roomCode, name)
})

/* member side */

onMessage('party-state', (from, msg) => {
  const s = store.getState()
  const partyId = String(msg.partyId ?? '')
  const joining = s.joinState === 'joining'
  if (!(s.active && s.leaderId === from && s.partyId === partyId) && !joining) return
  const raw = Array.isArray(msg.members) ? (msg.members as WireMember[]) : []
  if (!raw.some((m) => m.id === myNetId())) return
  const members = raw.slice(0, MAX_PARTY).map((m) => toMember(m, from))
  const sel = getGame(String(msg.selectedGameId ?? ''))?.id ?? null
  store.setState((st) => {
    st.active = true
    st.partyId = partyId
    st.leaderId = from
    st.joinState = 'idle'
    st.members = members
    st.selectedGameId = sel
  })
  if (joining) {
    useChatStore.getState().clearConversation(PARTY_CONVERSATION)
    systemLine(`You joined ${members.find((m) => m.isLeader)?.name ?? 'the'}'s party.`)
  }
  syncFriendFlags()
})

onMessage('party-gone', () => {
  if (store.getState().joinState === 'joining') {
    store.setState((s) => void (s.joinState = 'idle'))
    useNotificationStore.getState().push({ title: 'Party closed', body: 'That party has already ended.', icon: '👥', deepLink: { screen: 'chat' } })
  }
})

onMessage('party-full', () => {
  store.setState((s) => void (s.joinState = 'idle'))
  useNotificationStore.getState().push({ title: 'Party is full', body: `Parties can have up to ${MAX_PARTY} people.`, icon: '👥', deepLink: { screen: 'chat' } })
})

onMessage('party-end', (from) => {
  if (store.getState().leaderId === from && !amLeader()) resetWithNote('Party ended', 'The party leader ended the party.')
})

onMessage('party-kick', (from) => {
  if (store.getState().leaderId === from && !amLeader()) resetWithNote('Removed from party', 'The leader removed you from the party.')
})

onMessage('disconnected', (from) => {
  const s = store.getState()
  if (!s.active) return
  if (amLeader()) dropMember(from, 'went offline.')
  else if (s.leaderId === from) {
    // the connection may just have hiccuped: try to get back in before giving up
    const partyId = s.partyId
    void connect(from, 6000).then((c) => {
      if (c && store.getState().partyId === partyId) {
        store.setState((st) => void (st.joinState = 'joining'))
        send(from, { t: 'party-join', partyId })
      } else if (store.getState().partyId === partyId) resetWithNote('Party ended', 'Lost connection to the party leader.')
    })
  }
})

/** Keep my own entry (name, avatar) fresh in the party list. */
usePlayerStore.subscribe((p, prev) => {
  if (p.profile === prev.profile || !store.getState().active) return
  store.setState((s) => {
    const i = s.members.findIndex((m) => m.isUser)
    if (i >= 0) s.members[i] = meAsMember(s.members[i].isLeader, s.members[i])
  })
  broadcastState()
})
