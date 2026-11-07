import { randomBytes } from 'node:crypto'
import { REGULARS } from '../../../src/games/poker/data/regulars'
import { TABLE_TIERS, TURN_MS, tier } from '../../../src/games/poker/data/tables'
import { levelInfo } from '../../../src/games/poker/data/progression'
import { isVip, notify, profileOf, userById } from '../accounts'
import { all } from '../db'
import { hub } from './hub'
import { TableRunner } from './runner'

/*
 * Cash tables (classic / VIP) and private rooms.
 *
 * Cash tables: players join a tier; we seat them at a table that already has people, else a new one.
 * Empty seats are kept filled with the club's computer regulars, who give up their seat to the next real
 * player between hands. A player has one cash seat at a time, and their stack comes from their points.
 */

export const tables = new Map<string, TableRunner>()
/** userId → the table they are seated at (cash, room or tournament) */
export const seatedAt = new Map<string, string>()

const tableTier = new Map<string, string>()
const usedNames = (r: TableRunner) => new Set(r.state.seats.filter(Boolean).map((s) => s!.name))

function fillBots(r: TableRunner, buyIn: number, target: number) {
  while (r.state.seats.filter(Boolean).length < target) {
    const i = r.freeSeat()
    if (i < 0) break
    const used = usedNames(r)
    const reg = REGULARS.find((x) => !used.has(x.name)) ?? REGULARS[0]
    r.seat(i, { userId: null, name: reg.name, avatar: reg.avatar, stack: Math.round(buyIn * (0.6 + Math.random() * 0.9)), bot: reg.style })
  }
}

function newCashTable(tierId: string): TableRunner {
  const t = tier(tierId)!
  const id = `${tierId}-${randomBytes(4).toString('hex')}`
  const size = t.opponents + 1
  const r = new TableRunner(id, t.mode === 'vip' ? 'vip' : 'classic', t.name, [t.smallBlind, t.bigBlind], size, TURN_MS, {
    betweenHands: (x) => {
      // busted regulars leave; keep the table full; refresh players' chip-count vs points
      x.state.seats.forEach((s, i) => {
        if (s && x.owners[i]?.bot && s.stack === 0) x.unseat(i)
      })
      fillBots(x, t.buyIn, size)
      x.owners.forEach((o, i) => {
        if (o?.userId && x.state.seats[i]?.stack === 0) hub.send(o.userId, { type: 'BUSTED', tableId: x.id })
      })
    },
    onEmpty: (x) => closeTable(x),
  })
  tables.set(id, r)
  tableTier.set(id, tierId)
  return r
}

export function closeTable(r: TableRunner) {
  r.close()
  tables.delete(r.id)
  tableTier.delete(r.id)
  for (const [u, t] of seatedAt) if (t === r.id) seatedAt.delete(u)
}

/** SIT at a classic or VIP tier. Returns the table id. */
export function sitCash(userId: string, tierId: string): string {
  const t = tier(tierId)
  if (!t || t.mode === 'practice') throw new Error('No such table')
  const u = userById(userId)!
  const p = profileOf(userId)!
  if (levelInfo(p.xp).level < t.minLevel && !(t.mode === 'vip' && isVip(p))) throw new Error(`Reach Lv.${t.minLevel} to sit here`)
  const current = seatedAt.get(userId)
  if (current && tables.has(current)) {
    if (tableTier.get(current) === tierId) return current
    leaveTable(userId, current)
  }
  const stack = Math.min(p.balance, t.buyIn)
  if (stack < t.bigBlind * 20) throw new Error(`You need at least ${(t.bigBlind * 20).toLocaleString('en-IN')} points to sit here`)
  // prefer a table with real players: a free seat first, else a seat a regular can give up
  const candidates = [...tables.values()].filter((r) => tableTier.get(r.id) === tierId && !r.closed).sort((a, b) => b.humans().length - a.humans().length)
  let target = candidates.find((r) => r.freeSeat() >= 0) ?? candidates.find((r) => r.owners.some((o) => o?.bot && !o.leaving))
  if (!target) {
    target = newCashTable(tierId)
    fillBots(target, t.buyIn, t.opponents)
  }
  const player = { userId, name: u.handle, avatar: p.avatar, stack }
  seatedAt.set(userId, target.id)
  let seat = target.freeSeat()
  if (seat < 0) {
    const botSeat = target.owners.findIndex((o) => o?.bot && !o.leaving)
    target.unseat(botSeat) // frees the seat now, or after the hand if the regular is still playing it
    seat = target.freeSeat()
  }
  if (seat >= 0) target.seat(seat, player)
  else {
    target.pending.push(player)
    target.watchers.add(userId)
    target.sync(userId)
  }
  target.dealerLine(`${u.handle} ${seat >= 0 ? 'sat down' : 'takes a seat next hand'}`)
  if (target.state.handNo === 0) target.start()
  return target.id
}

