import { create } from 'zustand'
import { SERVER, accessToken, refresh } from './api'

/*
 * The realtime connection to the club server. Reconnects with backoff (fresh token each time); the server
 * puts the player back at their table and resends the snapshot and their own cards.
 */

export type LiveStatus = 'off' | 'connecting' | 'online' | 'reconnecting'
export const useLive = create<{ status: LiveStatus; latency: number | null }>(() => ({ status: 'off', latency: null }))

type Listener = (m: Record<string, unknown>) => void
const listeners = new Set<Listener>()
export const onLive = (fn: Listener) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

let ws: WebSocket | null = null
let wanted = false
let attempt = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let pingTimer: ReturnType<typeof setInterval> | undefined
const queue: string[] = []

export function connectLive() {
  wanted = true
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  void open()
}

async function open() {
  clearTimeout(retryTimer)
  if (!wanted) return
  let token = accessToken()
  // tokens live 15 minutes; refresh before every (re)connect so the handshake is never refused for age
  if (attempt > 0 || !token) {
    await refresh()
    token = accessToken()
  }
  if (!token) return useLive.setState({ status: 'off' })
  useLive.setState({ status: attempt ? 'reconnecting' : 'connecting' })
  const sock = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`)
  ws = sock
  sock.onopen = () => {
    attempt = 0
    useLive.setState({ status: 'online' })
    while (queue.length) sock.send(queue.shift()!)
    clearInterval(pingTimer)
    pingTimer = setInterval(() => send({ type: 'PING', echo: Date.now() }), 20000)
  }
  sock.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Record<string, unknown>
    if (m.type === 'PONG') useLive.setState({ latency: Date.now() - Number(m.echo) })
    for (const l of listeners) l(m)
  }
  sock.onclose = (e) => {
    clearInterval(pingTimer)
    if (ws !== sock) return
    ws = null
    if (!wanted) return useLive.setState({ status: 'off' })
    if (e.code === 4001) {
      // refused: token expired or account suspended; try once more with a refreshed token
      attempt++
      if (attempt > 3) return useLive.setState({ status: 'off' })
    }
    attempt++
    useLive.setState({ status: 'reconnecting' })
    retryTimer = setTimeout(() => void open(), Math.min(10000, 500 * 2 ** Math.min(attempt, 5)))
  }
}

export function send(m: Record<string, unknown>) {
  const data = JSON.stringify(m)
  if (ws?.readyState === WebSocket.OPEN) ws.send(data)
  else {
    queue.push(data)
    if (queue.length > 20) queue.shift()
    connectLive()
  }
}

export function disconnectLive() {
  wanted = false
  clearTimeout(retryTimer)
  ws?.close()
  ws = null
  useLive.setState({ status: 'off' })
}

/** Wait for the first message matching pred (or time out). */
export function waitLive<T = Record<string, unknown>>(pred: (m: Record<string, unknown>) => boolean, ms = 10000): Promise<T | null> {
  return new Promise((resolve) => {
    const off = onLive((m) => {
      if (!pred(m)) return
      off()
      clearTimeout(t)
      resolve(m as T)
    })
    const t = setTimeout(() => {
      off()
      resolve(null)
    }, ms)
  })
}
