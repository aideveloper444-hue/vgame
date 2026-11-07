import Peer, { type DataConnection, type MediaConnection, type PeerOptions } from 'peerjs'
import { create } from 'zustand'
import { myNetId, PEER_PREFIX } from './identity'

/*
 * The social hub: one long-lived PeerJS peer per device, addressed by this device's net id. It keeps a
 * data connection to every online friend (or party member) and routes typed messages to the social stores.
 * Audio calls for party voice ride on the same peer (see voice.ts).
 *
 * The public PeerJS broker only introduces devices; messages and audio flow device to device. Networks that
 * block direct connections need a TURN relay, configured with VITE_TURN_URL / VITE_TURN_USER / VITE_TURN_PASS.
 */

export interface PeerProfile {
  id: string
  name: string
  avatarEmoji: string
  level: number
  activity: string | null
  gameId: string | null
}

export type HubMessage = { t: string; [k: string]: unknown }
type Handler = (from: string, msg: HubMessage) => void

export type HubStatus = 'offline' | 'connecting' | 'online' | 'error'

interface HubState {
  status: HubStatus
  error: string | null
  /** net ids with an open data connection, with the profile they sent in their hello */
  peers: Record<string, PeerProfile>
}

export const useHub = create<HubState>(() => ({ status: 'offline', error: null, peers: {} }))

const env = import.meta.env as Record<string, string | undefined>
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }]
if (env.VITE_TURN_URL) ICE.push({ urls: env.VITE_TURN_URL.split(','), username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS })
export const PEER_OPTIONS: PeerOptions = { debug: 0, config: { iceServers: ICE } }

let peer: Peer | null = null
const conns = new Map<string, DataConnection>()
const pending = new Map<string, Promise<DataConnection | null>>()
const handlers = new Map<string, Set<Handler>>()
const callListeners = new Set<(call: MediaConnection) => void>()
const openListeners = new Set<(id: string) => void>()
let profileSource: () => PeerProfile = () => ({ id: myNetId(), name: 'Player', avatarEmoji: '🙂', level: 1, activity: null, gameId: null })
let retryTimer: ReturnType<typeof setTimeout> | undefined

export function setProfileSource(fn: () => PeerProfile) {
  profileSource = fn
}

export function onMessage(type: string, fn: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type)!.add(fn)
  return () => handlers.get(type)?.delete(fn)
}

export function onCall(fn: (call: MediaConnection) => void): () => void {
  callListeners.add(fn)
  return () => callListeners.delete(fn)
}

/** Called whenever a connection to `id` opens and the hello has been exchanged. */
export function onPeerOpen(fn: (id: string) => void): () => void {
  openListeners.add(fn)
  return () => openListeners.delete(fn)
}

export function getPeer(): Peer | null {
  return peer
}

export function isConnected(id: string): boolean {
  return !!conns.get(id)?.open && !!useHub.getState().peers[id]
}

function dispatch(from: string, msg: HubMessage) {
  for (const fn of handlers.get(msg.t) ?? []) {
    try {
      fn(from, msg)
    } catch (err) {
      console.error('hub handler', msg.t, err)
    }
  }
}

function setPeerProfile(id: string, p: PeerProfile | null) {
  const peers = { ...useHub.getState().peers }
  if (p) peers[id] = p
  else delete peers[id]
  useHub.setState({ peers })
}

function attach(conn: DataConnection, id: string) {
  const prev = conns.get(id)
  if (prev && prev !== conn && prev.open) {
    // both sides dialled at once: keep the connection opened by the smaller id so both ends agree
    const keepIncoming = id < myNetId()
    const isIncoming = !(conn.metadata && (conn.metadata as { dialer?: string }).dialer === myNetId())
    if (keepIncoming !== isIncoming) {
      conn.close()
      return
    }
    prev.close()
  }
  conns.set(id, conn)
  conn.on('data', (raw) => {
    const msg = raw as HubMessage
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return
    if (msg.t === 'hello') {
      const p = msg.p as PeerProfile
      const first = !useHub.getState().peers[id]
      setPeerProfile(id, { id, name: String(p?.name ?? 'Player').slice(0, 20), avatarEmoji: String(p?.avatarEmoji ?? '🙂').slice(0, 8),
        level: Number(p?.level) || 1, activity: p?.activity ? String(p.activity).slice(0, 60) : null, gameId: p?.gameId ? String(p.gameId).slice(0, 20) : null })
      if (first) {
        conn.send({ t: 'hello', p: profileSource() })
        for (const fn of openListeners) fn(id)
      }
      dispatch(id, msg)
      return
    }
    dispatch(id, msg)
  })
  const gone = () => {
    if (conns.get(id) !== conn) return
    conns.delete(id)
    setPeerProfile(id, null)
    dispatch(id, { t: 'disconnected' })
  }
  conn.on('close', gone)
  conn.on('error', gone)
}

