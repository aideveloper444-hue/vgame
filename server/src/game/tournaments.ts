import { randomBytes } from 'node:crypto'
import { fieldPlayer } from '../../../src/games/poker/data/regulars'
import { BLIND_LEVELS, TOURNAMENTS, TURN_MS, nextStart, payouts, tournament, type TournamentDef } from '../../../src/games/poker/data/tables'
import { config } from '../config'
import { all, one, run } from '../db'
import { grant, notify, profileOf, unlock, updateProfile, userById } from '../accounts'
import { hub } from './hub'
import { TableRunner } from './runner'
import { seatedAt, tables } from './lobby'
import { log } from '../http'

/*
 * Multi-table tournaments with real registrations.
 *
 * Scheduled events open at their start time with everyone registered for that start (tournament key =
 * "<id>:<start ms>"). The Turbo Sit & Go starts as soon as six players are waiting, or 45 seconds after
 * the first one with computer players filling the rest. If fewer than MIN_TOURNAMENT_FIELD people
 * registered, computer players make up the difference so a table can run.
 *
 * Entrants play at tables of up to six. Blinds rise on a shared clock. After each hand, busted players
 * get their place, tables are balanced, and the field merges to a final table. Prizes are points.
 */

const LEVEL_MS = Number(process.env.TOURNEY_LEVEL_MS ?? 4 * 60_000)
const SNG_WAIT_MS = 45_000

interface Entrant {
  key: string
  userId: string | null
  name: string
  avatar: string
  bot?: string
  chips: number
  tableId: string | null
  place: number | null
}

interface Tourney {
  key: string
  def: TournamentDef
  entrants: Entrant[]
  tables: Map<string, TableRunner>
  level: number
  startedAt: number
  remaining: number
  finished: boolean
  prizes: number[]
}

export const running = new Map<string, Tourney>()
const sngQueue: { userId: string; at: number }[] = []

const keyFor = (def: TournamentDef, at: number) => `${def.id}:${at}`

/* ---------------------------------------------------------------- registration */

export function register(userId: string, id: string): string {
  const def = tournament(id)
  if (!def) throw new Error('No such tournament')
  if (def.schedule.kind === 'now') {
    if (!sngQueue.some((q) => q.userId === userId)) sngQueue.push({ userId, at: Date.now() })
    hub.send(userId, { type: 'SNG_QUEUE', waiting: sngQueue.length })
    checkSng()
    return 'queued'
  }
  const at = nextStart(def)!
  run('INSERT OR IGNORE INTO tournament_regs (tournament_key, user_id, at) VALUES (?, ?, ?)', keyFor(def, at), userId, Date.now())
  return keyFor(def, at)
}

export function unregister(userId: string, id: string) {
  const def = tournament(id)
  if (!def) return
  if (def.schedule.kind === 'now') {
    const i = sngQueue.findIndex((q) => q.userId === userId)
    if (i >= 0) sngQueue.splice(i, 1)
    return
  }
  run('DELETE FROM tournament_regs WHERE user_id = ? AND tournament_key = ?', userId, keyFor(def, nextStart(def)!))
}

export function listing(userId: string | null) {
  return TOURNAMENTS.map((def) => {
    const at = nextStart(def)
    const key = at ? keyFor(def, at) : null
    const regs = key ? one<{ c: number }>('SELECT COUNT(*) AS c FROM tournament_regs WHERE tournament_key = ?', key)!.c : sngQueue.length
    const live = [...running.values()].find((t) => t.def.id === def.id && !t.finished)
    const mine = userId ? [...running.values()].find((t) => !t.finished && t.entrants.some((e) => e.userId === userId && e.place == null)) : undefined
    return {
      id: def.id,
      startsAt: at,
      registered: regs,
      isRegistered: !!userId && (key ? !!one('SELECT 1 FROM tournament_regs WHERE tournament_key = ? AND user_id = ?', key, userId) : sngQueue.some((q) => q.userId === userId)),
      live: live ? { key: live.key, remaining: live.remaining, field: live.entrants.length, level: live.level } : null,
      playing: mine?.def.id === def.id ? mine.key : null,
    }
  })
}