export function rebuy(userId: string, tableId: string): void {
  const r = tables.get(tableId)
  const t = tier(tableTier.get(tableId) ?? '')
  if (!r || !t) throw new Error('Not at a cash table')
  const i = r.seatOf(userId)
  if (i < 0) throw new Error('Not seated')
  const p = profileOf(userId)!
  const stack = Math.min(p.balance, t.buyIn)
  if (stack < t.bigBlind * 2) throw new Error('Not enough points. Claim your free daily bonus in Rewards.')
  r.setStack(i, stack)
}

export function leaveTable(userId: string, tableId: string) {
  const r = tables.get(tableId)
  if (!r) return
  const i = r.seatOf(userId)
  if (i >= 0) {
    r.unseat(i)
    r.dealerLine(`${r.state.seats[i]?.name ?? 'A player'} left the table`)
  }
  r.watchers.delete(userId)
  if (seatedAt.get(userId) === tableId) seatedAt.delete(userId)
  if (r.mode !== 'tournament' && !r.humans().length && r.state.phase !== 'preflop' && r.state.phase !== 'flop' && r.state.phase !== 'turn' && r.state.phase !== 'river') closeTable(r)
}

export function lobbyTiers() {
  return TABLE_TIERS.filter((t) => t.mode !== 'practice').map((t) => {
    const rs = [...tables.values()].filter((r) => tableTier.get(r.id) === t.id)
    return { id: t.id, tables: rs.length, players: rs.reduce((n, r) => n + r.humans().length, 0) }
  })
}

/* ---------------------------------------------------------------- private rooms */

export interface Room {
  code: string
  hostId: string
  size: number
  stack: number
  blinds: [number, number]
  members: { userId: string | null; name: string; avatar: string; bot?: string }[]
  tableId: string | null
  createdAt: number
}
export const rooms = new Map<string, Room>()
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function roomState(r: Room) {
  return { type: 'ROOM_STATE', room: { code: r.code, hostId: r.hostId, size: r.size, stack: r.stack, blinds: r.blinds, members: r.members.map((m) => ({ ...m, online: m.userId ? hub.online(m.userId) : true })), tableId: r.tableId } }
}
function pushRoom(r: Room) {
  for (const m of r.members) if (m.userId) hub.send(m.userId, roomState(r))
}

export function roomOf(userId: string) {
  return [...rooms.values()].find((r) => r.members.some((m) => m.userId === userId))
}

export function createRoom(userId: string, size: number, stack: number, blinds: [number, number]): Room {
  const existing = roomOf(userId)
  if (existing) leaveRoom(userId)
  let code = ''
  do code = [...randomBytes(5)].map((b) => CODE[b % CODE.length]).join('')
  while (rooms.has(code))
  const u = userById(userId)!
  const r: Room = { code, hostId: userId, size: Math.min(6, Math.max(2, size)), stack, blinds, members: [{ userId, name: u.handle, avatar: profileOf(userId)!.avatar }], tableId: null, createdAt: Date.now() }
  rooms.set(code, r)
  pushRoom(r)
  return r
}

export function joinRoom(userId: string, code: string): Room {
  const r = rooms.get(code.toUpperCase())
  if (!r) throw new Error(`No room found with code ${code.toUpperCase()}`)
  if (r.members.some((m) => m.userId === userId)) {
    pushRoom(r)
    if (r.tableId) tables.get(r.tableId)?.sync(userId)
    return r
  }
  if (r.tableId) throw new Error('That game has already started')
  if (r.members.length >= r.size) throw new Error('That room is full')
  if (all('SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)', r.hostId, userId, userId, r.hostId).length) throw new Error('You can’t join this room')
  const prev = roomOf(userId)
  if (prev) leaveRoom(userId)
  r.members.push({ userId, name: userById(userId)!.handle, avatar: profileOf(userId)!.avatar })
  pushRoom(r)
  return r
}

