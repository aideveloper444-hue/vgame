import { freshDeck, shuffle, type Card } from './cards'
import { evaluate } from './evaluator'

/*
 * Authoritative No-Limit Texas Hold'em table. Pure functions: every transition clones the state, so a
 * hand can be replayed from its starting state, deck and inputs (see replayHand). Time is passed in, never
 * read, for the same reason.
 *
 * Only the device that owns the table (solo play, or the host of a friends' room) holds the full state.
 * Everyone else receives publicView() plus their own hole cards; the deck, burn cards and other players'
 * cards never leave this module except at showdown.
 */

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'complete'
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'

export interface PlayerAction {
  type: ActionType
  /** bet / raise: the total this seat will have in front of it on this street ("raise to") */
  amount?: number
}

export type SeatKind = 'human' | 'bot' | 'remote'

export interface Seat {
  id: string
  name: string
  avatar: string
  kind: SeatKind
  stack: number
  /** chips put in on the current street */
  bet: number
  /** chips put in over the whole hand */
  committed: number
  /** dealt into the current hand */
  inHand: boolean
  folded: boolean
  allIn: boolean
  /** raiseId when this seat last acted on this street, -1 if it has not acted */
  actedRaiseId: number
  last: { type: ActionType | 'sb' | 'bb' | 'timeout'; amount: number } | null
  sittingOut: boolean
}

export interface TableConfig {
  tableId: string
  name: string
  smallBlind: number
  bigBlind: number
  turnMs: number
  maxSeats: number
}

export interface PotResult {
  amount: number
  eligible: number[]
  winners: number[]
  /** an uncalled bet handed back to the only player who put it in */
  returned: boolean
}

export interface Reveal {
  cards: Card[]
  hand: string
  best: Card[]
}

export interface HandResult {
  pots: PotResult[]
  payouts: Record<number, number>
  net: Record<number, number>
  reveals: Record<number, Reveal>
  /** everyone else folded; no cards are shown */
  uncontested: boolean
  winners: number[]
}

export interface GameEvent {
  eventId: string
  tableId: string
  handId: number
  version: number
  type: 'HAND_STARTED' | 'BLINDS_POSTED' | 'ACTION_ACCEPTED' | 'BOARD_UPDATED' | 'TIMEOUT' | 'HAND_SETTLED'
  serverTimestamp: number
  payload: Record<string, unknown>
}

export interface TableState {
  config: TableConfig
  handNo: number
  version: number
  phase: Phase
  dealer: number
  sb: number
  bb: number
  active: number
  board: Card[]
  seats: (Seat | null)[]
  currentBet: number
  /** smallest legal raise increment */
  minRaise: number
  /** bumped on every full bet/raise; a short all-in does not bump it, so it does not reopen action */
  raiseId: number
  deadline: number
  result: HandResult | null
  /** public events of the current hand */
  events: GameEvent[]
  /* ---- private: never serialised to other players ---- */
  deck: Card[]
  burned: Card[]
  holes: Record<number, Card[]>
}

export type RejectCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'HAND_NOT_LIVE' | 'STALE_STATE'
export type ActResult = { ok: true; state: TableState } | { ok: false; code: RejectCode; reason: string }

/* ------------------------------------------------------------------ setup */

export function createTable(config: TableConfig): TableState {
  return {
    config,
    handNo: 0,
    version: 0,
    phase: 'waiting',
    dealer: -1,
    sb: -1,
    bb: -1,
    active: -1,
    board: [],
    seats: Array.from({ length: config.maxSeats }, () => null),
    currentBet: 0,
    minRaise: config.bigBlind,
    raiseId: 0,
    deadline: 0,
    result: null,
    events: [],
    deck: [],
    burned: [],
    holes: {},
  }
}

export function sitDown(state: TableState, index: number, p: Pick<Seat, 'id' | 'name' | 'avatar' | 'kind' | 'stack'>): TableState {
  const s = structuredClone(state)
  if (s.seats[index]) throw new Error('seat taken')
  s.seats[index] = { ...p, bet: 0, committed: 0, inHand: false, folded: false, allIn: false, actedRaiseId: -1, last: null, sittingOut: false }
  s.version++
  return s
}