/* ---------------------------------------------------------------- start */

function checkSng() {
  const def = tournament('turbo')!
  if (!sngQueue.length) return
  const full = sngQueue.length >= 6
  const waited = Date.now() - sngQueue[0].at > SNG_WAIT_MS
  if (!full && !waited) return
  const players = sngQueue.splice(0, 6).map((q) => q.userId)
  start(def, `turbo:${Date.now()}`, players, 6)
}

function start(def: TournamentDef, key: string, userIds: string[], minField: number) {
  const humans = userIds.map((id) => ({ u: userById(id), p: profileOf(id) })).filter((x) => x.u && x.p && x.u.status === 'active')
  if (!humans.length) return
  const entrants: Entrant[] = humans.map(({ u, p }) => ({ key: u!.id, userId: u!.id, name: u!.handle, avatar: p!.avatar, chips: def.startingStack, tableId: null, place: null }))
  let n = Math.floor(Math.random() * 40)
  while (entrants.length < Math.min(def.field, minField)) {
    const f = fieldPlayer(n)
    entrants.push({ key: `bot${n}`, userId: null, name: f.name, avatar: f.avatar, bot: f.style, chips: def.startingStack, tableId: null, place: null })
    n++
  }
  const t: Tourney = { key, def, entrants, tables: new Map(), level: 0, startedAt: Date.now(), remaining: entrants.length, finished: false, prizes: payoutsFor(def, entrants.length) }
  running.set(key, t)
  // shuffle and deal into tables of up to six, as evenly as possible
  entrants.sort(() => Math.random() - 0.5)
  const count = Math.ceil(entrants.length / 6)
  for (let k = 0; k < count; k++) makeTable(t)
  const ts = [...t.tables.values()]
  entrants.forEach((e, i) => seatEntrant(t, ts[i % count], e))
  for (const h of humans) {
    updateProfile(h.u!.id, (p) => {
      p.statsObj.tournaments++
      p.missionsObj.progress.tourney = (p.missionsObj.progress.tourney ?? 0) + 1
    })
    hub.send(h.u!.id, { type: 'TABLE_ASSIGNED', tableId: entrants.find((e) => e.userId === h.u!.id)!.tableId, mode: 'tournament' })
    hub.send(h.u!.id, { type: 'ME_CHANGED' })
  }
  for (const r of ts) {
    r.dealerLine(`${def.name} is underway: ${entrants.length} players, ${def.startingStack.toLocaleString('en-IN')} chips each.`)
    r.start()
  }
  log('info', { event: 'tournament_start', key, field: entrants.length, humans: humans.length })
}

/** Prize table scaled to the real field: top ~10%, at least 2 places. */
function payoutsFor(def: TournamentDef, field: number): number[] {
  const scaled = { ...def, field, prizePool: Math.round((def.prizePool * Math.min(field, def.field)) / def.field / 100) * 100 || def.prizePool }
  // small fields still pay a meaningful pool
  if (field < def.field) scaled.prizePool = Math.max(scaled.prizePool, Math.round(def.prizePool * 0.2))
  const p = payouts(scaled)
  return field <= 6 ? p.slice(0, Math.max(2, Math.min(3, field - 1))) : p
}

function makeTable(t: Tourney): TableRunner {
  const id = `${t.def.id}-${randomBytes(3).toString('hex')}`
  const [sb, bb] = BLIND_LEVELS[t.level]
  const r = new TableRunner(id, 'tournament', `${t.def.name}`, [sb, bb], 6, TURN_MS, {
    betweenHands: (x) => afterHand(t, x),
    extra: () => ({ tourney: { key: t.key, id: t.def.id, name: t.def.name, level: t.level, remaining: t.remaining, field: t.entrants.length, nextLevelAt: t.startedAt + (t.level + 1) * LEVEL_MS, finished: t.finished } }),
  })
  t.tables.set(id, r)
  tables.set(id, r)
  return r
}

