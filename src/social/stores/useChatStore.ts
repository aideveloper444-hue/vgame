import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { makeId } from '@/lib/id'
import { onMessage, onPeerOpen, send, sendTo, useHub } from '@/net/hub'
import { isBlocked, isFriend, useFriendsStore } from './useFriendsStore'
import { useNotificationStore } from './useNotificationStore'
import { usePartyStore } from './usePartyStore'
import { sfx } from '@/lib/sound'

/*
 * Conversations: direct messages with friends, the party chat, and local game logs (e.g. City's table talk).
 * DMs go device to device; a message written while the friend is offline waits here ('sending') and goes out
 * the moment they come online.
 */

export interface ChatMessage {
  id: string
  conversationId: string
  /** 'you' for this device, otherwise the sender's net id (or a game seat id in game logs) */
  senderId: string
  senderName: string
  text: string
  timestamp: number
  status?: 'sending' | 'sent'
  system?: boolean
}

export interface Conversation {
  id: string
  kind: 'dm' | 'party' | 'game'
  friendId: string | null
  title: string
  avatarEmoji: string
  updatedAt: number
}

export const PARTY_CONVERSATION = 'party'

interface ChatState {
  conversations: Conversation[]
  messages: Record<string, ChatMessage[]>
  unread: Record<string, number>
  /** the conversation currently on screen, which doesn't collect unread counts */
  viewing: string | null
  ensureDmConversation: (friendId: string) => string
  ensurePartyConversation: () => string
  sendMessage: (conversationId: string, text: string, senderId?: string, senderName?: string) => void
  /** add a line without sending it anywhere */
  appendLocal: (conversationId: string, msg: Omit<ChatMessage, 'id' | 'conversationId' | 'timestamp'> & { id?: string; timestamp?: number }) => void
  receive: (conversationId: string, msg: ChatMessage) => void
  clearConversation: (conversationId: string) => void
  deleteConversation: (conversationId: string) => void
  markRead: (conversationId: string) => void
  setViewing: (conversationId: string | null) => void
  lastMessagePreview: (conversationId: string) => string
}

const MAX_KEEP = 200

