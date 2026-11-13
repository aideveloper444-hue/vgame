import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { makeId } from '@/lib/id'
import {
  buildBoard,
  buildBlocker,
  ownsFullGroup,
  mortgageValue,
  redeemCost,
  ERECTION_NAMES,
  EVENT_TEMPLATES,
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  JAIL_TILE_ID,
  type CityTile,
  type PropertyTile,
  type PropertyCategory,
} from './cityBoardData'

// Rules and money follow the PVC Ludo Snake & Trade rulebook: ₹25,000 to start, sites ₹1,500 – ₹5,000,
// concerns up to ₹7,000, ₹250 decline penalty, ₹500 jail fine, ₹50-per-property tax capped at ₹500.
// Each player card shows one die, so the rulebook's "double" is a 6 here: a 6 rolls again, three 6s
// in a row go to Jail, and a 6 gets you out of Jail.

export const CITY_PLAYER_COLORS = ['#3b82f6', '#ec4899', '#d946ef', '#eab308']

export interface CityEventModifier {
  id: string
  description: string
  affectsCategory: PropertyCategory | 'ALL'
  rentMultiplier: number
  remainingRounds: number
}

export interface CityPlayer {
  id: string
  name: string
  avatarEmoji: string
  color: string
  isBot: boolean
  cash: number
  position: number
  inJail: boolean
  jailTurnsRemaining: number
  bankrupt: boolean
}

export type CityPhase =
  | 'ROLLING'
  | 'MOVING'
  | 'AWAITING_BUY_DECISION'
  | 'AUCTION'
  | 'POST_MOVE_ACTIONS'
  | 'GAME_OVER'

export interface AuctionState {
  tileId: number
  currentBid: number
  currentBidderId: string | null
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
  type: 'buy' | 'rent' | 'auction' | 'card' | 'event' | 'bankrupt' | 'upgrade' | 'trade' | 'win'
  text: string
  /** Which deck a 'card' event came from. */
  deck?: 'CHANCE' | 'COMMUNITY'
}

export interface CityConfig {
  /** Time limit: if more than one player is still solvent after this many rounds, net worth decides. */
  maxRounds: number
  goBonus: number
  bidIncrement: number
  startingCash: number
  /** Paid to the Bank when a player declines to buy an unowned site they can afford (rulebook ₹250). */
  declinePenalty: number
  /** Fine to leave Jail (rulebook ₹500). */
  jailFine: number
  /** Turns a player may try to roll out of Jail before the fine is due. */
  jailTurns: number
  /** Share of all earnings a jailed player pays to the Bank. */
  jailEarningsCut: number
  /** Sales/Income Tax: per property owned, capped (rulebook ₹50 each, at most ₹500). */
  taxPerProperty: number
  taxCap: number
  /** Rolls of the "double" face in a row that send a player to Jail. */
  doublesToJail: number
  /** Merchant's Club / Milk Bar: the bill the lander shares out equally among the other players. */
  clubBill: number
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
  diceValue: number | null
  phase: CityPhase
  pendingMovePath: number[] | null
  activeEvents: CityEventModifier[]
  pendingTrades: TradeOffer[]
  auction: AuctionState | null
  lastEvent: CityLastEvent | null
  eventLog: CityLogEntry[]
  finalRanking: RankingEntry[] | null
  config: CityConfig
  /** Consecutive "doubles" (6s) the current player has rolled this turn. */
  doublesStreak: number
  /** The current player rolled a "double" and rolls again after this move. */
  extraTurn: boolean

  startGame: (participants: { id: string; name: string; avatarEmoji: string; isBot: boolean }[]) => void
  rollAndMove: () => void
  completeMove: () => void
  resolveBuyDecision: (buy: boolean) => void
  submitAuctionAction: (playerId: string, action: 'BID' | 'PASS') => void
  upgradeProperty: (tileId: number) => void
  sellBuilding: (tileId: number) => void
  mortgageProperty: (tileId: number) => void
  redeemProperty: (tileId: number) => void
  payJailFine: () => void
  proposeTrade: (offer: Omit<TradeOffer, 'id' | 'status'>) => void
  respondToTrade: (tradeId: string, accept: boolean) => void
  endTurn: () => void
  resetGame: () => void
}

