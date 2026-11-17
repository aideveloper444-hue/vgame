import { create } from 'zustand'

/*
 * Who is at the table right now, for game voice chat: the game room being played (one at a time) publishes the
 * hub ids (friend codes) of the other human players seated with this device. Voice in "game" mode talks to
 * exactly these players; it is empty in solo, pass-and-play and computer games.
 */

export interface GameVoiceRoster {
  /** the room this roster belongs to (room prefix + code); null when not seated in an online game */
  key: string | null
  /** other human players' hub ids */
  netIds: string[]
}

export const useGameVoiceRoster = create<GameVoiceRoster>(() => ({ key: null, netIds: [] }))

export function setGameVoiceRoster(key: string, netIds: string[]) {
  const cur = useGameVoiceRoster.getState()
  const sorted = [...new Set(netIds)].sort()
  if (cur.key === key && cur.netIds.join() === sorted.join()) return
  useGameVoiceRoster.setState({ key, netIds: sorted })
}

/** Clear the roster (only if it still belongs to this room, so a newer room is never wiped by an older one). */
export function clearGameVoiceRoster(key?: string) {
  if (key && useGameVoiceRoster.getState().key !== key) return
  useGameVoiceRoster.setState({ key: null, netIds: [] })
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __gameVoice: typeof useGameVoiceRoster }).__gameVoice = useGameVoiceRoster
