import { decideBot, type BotStyle } from '../../../src/games/poker/engine/bot'
import { evaluate } from '../../../src/games/poker/engine/evaluator'
import type { Card } from '../../../src/games/poker/engine/cards'
import { act, canStartHand, createTable, foldOut, holeCards, isLive, legalActions, publicView, setBlinds, sitDown, startHand, timeout, type HandInput, type HandRecord, type PlayerAction, type TableState } from '../../../src/games/poker/engine/table'
import { run, tx } from '../db'
import { grant, unlock, updateProfile } from '../accounts'
import { hub } from './hub'
import { log } from '../http'

/*
 * One authoritative table. Only this object holds the deck and hole cards. Every viewer receives
 * TABLE_SNAPSHOT (public view) after each change, and each seated player receives PRIVATE_CARDS for
 * their own seat only. Hands are persisted with their event log and replay record, and settle into the
 * points ledger exactly once (ledger correlation id = hand id).
 */

export type RunnerMode = 'classic' | 'vip' | 'friends' | 'tournament'

export interface SeatOwner {
  userId: string | null
  bot?: BotStyle
  /** consecutive turns lost to the clock */
  timeouts: number
  /** set when a human replaces this bot after the hand */
  leaving?: boolean
}

export interface RunnerHooks {
  /** after every settled hand, before the next one is dealt */
  betweenHands?: (r: TableRunner) => void
  /** extra public info sent with every snapshot (tournament clock etc.) */
  extra?: () => Record<string, unknown>
  onEmpty?: (r: TableRunner) => void
}

const AWAY_TIMEOUT_MS = 2500

export class TableRunner {
  state: TableState
  owners: (SeatOwner | null)[]
  watchers = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private record: HandRecord | null = null
  private settled = 0
  private recent = new Map<string, { ok: boolean; code?: string }>()
  private chatLog: string[] = []
  closed = false
  paused = false
  /** players waiting for a seat a regular is giving up */
  pending: { userId: string; name: string; avatar: string; stack: number }[] = []

  constructor(
    public id: string,
    public mode: RunnerMode,
    public name: string,
    blinds: [number, number],
    maxSeats: number,
    public turnMs: number,
    public hooks: RunnerHooks = {},
  ) {
    this.state = createTable({ tableId: id, name, smallBlind: blinds[0], bigBlind: blinds[1], turnMs, maxSeats })
    this.owners = Array.from({ length: maxSeats }, () => null)
  }

  /* ---------------------------------------------------------------- seats */

  seatOf(userId: string) {
    return this.owners.findIndex((o) => o?.userId === userId)
  }
  humans() {
    return this.owners.filter((o) => o?.userId).map((o) => o!.userId!) as string[]
  }
  freeSeat() {
    return this.state.seats.findIndex((s) => !s)
  }

  seat(index: number, p: { userId: string | null; name: string; avatar: string; stack: number; bot?: BotStyle }) {
    this.state = sitDown(this.state, index, { id: p.userId ?? `bot-${p.name}-${index}`, name: p.name, avatar: p.avatar, kind: p.userId ? 'remote' : 'bot', stack: p.stack })
    this.owners[index] = { userId: p.userId, bot: p.bot, timeouts: 0 }
    if (p.userId) this.watchers.add(p.userId)
    this.changed()
  }

  /** Free a seat. In a live hand the player folds first (settled like any hand) and the seat goes after it. */
  unseat(index: number): number {
    const seat = this.state.seats[index]
    if (!seat) return 0
    const owner = this.owners[index]
    if (owner?.userId) this.watchers.delete(owner.userId)
    if (isLive(this.state) && seat.inHand) {
      const next = foldOut(this.state, index, Date.now())
      if (next !== this.state) {
        this.record?.inputs.push({ kind: 'act', seat: index, action: { type: 'fold' }, now: Date.now() })
        this.commit(next)
      }
    }
    if (isLive(this.state) && this.state.seats[index]?.inHand) {
      // still part of the running hand's pots: leave after it
      this.state = { ...this.state, seats: this.state.seats.map((x, j) => (j === index && x ? { ...x, sittingOut: true } : x)) }
      if (owner) owner.leaving = true
    } else {
      this.state = { ...this.state, seats: this.state.seats.map((x, j) => (j === index ? null : x)) }
      this.owners[index] = null
    }
    this.changed()
    return seat.stack
  }