export function leaveRoom(userId: string) {
  const r = roomOf(userId)
  if (!r) return
  if (r.tableId) leaveTable(userId, r.tableId)
  r.members = r.members.filter((m) => m.userId !== userId)
  hub.send(userId, { type: 'ROOM_STATE', room: null })
  if (!r.members.some((m) => m.userId) || (r.hostId === userId && !r.tableId)) {
    for (const m of r.members) if (m.userId) hub.send(m.userId, { type: 'ROOM_STATE', room: null, reason: 'The host closed the room' })
    if (r.tableId) {
      const t = tables.get(r.tableId)
      if (t) closeTable(t)
    }
    rooms.delete(r.code)
    return
  }
  if (r.hostId === userId) r.hostId = r.members.find((m) => m.userId)!.userId!
  pushRoom(r)
}

export function addRoomBot(userId: string, name?: string) {
  const r = roomOf(userId)
  if (!r || r.hostId !== userId || r.tableId) throw new Error('Only the host can add players before the start')
  if (r.members.length >= r.size) throw new Error('The room is full')
  const used = new Set(r.members.map((m) => m.name))
  const reg = REGULARS.find((x) => x.name === name && !used.has(x.name)) ?? REGULARS.find((x) => !used.has(x.name))
  if (!reg) throw new Error('No regulars left')
  r.members.push({ userId: null, name: reg.name, avatar: reg.avatar, bot: reg.style })
  pushRoom(r)
}

export function removeRoomMember(userId: string, index: number) {
  const r = roomOf(userId)
  if (!r || r.hostId !== userId || r.tableId) throw new Error('Only the host can do that')
  const m = r.members[index]
  if (!m || m.userId === userId) return
  r.members.splice(index, 1)
  if (m.userId) hub.send(m.userId, { type: 'ROOM_STATE', room: null, reason: 'The host removed you from the room' })
  pushRoom(r)
}

export function inviteToRoom(userId: string, friendId: string) {
  const r = roomOf(userId)
  if (!r) throw new Error('Open a room first')
  const ok = all('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? AND status = ?', userId, friendId, 'accepted').length
  if (!ok) throw new Error('You can only invite friends')
  if (hub.blocks(friendId, userId)) throw new Error('You can’t invite this player')
  const from = userById(userId)!.handle
  hub.send(friendId, { type: 'ROOM_INVITE', code: r.code, from })
  notify(friendId, 'Table invite', `${from} invited you to private room ${r.code}`)
  hub.send(friendId, { type: 'ME_CHANGED' })
}

export function startRoom(userId: string) {
  const r = roomOf(userId)
  if (!r || r.hostId !== userId) throw new Error('Only the host can start')
  if (r.tableId) return
  if (r.members.length < 2) throw new Error('Add a friend or a computer player first')
  const t = new TableRunner(`room-${r.code}-${randomBytes(3).toString('hex')}`, 'friends', `Private Room ${r.code}`, r.blinds, r.members.length, TURN_MS + 5000, {
    onEmpty: (x) => {
      closeTable(x)
      rooms.delete(r.code)
    },
  })
  r.members.forEach((m, i) => {
    t.seat(i, { userId: m.userId, name: m.name, avatar: m.avatar, stack: r.stack, bot: m.bot as never })
    if (m.userId) seatedAt.set(m.userId, t.id)
  })
  tables.set(t.id, t)
  r.tableId = t.id
  for (const m of r.members) if (m.userId) hub.send(m.userId, { type: 'TABLE_ASSIGNED', tableId: t.id, mode: 'friends' })
  pushRoom(r)
  t.dealerLine(`Room ${r.code}: blinds ${r.blinds[0]}/${r.blinds[1]}, ${r.stack.toLocaleString('en-IN')} chips each`)
  t.start()
}

/** Rooms nobody started within an hour are cleared. */
setInterval(() => {
  for (const r of rooms.values()) if (!r.tableId && Date.now() - r.createdAt > 3600_000) rooms.delete(r.code)
}, 300_000).unref()
