import { createPeerRoom, type RoomControls } from '@/games/shared/online/peerRoom'
import { useCityStore } from './cityStore'
import { CITY_BOT_NAMES, useCityMatch } from './cityMatch'

/** What a guest's device can ask the host to do; the host checks each against the game state. */
export type CityAction =
  | { t: 'roll' }
  | { t: 'buy'; buy: boolean }
  | { t: 'auction'; action: 'BID' | 'PASS'; raise?: number }
  | { t: 'casino'; bet: boolean }
  | { t: 'upgrade'; tileId: number }
  | { t: 'sell'; tileId: number }
  | { t: 'mortgage'; tileId: number }
  | { t: 'redeem'; tileId: number }
  | { t: 'payFine' }
  | { t: 'freePass' }
  | { t: 'trade'; toPlayerId: string; offerIds: number[]; requestIds: number[]; offerCash?: number; requestCash?: number }
  | { t: 'tradeReply'; tradeId: string; accept: boolean }
  | { t: 'end' }
  | { t: 'chat'; text: string }

/** Transient happenings relayed to every device. */
export type CityEvent = { t: 'chat'; playerId: string; name: string; text: string }

const SNAPSHOT_KEYS = [
  'tiles',
  'players',
  'currentPlayerIndex',
  'roundNumber',
  'dice',
  'rollSeq',
  'phase',
  'pendingMovePath',
  'pendingTrades',
  'auction',
  'lastEvent',
  'eventLog',
  'finalRanking',
  'config',
  'doublesStreak',
  'extraTurn',
  'decks',
  'clubPot',
  'casinoTray',
  'casinoResult',
] as const

const room = createPeerRoom<CityAction, CityEvent>({
  prefix: 'vgame-tycoon-v1-',
  botNames: CITY_BOT_NAMES,
  snapshot: () => {
    const st = useCityStore.getState() as unknown as Record<string, unknown>
    const s: Record<string, unknown> = {}
    for (const k of SNAPSHOT_KEYS) s[k] = st[k]
    return s
  },
  applySnapshot: (s) => useCityStore.setState(s as never),
  subscribe: (listener) => useCityStore.subscribe(listener),
  onStart: (quick, role, seats, localSeatIds) => useCityMatch.getState().begin(quick ? 'online' : 'friends', role, seats, localSeatIds),
  onGuestLeftMidGame: (id) => {
    // a computer player takes over the empty seat so the match can finish
    useCityStore.setState((s) => {
      const p = s.players.find((pl) => pl.id === id)
      if (p) p.isBot = true
    })
    const match = useCityMatch.getState()
    useCityMatch.setState({ seats: match.seats.map((s) => (s.id === id ? { ...s, kind: 'bot' as const } : s)) })
  },
})

/** Lobby controls for the shared mode menu. */
export const cityRoom: RoomControls = room
export const useCityRoom = room.useRoom
export const leaveCityRoom = room.leaveRoom

export function sendCityAction(action: CityAction) {
  room.sendAction(action)
}

export function broadcastCityChat(playerId: string, name: string, text: string, exceptSeatId?: string) {
  room.broadcastEvent({ t: 'chat', playerId, name, text }, exceptSeatId)
}

/**
 * Host: apply a guest's request if it is theirs to make right now (their turn, their auction bid,
 * a trade addressed to them). Guest: show chat lines relayed by the host.
 */
export function setCityNetHandlers(h: { onChat: (playerId: string, name: string, text: string, fromSeat?: string) => void }) {
  room.setHandlers({
    onAction: (seatId, a) => {
      const st = useCityStore.getState()
      const current = st.players[st.currentPlayerIndex]
      const theirTurn = current?.id === seatId
      switch (a.t) {
        case 'roll':
          if (theirTurn && st.phase === 'ROLLING') st.rollAndMove()
          break
        case 'buy':
          if (theirTurn && st.phase === 'AWAITING_BUY_DECISION') st.resolveBuyDecision(Boolean(a.buy))
          break
        case 'auction':
          if (st.phase === 'AUCTION' && st.auction?.queue[0] === seatId) st.submitAuctionAction(seatId, a.action === 'BID' ? 'BID' : 'PASS', Number(a.raise) || 100)
          break
        case 'casino':
          if (theirTurn && st.phase === 'CASINO') st.casinoDecision(Boolean(a.bet))
          break
        case 'upgrade':
          if (theirTurn) st.upgradeProperty(Number(a.tileId))
          break
        case 'sell':
          if (theirTurn) st.sellBuilding(Number(a.tileId))
          break
        case 'mortgage':
          if (theirTurn) st.mortgageProperty(Number(a.tileId))
          break
        case 'redeem':
          if (theirTurn) st.redeemProperty(Number(a.tileId))
          break
        case 'payFine':
          if (theirTurn && st.phase === 'ROLLING') st.payJailFine()
          break
        case 'freePass':
          if (theirTurn && st.phase === 'ROLLING') st.useFreePass()
          break
        case 'trade':
          if (theirTurn && (st.phase === 'POST_MOVE_ACTIONS' || st.phase === 'ROLLING'))
            st.proposeTrade({
              fromPlayerId: seatId,
              toPlayerId: String(a.toPlayerId),
              offer: { cash: Math.max(0, Number(a.offerCash) || 0), propertyIds: (a.offerIds ?? []).map(Number) },
              request: { cash: Math.max(0, Number(a.requestCash) || 0), propertyIds: (a.requestIds ?? []).map(Number) },
            })
          break
        case 'tradeReply': {
          const trade = st.pendingTrades.find((t) => t.id === a.tradeId)
          if (trade && trade.status === 'PENDING' && trade.toPlayerId === seatId) st.respondToTrade(trade.id, Boolean(a.accept))
          break
        }
        case 'end':
          if (theirTurn && st.phase === 'POST_MOVE_ACTIONS') st.endTurn()
          break
        case 'chat': {
          const text = String(a.text ?? '').slice(0, 120).trim()
          const p = st.players.find((pl) => pl.id === seatId)
          if (text && p) h.onChat(seatId, p.name, text, seatId)
          break
        }
      }
    },
    onEvent: (e) => {
      if (e.t === 'chat') h.onChat(e.playerId, e.name, e.text)
    },
  })
}