  setStack(index: number, stack: number) {
    const seats = this.state.seats.slice()
    if (seats[index]) seats[index] = { ...seats[index]!, stack, sittingOut: false }
    this.state = { ...this.state, seats }
    this.changed()
  }

  setBlinds(sb: number, bb: number) {
    this.state = setBlinds(this.state, sb, bb)
  }

  /* ---------------------------------------------------------------- flow */

  start() {
    this.schedule()
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    for (const u of this.watchers) hub.send(u, { type: 'TABLE_CLOSED', tableId: this.id })
    this.watchers.clear()
  }

  private changed() {
    if (this.closed) return
    this.broadcast()
  }

  private schedule() {
    clearTimeout(this.timer)
    if (this.closed || this.paused) return
    const s = this.state
    if (s.phase === 'complete' || s.phase === 'waiting') {
      this.timer = setTimeout(() => this.nextHand(), s.phase === 'complete' ? (s.result?.uncontested ? 2600 : 4800) : 1500)
      return
    }
    if (!isLive(s) || s.active < 0) return
    const owner = this.owners[s.active]
    if (owner?.bot) {
      const v = s.version
      this.timer = setTimeout(() => {
        if (this.state.version !== v || this.state.active < 0) return
        this.input({ kind: 'act', seat: this.state.active, action: decideBot(this.state, this.state.active, owner.bot), now: Date.now() })
      }, 700 + Math.random() * 1100)
      return
    }
    const away = owner && (owner.timeouts >= 2 || (owner.userId && !hub.online(owner.userId)))
    const wait = away ? Math.min(AWAY_TIMEOUT_MS, s.deadline - Date.now()) : s.deadline - Date.now()
    this.timer = setTimeout(() => this.input({ kind: 'timeout', now: away ? s.deadline : Date.now() }), Math.max(30, wait + 20))
  }

  private input(i: HandInput): { ok: true } | { ok: false; code: string; reason: string } {
    if (i.kind === 'timeout') {
      const who = this.state.active
      const next = timeout(this.state, i.now)
      if (next === this.state) {
        this.schedule()
        return { ok: true }
      }
      this.record?.inputs.push(i)
      const o = this.owners[who]
      if (o) o.timeouts++
      this.commit(next)
      return { ok: true }
    }
    const r = act(this.state, i.seat, i.action, i.now)
    if (!r.ok) return r
    this.record?.inputs.push(i)
    const o = this.owners[i.seat]
    if (o) o.timeouts = 0
    this.commit(r.state)
    return { ok: true }
  }

  private commit(next: TableState) {
    const prevHand = this.state.handNo
    this.state = next
    if (next.handNo !== prevHand) this.sendHoles()
    if (next.phase === 'complete' && next.handNo !== this.settled) this.settle()
    this.broadcast()
    this.schedule()
  }

  private nextHand() {
    if (this.closed) return
    // replaced bots and players who left mid-hand go now
    this.owners.forEach((o, i) => {
      if (o?.leaving) {
        this.state = { ...this.state, seats: this.state.seats.map((x, j) => (j === i ? null : x)) }
        this.owners[i] = null
      }
    })
    this.state = { ...this.state, seats: this.state.seats.map((x, i) => (x && !this.owners[i] ? null : x)) }
    for (const p of this.pending.splice(0)) {
      const i = this.freeSeat()
      if (i >= 0) this.seat(i, p)
    }
    this.hooks.betweenHands?.(this)
    if (this.closed) return
    if (!this.humans().length && this.mode !== 'tournament') {
      this.hooks.onEmpty?.(this)
      return
    }
    if (!canStartHand(this.state)) {
      this.state = { ...this.state, phase: 'waiting', active: -1 }
      this.broadcast()
      this.timer = setTimeout(() => this.nextHand(), 2000)
      return
    }
    const start = this.state
    const now = Date.now()
    const next = startHand(start, now)
    const order = (next.events[0]?.payload.seats as number[]) ?? []
    const dealt: Card[] = []
    for (let r = 0; r < 2; r++) for (const i of order) dealt.push(next.holes[i][r])
    this.record = { start, deck: [...dealt, ...next.deck], startedAt: now, inputs: [] }
    run('INSERT OR REPLACE INTO hands (id, table_id, mode, started_at, record) VALUES (?, ?, ?, ?, ?)', this.handId(next.handNo), this.id, this.mode, now, JSON.stringify(this.record))
    this.commit(next)
  }