/** Fold a seat out of the live hand (leaving, disconnect). The seat itself stays until the hand is over. */
export function foldOut(state: TableState, index: number, now: number): TableState {
  const seat = state.seats[index]
  if (!seat || !isLive(state) || !seat.inHand || seat.folded) return state
  if (state.active === index) {
    const r = act(state, index, { type: 'fold' }, now)
    return r.ok ? r.state : state
  }
  let s = structuredClone(state)
  s.seats[index]!.folded = true
  s.seats[index]!.last = { type: 'fold', amount: 0 }
  s.version++
  // the turn stays where it is unless that fold ended the hand
  if (s.seats.filter(inPlay).length <= 1) s = settle(s, now)
  return s
}

/** Leaving mid-hand folds the seat first; the seat is freed once the hand is over. */
export function standUp(state: TableState, index: number, now: number): TableState {
  if (!state.seats[index]) return state
  let s = structuredClone(foldOut(state, index, now))
  if (isLive(s) && s.seats[index]?.inHand) s.seats[index]!.sittingOut = true
  else s.seats[index] = null
  s.version++
  return s
}

/** Between hands: seats that left mid-hand are cleared. */
export function clearLeavers(state: TableState): TableState {
  const s = structuredClone(state)
  s.seats = s.seats.map((x) => (x && x.sittingOut && x.inHand ? null : x))
  return s
}

export function setBlinds(state: TableState, smallBlind: number, bigBlind: number): TableState {
  const s = structuredClone(state)
  s.config.smallBlind = smallBlind
  s.config.bigBlind = bigBlind
  return s
}

/* ------------------------------------------------------------------ helpers */

export const isLive = (s: TableState) => s.phase === 'preflop' || s.phase === 'flop' || s.phase === 'turn' || s.phase === 'river'

const canAct = (x: Seat | null): x is Seat => !!x && x.inHand && !x.folded && !x.allIn
const inPlay = (x: Seat | null): x is Seat => !!x && x.inHand && !x.folded

function nextIndex(s: TableState, from: number, pred: (x: Seat | null, i: number) => boolean): number {
  const n = s.seats.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n
    if (pred(s.seats[i], i)) return i
  }
  return -1
}

function needsAction(s: TableState, x: Seat | null): boolean {
  return canAct(x) && (x.actedRaiseId === -1 || x.actedRaiseId !== s.raiseId || x.bet < s.currentBet)
}

function put(seat: Seat, amount: number) {
  const a = Math.min(amount, seat.stack)
  seat.stack -= a
  seat.bet += a
  seat.committed += a
  if (seat.stack === 0) seat.allIn = true
  return a
}

function emit(s: TableState, type: GameEvent['type'], now: number, payload: Record<string, unknown> = {}) {
  s.version++
  s.events.push({
    eventId: `${s.config.tableId}:${s.handNo}:${s.events.length}`,
    tableId: s.config.tableId,
    handId: s.handNo,
    version: s.version,
    type,
    serverTimestamp: now,
    payload,
  })
}

export const potTotal = (s: TableState) => s.seats.reduce((t, x) => t + (x ? x.committed : 0), 0)

/* ------------------------------------------------------------------ hand start */

export function canStartHand(s: TableState): boolean {
  return s.seats.filter((x) => x && x.stack > 0 && !x.sittingOut).length >= 2
}

