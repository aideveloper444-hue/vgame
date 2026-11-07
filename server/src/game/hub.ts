import type { WebSocket } from 'ws'
import { all } from '../db'

/*
 * Who is connected. A user may have several sockets (phone + web); messages go to all of them.
 * Presence changes are pushed to accepted friends.
 */

class Hub {
  private sockets = new Map<string, Set<WebSocket>>()
  private blockCache = new Map<string, { at: number; set: Set<string> }>()
  onPresence: ((userId: string, online: boolean) => void) | null = null

  add(userId: string, ws: WebSocket) {
    const set = this.sockets.get(userId) ?? new Set()
    const was = set.size > 0
    set.add(ws)
    this.sockets.set(userId, set)
    if (!was) this.onPresence?.(userId, true)
  }

  remove(userId: string, ws: WebSocket) {
    const set = this.sockets.get(userId)
    if (!set) return
    set.delete(ws)
    if (!set.size) {
      this.sockets.delete(userId)
      this.onPresence?.(userId, false)
    }
  }

  online(userId: string) {
    return (this.sockets.get(userId)?.size ?? 0) > 0
  }

  count() {
    let n = 0
    for (const s of this.sockets.values()) n += s.size
    return { users: this.sockets.size, sockets: n }
  }

  send(userId: string, msg: Record<string, unknown>) {
    const set = this.sockets.get(userId)
    if (!set) return
    const data = JSON.stringify(msg)
    for (const ws of set) if (ws.readyState === 1) ws.send(data)
  }

  /** True when `viewer` has blocked `author` (cached for a minute). */
  blocks(viewer: string, author: string) {
    let c = this.blockCache.get(viewer)
    if (!c || Date.now() - c.at > 60000) {
      c = { at: Date.now(), set: new Set(all<{ blocked_id: string }>('SELECT blocked_id FROM blocks WHERE user_id = ?', viewer).map((r) => r.blocked_id)) }
      this.blockCache.set(viewer, c)
    }
    return c.set.has(author)
  }

  invalidateBlocks(userId: string) {
    this.blockCache.delete(userId)
  }

  kick(userId: string, reason: string) {
    for (const ws of this.sockets.get(userId) ?? []) ws.close(4001, reason.slice(0, 100))
  }
}

export const hub = new Hub()