  handId(n = this.state.handNo) {
    return `${this.id}:${n}`
  }

  /* ---------------------------------------------------------------- settlement */

  private settle() {
    const s = this.state
    this.settled = s.handNo
    const res = s.result!
    const handId = this.handId()
    const contested = res.pots.filter((p) => !p.returned)
    try {
      tx(() => {
        run('UPDATE hands SET summary = ?, record = ? WHERE id = ?', JSON.stringify({ board: s.board, pots: res.pots, net: res.net, winners: res.winners }), JSON.stringify(this.record), handId)
        s.events.forEach((e, k) => run('INSERT OR IGNORE INTO hand_events (hand_id, sequence_no, event_type, payload, server_time) VALUES (?, ?, ?, ?, ?)', handId, k, e.type, JSON.stringify(e.payload), e.serverTimestamp))
        this.owners.forEach((o, i) => {
          const seat = s.seats[i]
          if (!o?.userId || !seat?.inHand) return
          const net = res.net[i] ?? 0
          const won = res.winners.includes(i)
          const hand = !res.uncontested && res.reveals[i] ? res.reveals[i].hand : null
          const pot = contested.reduce((t, p) => t + p.amount, 0)
          const summary = { id: handId, at: Date.now(), table: this.name, mode: this.mode, hole: s.holes[i] ?? [], board: s.board, hand, net, won, pot }
          run('INSERT OR IGNORE INTO player_hands (user_id, hand_id, at, summary) VALUES (?, ?, ?, ?)', o.userId, handId, Date.now(), JSON.stringify(summary))
          if ((this.mode === 'classic' || this.mode === 'vip') && net !== 0) grant(o.userId, 'HAND_SETTLEMENT', net, `${this.name} · ${won ? 'won' : 'lost'} hand`, handId)
          updateProfile(o.userId, (p) => {
            p.statsObj.hands++
            p.xp += won ? 30 : 10
            if (won) {
              p.statsObj.wins++
              p.statsObj.totalWon += Math.max(0, net)
              p.statsObj.biggestPot = Math.max(p.statsObj.biggestPot, pot)
            }
            if (won && !res.uncontested) p.statsObj.showdowns++
            const m = p.missionsObj.progress
            m.play10 = (m.play10 ?? 0) + 1
            if (won) m.win3 = (m.win3 ?? 0) + 1
            if (won && !res.uncontested) m.showdown = (m.showdown ?? 0) + 1
            if (this.mode === 'friends') m.friends = (m.friends ?? 0) + 1
            if (p.statsObj.wins >= 25) unlock(o.userId!, p.achObj, 'poker-star')
            if (won && pot >= 50000) unlock(o.userId!, p.achObj, 'big-winner')
            if (hand === 'Royal Flush') unlock(o.userId!, p.achObj, 'royal')
            if (p.statsObj.hands >= 500) unlock(o.userId!, p.achObj, 'regular')
          })
          hub.send(o.userId, { type: 'ME_CHANGED' })
        })
      })
    } catch (e) {
      log('error', { where: 'settle', tableId: this.id, handId, error: String(e) })
    }
  }

  /* ---------------------------------------------------------------- messages */

  private sendHoles() {
    this.owners.forEach((o, i) => {
      if (o?.userId) hub.send(o.userId, { type: 'PRIVATE_CARDS', tableId: this.id, handId: this.state.handNo, cards: holeCards(this.state, i) })
    })
  }

  snapshot() {
    return { type: 'TABLE_SNAPSHOT', tableId: this.id, mode: this.mode, name: this.name, view: publicView(this.state), serverNow: Date.now(), ...(this.hooks.extra?.() ?? {}) }
  }

