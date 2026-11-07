import { createPeerRoom, type RoomControls } from '@/games/shared/online/peerRoom'
import { createMatchStore, type BotName } from '@/games/shared/online/matchStore'
import { applyNetRunner, dropRunner, packRunner, sim, type NetRunner, type RaceSeat } from './amazonStore'

export const useAmazonMatch = createMatchStore()

export const AMAZON_BOT_NAMES: BotName[] = [
  { name: 'Nova', avatarEmoji: '🤖' },
  { name: 'Rex', avatarEmoji: '🦖' },
  { name: 'Kato', avatarEmoji: '🐯' },
  { name: 'Zuri', avatarEmoji: '🦒' },
  { name: 'Milo', avatarEmoji: '🦊' },
]

/** Guest -> host. */
export type AmazonAction = { t: 'pick'; animalId: string } | { t: 'me'; r: NetRunner }

/** Host -> guests. */
export type AmazonEvent = { t: 'go'; seed: number; seats: RaceSeat[] }

const room = createPeerRoom<AmazonAction, AmazonEvent>({
  prefix: 'vgame-amazon-v2-',
  botNames: AMAZON_BOT_NAMES,
  snapshot: () => (sim.phase === 'running' || sim.phase === 'countdown' ? { runners: sim.runners.map(packRunner) } : {}),
  applySnapshot: (s) => {
    const list = (s.runners ?? []) as NetRunner[]
    for (const n of list) applyNetRunner(n, true)
  },
  // stream positions ~7 times a second rather than on every store change
  subscribe: (listener) => {
    const timer = setInterval(listener, 140)
    return () => clearInterval(timer)
  },
  onStart: (quick, role, seats, localSeatIds) => useAmazonMatch.getState().begin(quick ? 'online' : 'friends', role, seats, localSeatIds),
  onGuestLeftMidGame: (id) => dropRunner(id),
})

export const amazonRoom: RoomControls = room
export const useAmazonRoom = room.useRoom
export const leaveAmazonRoom = room.leaveRoom

export function sendAmazonAction(a: AmazonAction) {
  room.sendAction(a)
}

export function broadcastGo(seed: number, seats: RaceSeat[]) {
  room.broadcastEvent({ t: 'go', seed, seats })
}

export function setAmazonNetHandlers(h: { onPick: (seatId: string, animalId: string) => void; onGo: (seed: number, seats: RaceSeat[]) => void }) {
  room.setHandlers({
    onAction: (seatId, a) => {
      if (a.t === 'pick') h.onPick(seatId, String(a.animalId))
      else if (a.t === 'me' && Array.isArray(a.r) && a.r[0] === seatId) applyNetRunner(a.r, false)
    },
    onEvent: (e) => {
      if (e.t === 'go') h.onGo(Number(e.seed), e.seats)
    },
  })
}