export const DOUBLE_FACE = 6

const DEFAULT_CONFIG: CityConfig = {
  maxRounds: 30,
  goBonus: 3000,
  bidIncrement: 500,
  startingCash: 25000,
  declinePenalty: 250,
  jailFine: 500,
  jailTurns: 3,
  jailEarningsCut: 0.1,
  taxPerProperty: 50,
  taxCap: 500,
  doublesToJail: 3,
  clubBill: 1500,
}

function siteValue(t: PropertyTile): number {
  return (t.mortgaged ? t.basePrice - redeemCost(t) : t.basePrice) + t.level * t.upgradeCost
}

export function netWorthOf(player: CityPlayer, tiles: CityTile[]): number {
  const propertyValue = tiles
    .filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.ownerId === player.id)
    .reduce((sum, t) => sum + siteValue(t), 0)
  return player.cash + propertyValue
}

/**
 * Rent due: a site's card rent for its erection, doubled on an undeveloped site of a full colour group;
 * a concern's rent alone, or the higher rent when its partner concern has the same owner.
 */
export function computeRent(tile: PropertyTile, events: CityEventModifier[], tiles?: CityTile[]): number {
  const full = tiles ? ownsFullGroup(tiles, tile) : false
  let rent = tile.kind === 'CONCERN' ? tile.rentTable[full ? 1 : 0] : tile.rentTable[tile.level]
  if (tile.kind === 'SITE' && tile.level === 0 && full) rent *= 2
  for (const ev of events) {
    if (ev.affectsCategory === 'ALL' || ev.affectsCategory === tile.category) {
      rent = Math.round(rent * ev.rentMultiplier)
    }
  }
  return rent
}

/** Whether `player` may take `tile`'s next erection right now. */
export function canBuildOn(player: CityPlayer, tile: PropertyTile, tiles: CityTile[]): boolean {
  return tile.ownerId === player.id && buildBlocker(tiles, tile) === null && player.cash >= tile.upgradeCost
}

/** Only undeveloped, unmortgaged sites change hands between players (rulebook §14, §15). */
export function isTradable(tile: PropertyTile): boolean {
  return tile.level === 0 && !tile.mortgaged
}

export function botBuyDecision(bot: CityPlayer, tile: PropertyTile): boolean {
  const safetyMargin = 3500
  return bot.cash - tile.basePrice >= safetyMargin
}

export function botAuctionDecision(bot: CityPlayer, tile: PropertyTile, currentBid: number, increment: number): 'BID' | 'PASS' {
  const nextBid = currentBid + increment
  const maxWilling = tile.basePrice * 0.9
  if (nextBid <= maxWilling && bot.cash - nextBid >= 2500) return 'BID'
  return 'PASS'
}

export function botUpgradeDecision(bot: CityPlayer, tiles: CityTile[]): number | null {
  const candidates = tiles.filter(
    (t): t is PropertyTile => t.type === 'PROPERTY' && canBuildOn(bot, t, tiles) && bot.cash - t.upgradeCost >= 4000,
  )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const scoreA = (a.rentTable[a.level + 1] - a.rentTable[a.level]) / a.upgradeCost
    const scoreB = (b.rentTable[b.level + 1] - b.rentTable[b.level]) / b.upgradeCost
    return scoreB - scoreA
  })
  return candidates[0].id
}

export function botRedeemDecision(bot: CityPlayer, tiles: CityTile[]): number | null {
  const mortgaged = tiles.filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.ownerId === bot.id && t.mortgaged)
  const affordable = mortgaged.filter((t) => bot.cash - redeemCost(t) >= 6000)
  return affordable.length > 0 ? affordable[0].id : null
}

export function botShouldPayJailFine(bot: CityPlayer, config: CityConfig): boolean {
  return bot.inJail && bot.cash >= config.jailFine + 5000
}