  broadcast() {
    if (this.closed) return
    const snap = this.snapshot()
    for (const u of this.watchers) hub.send(u, { ...snap, mySeat: this.seatOf(u) })
  }

  /** A viewer (re)connected: public state, plus their own cards if seated. */
  sync(userId: string) {
    hub.send(userId, { ...this.snapshot(), mySeat: this.seatOf(userId) })
    const i = this.seatOf(userId)
    if (i >= 0 && this.state.holes[i]) hub.send(userId, { type: 'PRIVATE_CARDS', tableId: this.id, handId: this.state.handNo, cards: holeCards(this.state, i) })
  }

  /** PLAYER_ACTION: membership, hand, version, duplicate id and turn are all checked before the engine. */
  action(userId: string, m: { handId: number; expectedStateVersion: number; clientActionId: string; action: PlayerAction }) {
    const reply = (ok: boolean, code?: string, reason?: string) => {
      this.recent.set(m.clientActionId, { ok, code })
      if (this.recent.size > 500) this.recent.delete(this.recent.keys().next().value!)
      hub.send(userId, ok ? { type: 'ACTION_ACCEPTED', tableId: this.id, clientActionId: m.clientActionId, version: this.state.version } : { type: 'ACTION_REJECTED', tableId: this.id, clientActionId: m.clientActionId, code, message: reason })
    }
    const prior = this.recent.get(m.clientActionId)
    if (prior) return hub.send(userId, prior.ok ? { type: 'ACTION_ACCEPTED', tableId: this.id, clientActionId: m.clientActionId, version: this.state.version, duplicate: true } : { type: 'ACTION_REJECTED', tableId: this.id, clientActionId: m.clientActionId, code: prior.code, duplicate: true })
    const i = this.seatOf(userId)
    if (i < 0) return reply(false, 'NOT_SEATED', 'You are not seated at this table')
    if (m.handId !== this.state.handNo || m.expectedStateVersion !== this.state.version) return reply(false, 'STALE_STATE', 'The table moved on')
    const a = m.action
    if (!a || !['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(a.type)) return reply(false, 'INVALID_ACTION', 'Unknown action')
    const r = this.input({ kind: 'act', seat: i, action: { type: a.type, amount: a.amount == null ? undefined : Number(a.amount) }, now: Date.now() })
    if (r.ok) reply(true)
    else reply(false, r.code, r.reason)
  }

  chat(userId: string, name: string, text: string) {
    const line = { id: Math.random().toString(36).slice(2), name, text, at: Date.now() }
    this.chatLog.push(`${name}: ${text}`)
    if (this.chatLog.length > 50) this.chatLog.shift()
    for (const u of this.watchers) if (!hub.blocks(u, userId)) hub.send(u, { type: 'CHAT_RECEIVED', tableId: this.id, line })
  }

  dealerLine(text: string) {
    const line = { id: Math.random().toString(36).slice(2), name: 'Dealer', text, at: Date.now(), system: true }
    for (const u of this.watchers) hub.send(u, { type: 'CHAT_RECEIVED', tableId: this.id, line })
  }

  emote(userId: string, emoji: string) {
    const seat = this.seatOf(userId)
    if (seat < 0) return
    for (const u of this.watchers) hub.send(u, { type: 'EMOTE', tableId: this.id, seat, emoji })
  }

  recentChat() {
    return this.chatLog.slice(-20)
  }

  legal(userId: string) {
    return legalActions(this.state, this.seatOf(userId))
  }

  describe() {
    return { id: this.id, mode: this.mode, name: this.name, blinds: [this.state.config.smallBlind, this.state.config.bigBlind], seats: this.state.seats.map((s, i) => (s ? { name: s.name, stack: s.stack, human: !!this.owners[i]?.userId } : null)), handNo: this.state.handNo, phase: this.state.phase, version: this.state.version }
  }

  /** Best hand name for a seat (used by the admin room inspector without exposing cards to players). */
  handName(i: number) {
    const h = this.state.holes[i]
    return h && this.state.board.length >= 3 ? evaluate([...h, ...this.state.board]).name : null
  }
}
