import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { makeId } from '@/lib/id'
import {
  ALL_CARDS,
  BOARD_SIZE,
  CHANCE_CARDS,
  ERECTION_NAMES,
  JAIL_TILE_ID,
  START_TILE_ID,
  TREASURY_CARDS,
  VARIANTS,
  buildBlocker,
  buildBoard,
  buildCost,
  isProperty,
  mortgageBlocker,
  mortgageValue,
  ownsFullGroup,
  ownsPartner,
  redeemCost,
  sellBlocker,
  type CardDef,
  type CityConfig,
  type CityTile,
  type Deck,
  type PropertyTile,
  type VariantId,
} from './cityBoardData'

// World Tycoon rules engine (rule book pages 4–8). Money moves between players, the Bank, the
// Grand Club pot (every tax, fine and penalty) and the Casino jackpot tray (every lost bet).

export type { CityConfig } from './cityBoardData'

export const CITY_PLAYER_COLORS = ['#3b82f6', '#ec4899', '#d946ef', '#eab308']

export interface CityPlayer {
  id: string
  name: string
  avatarEmoji: string
  color: string
  isBot: boolean
  cash: number
  position: number
  inJail: boolean
  /** Failed rolls so far in this Jail stay. */
  jailTurnsServed: number
  /** Get Out of Jail Free cards held (card ids). */
  freePasses: string[]
  bankrupt: boolean
}

export type CityPhase = 'ROLLING' | 'MOVING' | 'AWAITING_BUY_DECISION' | 'AUCTION' | 'CASINO' | 'POST_MOVE_ACTIONS' | 'GAME_OVER'

export interface AuctionState {
  tileId: number
  currentBid: number
  currentBidderId: string | null
  /** Bidders still in, the one to act first. */
  queue: string[]
}

export interface TradeOffer {
  id: string
  fromPlayerId: string
  toPlayerId: string
  offer: { cash: number; propertyIds: number[] }
  request: { cash: number; propertyIds: number[] }
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
}

export interface CityLogEntry {
  id: string
  icon: string
  text: string
  timestamp: number
}

export interface CityLastEvent {
  seq: number
  type: 'buy' | 'rent' | 'auction' | 'card' | 'event' | 'bankrupt' | 'upgrade' | 'trade' | 'casino' | 'club' | 'jail'
  text: string
  deck?: Deck
  cardId?: string
}

export interface CasinoResult {
  seq: number
  playerId: string
  roll: number
  outcome: 'JACKPOT' | 'PUSH' | 'LOSE'
  amount: number
}

export interface RankingEntry {
  playerId: string
  netWorth: number
}

interface CityState {
  tiles: CityTile[]
  players: CityPlayer[]
  currentPlayerIndex: number
  roundNumber: number
  dice: [number, number] | null
  /** Increments on every roll, so the dice can animate even when the faces repeat. */
  rollSeq: number
  phase: CityPhase
  pendingMovePath: number[] | null
  pendingTrades: TradeOffer[]
  auction: AuctionState | null
  lastEvent: CityLastEvent | null
  eventLog: CityLogEntry[]
  finalRanking: RankingEntry[] | null
  config: CityConfig
  /** Double sixes rolled in a row this turn. */
  doublesStreak: number
  /** The current player rolled a double six and rolls again after this move. */
  extraTurn: boolean
  decks: Record<Deck, string[]>
  /** Grand Club pot: every tax, fine and penalty. */
  clubPot: number
  /** Casino jackpot tray: every lost bet. */
  casinoTray: number
  casinoResult: CasinoResult | null

  startGame: (participants: { id: string; name: string; avatarEmoji: string; isBot: boolean }[], variant?: VariantId) => void
  rollAndMove: () => void
  completeMove: () => void
  resolveBuyDecision: (buy: boolean) => void
  submitAuctionAction: (playerId: string, action: 'BID' | 'PASS', raise?: number) => void
  casinoDecision: (bet: boolean) => void
  upgradeProperty: (tileId: number) => void
  sellBuilding: (tileId: number) => void
  mortgageProperty: (tileId: number) => void
  redeemProperty: (tileId: number) => void
  payJailFine: () => void
  useFreePass: () => void
  proposeTrade: (offer: Omit<TradeOffer, 'id' | 'status'>) => void
  respondToTrade: (tradeId: string, accept: boolean) => void
  endTurn: () => void
  resetGame: () => void
}

/* ------------------------------------------------------------------ pure helpers (also used by the UI and bots) */

export function buildingValue(t: PropertyTile, config: CityConfig): number {
  return t.level * buildCost(t, config)
}

export function netWorthOf(player: CityPlayer, tiles: CityTile[], config: CityConfig = VARIANTS.CLASSIC.config): number {
  if (player.bankrupt) return 0
  const props = tiles.filter((t): t is PropertyTile => isProperty(t) && t.ownerId === player.id)
  return player.cash + props.reduce((sum, t) => sum + (t.mortgaged ? t.basePrice - mortgageValue(t) : t.basePrice) + buildingValue(t, config), 0)
}