export function botTradeAcceptDecision(offer: TradeOffer, tiles: CityTile[]): boolean {
  const valueOf = (cash: number, propertyIds: number[]) =>
    cash +
    propertyIds.reduce((sum, id) => {
      const t = tiles.find((x) => x.id === id) as PropertyTile | undefined
      return sum + (t ? siteValue(t) : 0)
    }, 0)
  const offerValue = valueOf(offer.offer.cash, offer.offer.propertyIds)
  const requestValue = valueOf(offer.request.cash, offer.request.propertyIds)
  return offerValue >= requestValue * 1.05
}

/* ------------------------------------------------------------------ money movement (on an immer draft) */

type Draft = CityState

function log(s: Draft, icon: string, text: string) {
  s.eventLog = [{ id: makeId('clog'), icon, text, timestamp: Date.now() }, ...s.eventLog].slice(0, 40)
}

function ownedSites(s: Draft, playerId: string): PropertyTile[] {
  return s.tiles.filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.ownerId === playerId)
}

/** Credits a player; while in Jail they pay 10% of all earnings to the Bank (rulebook §10). */
function receive(s: Draft, playerId: string, amount: number) {
  const p = s.players.find((x) => x.id === playerId)
  if (!p || p.bankrupt || amount <= 0) return
  const cut = p.inJail ? Math.floor(amount * s.config.jailEarningsCut) : 0
  p.cash += amount - cut
  if (cut > 0) log(s, '🔒', `${p.name} is in Jail and paid ₹${cut} of earnings to the Bank`)
}

/**
 * Raises cash to cover a debt: erections go back to the Bank at half price (highest first, so groups
 * stay even), then undeveloped sites are mortgaged (rulebook §14, §15, §18).
 */
function raiseFunds(s: Draft, player: CityPlayer, needed: number) {
  while (player.cash < needed) {
    const built = ownedSites(s, player.id).filter((t) => t.level > 0).sort((a, b) => b.level - a.level || b.upgradeCost - a.upgradeCost)[0]
    if (built) {
      const refund = Math.floor(built.upgradeCost / 2)
      built.level -= 1
      player.cash += refund
      log(s, '🏚️', `${player.name} sold a ${ERECTION_NAMES[built.level + 1].toLowerCase()} on ${built.name} to the Bank for ₹${refund}`)
      continue
    }
    const site = ownedSites(s, player.id).filter((t) => !t.mortgaged).sort((a, b) => a.basePrice - b.basePrice)[0]
    if (site) {
      site.mortgaged = true
      player.cash += mortgageValue(site)
      log(s, '🏦', `${player.name} mortgaged ${site.name} for ₹${mortgageValue(site)}`)
      continue
    }
    break
  }
}

interface Share {
  /** null = the Bank */
  to: string | null
  amount: number
}

/**
 * Pays `shares` from `payerId`, raising funds if needed. A player who still can't pay goes into
 * liquidation: their cash goes to the first creditor and their sites to that player (or back to the
 * Bank when the Bank is owed), and they retire from the game (rulebook §18). Returns false on liquidation.
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
    for (const x of live) if (x.to) receive(s, x.to, x.amount)
    return true
  }

  let left = payer.cash
  for (const x of live) {
    const part = Math.min(left, x.amount)
    left -= part
    if (x.to) receive(s, x.to, part)
  }
  const creditor = live.find((x) => x.to !== null)?.to ?? null
  const creditorPlayer = creditor ? s.players.find((p) => p.id === creditor && !p.bankrupt) : undefined
  for (const t of ownedSites(s, payer.id)) {
    if (creditorPlayer) {
      t.ownerId = creditorPlayer.id
    } else {
      t.ownerId = null
      t.mortgaged = false
    }
    t.level = 0
  }
  payer.cash = 0
  payer.bankrupt = true
  payer.inJail = false
  s.lastEvent = { type: 'bankrupt', text: `${payer.name} went into liquidation!` }
  log(
    s,
    '💸',
    creditorPlayer
      ? `${payer.name} went into liquidation — assets handed to ${creditorPlayer.name}`
      : `${payer.name} went into liquidation — the Bank takes over their assets`,
  )
  return false
}

function sendToJail(s: Draft, idx: number) {
  const p = s.players[idx]
  p.position = JAIL_TILE_ID
  p.inJail = true
  p.jailTurnsRemaining = s.config.jailTurns
  s.extraTurn = false
  s.doublesStreak = 0
}

/* ------------------------------------------------------------------ store */