function seatEntrant(t: Tourney, r: TableRunner, e: Entrant) {
  const i = r.freeSeat()
  r.seat(i, { userId: e.userId, name: e.name, avatar: e.avatar, stack: e.chips, bot: e.bot as never })
  e.tableId = r.id
  if (e.userId) {
    seatedAt.set(e.userId, r.id)
    hub.send(e.userId, { type: 'TABLE_ASSIGNED', tableId: r.id, mode: 'tournament' })
  }
}

/* ---------------------------------------------------------------- between hands */

function entrantAt(t: Tourney, r: TableRunner, seat: number) {
  const o = r.owners[seat]
  const s = r.state.seats[seat]
  if (!o || !s) return undefined
  return t.entrants.find((e) => e.tableId === r.id && (o.userId ? e.userId === o.userId : !e.userId && e.name === s.name))
}

function afterHand(t: Tourney, r: TableRunner) {
  if (t.finished) return
  // blind clock
  const level = Math.min(BLIND_LEVELS.length - 1, Math.floor((Date.now() - t.startedAt) / LEVEL_MS))
  if (level !== t.level) {
    t.level = level
    for (const x of t.tables.values()) {
      x.setBlinds(...BLIND_LEVELS[level])
      x.dealerLine(`Blinds up: ${BLIND_LEVELS[level][0].toLocaleString('en-IN')}/${BLIND_LEVELS[level][1].toLocaleString('en-IN')}`)
    }
  }
  // bust-outs (players busted in the same hand share the better place in order of seat)
  const busted: number[] = []
  r.state.seats.forEach((s, i) => {
    if (s && s.stack === 0) busted.push(i)
  })
  for (const i of busted) {
    const e = entrantAt(t, r, i)
    r.unseat(i)
    r.owners[i] = null
    r.state = { ...r.state, seats: r.state.seats.map((x, j) => (j === i ? null : x)) }
    if (!e) continue
    e.place = t.remaining
    e.chips = 0
    e.tableId = null
    t.remaining--
    finishEntrant(t, e)
  }
  for (const [i, s] of r.state.seats.entries()) {
    const e = s ? entrantAt(t, r, i) : undefined
    if (e && s) e.chips = s.stack
  }
  if (t.remaining <= 1) return finish(t)
  balance(t, r)
}

/** Move players from this table to keep tables within one seat of each other; break tables toward a final table. */
function balance(t: Tourney, r: TableRunner) {
  const live = [...t.tables.values()].filter((x) => !x.closed)
  const count = (x: TableRunner) => x.state.seats.filter(Boolean).length
  const needed = Math.ceil(t.remaining / 6)
  // break this table if there are more tables than needed (it's between hands, so its players can move)
  if (live.length > needed) {
    const others = live.filter((x) => x !== r)
    const movers = r.state.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
    for (const i of movers) {
      const dest = others.filter((x) => x.freeSeat() >= 0).sort((a, b) => count(a) - count(b))[0]
      if (!dest) break
      move(t, r, i, dest)
    }
    if (!r.state.seats.some(Boolean)) {
      t.tables.delete(r.id)
      tables.delete(r.id)
      r.close()
    }
    return
  }
  const smallest = live.filter((x) => x !== r).sort((a, b) => count(a) - count(b))[0]
  if (smallest && count(r) - count(smallest) >= 2 && smallest.freeSeat() >= 0) {
    const i = r.state.seats.findIndex((s, k) => s && k !== r.state.dealer)
    if (i >= 0) move(t, r, i, smallest)
  }
  if (live.length === 1) r.dealerLine(t.remaining <= 6 ? `Final table! ${t.remaining} players left.` : `${t.remaining} players left.`)
}

function move(t: Tourney, from: TableRunner, seat: number, to: TableRunner) {
  const e = entrantAt(t, from, seat)
  const s = from.state.seats[seat]!
  from.owners[seat] = null
  from.state = { ...from.state, seats: from.state.seats.map((x, j) => (j === seat ? null : x)) }
  if (e?.userId) from.watchers.delete(e.userId)
  if (!e) return
  e.chips = s.stack
  seatEntrant(t, to, e)
  to.dealerLine(`${e.name} moves to this table`)
}