export function startHand(state: TableState, now: number, deck: Card[] = shuffle(freshDeck())): TableState {
  const s = structuredClone(clearLeavers(state))
  const playing = (x: Seat | null) => !!x && x.stack > 0 && !x.sittingOut
  if (s.seats.filter(playing).length < 2) {
    s.phase = 'waiting'
    s.active = -1
    return s
  }
  s.handNo++
  s.events = []
  s.board = []
  s.burned = []
  s.holes = {}
  s.result = null
  s.currentBet = 0
  s.raiseId = 0
  s.minRaise = s.config.bigBlind
  for (const x of s.seats) {
    if (!x) continue
    Object.assign(x, { bet: 0, committed: 0, folded: false, allIn: false, actedRaiseId: -1, last: null, inHand: playing(x) })
  }
  const dealt = (x: Seat | null) => !!x && x.inHand
  s.dealer = nextIndex(s, s.dealer, dealt)
  const headsUp = s.seats.filter(dealt).length === 2
  // heads-up: the button posts the small blind and acts first before the flop
  s.sb = headsUp ? s.dealer : nextIndex(s, s.dealer, dealt)
  s.bb = nextIndex(s, s.sb, dealt)

  const sbSeat = s.seats[s.sb]!
  const bbSeat = s.seats[s.bb]!
  const sbAmt = put(sbSeat, s.config.smallBlind)
  sbSeat.last = { type: 'sb', amount: sbAmt }
  const bbAmt = put(bbSeat, s.config.bigBlind)
  bbSeat.last = { type: 'bb', amount: bbAmt }
  s.currentBet = s.config.bigBlind

  // two cards each, one at a time, starting left of the button
  s.deck = deck.slice()
  const order: number[] = []
  for (let i = nextIndex(s, s.dealer, dealt), k = 0; k < s.seats.filter(dealt).length; k++, i = nextIndex(s, i, dealt)) order.push(i)
  for (let round = 0; round < 2; round++) for (const i of order) (s.holes[i] ??= []).push(s.deck.shift()!)

  s.phase = 'preflop'
  emit(s, 'HAND_STARTED', now, { dealer: s.dealer, sb: s.sb, bb: s.bb, seats: order, blinds: [s.config.smallBlind, s.config.bigBlind] })
  emit(s, 'BLINDS_POSTED', now, { sb: [s.sb, sbAmt], bb: [s.bb, bbAmt] })

  s.active = -1
  const first = nextIndex(s, s.bb, (x) => needsAction(s, x))
  if (first < 0) return finishRound(s, now)
  s.active = first
  s.deadline = now + s.config.turnMs
  return s
}

/* ------------------------------------------------------------------ actions */

export interface Legal {
  stack: number
  toCall: number
  callAmount: number
  canCheck: boolean
  canCall: boolean
  canRaise: boolean
  /** true when nobody has bet this street (the aggressive action is a "bet", not a "raise") */
  isBet: boolean
  minTo: number
  maxTo: number
  canAllIn: boolean
}

export function legalActions(s: TableState, i: number): Legal | null {
  const x = s.seats[i]
  if (!isLive(s) || s.active !== i || !canAct(x)) return null
  const toCall = Math.max(0, s.currentBet - x.bet)
  const maxTo = x.bet + x.stack
  const reopened = x.actedRaiseId === -1 || x.actedRaiseId !== s.raiseId
  const othersCanAct = s.seats.some((y, j) => j !== i && canAct(y))
  const canRaise = reopened && othersCanAct && maxTo > s.currentBet
  const fullMin = s.currentBet === 0 ? s.config.bigBlind : s.currentBet + s.minRaise
  return {
    stack: x.stack,
    toCall,
    callAmount: Math.min(toCall, x.stack),
    canCheck: toCall === 0,
    canCall: toCall > 0,
    canRaise,
    isBet: s.currentBet === 0,
    minTo: Math.min(fullMin, maxTo),
    maxTo,
    canAllIn: canRaise || x.stack <= toCall,
  }
}