/** Rent printed on the deed: doubled on an empty city of a full colour set; companies pay more with their partner. */
export function computeRent(tile: PropertyTile, tiles: CityTile[]): number {
  if (tile.mortgaged || tile.ownerId === null) return 0
  if (tile.kind === 'COMPANY') return tile.rentTable[ownsPartner(tiles, tile) ? 1 : 0]
  if (tile.level > 0) return tile.rentTable[tile.level]
  return ownsFullGroup(tiles, tile) ? tile.rentTable[0] * 2 : tile.rentTable[0]
}

export function canBuildOn(player: CityPlayer, tile: PropertyTile, tiles: CityTile[], config: CityConfig): boolean {
  return tile.ownerId === player.id && buildBlocker(tiles, tile, config.evenBuild) === null && player.cash >= buildCost(tile, config)
}

/** Only undeveloped deeds change hands between players; mortgaged ones may. */
export function isTradable(tile: PropertyTile): boolean {
  return tile.level === 0
}

export function ownedBy(tiles: CityTile[], playerId: string): PropertyTile[] {
  return tiles.filter((t): t is PropertyTile => isProperty(t) && t.ownerId === playerId)
}

export function taxDue(tiles: CityTile[], playerId: string, config: CityConfig): number {
  return Math.min(config.taxCap, ownedBy(tiles, playerId).length * config.taxPerSite)
}

/* ------------------------------------------------------------------ bot brains */

function completesSet(tiles: CityTile[], tile: PropertyTile, playerId: string): boolean {
  if (tile.kind === 'COMPANY') {
    const partner = tile.partnerId !== null ? tiles[tile.partnerId] : undefined
    return isProperty(partner) && partner.ownerId === playerId
  }
  return tiles.filter((t): t is PropertyTile => isProperty(t) && t.group === tile.group && t.id !== tile.id).every((t) => t.ownerId === playerId)
}

export function botBuyDecision(bot: CityPlayer, tile: PropertyTile, tiles: CityTile[]): boolean {
  if (bot.cash < tile.basePrice) return false
  const margin = completesSet(tiles, tile, bot.id) ? 800 : 3000
  return bot.cash - tile.basePrice >= margin
}

export function botAuctionRaise(bot: CityPlayer, tile: PropertyTile, auction: AuctionState, tiles: CityTile[], config: CityConfig): number | null {
  const wants = completesSet(tiles, tile, bot.id) ? 1.3 : 0.9
  const raise = auction.currentBid < tile.basePrice * 0.4 ? 500 : 100
  const next = auction.currentBid === 0 ? Math.max(config.auctionOpening, raise) : auction.currentBid + raise
  if (next <= tile.basePrice * wants && bot.cash - next >= 2500) return raise
  return null
}

/**
 * A bot that owns all but one city of a colour offers cash (and a spare deed if it's short) for the
 * missing one. Returns null when there's nothing worth asking for.
 */
export function botTradeProposal(bot: CityPlayer, tiles: CityTile[], players: CityPlayer[], skip: (tileId: number) => boolean = () => false): Omit<TradeOffer, 'id' | 'status'> | null {
  for (const want of tiles) {
    if (!isProperty(want) || want.kind !== 'SITE' || !want.ownerId || want.ownerId === bot.id || !isTradable(want) || skip(want.id)) continue
    const owner = players.find((p) => p.id === want.ownerId)
    if (!owner || owner.bankrupt) continue
    if (!completesSet(tiles, want, bot.id)) continue
    // the owner keeps it if it's part of a set they're building themselves
    const ownerShare = tiles.filter((t) => isProperty(t) && t.group === want.group && t.ownerId === owner.id).length
    if (ownerShare > 1) continue
    const cash = Math.round((want.basePrice * 1.8) / 100) * 100
    if (bot.cash - cash >= 3000) return { fromPlayerId: bot.id, toPlayerId: owner.id, offer: { cash, propertyIds: [] }, request: { cash: 0, propertyIds: [want.id] } }
    const spare = ownedBy(tiles, bot.id).find((t) => isTradable(t) && !t.mortgaged && !completesSet(tiles, t, bot.id) && t.group !== want.group && t.basePrice >= want.basePrice * 0.6)
    const part = Math.max(0, cash - (spare?.basePrice ?? 0))
    if (spare && bot.cash - part >= 3000) return { fromPlayerId: bot.id, toPlayerId: owner.id, offer: { cash: part, propertyIds: [spare.id] }, request: { cash: 0, propertyIds: [want.id] } }
  }
  return null
}

export function botUpgradeDecision(bot: CityPlayer, tiles: CityTile[], config: CityConfig): number | null {
  const candidates = tiles.filter((t): t is PropertyTile => isProperty(t) && canBuildOn(bot, t, tiles, config) && bot.cash - buildCost(t, config) >= 2500)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (b.rentTable[b.level + 1] - b.rentTable[b.level]) / buildCost(b, config) - (a.rentTable[a.level + 1] - a.rentTable[a.level]) / buildCost(a, config))
  return candidates[0].id
}

export function botRedeemDecision(bot: CityPlayer, tiles: CityTile[], config: CityConfig): number | null {
  const t = ownedBy(tiles, bot.id).find((x) => x.mortgaged && bot.cash - redeemCost(x, config.mortgageInterest) >= 7000)
  return t ? t.id : null
}

