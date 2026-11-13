import { createPeerRoom, type RoomControls } from '@/games/shared/online/peerRoom'
import { useLudoStore } from './ludoStore'
import { BOT_NAMES, useLudoMatch } from './ludoMatch'

/** What a guest's device can ask the host to do. */
type LudoAction = { t: 'roll' } | { t: 'select'; tokenId: string } | { t: 'chat'; text: string }
/** Transient happenings the host shows on every device. */
type LudoEvent = { t: 'spin' } | { t: 'say'; playerId: string; text: string }

const SNAPSHOT_KEYS = [
  'arms',
  'players',
  'currentPlayerIndex',
  'diceValue',
  'lastRoll',
  'rollCount',
  'consecutiveSixes',
  'legalMoves',
  'phase',
  'pendingMove',
  'lastEvent',
  'winnerId',
  'rankings',
  'bestRoll',
  'eventLog',
  'startedAt',
] as const

const room = createPeerRoom<LudoAction, LudoEvent>({
  prefix: 'vgame-ludo-v2-',
  botNames: BOT_NAMES,
  snapshot: () => {
    const st = useLudoStore.getState() as unknown as Record<string, unknown>
    const s: Record<string, unknown> = {}
    for (const k of SNAPSHOT_KEYS) s[k] = st[k]
    return s
  },
  applySnapshot: (s) => useLudoStore.setState(s as never),
  subscribe: (listener) => useLudoStore.subscribe(listener),
  onStart: (quick, role, seats, localSeatIds) => useLudoMatch.getState().begin(quick ? 'online' : 'friends', role, seats, localSeatIds),
  onGuestLeftMidGame: (id) => {
    // a computer player takes over the empty seat so the match can finish
    useLudoStore.setState((s) => {
      const p = s.players.find((pl) => pl.id === id)
      if (p) p.isBot = true
    })
    const match = useLudoMatch.getState()
    useLudoMatch.setState({ seats: match.seats.map((s) => (s.id === id ? { ...s, kind: 'bot' as const } : s)) })
    useLudoStore.getState().logChat(id, 'left — a computer player took over')
  },
})

/** Lobby controls for the shared mode menu. */
export const ludoRoom: RoomControls = room
export const useLudoRoom = room.useRoom
export const { QUICK_WAIT_MS, createRoom, joinRoom, quickMatch, addComputerSeat, removeSeat, startMatch, leaveRoom } = room

export function sendToHost(action: LudoAction) {
  room.sendAction(action)
}

export function broadcastSpin() {
  room.broadcastEvent({ t: 'spin' })
}

export function broadcastSay(playerId: string, text: string, exceptSeatId?: string) {
  room.broadcastEvent({ t: 'say', playerId, text }, exceptSeatId)
}

export interface NetHandlers {
  /** Host: a guest asked to roll on their turn. */
  onRoll?: () => void
  /** Host: a guest sent a quick-chat line. */
  onChat?: (playerId: string, text: string) => void
  /** Guest: the host started tumbling the die. */
  onSpin?: () => void
  /** Guest: someone else said something. */
  onSay?: (playerId: string, text: string) => void
}

export function setNetHandlers(h: NetHandlers) {
  room.setHandlers({
    onAction: (seatId, a) => {
      const st = useLudoStore.getState()
      const current = st.players[st.currentPlayerIndex]
      if (a.t === 'roll' && current?.id === seatId && st.phase === 'rolling') h.onRoll?.()
      else if (a.t === 'select' && current?.id === seatId && st.phase === 'selecting') st.selectToken(String(a.tokenId))
      else if (a.t === 'chat') {
        const text = String(a.text ?? '').slice(0, 40)
        if (text) h.onChat?.(seatId, text)
      }
    },
    onEvent: (e) => {
      if (e.t === 'spin') h.onSpin?.()
      else if (e.t === 'say') h.onSay?.(e.playerId, e.text)
    },
  })
}
