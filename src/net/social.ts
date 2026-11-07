import { create } from 'zustand'
import { broadcastHello, setProfileSource, startHub } from './hub'
import { myNetId } from './identity'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { startPresence } from '@/social/stores/useFriendsStore'
// imported for their network handlers
import '@/social/stores/useChatStore'
import '@/social/stores/usePartyStore'
import '@/social/stores/useVoiceStore'

/** What this player is doing right now, shown to friends ("Playing Ludo"). */
export const usePresence = create<{ activity: string | null; gameId: string | null }>(() => ({ activity: null, gameId: null }))

export function setPresence(activity: string | null, gameId: string | null) {
  const cur = usePresence.getState()
  if (cur.activity === activity && cur.gameId === gameId) return
  usePresence.setState({ activity, gameId })
  broadcastHello()
}

let started = false

export function initSocial() {
  if (started) return
  started = true
  setProfileSource(() => {
    const p = usePlayerStore.getState().profile
    const pr = usePresence.getState()
    return { id: myNetId(), name: p.name, avatarEmoji: p.avatarEmoji, level: p.level, activity: pr.activity, gameId: pr.gameId }
  })
  usePlayerStore.subscribe((s, prev) => {
    const a = s.profile
    const b = prev.profile
    if (a.name !== b.name || a.avatarEmoji !== b.avatarEmoji || a.level !== b.level) broadcastHello()
  })
  void startHub().then(startPresence)
}