export function botCasinoDecision(bot: CityPlayer, tray: number, config: CityConfig): boolean {
  return bot.cash >= config.casinoBet + 6000 && tray >= 2000
}

export function botTradeAcceptDecision(offer: TradeOffer, tiles: CityTile[], config: CityConfig): boolean {
  const valueOf = (cash: number, ids: number[]) =>
    cash +
    ids.reduce((sum, id) => {
      const t = tiles[id]
      if (!isProperty(t)) return sum
      // a deed that would finish the other side's set is worth more to them
      const bonus = completesSet(tiles, t, offer.fromPlayerId) ? t.basePrice * 0.6 : 0
      return sum + (t.mortgaged ? t.basePrice - redeemCost(t, config.mortgageInterest) : t.basePrice) + bonus
    }, 0)
  return valueOf(offer.offer.cash, offer.offer.propertyIds) >= valueOf(offer.request.cash, offer.request.propertyIds) * 1.05
}

/* ------------------------------------------------------------------ money movement (on an immer draft) */

type Draft = CityState
type Payee = string | 'BANK' | 'POT' | 'TRAY'

interface Share {
  to: Payee
  amount: number
}

let eventSeq = 0

function log(s: Draft, icon: string, text: string) {
  s.eventLog = [{ id: makeId('clog'), icon, text, timestamp: Date.now() }, ...s.eventLog].slice(0, 60)
}

function event(s: Draft, e: Omit<CityLastEvent, 'seq'>) {
  s.lastEvent = { ...e, seq: ++eventSeq }
}

const $ = (n: number) => `$${n.toLocaleString('en-US')}`

function shuffled<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const rollDie = () => 1 + Math.floor(Math.random() * 6)

function credit(s: Draft, to: Payee, amount: number) {
  if (amount <= 0) return
  if (to === 'POT') s.clubPot += amount
  else if (to === 'TRAY') s.casinoTray += amount
  else if (to !== 'BANK') {
    const p = s.players.find((x) => x.id === to)
    if (p && !p.bankrupt) p.cash += amount
  }
}

/** Sells buildings back at half cost (highest first, so sets stay even), then mortgages empty deeds. */
function raiseFunds(s: Draft, player: CityPlayer, needed: number) {
  while (player.cash < needed) {
    const built = ownedBy(s.tiles, player.id)
      .filter((t) => t.level > 0)
      .sort((a, b) => b.level - a.level || b.upgradeCost - a.upgradeCost)[0]
    if (built) {
      const refund = Math.floor(buildCost(built, s.config) / 2)
      const name = ERECTION_NAMES[built.level]
      built.level -= 1
      player.cash += refund
      log(s, '🏚️', `${player.name} sold the ${name} on ${built.name} to the Bank for ${$(refund)}`)
      continue
    }
    const deed = ownedBy(s.tiles, player.id)
      .filter((t) => !t.mortgaged)
      .sort((a, b) => a.basePrice - b.basePrice)[0]
    if (deed) {
      deed.mortgaged = true
      player.cash += mortgageValue(deed)
      log(s, '🏦', `${player.name} mortgaged ${deed.name} for ${$(mortgageValue(deed))}`)
      continue
    }
    break
  }
}

/**
 * Pays `shares` from a player, selling and mortgaging if needed. A player who still can't pay is
 * bankrupt: everything (deeds, cards, cash) goes to the player they owe, or to the Bank. Returns false then.
 */
function pay(s: Draft, payerId: string, shares: Share[]): boolean {
  const payer = s.players.find((p) => p.id === payerId)
  if (!payer || payer.bankrupt) return false
  const live = shares.filter((x) => x.amount > 0)
  const total = live.reduce((sum, x) => sum + x.amount, 0)
  if (total <= 0) return true
  if (payer.cash < total) raiseFunds(s, payer, total)
  if (payer.cash >= total) {
    payer.cash -= total
    for (const x of live) credit(s, x.to, x.amount)
    return true
  }

  // bankrupt: what cash there is goes out in order, then the rest of the estate
  let left = payer.cash
  for (const x of live) {
    const part = Math.min(left, x.amount)
    left -= part
    credit(s, x.to, part)
  }
  const creditorId = live.find((x) => x.to !== 'BANK' && x.to !== 'POT' && x.to !== 'TRAY')?.to
  const creditor = creditorId ? s.players.find((p) => p.id === creditorId && !p.bankrupt) : undefined
  for (const t of ownedBy(s.tiles, payer.id)) {
    t.level = 0
    if (creditor) {
      t.ownerId = creditor.id
    } else {
      t.ownerId = null
      t.mortgaged = false
    }
  }
  if (creditor) creditor.freePasses.push(...payer.freePasses)
  else for (const id of payer.freePasses) s.decks[ALL_CARDS[id].deck].push(id)
  payer.freePasses = []
  payer.cash = 0
  payer.bankrupt = true
  payer.inJail = false
  event(s, { type: 'bankrupt', text: `${payer.name} is bankrupt!` })
  log(s, '💸', creditor ? `${payer.name} is bankrupt — everything goes to ${creditor.name}` : `${payer.name} is bankrupt — the Bank takes everything`)
  return false
}

