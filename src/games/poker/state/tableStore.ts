import { create } from 'zustand'
import { decideBot, type BotStyle } from '../engine/bot'
import { evaluate } from '../engine/evaluator'
import type { Card } from '../engine/cards'
import { act, canStartHand, createTable, holeCards, isLive, publicView, sitDown, startHand, timeout, type PlayerAction, type PublicTable, type TableState } from '../engine/table'
import { REGULARS, type Regular } from '../data/regulars'
import { TURN_MS, tier, tournament, type TableMode, type TournamentDef } from '../data/tables'
import { currentProfile } from './profileStore'
import { onLive, send } from '../net/live'
import { pokerSfx } from '../ui/sound'

/*
 * The table this device shows.
 *
 * - server (classic, VIP, private rooms, tournaments): the club server deals and decides everything. This
 *   store mirrors TABLE_SNAPSHOT and the player's own PRIVATE_CARDS, and sends action intents carrying the
 *   hand id, expected state version and a client action id.
 * - solo (practice only): the same engine runs on this device against the regulars, so practice works
 *   offline and never touches points.
 *
 * The UI reads only `view` + `myHole` in both cases.
 */

export interface ChatLine {
  id: string
  name: string
  text: string
  at: number
  system?: boolean
}

export interface TourneyState {
  def: TournamentDef
  level: number
  remaining: number
  field: number
  place: number | null
  prize: number
  finished: boolean
  nextLevelAt?: number
}

export type Connection = 'ok' | 'reconnecting' | 'lost'

interface PokerTableState {
  open: boolean
  mode: TableMode
  role: 'solo' | 'server'
  tableId: string | null
  tableName: string
  view: PublicTable | null
  clockOffset: number
  myIndex: number
  myHole: Card[]
  myHoleHand: number
  chat: ChatLine[]
  emotes: { seat: number; emoji: string; at: number }[]
  pending: boolean
  notice: { text: string; at: number } | null
  tourney: TourneyState | null
  connection: Connection
  busted: boolean
}

const INITIAL: PokerTableState = {
  open: false,
  mode: 'practice',
  role: 'solo',
  tableId: null,
  tableName: '',
  view: null,
  clockOffset: 0,
  myIndex: -1,
  myHole: [],
  myHoleHand: 0,
  chat: [],
  emotes: [],
  pending: false,
  notice: null,
  tourney: null,
  connection: 'ok',
  busted: false,
}

export const usePokerTable = create<PokerTableState>(() => ({ ...INITIAL }))
const setT = (patch: Partial<PokerTableState>) => usePokerTable.setState(patch)

const pushChat = (line: ChatLine) => usePokerTable.setState((s) => ({ chat: [...s.chat.slice(-60), line] }))
const showEmote = (seat: number, emoji: string) => usePokerTable.setState((s) => ({ emotes: [...s.emotes.filter((x) => Date.now() - x.at < 3000), { seat, emoji: String(emoji).slice(0, 4), at: Date.now() }] }))

/* ================================================================= server tables */

/** Called when the server seats us (SIT, room start, tournament start or a reconnect). */
export function openServerTable(tableId: string, mode: TableMode) {
  const st = usePokerTable.getState()
  if (st.open && st.tableId === tableId) return
  setT({ ...INITIAL, open: true, role: 'server', tableId, mode, tableName: '', connection: 'ok' })
  send({ type: 'JOIN_TABLE', tableId })
}

function applySnapshot(m: Record<string, unknown>) {
  const st = usePokerTable.getState()
  if (!st.open || st.role !== 'server' || m.tableId !== st.tableId) return
  const view = m.view as PublicTable
  if (st.view && view.handNo === st.view.handNo && view.version < st.view.version) return // stale
  if (st.view && view.handNo === st.view.handNo && view.board.length > st.view.board.length) pokerSfx.flip()
  if (view.handNo !== st.view?.handNo && view.handNo > 0 && view.phase !== 'complete') pokerSfx.deal()
  if (view.phase === 'complete' && st.view?.phase !== 'complete' && view.result?.winners.includes(Number(m.mySeat))) pokerSfx.win()
  const prevLast = st.view?.seats.map((s) => s?.last?.type).join()
  const nowLast = view.seats.map((s) => s?.last?.type).join()
  if (prevLast !== nowLast && st.view?.handNo === view.handNo) pokerSfx.chips()
  const t = m.tourney as (Omit<TourneyState, 'def'> & { id: string }) | undefined
  const def = t ? tournament(t.id) : undefined
  setT({
    view,
    tableName: String(m.name ?? st.tableName),
    myIndex: Number(m.mySeat ?? -1),
    clockOffset: Number(m.serverNow) - Date.now(),
    pending: false,
    connection: 'ok',
    busted: st.busted && (view.seats[Number(m.mySeat)]?.stack ?? 0) === 0,
    ...(t && def ? { tourney: { ...(st.tourney ?? { place: null, prize: 0 }), def, level: t.level, remaining: t.remaining, field: t.field, finished: st.tourney?.finished ?? false, nextLevelAt: t.nextLevelAt } } : {}),
  })
}

