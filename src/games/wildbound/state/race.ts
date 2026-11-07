import { create } from 'zustand'
import { createPeerRoom, type RoomControls } from '@/games/shared/online/peerRoom'
import { createMatchStore, type BotName } from '@/games/shared/online/matchStore'
import { ANIMALS } from '../engine/content'
import { RACE_LENGTHS, RaceSession, type NetRacer, type RaceLength, type RaceSeat } from '../engine/race'
import type { BotLevel } from '../engine/autopilot'
import { run } from '../scene/runController'

/*
 * "Play with Friends": race friends with a room code, race players online (quick match), or race computer
 * rivals. The room is the app's shared peer-to-peer room (same as Ludo, City and the old Amazon runner); the
 * host picks the seed and the length, every device runs its own runner on that trail and streams its
 * position ~7 times a second; the host relays everyone and simulates the computer rivals.
 */

export const useWildMatch = createMatchStore()

export const WILD_BOT_NAMES: BotName[] = [
  { name: 'Nova', avatarEmoji: '🐺' },
  { name: 'Rex', avatarEmoji: '🦁' },
  { name: 'Kato', avatarEmoji: '🐯' },
  { name: 'Zuri', avatarEmoji: '🐆' },
  { name: 'Milo', avatarEmoji: '🦊' },
]

/** Guest -> host. */
export type RaceAction = { t: 'pick'; animalId: string } | { t: 'me'; r: NetRacer }
/** Host -> guests. */
export type RaceEvent = { t: 'go'; seed: number; length: number; seats: RaceSeat[] }

const room = createPeerRoom<RaceAction, RaceEvent>({
  prefix: 'vgame-wildbound-v1-',
  botNames: WILD_BOT_NAMES,
  snapshot: () => (run.race ? { r: run.race.racers.map((r) => run.race!.pack(r)) } : {}),
  applySnapshot: (s) => {
    const race = run.race
    if (!race) return
    for (const n of (s.r ?? []) as NetRacer[]) race.apply(n)
  },
  // stream positions ~7 times a second rather than on every change
  subscribe: (listener) => {
    const t = setInterval(listener, 140)
    return () => clearInterval(t)
  },
  onStart: (quick, role, seats, localSeatIds) => useWildMatch.getState().begin(quick ? 'online' : 'friends', role, seats, localSeatIds),
  onGuestLeftMidGame: (id) => {
    const r = run.race?.racers.find((x) => x.id === id)
    if (r) r.left = true
  },
})

export const wildRoom: RoomControls = room
export const useWildRoom = room.useRoom
export const sendRaceAction = (a: RaceAction) => room.sendAction(a)
export const broadcastGo = (seed: number, length: number, seats: RaceSeat[]) => room.broadcastEvent({ t: 'go', seed, length, seats })

export function setRaceNetHandlers(h: { onPick?: (seatId: string, animalId: string) => void; onGo?: (seed: number, length: number, seats: RaceSeat[]) => void }) {
  room.setHandlers({
    onAction: (seatId, a) => {
      if (a.t === 'pick' && ANIMALS.some((x) => x.id === a.animalId)) h.onPick?.(seatId, a.animalId)
      else if (a.t === 'me' && Array.isArray(a.r) && a.r[0] === seatId) run.race?.apply(a.r)
    },
    onEvent: (e) => {
      if (e.t === 'go' && Array.isArray(e.seats)) h.onGo?.(Number(e.seed) | 0, RACE_LENGTHS.includes(e.length as RaceLength) ? e.length : 1000, e.seats)
    },
  })
}

export function leaveRace() {
  if (useWildMatch.getState().role !== 'solo') room.leaveRoom()
  useWildMatch.getState().backToMenu()
  run.race = null
  useRaceUI.setState({ pending: null })
}

/** A race about to start: the run screen picks it up and builds the session. */
export interface PendingRace {
  seed: number
  length: number
  seats: RaceSeat[]
  localId: string
  botLevel: BotLevel
  online: boolean
  role: 'solo' | 'host' | 'guest'
}

export const useRaceUI = create<{ length: RaceLength; pending: PendingRace | null }>(() => ({ length: 1000, pending: null }))

export function makeSession(p: PendingRace) {
  return new RaceSession(p.seed, p.length, p.seats, p.localId, p.botLevel)
}