function sendToJail(s: Draft, idx: number) {
  const p = s.players[idx]
  p.position = JAIL_TILE_ID
  p.inJail = true
  p.jailTurnsServed = 0
  s.extraTurn = false
  s.doublesStreak = 0
}

function collectStart(s: Draft, p: CityPlayer) {
  p.cash += s.config.goBonus
  log(s, '🏁', `${p.name} passed START and collected ${$(s.config.goBonus)}`)
}

/* ------------------------------------------------------------------ store */

const EMPTY_GAME = {
  tiles: [] as CityTile[],
  players: [] as CityPlayer[],
  currentPlayerIndex: 0,
  roundNumber: 1,
  dice: null as [number, number] | null,
  rollSeq: 0,
  phase: 'ROLLING' as CityPhase,
  pendingMovePath: null as number[] | null,
  pendingTrades: [] as TradeOffer[],
  auction: null as AuctionState | null,
  lastEvent: null as CityLastEvent | null,
  eventLog: [] as CityLogEntry[],
  finalRanking: null as RankingEntry[] | null,
  doublesStreak: 0,
  extraTurn: false,
  decks: { CHANCE: [], TREASURY: [] } as Record<Deck, string[]>,
  clubPot: 0,
  casinoTray: 0,
  casinoResult: null as CasinoResult | null,
}

