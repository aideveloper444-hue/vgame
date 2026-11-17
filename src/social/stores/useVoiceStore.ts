import { create } from 'zustand'
import type { MediaConnection } from 'peerjs'
import { getPeer, onCall } from '@/net/hub'
import { myNetId, PEER_PREFIX } from '@/net/identity'
import { usePartyStore } from './usePartyStore'
import { useGameVoiceRoster } from '@/net/gameVoiceRoster'
import { sfx } from '@/lib/sound'

/*
 * Voice chat, on one of two channels:
 *  - game: the other human players at the table of the online game being played (useGameVoiceRoster), so a
 *    match talks only among its own players;
 *  - party: the party's voice channel (friends together across games).
 * Everyone on the channel streams their microphone straight to everyone else (a small mesh). For each pair,
 * the device with the smaller id places the call; a call for another channel, room or party is refused.
 * Mic and speaker are separate switches: mute yourself, or silence everyone else.
 */

export type VoiceChannel = 'game' | 'party'

interface VoiceState {
  /** which voice channel joinVoice uses (and the current call is on) */
  channel: VoiceChannel
  setChannel: (c: VoiceChannel) => void
  /** this device is in the voice channel */
  joined: boolean
  joining: boolean
  micMuted: boolean
  deafened: boolean
  error: string | null
  /** net id -> currently talking (includes this device's id) */
  speaking: Record<string, boolean>
  /** net id -> audio connected */
  linked: Record<string, boolean>
  joinVoice: () => Promise<void>
  leaveVoice: () => void
  toggleMic: (memberId?: string) => void
  toggleDeafen: () => void
  isMuted: (memberId: string) => boolean
}

let localStream: MediaStream | null = null
let audioCtx: AudioContext | null = null
const calls = new Map<string, MediaConnection>()
const callStarted = new Map<string, number>()
const audioEls = new Map<string, HTMLAudioElement>()
const analysers = new Map<string, { an: AnalyserNode; buf: Uint8Array<ArrayBuffer>; src: MediaStreamAudioSourceNode }>()
let meterTimer: ReturnType<typeof setInterval> | undefined

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  channel: 'party',
  setChannel: (channel) => {
    if (get().channel === channel) return
    const wasJoined = get().joined
    // switching channel: drop every call on the old one, then link up on the new one
    for (const id of [...calls.keys()]) hangUp(id)
    if (wasJoined && get().channel === 'party' && usePartyStore.getState().active) usePartyStore.getState().setMyVoice(false, get().micMuted)
    set({ channel })
    if (wasJoined && channel === 'party' && usePartyStore.getState().active) usePartyStore.getState().setMyVoice(true, get().micMuted)
    reconcile()
  },
  joined: false,
  joining: false,
  micMuted: false,
  deafened: false,
  error: null,
  speaking: {},
  linked: {},

  joinVoice: async () => {
    if (get().joined || get().joining) return
    if (get().channel === 'party' ? !usePartyStore.getState().active : !useGameVoiceRoster.getState().key) return
    set({ joining: true, error: null })
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      set({ joining: false, error: denied ? 'Microphone permission was denied. Allow it in your settings to talk.' : 'No microphone was found on this device.' })
      return
    }
    audioCtx ??= new AudioContext()
    void audioCtx.resume()
    localStream.getAudioTracks().forEach((t) => (t.enabled = !get().micMuted))
    watchLevel(myNetId(), localStream)
    startMeter()
    set({ joined: true, joining: false })
    sfx.voiceOn()
    if (get().channel === 'party') usePartyStore.getState().setMyVoice(true, get().micMuted)
    reconcile()
  },

  leaveVoice: () => {
    if (!get().joined && !get().joining) return
    for (const id of [...calls.keys()]) hangUp(id)
    unwatch(myNetId())
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    clearInterval(meterTimer)
    meterTimer = undefined
    set({ joined: false, joining: false, speaking: {}, linked: {} })
    sfx.voiceOff()
    if (get().channel === 'party' && usePartyStore.getState().active) usePartyStore.getState().setMyVoice(false, get().micMuted)
  },

  toggleMic: () => {
    const micMuted = !get().micMuted
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !micMuted))
    set((s) => ({ micMuted, speaking: { ...s.speaking, [myNetId()]: false } }))
    if (get().joined && get().channel === 'party') usePartyStore.getState().setMyVoice(true, micMuted)
  },

  toggleDeafen: () => {
    const deafened = !get().deafened
    for (const el of audioEls.values()) el.muted = deafened
    set({ deafened })
  },

  isMuted: (memberId) => {
    if (memberId === myNetId() || memberId === 'you') return get().micMuted
    return usePartyStore.getState().members.find((m) => m.id === memberId)?.micMuted ?? false
  },
}))

const store = useVoiceStore

function watchLevel(id: string, stream: MediaStream) {
  if (!audioCtx || analysers.has(id)) return
  try {
    const src = audioCtx.createMediaStreamSource(stream)
    const an = audioCtx.createAnalyser()
    an.fftSize = 512
    src.connect(an)
    analysers.set(id, { an, src, buf: new Uint8Array(new ArrayBuffer(an.fftSize)) })
  } catch {
    /* some WebViews can't analyse remote streams; the speaking ring just stays off */
  }
}