export function act(state: TableState, i: number, action: PlayerAction, now: number, timedOut = false): ActResult {
  if (!isLive(state)) return { ok: false, code: 'HAND_NOT_LIVE', reason: 'No hand in progress' }
  if (state.active !== i) return { ok: false, code: 'NOT_YOUR_TURN', reason: 'Not your turn' }
  const legal = legalActions(state, i)
  if (!legal) return { ok: false, code: 'INVALID_ACTION', reason: 'Seat cannot act' }
  const s = structuredClone(state)
  const x = s.seats[i]!
  let paid = 0

  switch (action.type) {
    case 'fold':
      x.folded = true
      break
    case 'check':
      if (!legal.canCheck) return { ok: false, code: 'INVALID_ACTION', reason: 'Cannot check facing a bet' }
      break
    case 'call':
      if (!legal.canCall) return { ok: false, code: 'INVALID_ACTION', reason: 'Nothing to call' }
      paid = put(x, legal.callAmount)
      break
    case 'bet':
    case 'raise':
    case 'allin': {
      const to = action.type === 'allin' ? legal.maxTo : Math.floor(Number(action.amount))
      if (!Number.isFinite(to)) return { ok: false, code: 'INVALID_ACTION', reason: 'Missing amount' }
      if (action.type === 'allin' && to <= s.currentBet) {
        // all-in for no more than the call: it is a call
        paid = put(x, x.stack)
        break
      }
      if (!legal.canRaise) return { ok: false, code: 'INVALID_ACTION', reason: 'Raising is not open to you' }
      if (action.type === 'bet' && !legal.isBet) return { ok: false, code: 'INVALID_ACTION', reason: 'There is already a bet; raise instead' }
      if (action.type === 'raise' && legal.isBet) return { ok: false, code: 'INVALID_ACTION', reason: 'Nothing to raise; bet instead' }
      if (to > legal.maxTo) return { ok: false, code: 'INVALID_ACTION', reason: 'Not enough points' }
      if (to < legal.minTo) return { ok: false, code: 'INVALID_ACTION', reason: `Minimum is ${legal.minTo}` }
      const increment = to - s.currentBet
      const full = s.currentBet === 0 ? to >= s.config.bigBlind : increment >= s.minRaise
      paid = put(x, to - x.bet)
      if (full) {
        s.minRaise = Math.max(increment, s.config.bigBlind)
        s.raiseId++
      }
      s.currentBet = Math.max(s.currentBet, x.bet)
      break
    }
    default:
      return { ok: false, code: 'INVALID_ACTION', reason: 'Unknown action' }
  }

  x.actedRaiseId = s.raiseId
  const shown: ActionType = x.allIn && action.type !== 'fold' ? 'allin' : action.type
  x.last = { type: timedOut ? 'timeout' : shown, amount: x.bet }
  emit(s, timedOut ? 'TIMEOUT' : 'ACTION_ACCEPTED', now, { seat: i, action: shown, paid, to: x.bet, pot: potTotal(s) })
  return { ok: true, state: advanceIfDone(s, now) }
}

/** The active player ran out of time: check when that is free, otherwise fold. */
export function timeout(state: TableState, now: number): TableState {
  if (!isLive(state) || state.active < 0 || now < state.deadline) return state
  const legal = legalActions(state, state.active)
  const r = act(state, state.active, { type: legal?.canCheck ? 'check' : 'fold' }, now, true)
  return r.ok ? r.state : state
}

/* ------------------------------------------------------------------ flow */

function advanceIfDone(s: TableState, now: number): TableState {
  if (!isLive(s)) return s
  if (s.seats.filter(inPlay).length <= 1) return settle(s, now)
  const next = nextIndex(s, s.active, (x) => needsAction(s, x))
  if (next >= 0) {
    s.active = next
    s.deadline = now + s.config.turnMs
    return s
  }
  return finishRound(s, now)
}

function dealStreet(s: TableState, now: number) {
  s.burned.push(s.deck.shift()!)
  const n = s.board.length === 0 ? 3 : 1
  for (let k = 0; k < n; k++) s.board.push(s.deck.shift()!)
  s.phase = s.board.length === 3 ? 'flop' : s.board.length === 4 ? 'turn' : 'river'
  emit(s, 'BOARD_UPDATED', now, { board: s.board.slice(), street: s.phase })
}

function finishRound(s: TableState, now: number): TableState {
  for (const x of s.seats) if (x) x.bet = 0
  s.currentBet = 0
  s.minRaise = s.config.bigBlind
  s.active = -1
  if (s.phase === 'river') return settle(s, now)
  // with at most one player still able to bet, deal the rest of the board straight out
  if (s.seats.filter(canAct).length <= 1) {
    while (s.board.length < 5) dealStreet(s, now)
    return settle(s, now)
  }
  dealStreet(s, now)
  s.raiseId++
  for (const x of s.seats) if (x) x.actedRaiseId = -1
  const first = nextIndex(s, s.dealer, (x) => needsAction(s, x))
  s.active = first
  s.deadline = now + s.config.turnMs
  return s
}

/* ------------------------------------------------------------------ settlement */

export function buildPots(s: TableState): { amount: number; eligible: number[]; contributors: number[] }[] {
  const contrib = s.seats.map((x) => (x && x.inHand ? x.committed : 0))
  const levels = [...new Set(contrib.filter((c) => c > 0))].sort((a, b) => a - b)
  const pots: { amount: number; eligible: number[]; contributors: number[] }[] = []
  let prev = 0
  for (const level of levels) {
    let amount = 0
    const contributors: number[] = []
    contrib.forEach((c, i) => {
      const part = Math.min(c, level) - Math.min(c, prev)
      if (part > 0) {
        amount += part
        contributors.push(i)
      }
    })
    const eligible = contributors.filter((i) => inPlay(s.seats[i]) && contrib[i] >= level)
    const last = pots[pots.length - 1]
    if (eligible.length === 0 && last) last.amount += amount
    else if (last && last.eligible.join() === eligible.join()) {
      last.amount += amount
      last.contributors = [...new Set([...last.contributors, ...contributors])]
    } else pots.push({ amount, eligible, contributors })
    prev = level
  }
  return pots
}