const EMPTY_GAME = {
  tiles: [] as CityTile[],
  players: [] as CityPlayer[],
  currentPlayerIndex: 0,
  roundNumber: 1,
  diceValue: null,
  phase: 'ROLLING' as CityPhase,
  pendingMovePath: null,
  activeEvents: [] as CityEventModifier[],
  pendingTrades: [] as TradeOffer[],
  auction: null,
  lastEvent: null,
  eventLog: [] as CityLogEntry[],
  finalRanking: null,
  doublesStreak: 0,
  extraTurn: false,
}

export const useCityStore = create<CityState>()(
  immer((set, get) => {
    function checkEndCondition() {
      const state = get()
      if (state.phase === 'GAME_OVER') return
      const active = state.players.filter((p) => !p.bankrupt)
      const overRounds = state.roundNumber > state.config.maxRounds
      if (active.length <= 1 || overRounds) {
        const ranking: RankingEntry[] = state.players
          .map((p) => ({ playerId: p.id, netWorth: p.bankrupt ? 0 : netWorthOf(p, state.tiles) }))
          .sort((a, b) => b.netWorth - a.netWorth)
        set((s) => {
          s.phase = 'GAME_OVER'
          s.finalRanking = ranking
          const winner = s.players.find((p) => p.id === ranking[0].playerId)
          if (winner) {
            log(
              s,
              '🏆',
              active.length <= 1 ? `${winner.name} is the last player standing and wins!` : `Time's up — ${winner.name} wins with ₹${ranking[0].netWorth} net worth!`,
            )
          }
        })
      }
    }

    function finishAuction() {
      set((s) => {
        const auction = s.auction
        if (!auction) return
        const tile = s.tiles.find((t) => t.id === auction.tileId) as PropertyTile
        const winner = auction.currentBidderId ? s.players.find((p) => p.id === auction.currentBidderId) : undefined
        if (winner && auction.currentBid > 0) {
          winner.cash -= auction.currentBid
          tile.ownerId = winner.id
          tile.level = 0
          tile.mortgaged = false
          log(s, '🔨', `${winner.name} won the auction for ${tile.name} at ₹${auction.currentBid}`)
        } else {
          log(s, '🔨', `No bids — ${tile.name} stays with the Bank`)
        }
        s.auction = null
        s.phase = 'POST_MOVE_ACTIONS'
      })
    }

    function resolveTile(s: Draft, idx: number) {
      const player = s.players[idx]
      const tile = s.tiles[player.position]
      s.phase = 'POST_MOVE_ACTIONS'

      if (tile.type === 'GO' || tile.type === 'PARK' || tile.type === 'JAIL') return

      if (tile.type === 'GO_TO_JAIL') {
        sendToJail(s, idx)
        s.lastEvent = { type: 'event', text: `${player.name} went to Jail!` }
        log(s, '👮', `${player.name} was sent to Jail!`)
        return
      }

      if (tile.type === 'TAX') {
        // Sales/Income Tax: a fixed amount per property owned, capped (rulebook §16)
        const count = ownedSites(s, player.id).length
        const amount = Math.min(s.config.taxCap, count * s.config.taxPerProperty)
        log(s, '🧾', `${player.name} paid ₹${amount} ${tile.name} (₹${s.config.taxPerProperty} × ${count} properties)`)
        pay(s, player.id, [{ to: null, amount }])
        return
      }

      if (tile.type === 'CLUB') {
        // common recreation site: the lander's bill is shared equally among the other players,
        // and any amount that doesn't divide evenly goes to the Bank (rulebook §12)
        const others = s.players.filter((p) => !p.bankrupt && p.id !== player.id)
        const bill = s.config.clubBill
        const each = others.length > 0 ? Math.floor(bill / others.length / 10) * 10 : 0
        const rest = bill - each * others.length
        s.lastEvent = { type: 'event', text: `${player.name} treats everyone at the ${tile.name}` }
        log(s, tile.name === 'Milk Bar' ? '🥛' : '🎩', `${player.name} paid ₹${bill} at the ${tile.name} — ₹${each} to each player`)
        pay(s, player.id, [...others.map((o) => ({ to: o.id, amount: each })), { to: null, amount: rest }])
        return
      }

      if (tile.type === 'EVENT') {
        const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)]
        s.activeEvents.push({
          id: makeId('event'),
          description: template.description,
          affectsCategory: template.affectsCategory,
          rentMultiplier: template.rentMultiplier,
          remainingRounds: template.rounds,
        })
        s.lastEvent = { type: 'event', text: template.description }
        log(s, '✨', template.description)
        return
      }

      if (tile.type === 'CHANCE' || tile.type === 'COMMUNITY') {
        const deck = tile.type === 'CHANCE' ? CHANCE_CARDS : COMMUNITY_CARDS
        const card = deck[Math.floor(Math.random() * deck.length)]
        const cardEvent: CityLastEvent = { type: 'card', text: card.text, deck: tile.type }
        s.lastEvent = cardEvent
        log(s, tile.type === 'CHANCE' ? '🍀' : '🤝', `${player.name}: ${card.text}`)
        if (card.sendToJail) {
          sendToJail(s, idx)
          return
        }
        const delta = card.cashDelta ?? 0
        if (delta > 0) receive(s, player.id, delta)
        else if (delta < 0) pay(s, player.id, [{ to: null, amount: -delta }])
        if (card.moveTo !== undefined && !player.bankrupt) {
          // moving forward past Start collects the Start bonus; then the new space takes effect
          if (card.moveTo <= player.position) {
            receive(s, player.id, s.config.goBonus)
            log(s, '🏁', `${player.name} passed Start and collected ₹${s.config.goBonus}`)
          }
          player.position = card.moveTo
          const dest = s.tiles[card.moveTo]
          if (dest.type !== 'CHANCE' && dest.type !== 'COMMUNITY') {
            resolveTile(s, idx)
            // keep the card on screen; what happened on the new space is in the log
            if (s.lastEvent?.type !== 'bankrupt' && s.lastEvent?.text !== `${player.name} went to Jail!`) s.lastEvent = cardEvent
          }
        }
        return
      }

      if (tile.type !== 'PROPERTY') return
      if (tile.ownerId === null) {
        s.phase = 'AWAITING_BUY_DECISION'
        return
      }
      if (tile.ownerId === player.id) return

      const owner = s.players.find((p) => p.id === tile.ownerId)!
      const rent = computeRent(tile, s.activeEvents, s.tiles)
      // another counter already on the site takes half the rent (rulebook §6)
      const occupants = s.players.filter((p) => !p.bankrupt && p.position === tile.id && p.id !== player.id && p.id !== owner.id)
      const occupantPool = occupants.length > 0 ? Math.floor(rent / 2) : 0
      let ownerPart = rent - occupantPool
      // a mortgaged site's rent is shared equally with the Bank, the mortgagee
      const bankPart = tile.mortgaged ? Math.floor(ownerPart / 2) : 0
      ownerPart -= bankPart
      const each = occupants.length > 0 ? Math.floor(occupantPool / occupants.length) : 0
      const indivisible = occupantPool - each * occupants.length

      const shares: Share[] = [{ to: owner.id, amount: ownerPart }, ...occupants.map((o) => ({ to: o.id, amount: each })), { to: null, amount: bankPart + indivisible }]
      const notes: string[] = []
      if (occupants.length > 0) notes.push(`half to ${occupants.map((o) => o.name).join(' & ')}`)
      if (tile.mortgaged) notes.push('mortgaged, shared with the Bank')
      s.lastEvent = { type: 'rent', text: `${player.name} paid ₹${rent} rent to ${owner.name}` }
      log(s, '🏠', `${player.name} paid ₹${rent} rent for ${tile.name}${notes.length ? ` (${notes.join('; ')})` : ''}`)
      pay(s, player.id, shares)
    }

    function startMove(s: Draft, idx: number, dice: number) {
      const player = s.players[idx]
      const total = s.tiles.length
      const path: number[] = []
      for (let k = 1; k <= dice; k++) path.push((player.position + k) % total)
      s.diceValue = dice
      s.pendingMovePath = path
      s.phase = 'MOVING'
      s.lastEvent = null
    }

    return {
      ...EMPTY_GAME,
      config: DEFAULT_CONFIG,

      startGame: (participants) => {
        const DEFAULT_NAMES = ['Rohan', 'Diya', 'Sneha', 'Doctor']
        const DEFAULT_EMOJIS = ['😎', '🧢', '🌸', '⚡']
        const players: CityPlayer[] = participants.slice(0, 4).map((p, i) => ({
          id: p.id,
          name: p.name && !p.name.startsWith('Player ') ? p.name : DEFAULT_NAMES[i] ?? `Player ${i + 1}`,
          avatarEmoji: p.avatarEmoji || DEFAULT_EMOJIS[i] || '👤',
          color: CITY_PLAYER_COLORS[i],
          isBot: p.isBot,
          cash: DEFAULT_CONFIG.startingCash,
          position: 0,
          inJail: false,
          jailTurnsRemaining: 0,
          bankrupt: false,
        }))
        // the highest roll starts (rulebook §3); ties go to the earlier seat
        const opening = players.map(() => 1 + Math.floor(Math.random() * 6))
        const first = opening.indexOf(Math.max(...opening))
        set({ ...EMPTY_GAME, config: DEFAULT_CONFIG, tiles: buildBoard(), players, currentPlayerIndex: Math.max(0, first) })
        set((s) => {
          log(s, '🎲', `Opening rolls: ${players.map((p, i) => `${p.name} ${opening[i]}`).join(', ')} — ${players[first]?.name} starts`)
        })
      },

      rollAndMove: () => {
        if (get().phase !== 'ROLLING') return
        const dice = 1 + Math.floor(Math.random() * 6)
        let endNow = false
        set((s) => {
          const idx = s.currentPlayerIndex
          const p = s.players[idx]

          if (p.inJail) {
            if (dice === DOUBLE_FACE) {
              p.inJail = false
              p.jailTurnsRemaining = 0
              log(s, '🔓', `${p.name} rolled a ${dice} and walked out of Jail`)
              s.extraTurn = false
              startMove(s, idx, dice)
              return
            }
            p.jailTurnsRemaining -= 1
            if (p.jailTurnsRemaining > 0) {
              log(s, '🔒', `${p.name} rolled a ${dice} — still in Jail (${p.jailTurnsRemaining} ${p.jailTurnsRemaining === 1 ? 'try' : 'tries'} left)`)
              endNow = true
              return
            }
            log(s, '🔓', `${p.name} paid the ₹${s.config.jailFine} Jail fine`)
            p.inJail = false
            if (!pay(s, p.id, [{ to: null, amount: s.config.jailFine }])) {
              endNow = true
              return
            }
            startMove(s, idx, dice)
            return
          }

          log(s, '🎲', `${p.name} rolled a ${dice}`)
          if (dice === DOUBLE_FACE) {
            s.doublesStreak += 1
            if (s.doublesStreak >= s.config.doublesToJail) {
              sendToJail(s, idx)
              s.lastEvent = { type: 'event', text: `${p.name} went to Jail!` }
              log(s, '👮', `${p.name} rolled ${s.config.doublesToJail} sixes in a row — straight to Jail!`)
              endNow = true
              return
            }
            s.extraTurn = true
          } else {
            s.extraTurn = false
          }
          startMove(s, idx, dice)
        })
        if (endNow) get().endTurn()
      },

      completeMove: () => {
        const path = get().pendingMovePath
        if (!path) return
        set((s) => {
          const idx = s.currentPlayerIndex
          const p = s.players[idx]
          const finalPos = path[path.length - 1]
          const wrapped = finalPos < p.position
          p.position = finalPos
          s.pendingMovePath = null
          if (wrapped) {
            receive(s, p.id, s.config.goBonus)
            log(s, '🏁', `${p.name} passed Start and collected ₹${s.config.goBonus}`)
          }
          resolveTile(s, idx)
        })
        checkEndCondition()
      },

      resolveBuyDecision: (buy) => {
        if (get().phase !== 'AWAITING_BUY_DECISION') return
        set((s) => {
          const idx = s.currentPlayerIndex
          const p = s.players[idx]
          const tile = s.tiles[p.position] as PropertyTile
          if (buy && p.cash >= tile.basePrice) {
            tile.ownerId = p.id
            tile.level = 0
            tile.mortgaged = false
            p.cash -= tile.basePrice
            s.phase = 'POST_MOVE_ACTIONS'
            s.lastEvent = { type: 'buy', text: `${p.name} bought ${tile.name}` }
            log(s, '🛒', `${p.name} bought ${tile.name} for ₹${tile.basePrice}`)
            return
          }
          // declining a site you can afford costs a penalty to the Bank (rulebook §4, §5)
          if (p.cash >= tile.basePrice) {
            log(s, '🏦', `${p.name} declined ${tile.name} and paid a ₹${s.config.declinePenalty} penalty`)
            pay(s, p.id, [{ to: null, amount: s.config.declinePenalty }])
          }
          const bidders = s.players.filter((x) => !x.bankrupt).map((x) => x.id)
          if (bidders.length < 2) {
            s.phase = 'POST_MOVE_ACTIONS'
            return
          }
          s.auction = { tileId: tile.id, currentBid: 0, currentBidderId: null, queue: bidders }
          s.phase = 'AUCTION'
          log(s, '🔨', `The Bank auctions ${tile.name}`)
        })
        checkEndCondition()
      },

      submitAuctionAction: (playerId, action) => {
        const auction = get().auction
        if (!auction || auction.queue[0] !== playerId) return
        set((s) => {
          const a = s.auction!
          const player = s.players.find((p) => p.id === playerId)!
          const tile = s.tiles.find((t) => t.id === a.tileId) as PropertyTile
          if (action === 'BID') {
            const newBid = a.currentBid + s.config.bidIncrement
            if (newBid > player.cash) {
              a.queue.shift()
              log(s, '🔨', `${player.name} can't raise the bid on ${tile.name}`)
            } else {
              a.currentBid = newBid
              a.currentBidderId = playerId
              a.queue.push(a.queue.shift()!)
              log(s, '🔨', `${player.name} bid ₹${newBid} on ${tile.name}`)
            }
          } else {
            a.queue.shift()
            log(s, '🔨', `${player.name} passed on ${tile.name}`)
          }
        })
        const after = get().auction
        if (!after) return
        // ends when one bidder is left holding the top bid, or nobody bids at all
        if (after.queue.length === 0 || (after.queue.length === 1 && after.currentBidderId === after.queue[0])) finishAuction()
      },

      upgradeProperty: (tileId) => {
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          const tile = s.tiles.find((t) => t.id === tileId)
          if (!tile || tile.type !== 'PROPERTY' || !canBuildOn(p, tile, s.tiles)) return
          tile.level += 1
          p.cash -= tile.upgradeCost
          s.lastEvent = { type: 'upgrade', text: `${p.name} built a ${ERECTION_NAMES[tile.level].toLowerCase()} on ${tile.name}` }
          log(s, '🏗️', `${p.name} built a ${ERECTION_NAMES[tile.level].toLowerCase()} on ${tile.name} for ₹${tile.upgradeCost}`)
        })
      },

      sellBuilding: (tileId) => {
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          const tile = s.tiles.find((t) => t.id === tileId)
          if (!tile || tile.type !== 'PROPERTY' || tile.ownerId !== p.id || tile.level === 0) return
          // sell evenly: never leave a site two stages above another in its group
          const top = Math.max(...s.tiles.filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.category === tile.category).map((t) => t.level))
          if (tile.level < top) return
          const refund = Math.floor(tile.upgradeCost / 2)
          const name = ERECTION_NAMES[tile.level].toLowerCase()
          tile.level -= 1
          p.cash += refund
          log(s, '🏚️', `${p.name} sold a ${name} on ${tile.name} to the Bank for ₹${refund}`)
        })
      },

      mortgageProperty: (tileId) => {
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          const tile = s.tiles.find((t) => t.id === tileId)
          if (!tile || tile.type !== 'PROPERTY' || tile.ownerId !== p.id || tile.mortgaged || tile.level > 0) return
          tile.mortgaged = true
          p.cash += mortgageValue(tile)
          log(s, '🏦', `${p.name} mortgaged ${tile.name} for ₹${mortgageValue(tile)}`)
        })
      },

      redeemProperty: (tileId) => {
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          const tile = s.tiles.find((t) => t.id === tileId)
          if (!tile || tile.type !== 'PROPERTY' || tile.ownerId !== p.id || !tile.mortgaged) return
          const cost = redeemCost(tile)
          if (p.cash < cost) return
          p.cash -= cost
          tile.mortgaged = false
          log(s, '🏦', `${p.name} paid off the mortgage on ${tile.name} (₹${cost} with 10% interest)`)
        })
      },

      payJailFine: () => {
        if (get().phase !== 'ROLLING') return
        set((s) => {
          const p = s.players[s.currentPlayerIndex]
          if (!p.inJail || p.cash < s.config.jailFine) return
          p.cash -= s.config.jailFine
          p.inJail = false
          p.jailTurnsRemaining = 0
          log(s, '🔓', `${p.name} paid the ₹${s.config.jailFine} Jail fine`)
        })
      },

      proposeTrade: (offer) => {
        set((s) => {
          s.pendingTrades.push({ ...offer, id: makeId('trade'), status: 'PENDING' })
          const from = s.players.find((p) => p.id === offer.fromPlayerId)
          const to = s.players.find((p) => p.id === offer.toPlayerId)
          log(s, '🤝', `${from?.name} proposed a trade to ${to?.name}`)
        })
      },

      respondToTrade: (tradeId, accept) => {
        set((s) => {
          const trade = s.pendingTrades.find((t) => t.id === tradeId)
          if (!trade || trade.status !== 'PENDING') return
          const from = s.players.find((p) => p.id === trade.fromPlayerId)
          const to = s.players.find((p) => p.id === trade.toPlayerId)
          const site = (id: number) => s.tiles.find((t) => t.id === id) as PropertyTile | undefined
          const ok = (ids: number[], ownerId?: string) =>
            ids.every((id) => {
              const t = site(id)
              return t !== undefined && t.ownerId === ownerId && isTradable(t)
            })
          const valid =
            accept && from && to && !from.bankrupt && !to.bankrupt && ok(trade.offer.propertyIds, from.id) && ok(trade.request.propertyIds, to.id) && from.cash >= trade.offer.cash && to.cash >= trade.request.cash

          if (valid && from && to) {
            from.cash += trade.request.cash - trade.offer.cash
            to.cash += trade.offer.cash - trade.request.cash
            for (const pid of trade.offer.propertyIds) site(pid)!.ownerId = to.id
            for (const pid of trade.request.propertyIds) site(pid)!.ownerId = from.id
            trade.status = 'ACCEPTED'
            s.lastEvent = { type: 'trade', text: `${from.name} and ${to.name} traded` }
            log(s, '🤝', `Trade between ${from.name} and ${to.name} accepted`)
          } else {
            trade.status = 'REJECTED'
            log(s, '🚫', `Trade between ${from?.name} and ${to?.name} rejected`)
          }
        })
      },

      endTurn: () => {
        if (get().phase === 'GAME_OVER') return
        set((s) => {
          const cur = s.players[s.currentPlayerIndex]
          if (s.extraTurn && cur && !cur.bankrupt && !cur.inJail) {
            // rolled a "double": same player rolls again
            s.extraTurn = false
            s.diceValue = null
            s.phase = 'ROLLING'
            log(s, '🎲', `${cur.name} rolled a ${DOUBLE_FACE} and rolls again`)
            return
          }
          s.extraTurn = false
          s.doublesStreak = 0
          let next = s.currentPlayerIndex
          for (let i = 0; i < s.players.length; i++) {
            next = (next + 1) % s.players.length
            if (!s.players[next].bankrupt) break
          }
          const wrapped = next <= s.currentPlayerIndex
          s.currentPlayerIndex = next
          if (wrapped) {
            s.roundNumber += 1
            s.activeEvents = s.activeEvents.map((e) => ({ ...e, remainingRounds: e.remainingRounds - 1 })).filter((e) => e.remainingRounds > 0)
          }
          s.diceValue = null
          s.phase = 'ROLLING'
        })
        checkEndCondition()
      },

      resetGame: () => {
        set({ ...EMPTY_GAME })
      },
    }
  }),
)