onLive((m) => {
  const st = usePokerTable.getState()
  switch (m.type) {
    case 'TABLE_SNAPSHOT':
      return applySnapshot(m)
    case 'PRIVATE_CARDS':
      if (m.tableId === st.tableId) setT({ myHole: m.cards as Card[], myHoleHand: Number(m.handId) })
      return
    case 'ACTION_REJECTED':
      if (m.tableId === st.tableId && !m.duplicate) setT({ pending: false, notice: { text: String(m.message ?? m.code), at: Date.now() } })
      return
    case 'CHAT_RECEIVED':
      if (m.tableId === st.tableId) pushChat(m.line as ChatLine)
      return
    case 'EMOTE':
      if (m.tableId === st.tableId) showEmote(Number(m.seat), String(m.emoji))
      return
    case 'BUSTED':
      if (m.tableId === st.tableId) setT({ busted: true })
      return
    case 'TABLE_ASSIGNED':
      // tournaments move players between tables
      if (st.open && st.role === 'server' && st.mode === 'tournament' && m.mode === 'tournament' && m.tableId !== st.tableId) {
        setT({ tableId: String(m.tableId), view: null, myHole: [], myHoleHand: 0 })
        send({ type: 'JOIN_TABLE', tableId: m.tableId })
      }
      return
    case 'TOURNEY_RESULT':
      if (st.mode === 'tournament') {
        const def = tournament(String(m.key).split(':')[0]) ?? st.tourney?.def
        if (def) setT({ tourney: { ...(st.tourney ?? { level: 0, remaining: 0, field: Number(m.field), nextLevelAt: 0 }), def, field: Number(m.field), place: Number(m.place), prize: Number(m.prize), finished: true } as TourneyState })
      }
      return
    case 'TABLE_CLOSED':
      if (m.tableId === st.tableId && !st.tourney?.finished) setT({ notice: { text: String(m.reason ?? 'The table closed'), at: Date.now() }, connection: 'lost' })
      return
  }
})

/* ================================================================= practice (on this device) */

let T: TableState | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let botStyles: Record<number, BotStyle> = {}
let usedRegulars = new Set<string>()

const say = (text: string, name = 'Dealer', system = true) => pushChat({ id: Math.random().toString(36).slice(2), name, text, at: Date.now(), system })

function publish() {
  if (!T) return
  const me = usePokerTable.getState().myIndex
  setT({ view: publicView(T), clockOffset: 0, ...(me >= 0 && T.holes[me] ? { myHole: holeCards(T, me), myHoleHand: T.handNo } : {}) })
}

function commit(next: TableState) {
  const prev = T
  T = next
  if (prev && prev.board.length !== next.board.length) pokerSfx.flip()
  publish()
  if (next.phase === 'complete' && prev?.phase !== 'complete') onPracticeSettled(next)
  schedule()
}

function schedule() {
  clearTimeout(timer)
  if (!T || usePokerTable.getState().role !== 'solo' || !usePokerTable.getState().open) return
  const s = T
  if (s.phase === 'complete' || s.phase === 'waiting') {
    timer = setTimeout(nextHand, s.phase === 'complete' ? (s.result?.uncontested ? 2600 : 4600) : 1200)
    return
  }
  if (!isLive(s) || s.active < 0) return
  if (s.seats[s.active]!.kind === 'bot') {
    timer = setTimeout(() => {
      if (!T || T.version !== s.version) return
      const r = act(T, T.active, decideBot(T, T.active, botStyles[T.active] ?? 'balanced'), Date.now())
      if (r.ok) {
        const last = r.state.seats[s.active]?.last?.type
        if (last === 'fold') pokerSfx.fold()
        else if (last === 'check') pokerSfx.check()
        else pokerSfx.chips()
        commit(r.state)
      }
    }, 700 + Math.random() * 1100)
    return
  }
  timer = setTimeout(() => {
    if (!T) return
    const next = timeout(T, Date.now())
    if (next !== T) commit(next)
    else schedule()
  }, Math.max(50, s.deadline - Date.now() + 30))
}

function nextHand() {
  if (!T) return
  const t = tier('practice')!
  // busted regulars are replaced
  T.seats.forEach((x, i) => {
    if (x && x.kind === 'bot' && x.stack === 0) {
      say(`${x.name} left the table`)
      usedRegulars.delete(x.name)
      T = { ...T!, seats: T!.seats.map((y, j) => (j === i ? null : y)) }
      const r = pickRegular()
      T = seatBot(T!, i, r, Math.round(t.buyIn * (0.6 + Math.random() * 0.9)))
      say(`${r.name} joined the table`)
    }
  })
  const me = usePokerTable.getState().myIndex
  if (T.seats[me]?.stack === 0) {
    setT({ busted: true })
    return publish()
  }
  if (!canStartHand(T)) return publish()
  pokerSfx.deal()
  commit(startHand(T, Date.now()))
}