export const useChatStore = create<ChatState>()(
  persist(
    immer((set, get) => ({
      conversations: [],
      messages: {},
      unread: {},
      viewing: null,

      ensureDmConversation: (friendId) => {
        const id = `dm-${friendId}`
        const friend = useFriendsStore.getState().friends.find((f) => f.id === friendId)
        set((s) => {
          const c = s.conversations.find((x) => x.id === id)
          if (c) {
            if (friend && friend.status === 'friend') {
              c.title = friend.name
              c.avatarEmoji = friend.avatarEmoji
            }
            return
          }
          s.conversations.push({ id, kind: 'dm', friendId, title: friend?.name ?? 'Friend', avatarEmoji: friend?.avatarEmoji ?? '🙂', updatedAt: Date.now() })
          s.messages[id] ??= []
        })
        return id
      },

      ensurePartyConversation: () => {
        if (!get().conversations.some((c) => c.id === PARTY_CONVERSATION)) {
          set((s) => {
            s.conversations.push({ id: PARTY_CONVERSATION, kind: 'party', friendId: null, title: 'Party', avatarEmoji: '🎉', updatedAt: Date.now() })
            s.messages[PARTY_CONVERSATION] ??= []
          })
        }
        return PARTY_CONVERSATION
      },

      sendMessage: (conversationId, raw, senderId = 'you', senderName = 'You') => {
        const text = raw.trim().slice(0, 500)
        if (!text) return
        const convo = get().conversations.find((c) => c.id === conversationId)
        const mine = senderId === 'you'
        const id = makeId('msg')
        const networked = mine && (convo?.kind === 'dm' || conversationId === PARTY_CONVERSATION)
        get().appendLocal(conversationId, { id, senderId, senderName, text, status: networked && convo?.kind === 'dm' ? 'sending' : undefined })
        if (!networked) return
        if (conversationId === PARTY_CONVERSATION) {
          usePartyStore.getState().sendChat(id, text)
          return
        }
        const friendId = convo!.friendId!
        void sendTo(friendId, { t: 'dm', id, text, ts: Date.now() })
      },

      appendLocal: (conversationId, msg) =>
        set((s) => {
          const list = (s.messages[conversationId] ??= [])
          const id = msg.id ?? makeId('msg')
          if (list.some((m) => m.id === id)) return
          list.push({ ...msg, id, conversationId, timestamp: msg.timestamp ?? Date.now() })
          if (list.length > MAX_KEEP) list.splice(0, list.length - MAX_KEEP)
          if (!s.conversations.some((c) => c.id === conversationId))
            s.conversations.push({ id: conversationId, kind: 'game', friendId: null, title: 'Game chat', avatarEmoji: '🎮', updatedAt: Date.now() })
          const c = s.conversations.find((x) => x.id === conversationId)
          if (c) c.updatedAt = Date.now()
        }),

      receive: (conversationId, msg) => {
        const before = get().messages[conversationId]?.length ?? 0
        get().appendLocal(conversationId, msg)
        if ((get().messages[conversationId]?.length ?? 0) === before) return
        if (get().viewing !== conversationId && !msg.system)
          set((s) => {
            s.unread[conversationId] = (s.unread[conversationId] ?? 0) + 1
          })
      },

      clearConversation: (conversationId) =>
        set((s) => {
          s.messages[conversationId] = []
          s.unread[conversationId] = 0
        }),

      deleteConversation: (conversationId) =>
        set((s) => {
          s.conversations = s.conversations.filter((c) => c.id !== conversationId)
          delete s.messages[conversationId]
          delete s.unread[conversationId]
        }),

      markRead: (conversationId) =>
        set((s) => {
          s.unread[conversationId] = 0
        }),

      setViewing: (conversationId) =>
        set((s) => {
          s.viewing = conversationId
          if (conversationId) s.unread[conversationId] = 0
        }),

      lastMessagePreview: (conversationId) => {
        const list = get().messages[conversationId]
        if (!list || list.length === 0) return 'No messages yet'
        const last = list[list.length - 1]
        return last.senderId === 'you' && !last.system ? `You: ${last.text}` : last.text
      },
    })),
    {
      name: 'mw-chat-v2',
      partialize: (s) => ({
        conversations: s.conversations.filter((c) => c.kind === 'dm'),
        messages: Object.fromEntries(Object.entries(s.messages).filter(([k]) => k.startsWith('dm-'))),
        unread: Object.fromEntries(Object.entries(s.unread).filter(([k]) => k.startsWith('dm-'))),
      }),
    },
  ),
)

export function totalUnread(s: Pick<ChatState, 'unread' | 'conversations'>): number {
  return s.conversations.reduce((n, c) => n + (c.kind === 'game' ? 0 : (s.unread[c.id] ?? 0)), 0)
}

/* ---------------- network wiring ---------------- */

onMessage('dm', (from, msg) => {
  if (!isFriend(from) || isBlocked(from)) return
  const id = String(msg.id ?? '')
  const text = String(msg.text ?? '').slice(0, 500)
  if (!id || !text) return
  const chat = useChatStore.getState()
  const conversationId = chat.ensureDmConversation(from)
  const name = useHub.getState().peers[from]?.name ?? useChatStore.getState().conversations.find((c) => c.id === conversationId)?.title ?? 'Friend'
  const ts = Number(msg.ts)
  const timestamp = Number.isFinite(ts) && Math.abs(ts - Date.now()) < 86400000 ? ts : Date.now()
  const fresh = !(chat.messages[conversationId] ?? []).some((m) => m.id === id)
  chat.receive(conversationId, { id, conversationId, senderId: from, senderName: name, text, timestamp })
  send(from, { t: 'dm-ack', id })
  if (fresh) sfx.message()
  if (fresh && useChatStore.getState().viewing !== conversationId)
    useNotificationStore.getState().push({ title: name, body: text, icon: '💬', deepLink: { screen: 'chat', conversationId } })
})

onMessage('dm-ack', (from, msg) => {
  useChatStore.setState((s) => {
    const m = s.messages[`dm-${from}`]?.find((x) => x.id === msg.id)
    if (m) m.status = 'sent'
  })
})

// queued messages go out when the friend comes online
onPeerOpen((id) => {
  const pendingMsgs = (useChatStore.getState().messages[`dm-${id}`] ?? []).filter((m) => m.senderId === 'you' && m.status === 'sending')
  for (const m of pendingMsgs) send(id, { t: 'dm', id: m.id, text: m.text, ts: m.timestamp })
})
