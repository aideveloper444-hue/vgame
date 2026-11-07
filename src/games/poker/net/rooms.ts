import { create } from 'zustand'
import { onLive, send } from './live'

/* Private rooms on the club server: the room lobby state and incoming invites. */

export interface RoomMember {
  userId: string | null
  name: string
  avatar: string
  bot?: string
  online: boolean
}

export interface Room {
  code: string
  hostId: string
  size: number
  stack: number
  blinds: [number, number]
  members: RoomMember[]
  tableId: string | null
}

interface RoomStore {
  room: Room | null
  /** the last room-related error from the server */
  error: string | null
  closedReason: string | null
  invites: { code: string; from: string; at: number }[]
}

export const useRoom = create<RoomStore>(() => ({ room: null, error: null, closedReason: null, invites: [] }))

onLive((m) => {
  if (m.type === 'ROOM_STATE') useRoom.setState({ room: (m.room as Room | null) ?? null, error: null, closedReason: m.room ? null : ((m.reason as string) ?? null) })
  if (m.type === 'ROOM_INVITE') useRoom.setState((s) => ({ invites: [{ code: String(m.code), from: String(m.from), at: Date.now() }, ...s.invites.filter((i) => i.code !== m.code)].slice(0, 5) }))
  if (m.type === 'ERROR' && typeof m.ref === 'string' && m.ref.startsWith('ROOM_')) useRoom.setState({ error: String(m.message) })
})

export const rooms = {
  create: (size: number, stack: number, bigBlind: number) => send({ type: 'ROOM_CREATE', size, stack, bigBlind }),
  join: (code: string) => {
    useRoom.setState({ error: null })
    send({ type: 'ROOM_JOIN', code: code.toUpperCase() })
  },
  leave: () => {
    send({ type: 'ROOM_LEAVE' })
    useRoom.setState({ room: null })
  },
  addBot: (name?: string) => send({ type: 'ROOM_ADD_BOT', name }),
  remove: (index: number) => send({ type: 'ROOM_REMOVE', index }),
  start: () => send({ type: 'ROOM_START' }),
  invite: (friendId: string) => send({ type: 'ROOM_INVITE', friendId }),
  dismissInvite: (code: string) => useRoom.setState((s) => ({ invites: s.invites.filter((i) => i.code !== code) })),
}

export const inviteLink = (code: string) => `${location.origin}/games/poker/play?room=${code}&join=1`