function onPracticeSettled(s: TableState) {
  const res = s.result!
  for (const p of res.pots) {
    if (p.returned) continue
    const names = p.winners.map((w) => s.seats[w]?.name ?? '?').join(' & ')
    const hand = !res.uncontested && p.winners[0] != null ? res.reveals[p.winners[0]]?.hand : null
    say(`${names} ${p.winners.length > 1 ? 'split' : 'wins'} ${p.amount.toLocaleString('en-IN')}${hand ? ` with ${hand}` : ''}`)
  }
  if (res.winners.includes(usePokerTable.getState().myIndex)) pokerSfx.win()
}

function pickRegular(): Regular {
  const free = REGULARS.filter((r) => !usedRegulars.has(r.name))
  const list = free.length ? free : REGULARS
  const r = list[Math.floor(Math.random() * list.length)]
  usedRegulars.add(r.name)
  return r
}

function seatBot(s: TableState, index: number, r: Regular, stack: number): TableState {
  botStyles[index] = r.style
  return sitDown(s, index, { id: `bot-${r.name}`, name: r.name, avatar: r.avatar, kind: 'bot', stack })
}

/** Practice table on this device (practice chips only). */
export function openPractice() {
  const t = tier('practice')!
  const p = currentProfile()
  clearTimeout(timer)
  botStyles = {}
  usedRegulars = new Set()
  setT({ ...INITIAL, open: true, role: 'solo', mode: 'practice', tableName: t.name, myIndex: 0 })
  let s = createTable({ tableId: `practice-${Date.now().toString(36)}`, name: t.name, smallBlind: t.smallBlind, bigBlind: t.bigBlind, turnMs: TURN_MS, maxSeats: t.opponents + 1 })
  s = sitDown(s, 0, { id: 'hero', name: p?.name ?? 'You', avatar: p?.avatar ?? 'akash', kind: 'human', stack: t.buyIn })
  for (let i = 1; i <= t.opponents; i++) s = seatBot(s, i, pickRegular(), Math.round(t.buyIn * (0.6 + Math.random() * 0.9)))
  T = s
  say(`Welcome to the ${t.name}. Practice chips only: your points are never used here.`)
  publish()
  schedule()
}

/* ================================================================= player intents */

let actionSeq = 0

export function heroAct(action: PlayerAction): string | null {
  const st = usePokerTable.getState()
  if (st.role === 'server') {
    const v = st.view
    if (!v || st.pending) return null
    if (v.active !== st.myIndex) return 'Not your turn'
    setT({ pending: true })
    send({ type: 'PLAYER_ACTION', tableId: st.tableId, handId: v.handNo, expectedStateVersion: v.version, clientActionId: `${st.myIndex}:${v.handNo}:${v.version}:${++actionSeq}`, action })
    return null
  }
  if (!T) return 'No table'
  const r = act(T, st.myIndex, action, Date.now())
  if (!r.ok) return r.reason
  const last = r.state.seats[st.myIndex]?.last?.type
  if (last === 'fold') pokerSfx.fold()
  else if (last === 'check') pokerSfx.check()
  else pokerSfx.chips()
  commit(r.state)
  return null
}

/** Take a fresh stack after busting (free: practice chips, or a new buy-in from points). */
export function rebuy(): string | null {
  const st = usePokerTable.getState()
  if (st.role === 'server') {
    send({ type: 'REBUY', tableId: st.tableId })
    setT({ busted: false })
    return null
  }
  if (!T) return null
  const seats = T.seats.slice()
  seats[st.myIndex] = { ...seats[st.myIndex]!, stack: tier('practice')!.buyIn }
  T = { ...T, seats }
  setT({ busted: false })
  publish()
  schedule()
  return null
}

export function sendChat(text: string) {
  const st = usePokerTable.getState()
  const clean = String(text).trim().slice(0, 120)
  if (!clean) return
  if (st.role === 'server') send({ type: 'CHAT_SEND', tableId: st.tableId, text: clean })
  else say(clean, currentProfile()?.name ?? 'You', false)
}

export function sendEmote(emoji: string) {
  const st = usePokerTable.getState()
  if (st.myIndex < 0) return
  if (st.role === 'server') send({ type: 'EMOTE', tableId: st.tableId, emoji })
  else showEmote(st.myIndex, emoji)
}

export function leaveTable() {
  const st = usePokerTable.getState()
  if (st.role === 'server' && st.tableId) send({ type: 'LEAVE_TABLE', tableId: st.tableId })
  clearTimeout(timer)
  T = null
  setT({ ...INITIAL })
}

/** Hand-strength label for the hero's cards. */
export function describeHand(hole: Card[], board: Card[]): string | null {
  if (hole.length < 2) return null
  if (board.length < 3) {
    const [a, b] = hole
    if (a[0] === b[0]) return 'Pocket Pair'
    return a[1] === b[1] ? 'Suited' : null
  }
  return evaluate([...hole, ...board]).name
}
