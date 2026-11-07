import Peer, { type DataConnection } from 'peerjs'
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { makeId } from '@/lib/id'
import type { BotName, MatchRole, Seat } from './matchStore'

/*
 * Peer-to-peer game rooms over WebRTC (PeerJS). The public PeerJS broker only introduces peers by id;
 * game traffic flows directly between devices. The host device runs the real game (rules, bots,
 * animations) and streams state snapshots; guests only send action requests, which the game validates
 * on the host (usually "is it this seat's turn?") before applying.
 *
 * Each game creates one room with createPeerRoom(), supplying how to snapshot/apply its store and how
 * to handle actions and events; the room handles codes, invites, quick matching and seating.
 */

const QUICK_SLOTS = 6
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type RoomStatus = 'idle' | 'connecting' | 'lobby' | 'searching' | 'error' | 'closed'

export interface RoomState {
  status: RoomStatus
  isHost: boolean
  quick: boolean
  code: string | null
  /** Seats at this table. */
  size: number
  seats: Seat[]
  mySeatId: string | null
  error: string | null
  searchEndsAt: number | null
}

const IDLE: RoomState = {
  status: 'idle',
  isHost: false,
  quick: false,
  code: null,
  size: 4,
  seats: [],
  mySeatId: null,
  error: null,
  searchEndsAt: null,
}

type ToHost<A> = { t: 'hello'; name: string; avatarEmoji: string; resume?: string } | { t: 'act'; a: A }

type ToGuest<E> =
  | { t: 'welcome'; seatId: string; size: number }
  | { t: 'lobby'; seats: Seat[]; size: number }
  | { t: 'full' }
  | { t: 'start'; seats: Seat[]; quick: boolean }
  | { t: 'state'; s: Record<string, unknown> }
  | { t: 'ev'; e: E }
  | { t: 'closed' }

export interface RoomHandlers<A, E> {
  /** Host: a seated guest asked for something. Validate it against the game state before applying. */
  onAction?: (seatId: string, action: A) => void
  /** Guest: the host broadcast a transient event (dice tumble, chat line…). */
  onEvent?: (event: E) => void
}

export interface PeerRoomConfig {
  /** Namespaces peer ids so different games never meet at the same table. */
  prefix: string
  botNames: BotName[]
  /** Serialisable slice of the game store that guests mirror. */
  snapshot: () => Record<string, unknown>
  applySnapshot: (s: Record<string, unknown>) => void
  /** Subscribe to game-store changes (the host streams a snapshot after each). */
  subscribe: (listener: () => void) => () => void
  /** Both sides: the table is locked and the match begins. */
  onStart: (quick: boolean, role: MatchRole, seats: Seat[], localSeatIds: string[]) => void
  /** Host: a guest dropped out mid-match (hand the seat to a computer player). */
  onGuestLeftMidGame?: (seatId: string) => void
  /** Host: allow a dropped guest back into their seat (see rejoinRoom). Without it, dropped guests stay out. */
  onGuestRejoined?: (seatId: string) => boolean
}

export interface PeerRoom<A, E> {
  useRoom: UseBoundStore<StoreApi<RoomState>>
  QUICK_WAIT_MS: number
  createRoom: (size: number) => Promise<void>
  joinRoom: (code: string) => Promise<boolean>
  quickMatch: (size: number) => Promise<void>
  addComputerSeat: (name?: string) => void
  removeSeat: (seatId: string) => void
  startMatch: () => void
  leaveRoom: () => void
  /** Guest → host. */
  sendAction: (action: A) => void
  /** Host → guests. */
  broadcastEvent: (event: E, exceptSeatId?: string) => void
  /** Host: send an event to one seat only (private data such as a player's own cards). */
  sendEventTo: (seatId: string, event: E) => void
  /** Guest: after the host connection dropped mid-match, reconnect to the same seat. */
  rejoinRoom: () => Promise<boolean>
  setHandlers: (h: RoomHandlers<A, E>) => void
}

function profile() {
  const p = usePlayerStore.getState().profile
  return { name: p.name, avatarEmoji: p.avatarEmoji }
}

