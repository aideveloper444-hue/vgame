import type { IncomingMessage, Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { verifyAccess } from '../crypto'
import { all, one } from '../db'
import { profileOf, userById } from '../accounts'
import { log, rateLimit } from '../http'
import { hub } from './hub'
import { addRoomBot, createRoom, inviteToRoom, joinRoom, leaveRoom, leaveTable, rebuy, removeRoomMember, roomOf, seatedAt, sitCash, startRoom, tables } from './lobby'
import { register, rejoinTourney, unregister } from './tournaments'

/*
 * Realtime contract.
 *   client → server: JOIN_TABLE, SIT, LEAVE_TABLE, PLAYER_ACTION, CHAT_SEND, EMOTE, REQUEST_SNAPSHOT, REBUY,
 *                    PING, READY_CONFIRM, ROOM_CREATE/JOIN/LEAVE/ADD_BOT/REMOVE/START/INVITE,
 *                    TOURNEY_REGISTER/UNREGISTER
 *   server → client: HELLO, TABLE_SNAPSHOT, PRIVATE_CARDS, ACTION_ACCEPTED, ACTION_REJECTED, CHAT_RECEIVED,
 *                    EMOTE, TABLE_ASSIGNED, TABLE_CLOSED, BUSTED, ROOM_STATE, ROOM_INVITE, TOURNEY_RESULT,
 *                    PRESENCE, ME_CHANGED, ERROR, PONG
 * Every message is size-limited and rate-limited; table membership is re-checked on every action.
 */

const BAD = /\b(fuck|shit|bitch|bastard|cunt|madarchod|bhenchod|chutiya)\b/gi
const clean = (t: unknown) => String(t ?? '').replace(BAD, '***').replace(/\s+/g, ' ').trim().slice(0, 120)

export function attachSockets(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 })

  hub.onPresence = (userId, online) => {
    const p = profileOf(userId)
    const visible = p ? (JSON.parse(p.settings || '{}') as { showOnline?: boolean }).showOnline !== false : true
    if (!visible && online) return
    for (const f of all<{ user_id: string }>("SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'", userId)) hub.send(f.user_id, { type: 'PRESENCE', userId, online })
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const token = new URL(req.url ?? '', 'http://x').searchParams.get('token') ?? ''
    const claims = verifyAccess(token)
    const user = claims && userById(claims.sub)
    const session = claims && one<{ revoked_at: number | null }>('SELECT revoked_at FROM sessions WHERE id = ?', claims.sid)
    if (!claims || !user || user.status !== 'active' || !session || session.revoked_at || user.suspended_until > Date.now()) {
      ws.close(4001, 'AUTH_REQUIRED')
      return
    }
    const userId = user.id
    hub.add(userId, ws)
    const send = (m: Record<string, unknown>) => ws.readyState === 1 && ws.send(JSON.stringify(m))
    send({ type: 'HELLO', userId, serverNow: Date.now() })

    // back to wherever this player is sitting
    const at = seatedAt.get(userId) ?? rejoinTourney(userId)
    if (at && tables.has(at)) {
      send({ type: 'TABLE_ASSIGNED', tableId: at, mode: tables.get(at)!.mode, resumed: true })
      tables.get(at)!.sync(userId)
    }
    const room = roomOf(userId)
    if (room) joinRoom(userId, room.code)

    let alive = true
    ws.on('pong', () => (alive = true))
    const beat = setInterval(() => {
      if (!alive) return ws.terminate()
      alive = false
      ws.ping()
    }, 25000)

    ws.on('message', (raw) => {
      if (!rateLimit(`ws:${userId}`, 240)) return send({ type: 'ERROR', code: 'RATE_LIMITED', message: 'Slow down' })
      let m: Record<string, unknown>
      try {
        m = JSON.parse(String(raw))
      } catch {
        return send({ type: 'ERROR', code: 'INVALID_INPUT', message: 'Bad message' })
      }
      const tableId = String(m.tableId ?? '')
      const table = tables.get(tableId)
      const fail = (e: unknown, code = 'INVALID_ACTION') => send({ type: 'ERROR', code, message: (e as Error)?.message ?? String(e), ref: m.type })
      try {
        switch (m.type) {
          case 'PING':
            return send({ type: 'PONG', serverNow: Date.now(), echo: m.echo })
          case 'SIT': {
            const id = sitCash(userId, String(m.tier))
            send({ type: 'TABLE_ASSIGNED', tableId: id, mode: tables.get(id)!.mode })
            return tables.get(id)!.sync(userId)
          }
          case 'JOIN_TABLE':
          case 'REQUEST_SNAPSHOT':
            if (!table) return send({ type: 'TABLE_CLOSED', tableId })
            // watching is allowed only for your own table (privacy of private rooms)
            if (table.seatOf(userId) < 0 && !table.watchers.has(userId)) return fail(new Error('Not at this table'), 'FORBIDDEN')
            return table.sync(userId)
          case 'LEAVE_TABLE':
            if (table?.mode === 'friends') return leaveRoom(userId)
            if (table?.mode === 'tournament') {
              table.watchers.delete(userId)
              return send({ type: 'TABLE_CLOSED', tableId, reason: 'You left the table; your seat stays in the tournament until you return.' })
            }
            return leaveTable(userId, tableId)
          case 'PLAYER_ACTION': {
            if (!table) return send({ type: 'ACTION_REJECTED', tableId, clientActionId: m.clientActionId, code: 'ROOM_CLOSED' })
            const clientActionId = String(m.clientActionId ?? '').slice(0, 80)
            if (!clientActionId) return fail(new Error('clientActionId required'))
            return table.action(userId, { handId: Number(m.handId), expectedStateVersion: Number(m.expectedStateVersion), clientActionId, action: m.action as never })
          }
          case 'REBUY':
            rebuy(userId, tableId)
            return
          case 'CHAT_SEND': {
            if (!table || table.seatOf(userId) < 0) return
            const u = userById(userId)!
            if (u.muted_until > Date.now()) return fail(new Error('You are muted for now'), 'MUTED')
            if (!rateLimit(`chat:${userId}`, 12)) return fail(new Error('Slow down'), 'RATE_LIMITED')
            const text = clean(m.text)
            if (text) table.chat(userId, u.handle, text)
            return
          }
          case 'EMOTE':
            if (table && rateLimit(`emote:${userId}`, 20)) table.emote(userId, String(m.emoji ?? '').slice(0, 4))
            return
          case 'READY_CONFIRM':
            return
          case 'ROOM_CREATE':
            createRoom(userId, Number(m.size) || 6, [5000, 10000, 25000].includes(Number(m.stack)) ? Number(m.stack) : 10000, ([[25, 50], [50, 100], [100, 200]] as [number, number][]).find((b) => b[1] === Number(m.bigBlind)) ?? [50, 100])
            return
          case 'ROOM_JOIN':
            joinRoom(userId, String(m.code ?? ''))
            return
          case 'ROOM_LEAVE':
            return leaveRoom(userId)
          case 'ROOM_ADD_BOT':
            return addRoomBot(userId, m.name ? String(m.name) : undefined)
          case 'ROOM_REMOVE':
            return removeRoomMember(userId, Number(m.index))
          case 'ROOM_START':
            return startRoom(userId)
          case 'ROOM_INVITE':
            return inviteToRoom(userId, String(m.friendId))
          case 'TOURNEY_REGISTER':
            register(userId, String(m.id))
            return send({ type: 'ME_CHANGED' })
          case 'TOURNEY_UNREGISTER':
            unregister(userId, String(m.id))
            return send({ type: 'ME_CHANGED' })
          default:
            return fail(new Error('Unknown message'), 'INVALID_INPUT')
        }
      } catch (e) {
        fail(e)
      }
    })

    ws.on('close', () => {
      clearInterval(beat)
      hub.remove(userId, ws)
    })
    ws.on('error', (e) => log('warn', { where: 'ws', error: String(e) }))
  })
  return wss
}