export const useCityStore = create<CityState>()(
  immer((set, get) => {
    function checkEndCondition() {
      const state = get()
      if (state.phase === 'GAME_OVER' || state.players.length === 0) return
      const active = state.players.filter((p) => !p.bankrupt)
      const overRounds = state.roundNumber > state.config.maxRounds
      if (active.length > 1 && !overRounds) return
      const ranking: RankingEntry[] = state.players
        .map((p) => ({ playerId: p.id, netWorth: netWorthOf(p, state.tiles, state.config) }))
        .sort((a, b) => b.netWorth - a.netWorth)
      set((s) => {
        s.phase = 'GAME_OVER'
        s.finalRanking = ranking
        s.auction = null
        const winner = s.players.find((p) => p.id === ranking[0].playerId)
        if (winner) log(s, '🏆', active.length <= 1 ? `${winner.name} is the last tycoon in business and wins!` : `Round limit reached — ${winner.name} wins with ${$(ranking[0].netWorth)}`)
      })
    }

    /** A bankrupt current player can't act any more: move on. */
    function skipIfCurrentBankrupt() {
      const st = get()
      if (st.phase === 'GAME_OVER') return
      const cur = st.players[st.currentPlayerIndex]
      if (cur?.bankrupt && st.phase !== 'AUCTION') get().endTurn()
    }

    function drawCard(s: Draft, idx: number, deck: Deck) {
      const player = s.players[idx]
      if (s.decks[deck].length === 0) s.decks[deck] = shuffled((deck === 'CHANCE' ? CHANCE_CARDS : TREASURY_CARDS).map((c) => c.id))
      const id = s.decks[deck].shift()!
      const card: CardDef = ALL_CARDS[id]
      // the card goes to the bottom, unless it's a Free Pass the player keeps
      if (card.action.kind !== 'freePass') s.decks[deck].push(id)
      const cardEvent: Omit<CityLastEvent, 'seq'> = { type: 'card', text: card.text, deck, cardId: id }
      event(s, cardEvent)
      log(s, deck === 'CHANCE' ? '❓' : '💰', `${player.name} drew ${deck === 'CHANCE' ? 'Chance' : 'Treasury'}: ${card.text}`)
      const a = card.action
      const others = s.players.filter((p) => !p.bankrupt && p.id !== player.id)
      switch (a.kind) {
        case 'cash':
          if (a.amount > 0) player.cash += a.amount
          else pay(s, player.id, [{ to: 'POT', amount: -a.amount }])
          break
        case 'payBank':
          pay(s, player.id, [{ to: 'BANK', amount: a.amount }])
          break
        case 'perBuilding': {
          const buildings = ownedBy(s.tiles, player.id).filter((t) => t.level > 0).length
          if (buildings > 0) {
            log(s, '🏚️', `${player.name} pays ${$(a.amount)} × ${buildings} buildings for earthquake repairs`)
            pay(s, player.id, [{ to: 'BANK', amount: a.amount * buildings }])
          }
          break
        }
        case 'fromEach':
          for (const o of others) pay(s, o.id, [{ to: player.id, amount: a.amount }])
          break
        case 'toEach':
          pay(s, player.id, others.map((o) => ({ to: o.id, amount: a.amount })))
          break
        case 'jail':
          sendToJail(s, idx)
          break
        case 'freePass':
          player.freePasses.push(id)
          break
        case 'moveTo': {
          if (a.tileId <= player.position) collectStart(s, player)
          player.position = a.tileId
          resolveTile(s, idx)
          break
        }
        case 'back':
          player.position = (player.position - a.steps + BOARD_SIZE) % BOARD_SIZE
          resolveTile(s, idx)
          break
      }
      // the card stays on screen; what happened next is in the log
      if (s.lastEvent?.type !== 'bankrupt') event(s, cardEvent)
    }

    function resolveTile(s: Draft, idx: number) {
      const player = s.players[idx]
      const tile = s.tiles[player.position]
      s.phase = 'POST_MOVE_ACTIONS'
      if (player.bankrupt) return

      switch (tile.type) {
        case 'GO':
        case 'JAIL':
          return
        case 'TAX': {
          const amount = taxDue(s.tiles, player.id, s.config)
          if (amount === 0) {
            log(s, '🧾', `${player.name} owns no sites — no ${tile.name} to pay`)
            return
          }
          log(s, '🧾', `${player.name} paid ${$(amount)} ${tile.name} into the Grand Club pot`)
          event(s, { type: 'event', text: `${player.name} paid ${$(amount)} ${tile.name}` })
          pay(s, player.id, [{ to: 'POT', amount }])
          return
        }
        case 'CLUB': {
          if (s.clubPot > 0) {
            const won = s.clubPot
            s.clubPot = 0
            player.cash += won
            event(s, { type: 'club', text: `${player.name} wins the Grand Club pot: ${$(won)}!` })
            log(s, '👑', `${player.name} collected the Grand Club pot of ${$(won)}`)
          } else {
            player.cash += s.config.clubEmptyGift
            event(s, { type: 'club', text: `The pot is empty — the Bank gives ${player.name} a ${$(s.config.clubEmptyGift)} welcome gift` })
            log(s, '👑', `Grand Club pot empty — ${player.name} gets a ${$(s.config.clubEmptyGift)} welcome gift`)
          }
          return
        }
        case 'CASINO':
          if (!s.config.casinoEnabled) {
            log(s, '🎰', `${player.name} visits the Casino (no betting in Kids Mode)`)
            return
          }
          if (player.cash < s.config.casinoBet) {
            log(s, '🎰', `${player.name} can't cover the ${$(s.config.casinoBet)} Casino bet`)
            return
          }
          s.phase = 'CASINO'
          return
        case 'CHANCE':
          drawCard(s, idx, 'CHANCE')
          return
        case 'TREASURY':
          drawCard(s, idx, 'TREASURY')
          return
        case 'PROPERTY': {
          if (tile.ownerId === null) {
            s.phase = 'AWAITING_BUY_DECISION'
            return
          }
          if (tile.ownerId === player.id) return
          const owner = s.players.find((p) => p.id === tile.ownerId)!
          if (tile.mortgaged) {
            log(s, '🏦', `${tile.name} is mortgaged — no rent`)
            return
          }
          const rent = computeRent(tile, s.tiles)
          event(s, { type: 'rent', text: `${player.name} paid ${$(rent)} rent to ${owner.name}` })
          log(s, '🏠', `${player.name} paid ${$(rent)} rent to ${owner.name} for ${tile.name}`)
          pay(s, player.id, [{ to: owner.id, amount: rent }])
          return
        }
      }
    }

    function startMove(s: Draft, idx: number, steps: number) {
      const player = s.players[idx]
      const path: number[] = []
      for (let k = 1; k <= steps; k++) path.push((player.position + k) % BOARD_SIZE)
      s.pendingMovePath = path
      s.phase = 'MOVING'
    }

    function finishAuction() {
      set((s) => {
        const a = s.auction
        if (!a) return
        const tile = s.tiles[a.tileId] as PropertyTile
        const winner = a.currentBidderId ? s.players.find((p) => p.id === a.currentBidderId) : undefined
        if (winner && a.currentBid > 0 && winner.cash >= a.currentBid) {
          winner.cash -= a.currentBid
          tile.ownerId = winner.id
          tile.level = 0
          tile.mortgaged = false
          event(s, { type: 'auction', text: `${winner.name} won ${tile.name} for ${$(a.currentBid)}` })
          log(s, '🔨', `${winner.name} won the auction for ${tile.name} at ${$(a.currentBid)}`)
        } else {
          log(s, '🔨', `No bids — ${tile.name} stays with the Bank`)
        }
        s.auction = null
        s.phase = 'POST_MOVE_ACTIONS'
      })
      skipIfCurrentBankrupt()
    }

    /** The current player may manage property before rolling and after moving. */
    function actingPlayer(s: Draft): CityPlayer | null {
      if (s.phase !== 'ROLLING' && s.phase !== 'POST_MOVE_ACTIONS') return null
      const p = s.players[s.currentPlayerIndex]
      return p && !p.bankrupt ? p : null
    }

    return {
      ...EMPTY_GAME,
      config: VARIANTS.CLASSIC.config,

      startGame: (participants, variant = 'CLASSIC') => {
        const config = VARIANTS[variant]?.config ?? VARIANTS.CLASSIC.config
        const DEFAULT_NAMES = ['Player', 'Divya', 'Sneha', 'Doctor']
        const DEFAULT_EMOJIS = ['😎', '🧢', '🌸', '🩺']
        const players: CityPlayer[] = participants.slice(0, 4).map((p, i) => ({
          id: p.id,
          name: p.name && !p.name.startsWith('Player ') ? p.name : (DEFAULT_NAMES[i] ?? `Player ${i + 1}`),
          avatarEmoji: p.avatarEmoji || DEFAULT_EMOJIS[i] || '👤',
          color: CITY_PLAYER_COLORS[i],
          isBot: p.isBot,
          cash: config.startingCash,
          position: START_TILE_ID,
          inJail: false,
          jailTurnsServed: 0,
          freePasses: [],
          bankrupt: false,
        }))
        // everyone rolls two dice; the highest total starts (ties: earlier seat)
        const opening = players.map(() => rollDie() + rollDie())
        const first = Math.max(0, opening.indexOf(Math.max(...opening)))
        set({
          ...EMPTY_GAME,
          config,
          tiles: buildBoard(),
          players,
          currentPlayerIndex: first,
          decks: { CHANCE: shuffled(CHANCE_CARDS.map((c) => c.id)), TREASURY: shuffled(TREASURY_CARDS.map((c) => c.id)) },
          casinoTray: config.casinoJackpotStart,
        })
        set((s) => {
          log(s, '🌍', `${VARIANTS[config.variant].name} game — everyone starts with ${$(config.startingCash)}`)
          log(s, '🎲', `Opening rolls: ${players.map((p, i) => `${p.name} ${opening[i]}`).join(', ')} — ${players[first]?.name} starts`)
        })
      },

      rollAndMove: () => {
        if (get().phase !== 'ROLLING') return
        const d1 = rollDie()
        const d2 = rollDie()
        const doubleSix = d1 === 6 && d2 === 6
        let skip = false
        set((s) => {
          const idx = s.currentPlayerIndex
          const p = s.players[idx]
          s.dice = [d1, d2]
          s.rollSeq += 1
          s.casinoResult = null
          s.lastEvent = null

          if (p.inJail) {
            if (doubleSix) {
              p.inJail = false
              p.jailTurnsServed = 0
              log(s, '🔓', `${p.name} rolled a double six and walks out of Jail`)
              s.extraTurn = false
              startMove(s, idx, d1 + d2)
              return
            }
            p.jailTurnsServed += 1
            if (p.jailTurnsServed < s.config.jailTurns) {
              const left = s.config.jailTurns - p.jailTurnsServed
              log(s, '🔒', `${p.name} rolled ${d1} + ${d2} — still in Jail (${left} ${left === 1 ? 'try' : 'tries'} left)`)
              s.extraTurn = false
              s.phase = 'POST_MOVE_ACTIONS'
              return
            }
            log(s, '🔓', `${p.name} served three turns and pays the ${$(s.config.jailFine)} fine`)
            p.inJail = false
            p.jailTurnsServed = 0
            if (!pay(s, p.id, [{ to: 'POT', amount: s.config.jailFine }])) {
              s.phase = 'POST_MOVE_ACTIONS'
              skip = true
              return
            }
            startMove(s, idx, d1 + d2)
            return
          }

          log(s, '🎲', `${p.name} rolled ${d1} + ${d2} = ${d1 + d2}`)
          if (doubleSix) {
            s.doublesStreak += 1
            if (s.doublesStreak >= s.config.doublesToJail) {
              sendToJail(s, idx)
              event(s, { type: 'jail', text: `${p.name} rolled three double sixes — straight to Jail!` })
              log(s, '👮', `${p.name} rolled three double sixes in a row — straight to Jail!`)
              s.phase = 'POST_MOVE_ACTIONS'
              return
            }
            s.extraTurn = true
          } else {
            s.extraTurn = false
          }
          startMove(s, idx, d1 + d2)
        })
        if (skip) skipIfCurrentBankrupt()
      },

      completeMove: () => {
        const path = get().pendingMovePath
        if (!path || get().phase !== 'MOVING') return
        set((s) => {
          const idx = s.currentPlayerIndex
          const p = s.players[idx]
          const finalPos = path[path.length - 1]
          const passedStart = path.includes(START_TILE_ID)
          p.position = finalPos
          s.pendingMovePath = null
          if (passedStart) collectStart(s, p)
          const before = s.lastEvent?.seq
          resolveTile(s, idx)
          if (s.lastEvent?.seq === before) s.lastEvent = null
        })
        checkEndCondition()
        skipIfCurrentBankrupt()
      },

      resolveBuyDecision: (buy) => {
        if (get().phase !== 'AWAITING_BUY_DECISION') return
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          const tile = s.tiles[p.position] as PropertyTile
          if (buy && p.cash >= tile.basePrice) {
            tile.ownerId = p.id
            p.cash -= tile.basePrice
            s.phase = 'POST_MOVE_ACTIONS'
            event(s, { type: 'buy', text: `${p.name} bought ${tile.name}` })
            log(s, '🛒', `${p.name} bought ${tile.name} for ${$(tile.basePrice)}`)
            return
          }
          // not bought: the Bank auctions it, starting at the opening bid; anyone can bid, including you
          const order = [...s.players.slice(s.currentPlayerIndex), ...s.players.slice(0, s.currentPlayerIndex)].filter((x) => !x.bankrupt)
          s.auction = { tileId: tile.id, currentBid: 0, currentBidderId: null, queue: order.map((x) => x.id) }
          s.phase = 'AUCTION'
          log(s, '🔨', `The Bank auctions ${tile.name} — bidding opens at ${$(s.config.auctionOpening)}`)
        })
      },

      submitAuctionAction: (playerId, action, raise = 100) => {
        const auction = get().auction
        if (!auction || get().phase !== 'AUCTION' || auction.queue[0] !== playerId) return
        set((s) => {
          const a = s.auction!
          const player = s.players.find((p) => p.id === playerId)!
          const tile = s.tiles[a.tileId] as PropertyTile
          const step = Math.max(100, Math.round(raise / 100) * 100)
          if (action === 'BID') {
            const bid = a.currentBid === 0 ? Math.max(s.config.auctionOpening, step) : a.currentBid + step
            if (bid > player.cash) return
            a.currentBid = bid
            a.currentBidderId = playerId
            a.queue.push(a.queue.shift()!)
            log(s, '🔨', `${player.name} bid ${$(bid)} for ${tile.name}`)
          } else {
            a.queue.shift()
            log(s, '🔨', `${player.name} is out of the bidding for ${tile.name}`)
          }
        })
        const after = get().auction
        if (!after) return
        if (after.queue.length === 0 || (after.queue.length === 1 && after.currentBidderId === after.queue[0])) finishAuction()
      },

      casinoDecision: (bet) => {
        if (get().phase !== 'CASINO') return
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          s.phase = 'POST_MOVE_ACTIONS'
          if (!bet || p.cash < s.config.casinoBet) {
            log(s, '🎰', `${p.name} walks away from the Casino`)
            return
          }
          const roll = rollDie()
          const stake = s.config.casinoBet
          if (roll === 6) {
            const won = s.casinoTray + s.config.casinoJackpotBonus
            s.casinoTray = 0
            p.cash += won
            s.casinoResult = { seq: ++eventSeq, playerId: p.id, roll, outcome: 'JACKPOT', amount: won }
            event(s, { type: 'casino', text: `JACKPOT! ${p.name} rolled a 6 and wins ${$(won)}!` })
            log(s, '🎰', `JACKPOT! ${p.name} rolled a 6 and takes ${$(won)}`)
          } else if (roll === 5) {
            p.cash += s.config.casinoFivePays
            s.casinoResult = { seq: ++eventSeq, playerId: p.id, roll, outcome: 'PUSH', amount: s.config.casinoFivePays }
            const extra = s.config.casinoFivePays > 0 ? ` and wins ${$(s.config.casinoFivePays)}` : ''
            event(s, { type: 'casino', text: `${p.name} rolled a 5 — push: bet back${extra}` })
            log(s, '🎰', `${p.name} rolled a 5 — bet returned${extra}`)
          } else {
            p.cash -= stake
            s.casinoTray += stake
            s.casinoResult = { seq: ++eventSeq, playerId: p.id, roll, outcome: 'LOSE', amount: stake }
            event(s, { type: 'casino', text: `${p.name} rolled a ${roll} and lost ${$(stake)} — the jackpot is now ${$(s.casinoTray)}` })
            log(s, '🎰', `${p.name} rolled a ${roll} and lost ${$(stake)} into the jackpot tray`)
          }
        })
      },

      upgradeProperty: (tileId) => {
        set((s) => {
          const p = actingPlayer(s)
          const tile = s.tiles[tileId]
          if (!p || !isProperty(tile) || !canBuildOn(p, tile, s.tiles, s.config)) return
          const cost = buildCost(tile, s.config)
          tile.level += 1
          p.cash -= cost
          const name = ERECTION_NAMES[tile.level]
          event(s, { type: 'upgrade', text: `${p.name} built a ${name} in ${tile.name}` })
          log(s, '🏗️', `${p.name} built a ${name} in ${tile.name} for ${$(cost)}`)
        })
      },

      sellBuilding: (tileId) => {
        set((s) => {
          const p = actingPlayer(s)
          const tile = s.tiles[tileId]
          if (!p || !isProperty(tile) || tile.ownerId !== p.id || sellBlocker(s.tiles, tile, s.config.evenBuild) !== null) return
          const refund = Math.floor(buildCost(tile, s.config) / 2)
          const name = ERECTION_NAMES[tile.level]
          tile.level -= 1
          p.cash += refund
          log(s, '🏚️', `${p.name} sold the ${name} in ${tile.name} back to the Bank for ${$(refund)}`)
        })
      },

      mortgageProperty: (tileId) => {
        set((s) => {
          const p = actingPlayer(s)
          const tile = s.tiles[tileId]
          if (!p || !isProperty(tile) || tile.ownerId !== p.id || mortgageBlocker(s.tiles, tile) !== null) return
          tile.mortgaged = true
          p.cash += mortgageValue(tile)
          log(s, '🏦', `${p.name} mortgaged ${tile.name} for ${$(mortgageValue(tile))}`)
        })
      },

      redeemProperty: (tileId) => {
        set((s) => {
          const p = actingPlayer(s)
          const tile = s.tiles[tileId]
          if (!p || !isProperty(tile) || tile.ownerId !== p.id || !tile.mortgaged) return
          const cost = redeemCost(tile, s.config.mortgageInterest)
          if (p.cash < cost) return
          p.cash -= cost
          tile.mortgaged = false
          log(s, '🏦', `${p.name} lifted the mortgage on ${tile.name} for ${$(cost)}`)
        })
      },

      payJailFine: () => {
        if (get().phase !== 'ROLLING') return
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          if (!p.inJail || p.cash < s.config.jailFine) return
          p.cash -= s.config.jailFine
          s.clubPot += s.config.jailFine
          p.inJail = false
          p.jailTurnsServed = 0
          log(s, '🔓', `${p.name} paid the ${$(s.config.jailFine)} Jail fine into the Grand Club pot`)
        })
      },

      useFreePass: () => {
        if (get().phase !== 'ROLLING') return
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          if (!p.inJail || p.freePasses.length === 0) return
          const id = p.freePasses.shift()!
          s.decks[ALL_CARDS[id].deck].push(id)
          p.inJail = false
          p.jailTurnsServed = 0
          log(s, '🎫', `${p.name} used a Get Out of Jail Free card`)
        })
      },

      proposeTrade: (offer) => {
        set((s) => {
          const from = s.players.find((p) => p.id === offer.fromPlayerId)
          const to = s.players.find((p) => p.id === offer.toPlayerId)
          if (!from || !to || from.bankrupt || to.bankrupt || from.id === to.id) return
          if (s.pendingTrades.some((t) => t.status === 'PENDING' && t.fromPlayerId === from.id)) return
          s.pendingTrades.push({ ...offer, id: makeId('trade'), status: 'PENDING' })
          log(s, '🤝', `${from.name} offered a trade to ${to.name}`)
        })
      },

      respondToTrade: (tradeId, accept) => {
        set((s) => {
          const trade = s.pendingTrades.find((t) => t.id === tradeId)
          if (!trade || trade.status !== 'PENDING') return
          const from = s.players.find((p) => p.id === trade.fromPlayerId)
          const to = s.players.find((p) => p.id === trade.toPlayerId)
          const deedsOk = (ids: number[], ownerId?: string) =>
            ids.every((id) => {
              const t = s.tiles[id]
              return isProperty(t) && t.ownerId === ownerId && isTradable(t)
            })
          // whoever takes a mortgaged deed pays the 10% interest straight away
          const interestOn = (ids: number[]) =>
            ids.reduce((sum, id) => {
              const t = s.tiles[id] as PropertyTile
              return sum + (t.mortgaged ? Math.round(mortgageValue(t) * s.config.mortgageInterest) : 0)
            }, 0)
          const valid =
            accept &&
            from &&
            to &&
            !from.bankrupt &&
            !to.bankrupt &&
            deedsOk(trade.offer.propertyIds, from.id) &&
            deedsOk(trade.request.propertyIds, to.id) &&
            from.cash >= trade.offer.cash + interestOn(trade.request.propertyIds) &&
            to.cash >= trade.request.cash + interestOn(trade.offer.propertyIds)
          trade.status = valid ? 'ACCEPTED' : 'REJECTED'
          if (!valid || !from || !to) {
            log(s, '🚫', `${to?.name ?? 'The other player'} turned down ${from?.name ?? 'the'}'s trade`)
            return
          }
          from.cash += trade.request.cash - trade.offer.cash - interestOn(trade.request.propertyIds)
          to.cash += trade.offer.cash - trade.request.cash - interestOn(trade.offer.propertyIds)
          for (const id of trade.offer.propertyIds) (s.tiles[id] as PropertyTile).ownerId = to.id
          for (const id of trade.request.propertyIds) (s.tiles[id] as PropertyTile).ownerId = from.id
          event(s, { type: 'trade', text: `${from.name} and ${to.name} made a deal` })
          log(s, '🤝', `${from.name} and ${to.name} traded`)
        })
        set((s) => {
          s.pendingTrades = s.pendingTrades.filter((t) => t.status === 'PENDING').concat(s.pendingTrades.filter((t) => t.status !== 'PENDING').slice(-4))
        })
      },

      endTurn: () => {
        const st = get()
        const current = st.players[st.currentPlayerIndex]
        if (st.phase === 'GAME_OVER') return
        // a turn ends after the move is resolved; a bankrupt player's pending decision is moot
        if (st.phase !== 'POST_MOVE_ACTIONS' && !current?.bankrupt) return
        set((s) => {
          const cur = s.players[s.currentPlayerIndex]
          s.pendingTrades = s.pendingTrades.filter((t) => t.status !== 'PENDING' || t.fromPlayerId !== cur?.id)
          if (s.extraTurn && cur && !cur.bankrupt && !cur.inJail) {
            s.extraTurn = false
            s.phase = 'ROLLING'
            log(s, '🎲', `Double six! ${cur.name} rolls again`)
            return
          }
          s.extraTurn = false
          s.doublesStreak = 0
          let next = s.currentPlayerIndex
          for (let i = 0; i < s.players.length; i++) {
            next = (next + 1) % s.players.length
            if (!s.players[next].bankrupt) break
          }
          if (next <= s.currentPlayerIndex) s.roundNumber += 1
          s.currentPlayerIndex = next
          s.phase = 'ROLLING'
          s.pendingMovePath = null
        })
        checkEndCondition()
      },

      resetGame: () => {
        set({ ...EMPTY_GAME, config: VARIANTS.CLASSIC.config })
      },
    }
  }),
)

// dev-only handle for poking at the game from the browser console
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __tycoon: typeof useCityStore }).__tycoon = useCityStore