function makeCode(): string {
  let out = ''
  for (let i = 0; i < 5; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return out
}

function cleanName(v: unknown): string {
  const s = String(v ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14)
  return s || 'Player'
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 })
    const onError = (err: { type?: string }) => {
      p.off('open', onOpen)
      p.destroy()
      reject(err)
    }
    const onOpen = () => {
      p.off('error', onError)
      resolve(p)
    }
    p.once('open', onOpen)
    p.once('error', onError)
  })
}

export const QUICK_WAIT_MS = 20000

export function createPeerRoom<A, E>(config: PeerRoomConfig): PeerRoom<A, E> {
  const { prefix } = config
  const useRoom = create<RoomState>(() => ({ ...IDLE }))
  const setRoom = (patch: Partial<RoomState>) => useRoom.setState(patch)

  let handlers: RoomHandlers<A, E> = {}
  let peer: Peer | null = null
  let hostConn: DataConnection | null = null
  const guestConns = new Map<string, DataConnection>()
  let started = false
  let unsubscribeState: (() => void) | null = null
  let quickTimer: ReturnType<typeof setTimeout> | undefined
  let mergeTimer: ReturnType<typeof setInterval> | undefined
  let merging = false
  let replyWaiter: ((msg: ToGuest<E>) => void) | null = null

  function connectTo(id: string, timeoutMs: number): Promise<DataConnection | null> {
    return new Promise((resolve) => {
      if (!peer) return resolve(null)
      const p = peer
      const conn = p.connect(id, { reliable: true })
      const cleanup = () => {
        clearTimeout(timer)
        p.off('error', onError)
      }
      // "peer-unavailable" is raised on the peer, not the connection; only react to the one naming our target
      const onError = (err: { type?: string; message?: string }) => {
        if (err.type === 'peer-unavailable' && (!err.message || err.message.includes(id))) {
          cleanup()
          resolve(null)
        }
      }
      const timer = setTimeout(() => {
        cleanup()
        conn.close()
        resolve(null)
      }, timeoutMs)
      p.on('error', onError)
      conn.once('open', () => {
        cleanup()
        resolve(conn)
      })
    })
  }

  /* ---------------------------------------------------------------- host */

  function broadcast(msg: ToGuest<E>, exceptSeatId?: string) {
    for (const [seatId, conn] of guestConns) if (seatId !== exceptSeatId && conn.open) conn.send(msg)
  }

  function broadcastLobby() {
    const room = useRoom.getState()
    broadcast({ t: 'lobby', seats: room.seats, size: room.size })
  }

  let snapshotQueued = false
  function queueSnapshot() {
    if (snapshotQueued) return
    snapshotQueued = true
    queueMicrotask(() => {
      snapshotQueued = false
      broadcast({ t: 'state', s: config.snapshot() })
    })
  }

  function acceptGuest(conn: DataConnection) {
    let seatId: string | null = null
    conn.on('data', (raw) => {
      const msg = raw as ToHost<A>
      if (!msg || typeof msg !== 'object') return
      if (msg.t === 'hello') {
        const room = useRoom.getState()
        const back = typeof msg.resume === 'string' ? room.seats.find((x) => x.id === msg.resume && x.kind === 'remote') : undefined
        if (started && back && !guestConns.has(back.id) && config.onGuestRejoined?.(back.id)) {
          seatId = back.id
          guestConns.set(back.id, conn)
          conn.send({ t: 'welcome', seatId: back.id, size: room.size } satisfies ToGuest<E>)
          conn.send({ t: 'start', seats: room.seats, quick: room.quick } satisfies ToGuest<E>)
          conn.send({ t: 'state', s: config.snapshot() } satisfies ToGuest<E>)
          return
        }
        if (started || room.seats.length >= room.size) {
          conn.send({ t: 'full' } satisfies ToGuest<E>)
          setTimeout(() => conn.close(), 400)
          return
        }
        const seat: Seat = { id: makeId('seat'), name: cleanName(msg.name), avatarEmoji: String(msg.avatarEmoji ?? '🙂').slice(0, 4), kind: 'remote' }
        seatId = seat.id
        guestConns.set(seat.id, conn)
        setRoom({ seats: [...room.seats, seat] })
        conn.send({ t: 'welcome', seatId: seat.id, size: room.size } satisfies ToGuest<E>)
        broadcastLobby()
        if (room.quick && room.seats.length + 1 >= room.size) startMatch()
        return
      }
      if (msg.t === 'act' && seatId && started) handlers.onAction?.(seatId, msg.a)
    })
    const gone = () => {
      if (!seatId || !guestConns.has(seatId)) return
      guestConns.delete(seatId)
      const id = seatId
      if (!started) {
        setRoom({ seats: useRoom.getState().seats.filter((s) => s.id !== id) })
        broadcastLobby()
        return
      }
      config.onGuestLeftMidGame?.(id)
    }
    conn.on('close', gone)
    conn.on('error', gone)
  }

  async function hostOn(peerId: string, quick: boolean, code: string, size: number) {
    peer = await openPeer(prefix + peerId)
    const me = profile()
    setRoom({
      status: quick ? 'searching' : 'lobby',
      isHost: true,
      quick,
      code,
      size,
      seats: [{ id: 'host', name: cleanName(me.name), avatarEmoji: me.avatarEmoji, kind: 'local' }],
      mySeatId: 'host',
      error: null,
    })
    peer.on('connection', acceptGuest)
    peer.on('disconnected', () => peer?.reconnect())
  }

  async function createRoom(size: number) {
    leaveRoom()
    setRoom({ status: 'connecting', isHost: true, size })
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode()
      try {
        await hostOn(code, false, code, size)
        return
      } catch (err) {
        if ((err as { type?: string }).type === 'unavailable-id') continue
        setRoom({ ...IDLE, status: 'error', error: 'Could not reach the online service. Check your connection and try again.' })
        return
      }
    }
    setRoom({ ...IDLE, status: 'error', error: 'Could not create a room right now. Please try again.' })
  }

  function addComputerSeat(name?: string) {
    const room = useRoom.getState()
    if (!room.isHost || room.seats.length >= room.size) return
    const used = new Set(room.seats.map((s) => s.name))
    const pick = config.botNames.find((b) => b.name === name && !used.has(b.name)) ?? config.botNames.find((b) => !used.has(b.name)) ?? config.botNames[0]
    setRoom({ seats: [...room.seats, { id: makeId('bot'), name: pick.name, avatarEmoji: pick.avatarEmoji, kind: 'bot' }] })
    broadcastLobby()
  }

  function removeSeat(seatId: string) {
    const room = useRoom.getState()
    if (!room.isHost || seatId === 'host') return
    const conn = guestConns.get(seatId)
    if (conn) {
      conn.send({ t: 'closed' } satisfies ToGuest<E>)
      guestConns.delete(seatId)
      setTimeout(() => conn.close(), 300)
    }
    setRoom({ seats: room.seats.filter((s) => s.id !== seatId) })
    broadcastLobby()
  }

  /** Host: lock the table and start. Empty seats in quick matches are filled with computer players. */
  function startMatch() {
    const room = useRoom.getState()
    if (!room.isHost || started) return
    clearTimeout(quickTimer)
    if (room.quick) while (useRoom.getState().seats.length < room.size) addComputerSeat()
    const seats = useRoom.getState().seats
    if (seats.length < 2) return
    started = true
    broadcast({ t: 'start', seats, quick: room.quick })
    unsubscribeState?.()
    unsubscribeState = config.subscribe(queueSnapshot)
    config.onStart(room.quick, 'host', seats, ['host'])
  }

  /* ---------------------------------------------------------------- guest */

  function handleHostMessage(raw: unknown) {
    const msg = raw as ToGuest<E>
    if (!msg || typeof msg !== 'object') return
    if (replyWaiter && (msg.t === 'welcome' || msg.t === 'full')) {
      const w = replyWaiter
      replyWaiter = null
      w(msg)
    }
    switch (msg.t) {
      case 'welcome':
        setRoom({ mySeatId: msg.seatId, size: msg.size, status: useRoom.getState().quick ? 'searching' : 'lobby' })
        break
      case 'lobby':
        setRoom({ seats: msg.seats, size: msg.size })
        break
      case 'full':
        if (!useRoom.getState().quick) {
          leaveRoom()
          setRoom({ status: 'error', error: 'That room is full or the game has already started.' })
        }
        break
      case 'start': {
        started = true
        const mine = useRoom.getState().mySeatId
        const seats = msg.seats.map((s) => (s.id === mine ? { ...s, kind: 'local' as const } : s.kind === 'bot' ? s : { ...s, kind: 'remote' as const }))
        config.onStart(msg.quick, 'guest', seats, mine ? [mine] : [])
        break
      }
      case 'state':
        config.applySnapshot(msg.s)
        break
      case 'ev':
        handlers.onEvent?.(msg.e)
        break
      case 'closed':
        setRoom({ status: 'closed' })
        break
    }
  }

  function attachHost(conn: DataConnection) {
    hostConn = conn
    conn.on('data', handleHostMessage)
    conn.on('close', () => {
      if (hostConn === conn && useRoom.getState().status !== 'idle') setRoom({ status: 'closed' })
    })
  }

  function waitForReply(ms: number): Promise<ToGuest<E> | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        replyWaiter = null
        resolve(null)
      }, ms)
      replyWaiter = (m) => {
        clearTimeout(timer)
        resolve(m)
      }
    })
  }

  function sendAction(action: A) {
    if (hostConn?.open) hostConn.send({ t: 'act', a: action } satisfies ToHost<A>)
  }

  function broadcastEvent(event: E, exceptSeatId?: string) {
    broadcast({ t: 'ev', e: event }, exceptSeatId)
  }

  function sendEventTo(seatId: string, event: E) {
    const conn = guestConns.get(seatId)
    if (conn?.open) conn.send({ t: 'ev', e: event } satisfies ToGuest<E>)
  }

  async function joinRoom(rawCode: string): Promise<boolean> {
    leaveRoom()
    const code = rawCode.trim().toUpperCase()
    setRoom({ status: 'connecting', isHost: false, quick: false, code })
    try {
      peer = await openPeer()
    } catch {
      setRoom({ ...IDLE, status: 'error', error: 'Could not reach the online service. Check your connection and try again.' })
      return false
    }
    const conn = await connectTo(prefix + code, 8000)
    if (!conn) {
      leaveRoom()
      setRoom({ status: 'error', error: `No room found with code ${code}. Check the code and try again.` })
      return false
    }
    attachHost(conn)
    const me = profile()
    conn.send({ t: 'hello', name: me.name, avatarEmoji: me.avatarEmoji } satisfies ToHost<A>)
    return true
  }

  async function rejoinRoom(): Promise<boolean> {
    const { code, mySeatId, isHost } = useRoom.getState()
    if (isHost || !code || !mySeatId) return false
    hostConn?.close()
    hostConn = null
    try {
      peer ??= await openPeer()
      if (peer.disconnected) peer.reconnect()
    } catch {
      return false
    }
    const conn = await connectTo(prefix + code, 8000)
    if (!conn) return false
    setRoom({ status: 'connecting' })
    attachHost(conn)
    const me = profile()
    conn.send({ t: 'hello', name: me.name, avatarEmoji: me.avatarEmoji, resume: mySeatId } satisfies ToHost<A>)
    const reply = await waitForReply(6000)
    if (reply?.t !== 'welcome') {
      setRoom({ status: 'closed' })
      return false
    }
    return true
  }

  /**
   * Serverless quick match: look for an open public table of the chosen size among a few well-known
   * slots and sit down; if none is open, open one and wait for strangers, then fill empty seats with
   * computer players.
   */
  async function quickMatch(size: number) {
    leaveRoom()
    setRoom({ status: 'searching', quick: true, isHost: false, code: null, size })
    try {
      peer = await openPeer()
    } catch {
      setRoom({ ...IDLE, status: 'error', error: 'Could not reach the online service. Check your connection and try again.' })
      return
    }
    if ((await sitAtFirstOpenTable(size, Array.from({ length: QUICK_SLOTS }, (_, n) => n))) !== null) return
    if (useRoom.getState().status !== 'searching') return
    // no open table found: open one ourselves
    peer?.destroy()
    peer = null
    for (let n = 0; n < QUICK_SLOTS; n++) {
      if (useRoom.getState().status !== 'searching') return
      try {
        await hostOn(`qm${size}-${n}`, true, `${size}-player table ${n + 1}`, size)
        setRoom({ searchEndsAt: Date.now() + QUICK_WAIT_MS })
        quickTimer = setTimeout(startMatch, QUICK_WAIT_MS)
        // two players who searched at the same moment can each open a table; while still alone, keep
        // checking the lower-numbered tables and move to one with a free seat so they end up together
        if (n > 0) mergeTimer = setInterval(() => void mergeIntoLowerTable(size, n), 3000)
        return
      } catch (err) {
        if ((err as { type?: string }).type !== 'unavailable-id') break
      }
    }
    setRoom({ ...IDLE, status: 'error', error: 'All online tables are busy right now. Try again in a moment, or play vs Computer.' })
  }

  /**
   * Probe the given public tables in parallel (missing ones fail fast; a live one can take a few
   * seconds to connect), then ask the open ones for a seat in slot order. Returns the slot we sat at.
   */
  async function sitAtFirstOpenTable(size: number, slots: number[], canSit = () => useRoom.getState().status === 'searching'): Promise<number | null> {
    const conns = await Promise.all(slots.map((n) => connectTo(`${prefix}qm${size}-${n}`, 8000)))
    const me = profile()
    let seatedAt: number | null = null
    for (let i = 0; i < slots.length; i++) {
      const conn = conns[i]
      if (!conn) continue
      if (seatedAt !== null || !canSit()) {
        conn.close()
        continue
      }
      attachHost(conn)
      const reply = waitForReply(4000)
      conn.send({ t: 'hello', name: me.name, avatarEmoji: me.avatarEmoji } satisfies ToHost<A>)
      const msg = await reply
      if (msg?.t === 'welcome') {
        seatedAt = slots[i]
        continue
      }
      if (hostConn === conn) hostConn = null
      conn.close()
    }
    return seatedAt
  }

  async function mergeIntoLowerTable(size: number, mySlot: number) {
    const alone = () => {
      const room = useRoom.getState()
      return !started && room.isHost && room.quick && room.seats.length === 1
    }
    if (merging || !alone()) return
    merging = true
    try {
      const slot = await sitAtFirstOpenTable(size, Array.from({ length: mySlot }, (_, n) => n), alone)
      if (slot !== null) {
        // we are now a guest at that table: stop hosting our empty one
        clearTimeout(quickTimer)
        clearInterval(mergeTimer)
        peer?.off('connection', acceptGuest)
        setRoom({ isHost: false, code: `${size}-player table ${slot + 1}`, searchEndsAt: null })
      }
    } finally {
      merging = false
    }
  }

  /** Close every connection and forget the room. Safe to call at any time. */
  function leaveRoom() {
    clearTimeout(quickTimer)
    clearInterval(mergeTimer)
    unsubscribeState?.()
    unsubscribeState = null
    if (useRoom.getState().isHost) broadcast({ t: 'closed' })
    for (const conn of guestConns.values()) setTimeout(() => conn.close(), 200)
    guestConns.clear()
    hostConn?.close()
    hostConn = null
    replyWaiter = null
    const p = peer
    peer = null
    if (p) setTimeout(() => p.destroy(), 250)
    started = false
    setRoom({ ...IDLE })
  }

  return {
    useRoom,
    QUICK_WAIT_MS,
    createRoom,
    joinRoom,
    quickMatch,
    addComputerSeat,
    removeSeat,
    startMatch,
    leaveRoom,
    sendAction,
    broadcastEvent,
    sendEventTo,
    rejoinRoom,
    setHandlers: (h) => {
      handlers = h
    },
  }
}

/** The lobby-facing part of a room, independent of the game's action and event types. */
export type RoomControls = Pick<
  PeerRoom<unknown, unknown>,
  'useRoom' | 'QUICK_WAIT_MS' | 'createRoom' | 'joinRoom' | 'quickMatch' | 'addComputerSeat' | 'removeSeat' | 'startMatch' | 'leaveRoom'
>