function finishEntrant(t: Tourney, e: Entrant) {
  const prize = e.place && e.place <= t.prizes.length ? t.prizes[e.place - 1] : 0
  if (!e.userId) return
  const id = `${t.key}:${e.userId}`
  try {
    run('INSERT OR IGNORE INTO tournament_results (id, tournament_key, tournament_id, name, user_id, place, field, prize, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, t.key, t.def.id, t.def.name, e.userId, e.place, t.entrants.length, prize, Date.now())
    if (prize > 0) grant(e.userId, 'MISSION_REWARD', prize, `${t.def.name} · place ${e.place}`, `tourney:${id}`)
    updateProfile(e.userId, (p) => {
      p.xp += prize > 0 ? 200 : 60
      if (prize > 0) {
        p.statsObj.tourneyCashes++
        unlock(e.userId!, p.achObj, 'tournament-pro')
      }
      if (e.place === 1) {
        p.statsObj.tourneyWins++
        unlock(e.userId!, p.achObj, 'champion')
      }
    })
    notify(e.userId, e.place === 1 ? `You won the ${t.def.name}!` : `${t.def.name}: you finished #${e.place}`, prize > 0 ? `+${prize.toLocaleString('en-IN')} points` : 'Better luck next time')
  } catch (err) {
    log('error', { where: 'tourney_result', key: t.key, error: String(err) })
  }
  if (seatedAt.get(e.userId)?.startsWith(t.def.id)) seatedAt.delete(e.userId)
  hub.send(e.userId, { type: 'TOURNEY_RESULT', key: t.key, name: t.def.name, place: e.place, field: t.entrants.length, prize })
  hub.send(e.userId, { type: 'ME_CHANGED' })
}

function finish(t: Tourney) {
  t.finished = true
  const winner = t.entrants.find((e) => e.place == null)
  if (winner) {
    winner.place = 1
    finishEntrant(t, winner)
  }
  for (const r of t.tables.values()) {
    r.dealerLine(`${winner?.name ?? 'Someone'} wins the ${t.def.name}!`)
    r.broadcast()
    setTimeout(() => {
      tables.delete(r.id)
      r.close()
    }, 8000)
  }
  setTimeout(() => running.delete(t.key), 60_000)
  log('info', { event: 'tournament_end', key: t.key, winner: winner?.name })
}

/** A player leaving a tournament table stays registered: their seat keeps posting and folding until they return. */
export function rejoinTourney(userId: string) {
  for (const t of running.values()) {
    const e = t.entrants.find((x) => x.userId === userId && x.place == null && x.tableId)
    if (e) return e.tableId
  }
  return null
}

/* ---------------------------------------------------------------- scheduler */

const started = new Set<string>()
setInterval(() => {
  checkSng()
  const now = Date.now()
  // a registration key whose start time has passed starts now
  for (const r of all<{ tournament_key: string }>('SELECT DISTINCT tournament_key FROM tournament_regs')) {
    const [id, at] = r.tournament_key.split(':')
    if (Number(at) > now || started.has(r.tournament_key)) continue
    started.add(r.tournament_key)
    const def = tournament(id)
    const users = all<{ user_id: string }>('SELECT user_id FROM tournament_regs WHERE tournament_key = ?', r.tournament_key).map((x) => x.user_id)
    run('DELETE FROM tournament_regs WHERE tournament_key = ?', r.tournament_key)
    if (!def || now - Number(at) > 15 * 60_000) continue // missed while the server was down
    start(def, r.tournament_key, users, config.minTournamentField)
  }
  // 10-minute heads-up for registered players
  for (const def of TOURNAMENTS) {
    const at = nextStart(def)
    if (!at || at - now > 10 * 60_000 || at - now < 9 * 60_000) continue
    for (const r of all<{ user_id: string }>('SELECT user_id FROM tournament_regs WHERE tournament_key = ?', keyFor(def, at))) hub.send(r.user_id, { type: 'TOURNEY_SOON', id: def.id, startsAt: at })
  }
}, 5000).unref()