function unwatch(id: string) {
  const a = analysers.get(id)
  if (!a) return
  a.src.disconnect()
  analysers.delete(id)
}

function startMeter() {
  if (meterTimer) return
  meterTimer = setInterval(() => {
    const next: Record<string, boolean> = {}
    for (const [id, { an, buf }] of analysers) {
      an.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      next[id] = rms > 0.035 && !(id === myNetId() && store.getState().micMuted)
    }
    const prev = store.getState().speaking
    if (Object.keys(next).length !== Object.keys(prev).length || Object.entries(next).some(([k, v]) => prev[k] !== v)) store.setState({ speaking: next })
  }, 160)
}

function hangUp(id: string) {
  calls.get(id)?.close()
  calls.delete(id)
  const el = audioEls.get(id)
  if (el) {
    el.srcObject = null
    el.remove()
    audioEls.delete(id)
  }
  unwatch(id)
  store.setState((s) => {
    const linked = { ...s.linked }
    delete linked[id]
    const speaking = { ...s.speaking }
    delete speaking[id]
    return { linked, speaking }
  })
}

function wire(id: string, call: MediaConnection) {
  const prev = calls.get(id)
  if (prev && prev !== call) prev.close()
  calls.set(id, call)
  callStarted.set(id, Date.now())
  call.on('stream', (remote) => {
    let el = audioEls.get(id)
    if (!el) {
      el = document.createElement('audio')
      el.autoplay = true
      el.setAttribute('playsinline', '')
      el.style.display = 'none'
      document.body.appendChild(el)
      audioEls.set(id, el)
    }
    el.muted = store.getState().deafened
    el.srcObject = remote
    void el.play().catch(() => undefined)
    watchLevel(id, remote)
    store.setState((s) => ({ linked: { ...s.linked, [id]: true } }))
  })
  const end = () => {
    if (calls.get(id) === call) hangUp(id)
  }
  call.on('close', end)
  call.on('error', end)
}

/** Place or drop calls so we're linked to exactly the players on the current channel (party members who are in
 * voice, or the other players at this game's table). */
function reconcile() {
  const party = usePartyStore.getState()
  const roster = useGameVoiceRoster.getState()
  const peer = getPeer()
  if (!store.getState().joined || !localStream || !peer || peer.destroyed) {
    for (const id of [...calls.keys()]) hangUp(id)
    return
  }
  if (store.getState().channel === 'game') {
    const want = new Set(roster.netIds)
    for (const id of [...calls.keys()]) if (!want.has(id)) hangUp(id)
    const me = myNetId()
    for (const id of want) {
      if (calls.has(id) || me > id) continue
      const call = peer.call(PEER_PREFIX + id, localStream, { metadata: { gameKey: roster.key } })
      if (call) wire(id, call)
    }
    return
  }
  const want = new Set(party.members.filter((m) => !m.isUser && m.inVoice).map((m) => m.id))
  for (const id of [...calls.keys()]) {
    const inParty = party.members.some((m) => m.id === id)
    if (!inParty || (!want.has(id) && Date.now() - (callStarted.get(id) ?? 0) > 6000)) hangUp(id)
  }
  const me = myNetId()
  for (const id of want) {
    if (calls.has(id) || me > id) continue
    const call = peer.call(PEER_PREFIX + id, localStream, { metadata: { partyId: party.partyId } })
    if (call) wire(id, call)
  }
}

onCall((call) => {
  const id = call.peer.startsWith(PEER_PREFIX) ? call.peer.slice(PEER_PREFIX.length) : ''
  const party = usePartyStore.getState()
  const roster = useGameVoiceRoster.getState()
  const meta = call.metadata as { partyId?: string; gameKey?: string } | undefined
  const v = store.getState()
  const ok =
    v.joined &&
    localStream &&
    (v.channel === 'game'
      ? !!roster.key && meta?.gameKey === roster.key && roster.netIds.includes(id)
      : party.active && meta?.partyId === party.partyId && party.members.some((m) => m.id === id))
  if (!ok) {
    call.close()
    return
  }
  call.answer(localStream!)
  wire(id, call)
})

usePartyStore.subscribe((s, prev) => {
  if (s.members !== prev.members || s.partyId !== prev.partyId) reconcile()
  if (!s.active && prev.active && store.getState().channel === 'party') store.getState().leaveVoice()
})

// the table changed (someone joined or left): re-link; the game ended: leave game voice
useGameVoiceRoster.subscribe((r, prev) => {
  if (store.getState().channel !== 'game') return
  if (!r.key && prev.key) store.getState().leaveVoice()
  else reconcile()
})

// calls placed by the other side may land before their voice flag arrives; retry a moment later
setInterval(() => {
  if (store.getState().joined) reconcile()
}, 5000)

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as { __voice: typeof useVoiceStore; __hubPeer: () => unknown }
  w.__voice = useVoiceStore
  w.__hubPeer = () => {
    const p = getPeer()
    return p ? { id: p.id, open: p.open, destroyed: p.destroyed } : null
  }
}