/** Open (or reuse) a data connection to another device. Resolves null if it is offline. */
export function connect(id: string, timeoutMs = 9000): Promise<DataConnection | null> {
  if (id === myNetId() || !peer || peer.destroyed) return Promise.resolve(null)
  const existing = conns.get(id)
  if (existing?.open) return Promise.resolve(existing)
  const inflight = pending.get(id)
  if (inflight) return inflight
  const p = peer
  const promise = new Promise<DataConnection | null>((resolve) => {
    const conn = p.connect(PEER_PREFIX + id, { reliable: true, metadata: { dialer: myNetId() } })
    const done = (c: DataConnection | null) => {
      clearTimeout(timer)
      p.off('error', onErr)
      pending.delete(id)
      resolve(c)
    }
    const onErr = (err: { type?: string; message?: string }) => {
      if (err.type === 'peer-unavailable' && (!err.message || err.message.includes(id))) done(null)
    }
    const timer = setTimeout(() => {
      conn.close()
      done(null)
    }, timeoutMs)
    p.on('error', onErr)
    conn.once('open', () => {
      attach(conn, id)
      conn.send({ t: 'hello', p: profileSource() })
      done(conn)
    })
  })
  pending.set(id, promise)
  return promise
}

/** Send to a connected device; returns false if it is not connected. */
export function send(id: string, msg: HubMessage): boolean {
  const c = conns.get(id)
  if (!c?.open) return false
  c.send(msg)
  return true
}

/** Connect if needed, then send. */
export async function sendTo(id: string, msg: HubMessage): Promise<boolean> {
  const c = await connect(id)
  if (!c?.open) return false
  c.send(msg)
  return true
}

/** Tell every connected device about a change in our profile or activity. */
export function broadcastHello() {
  const p = profileSource()
  for (const c of conns.values()) if (c.open) c.send({ t: 'hello', p })
}

export function startHub(): Promise<void> {
  if (peer && !peer.destroyed) return Promise.resolve()
  useHub.setState({ status: 'connecting', error: null })
  return new Promise((resolve) => {
    const p = new Peer(PEER_PREFIX + myNetId(), PEER_OPTIONS)
    peer = p
    p.on('open', () => {
      useHub.setState({ status: 'online', error: null })
      resolve()
    })
    p.on('connection', (conn) => {
      const id = conn.peer.startsWith(PEER_PREFIX) ? conn.peer.slice(PEER_PREFIX.length) : null
      if (!id) return conn.close()
      conn.once('open', () => attach(conn, id))
    })
    p.on('call', (call) => {
      for (const fn of callListeners) fn(call)
    })
    p.on('disconnected', () => {
      useHub.setState({ status: 'connecting' })
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => {
        if (!p.destroyed) p.reconnect()
      }, 2000)
    })
    p.on('error', (err: { type?: string }) => {
      if (err.type === 'unavailable-id') {
        // this account is already open in another tab or window
        useHub.setState({ status: 'error', error: 'Your account is open somewhere else. Close the other tab to go online here.' })
        resolve()
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        useHub.setState({ status: 'error', error: 'Can\'t reach the online service right now. Retrying…' })
        clearTimeout(retryTimer)
        retryTimer = setTimeout(() => {
          if (!p.destroyed && p.disconnected) p.reconnect()
        }, 5000)
        resolve()
      }
    })
    p.on('open', () => {
      if (useHub.getState().status !== 'online') useHub.setState({ status: 'online', error: null })
    })
  })
}

export function stopHub() {
  clearTimeout(retryTimer)
  for (const c of conns.values()) c.close()
  conns.clear()
  peer?.destroy()
  peer = null
  useHub.setState({ status: 'offline', peers: {} })
}