function settle(s: TableState, now: number): TableState {
  for (const x of s.seats) if (x) x.bet = 0
  s.active = -1
  const live = s.seats.map((x, i) => (inPlay(x) ? i : -1)).filter((i) => i >= 0)
  const uncontested = live.length === 1
  const reveals: Record<number, Reveal> = {}
  const scores: Record<number, number> = {}
  if (!uncontested) {
    for (const i of live) {
      const v = evaluate([...s.holes[i], ...s.board])
      scores[i] = v.score
      reveals[i] = { cards: s.holes[i].slice(), hand: v.name, best: v.best }
    }
  }
  // odd chips go to the first winner left of the button
  const fromButton = (i: number) => (i - s.dealer - 1 + s.seats.length) % s.seats.length
  const payouts: Record<number, number> = {}
  const pots: PotResult[] = []
  for (const p of buildPots(s)) {
    let winners: number[]
    if (p.eligible.length === 1) winners = p.eligible
    else {
      const top = Math.max(...p.eligible.map((i) => scores[i]))
      winners = p.eligible.filter((i) => scores[i] === top).sort((a, b) => fromButton(a) - fromButton(b))
    }
    const share = Math.floor(p.amount / winners.length)
    let odd = p.amount - share * winners.length
    for (const w of winners) {
      payouts[w] = (payouts[w] ?? 0) + share + (odd > 0 ? 1 : 0)
      if (odd > 0) odd--
    }
    pots.push({ amount: p.amount, eligible: p.eligible, winners, returned: p.contributors.length === 1 })
  }
  const net: Record<number, number> = {}
  s.seats.forEach((x, i) => {
    if (!x || !x.inHand) return
    x.stack += payouts[i] ?? 0
    net[i] = (payouts[i] ?? 0) - x.committed
    x.allIn = false
  })
  const contested = pots.filter((p) => !p.returned)
  const winners = [...new Set((contested.length ? contested : pots).flatMap((p) => p.winners))]
  s.result = { pots, payouts, net, reveals, uncontested, winners }
  s.phase = 'complete'
  emit(s, 'HAND_SETTLED', now, { pots: pots.map((p) => ({ amount: p.amount, winners: p.winners, returned: p.returned })), net, reveals, board: s.board.slice() })
  return s
}

/* ------------------------------------------------------------------ views & replay */

export type PublicSeat = Omit<Seat, never> & { cards: number }
export type PublicTable = Omit<TableState, 'deck' | 'burned' | 'holes' | 'seats'> & { seats: (PublicSeat | null)[]; pot: number }

/** Everything any player may see: no deck order, no burn cards, no hole cards except at showdown. */
export function publicView(s: TableState): PublicTable {
  const { deck: _d, burned: _b, holes, seats, ...rest } = s
  void _d
  void _b
  return {
    ...structuredClone(rest),
    seats: seats.map((x, i) => (x ? { ...x, cards: holes[i]?.length ?? 0 } : null)),
    pot: potTotal(s),
  }
}

export const holeCards = (s: TableState, i: number): Card[] => s.holes[i]?.slice() ?? []

export type HandInput = { kind: 'act'; seat: number; action: PlayerAction; now: number } | { kind: 'timeout'; now: number }

export interface HandRecord {
  start: TableState
  deck: Card[]
  startedAt: number
  inputs: HandInput[]
}

/** Deterministic reducer for audit and support: rebuild a hand from its start, deck and accepted inputs. */
export function replayHand(r: HandRecord): TableState {
  let s = startHand(r.start, r.startedAt, r.deck)
  for (const input of r.inputs) {
    if (input.kind === 'timeout') s = timeout(s, input.now)
    else {
      const res = act(s, input.seat, input.action, input.now)
      if (res.ok) s = res.state
    }
  }
  return s
}
