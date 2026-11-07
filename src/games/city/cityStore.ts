import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { makeId } from '@/lib/id'
import {
  buildBoard,
  EVENT_TEMPLATES,
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  JAIL_TILE_ID,
  type CityTile,
  type PropertyTile,
  type PropertyCategory,
} from './cityBoardData'

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
}

interface CityConfig {
  maxRounds: number
  targetNetWorth: number
  goBonus: number
  bidIncrement: number
  startingCash: number
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

  startGame: (participants: { id: string; name: string; avatarEmoji: string; isBot: boolean }[]) => void
  rollAndMove: () => void
  completeMove: () => void
  resolveBuyDecision: (buy: boolean) => void
  submitAuctionAction: (playerId: string, action: 'BID' | 'PASS') => void
  upgradeProperty: (tileId: number) => void
  proposeTrade: (offer: Omit<TradeOffer, 'id' | 'status'>) => void
  respondToTrade: (tradeId: string, accept: boolean) => void
  endTurn: () => void
  resetGame: () => void
}

export function netWorthOf(player: CityPlayer, tiles: CityTile[]): number {
  const propertyValue = tiles
    .filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.ownerId === player.id)
    .reduce((sum, t) => sum + t.basePrice + t.level * t.upgradeCost, 0)
  return player.cash + propertyValue
}

export function computeRent(tile: PropertyTile, events: CityEventModifier[]): number {
  let rent = tile.rentTable[tile.level]
  for (const ev of events) {
    if (ev.affectsCategory === 'ALL' || ev.affectsCategory === tile.category) {
      rent = Math.round(rent * ev.rentMultiplier)
    }
  }
  return rent
}

export function botBuyDecision(bot: CityPlayer, tile: PropertyTile): boolean {
  const safetyMargin = 220
  return bot.cash - tile.basePrice >= safetyMargin
}

export function botAuctionDecision(bot: CityPlayer, tile: PropertyTile, currentBid: number, increment: number): 'BID' | 'PASS' {
  const nextBid = currentBid + increment
  const maxWilling = tile.basePrice * 0.9
  if (nextBid <= maxWilling && bot.cash - nextBid >= 150) return 'BID'
  return 'PASS'
}

export function botUpgradeDecision(bot: CityPlayer, tiles: CityTile[]): number | null {
  const owned = tiles.filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.ownerId === bot.id && t.level < t.maxLevel)
  const candidates = owned.filter((t) => bot.cash - t.upgradeCost >= 260)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const scoreA = (a.rentTable[a.level + 1] - a.rentTable[a.level]) / a.upgradeCost
    const scoreB = (b.rentTable[b.level + 1] - b.rentTable[b.level]) / b.upgradeCost
    return scoreB - scoreA
  })
  return candidates[0].id
}

export function botTradeAcceptDecision(offer: TradeOffer, tiles: CityTile[]): boolean {
  const valueOf = (cash: number, propertyIds: number[]) =>
    cash + propertyIds.reduce((sum, id) => {
      const t = tiles.find((x) => x.id === id) as PropertyTile | undefined
      return sum + (t ? t.basePrice + t.level * t.upgradeCost : 0)
    }, 0)
  const offerValue = valueOf(offer.offer.cash, offer.offer.propertyIds)
  const requestValue = valueOf(offer.request.cash, offer.request.propertyIds)
  return offerValue >= requestValue * 1.05
}

export const useCityStore = create<CityState>()(
  immer((set, get) => {
    function pushLog(icon: string, text: string) {
      set((state) => {
        state.eventLog = [{ id: makeId('clog'), icon, text, timestamp: Date.now() }, ...state.eventLog].slice(0, 40)
      })
    }

    function checkBankruptcy(playerId: string) {
      set((state) => {
        const p = state.players.find((x) => x.id === playerId)
        if (p && p.cash <= 0 && !p.bankrupt) {
          p.bankrupt = true
          p.cash = 0
          for (const t of state.tiles) {
            if (t.type === 'PROPERTY' && t.ownerId === playerId) {
              t.ownerId = null
              t.level = 0
            }
          }
        }
      })
      const p = get().players.find((x) => x.id === playerId)
      if (p?.bankrupt) pushLog('💸', `${p.name} went bankrupt!`)
    }

    function checkEndCondition() {
      const state = get()
      const active = state.players.filter((p) => !p.bankrupt)
      const overRounds = state.roundNumber > state.config.maxRounds
      const hitTarget = active.some((p) => netWorthOf(p, state.tiles) >= state.config.targetNetWorth)
      if (active.length <= 1 || overRounds || hitTarget) {
        const ranking: RankingEntry[] = state.players
          .map((p) => ({ playerId: p.id, netWorth: netWorthOf(p, state.tiles) }))
          .sort((a, b) => b.netWorth - a.netWorth)
        set((s) => {
          s.phase = 'GAME_OVER'
          s.finalRanking = ranking
        })
        const winner = state.players.find((p) => p.id === ranking[0].playerId)
        if (winner) pushLog('🏆', `${winner.name} wins with ₹${ranking[0].netWorth} net worth!`)
      }
    }

    function finishAuction() {
      const auction = get().auction
      if (!auction) return
      set((state) => {
        const tile = state.tiles.find((t) => t.id === auction.tileId) as PropertyTile
        if (auction.currentBidderId && auction.currentBid > 0) {
          const winner = state.players.find((p) => p.id === auction.currentBidderId)!
          winner.cash -= auction.currentBid
          tile.ownerId = winner.id
          tile.level = 0
        }
        state.auction = null
        state.phase = 'POST_MOVE_ACTIONS'
      })
      const tile = get().tiles.find((t) => t.id === auction.tileId) as PropertyTile
      if (auction.currentBidderId) {
        const winner = get().players.find((p) => p.id === auction.currentBidderId)!
        pushLog('🔨', `${winner.name} won the auction for ${tile.name} at ₹${auction.currentBid}`)
      } else {
        pushLog('🔨', `No bids — ${tile.name} stays unowned`)
      }
    }

    function resolveTile(idx: number) {
      const state = get()
      const player = state.players[idx]
      const tile = state.tiles[player.position]

      if (tile.type === 'GO' || tile.type === 'PARK' || tile.type === 'JAIL') {
        set((s) => {
          s.phase = 'POST_MOVE_ACTIONS'
        })
        return
      }

      if (tile.type === 'GO_TO_JAIL') {
        set((s) => {
          s.players[idx].position = JAIL_TILE_ID
          s.players[idx].inJail = true
          s.players[idx].jailTurnsRemaining = 2
          s.phase = 'POST_MOVE_ACTIONS'
          s.lastEvent = { type: 'event', text: `${player.name} went to Jail!` }
        })
        pushLog('👮', `${player.name} was sent to Jail!`)
        return
      }

      if (tile.type === 'TAX') {
        const amount = Math.min(tile.amount ?? 0, player.cash)
        set((s) => {
          s.players[idx].cash -= amount
          s.phase = 'POST_MOVE_ACTIONS'
        })
        pushLog('🧾', `${player.name} paid ₹${amount} in tax`)
        checkBankruptcy(player.id)
        return
      }

      if (tile.type === 'EVENT') {
        const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)]
        set((s) => {
          s.activeEvents.push({
            id: makeId('event'),
            description: template.description,
            affectsCategory: template.affectsCategory,
            rentMultiplier: template.rentMultiplier,
            remainingRounds: template.rounds,
          })
          s.lastEvent = { type: 'event', text: template.description }
          s.phase = 'POST_MOVE_ACTIONS'
        })
        pushLog('✨', template.description)
        return
      }

      if (tile.type === 'CHANCE' || tile.type === 'COMMUNITY') {
        const deck = tile.type === 'CHANCE' ? CHANCE_CARDS : COMMUNITY_CARDS
        const card = deck[Math.floor(Math.random() * deck.length)]
        set((s) => {
          const p = s.players[idx]
          if (card.moveTo !== undefined) p.position = card.moveTo
          if (card.cashDelta) p.cash = Math.max(0, p.cash + card.cashDelta)
          if (card.sendToJail) {
            p.inJail = true
            p.jailTurnsRemaining = 3
          }
          s.lastEvent = { type: 'card', text: card.text }
          s.phase = 'POST_MOVE_ACTIONS'
        })
        pushLog(tile.type === 'CHANCE' ? '🍀' : '🤝', `${player.name}: ${card.text}`)
        if ((card.cashDelta ?? 0) < 0) checkBankruptcy(player.id)
        return
      }

      // PROPERTY
      if (tile.type !== 'PROPERTY') return
      if (tile.ownerId === null) {
        set((s) => {
          s.phase = 'AWAITING_BUY_DECISION'
        })
      } else if (tile.ownerId === player.id) {
        set((s) => {
          s.phase = 'POST_MOVE_ACTIONS'
        })
      } else {
        const rent = computeRent(tile, state.activeEvents)
        const amount = Math.min(rent, player.cash)
        set((s) => {
          const owner = s.players.find((p) => p.id === tile.ownerId)!
          s.players[idx].cash -= amount
          owner.cash += amount
          s.lastEvent = { type: 'rent', text: `${player.name} paid ₹${amount} rent to ${owner.name}` }
          s.phase = 'POST_MOVE_ACTIONS'
        })
        pushLog('🏠', `${player.name} paid ₹${amount} rent for ${tile.name}`)
        checkBankruptcy(player.id)
      }
    }

    return {
      tiles: [],
      players: [],
      currentPlayerIndex: 0,
      roundNumber: 1,
      diceValue: null,
      phase: 'ROLLING',
      pendingMovePath: null,
      activeEvents: [],
      pendingTrades: [],
      auction: null,
      lastEvent: null,
      eventLog: [],
      finalRanking: null,
      config: { maxRounds: 20, targetNetWorth: 2600, goBonus: 200, bidIncrement: 20, startingCash: 1500 },

      startGame: (participants) => {
        const DEFAULT_NAMES = ['Rohan', 'Diya', 'Sneha', 'Doctor']
        const DEFAULT_EMOJIS = ['😎', '🧢', '🌸', '⚡']
        const players: CityPlayer[] = participants.slice(0, 4).map((p, i) => ({
          id: p.id,
          name: p.name && !p.name.startsWith('Player ') ? p.name : DEFAULT_NAMES[i] ?? `Player ${i + 1}`,
          avatarEmoji: p.avatarEmoji || DEFAULT_EMOJIS[i] || '👤',
          color: CITY_PLAYER_COLORS[i],
          isBot: p.isBot,
          cash: 1500,
          position: 0,
          inJail: false,
          jailTurnsRemaining: 0,
          bankrupt: false,
        }))
        set({
          tiles: buildBoard(),
          players,
          currentPlayerIndex: 0,
          roundNumber: 1,
          diceValue: null,
          phase: 'ROLLING',
          pendingMovePath: null,
          activeEvents: [],
          pendingTrades: [],
          auction: null,
          lastEvent: null,
          eventLog: [],
          finalRanking: null,
        })
      },

      rollAndMove: () => {
        if (get().phase !== 'ROLLING') return
        const idx = get().currentPlayerIndex
        const player = get().players[idx]

        if (player.inJail) {
          set((state) => {
            const p = state.players[idx]
            p.jailTurnsRemaining -= 1
            if (p.jailTurnsRemaining <= 0) p.inJail = false
          })
          pushLog('🔒', `${player.name} is in jail (${Math.max(0, player.jailTurnsRemaining - 1)} turn${player.jailTurnsRemaining - 1 === 1 ? '' : 's'} left)`)
          get().endTurn()
          return
        }

        const dice = 1 + Math.floor(Math.random() * 6)
        const total = get().tiles.length
        const path: number[] = []
        for (let s = 1; s <= dice; s++) path.push((player.position + s) % total)
        set((state) => {
          state.diceValue = dice
          state.pendingMovePath = path
          state.phase = 'MOVING'
          state.lastEvent = null
        })
        pushLog('🎲', `${player.name} rolled a ${dice}`)
      },

      completeMove: () => {
        const idx = get().currentPlayerIndex
        const path = get().pendingMovePath
        if (!path) return
        const player = get().players[idx]
        const oldPos = player.position
        const finalPos = path[path.length - 1]
        const wrapped = finalPos < oldPos
        set((state) => {
          state.players[idx].position = finalPos
          if (wrapped) state.players[idx].cash += state.config.goBonus
          state.pendingMovePath = null
        })
        if (wrapped) pushLog('🏁', `${player.name} passed Go and collected ₹${get().config.goBonus}`)
        resolveTile(idx)
      },

      resolveBuyDecision: (buy) => {
        const idx = get().currentPlayerIndex
        const player = get().players[idx]
        const tile = get().tiles[player.position] as PropertyTile
        if (buy && player.cash >= tile.basePrice) {
          set((state) => {
            const t = state.tiles.find((x) => x.id === tile.id) as PropertyTile
            t.ownerId = player.id
            t.level = 0
            state.players[idx].cash -= tile.basePrice
            state.phase = 'POST_MOVE_ACTIONS'
            state.lastEvent = { type: 'buy', text: `${player.name} bought ${tile.name}` }
          })
          pushLog('🛒', `${player.name} bought ${tile.name} for ₹${tile.basePrice}`)
        } else {
          set((state) => {
            state.auction = {
              tileId: tile.id,
              currentBid: 0,
              currentBidderId: null,
              queue: state.players.filter((p) => !p.bankrupt).map((p) => p.id),
            }
            state.phase = 'AUCTION'
          })
          pushLog('🔨', `${tile.name} goes to auction`)
        }
      },

      submitAuctionAction: (playerId, action) => {
        const auction = get().auction
        if (!auction || auction.queue[0] !== playerId) return
        const player = get().players.find((p) => p.id === playerId)!
        const tile = get().tiles.find((t) => t.id === auction.tileId) as PropertyTile

        set((state) => {
          const a = state.auction!
          if (action === 'BID') {
            const newBid = a.currentBid + state.config.bidIncrement
            if (newBid > player.cash) {
              a.queue.shift()
            } else {
              a.currentBid = newBid
              a.currentBidderId = playerId
              a.queue.push(a.queue.shift()!)
            }
          } else {
            a.queue.shift()
          }
        })
        pushLog('🔨', `${player.name} ${action === 'BID' ? `bid ₹${get().auction?.currentBid ?? ''} on ${tile.name}` : `passed on ${tile.name}`}`)

        const after = get().auction
        if (after && after.queue.length <= 1) finishAuction()
      },

      upgradeProperty: (tileId) => {
        const idx = get().currentPlayerIndex
        const player = get().players[idx]
        const tile = get().tiles.find((t) => t.id === tileId) as PropertyTile | undefined
        if (!tile || tile.type !== 'PROPERTY' || tile.ownerId !== player.id) return
        if (tile.level >= tile.maxLevel || player.cash < tile.upgradeCost) return
        set((state) => {
          const t = state.tiles.find((x) => x.id === tileId) as PropertyTile
          t.level += 1
          state.players[idx].cash -= tile.upgradeCost
        })
        pushLog('🏗️', `${player.name} upgraded ${tile.name} to level ${tile.level + 1}`)
      },

      proposeTrade: (offer) => {
        set((state) => {
          state.pendingTrades.push({ ...offer, id: makeId('trade'), status: 'PENDING' })
        })
        const from = get().players.find((p) => p.id === offer.fromPlayerId)
        const to = get().players.find((p) => p.id === offer.toPlayerId)
        pushLog('🤝', `${from?.name} proposed a trade to ${to?.name}`)
      },

      respondToTrade: (tradeId, accept) => {
        const trade = get().pendingTrades.find((t) => t.id === tradeId)
        if (!trade || trade.status !== 'PENDING') return
        const from = get().players.find((p) => p.id === trade.fromPlayerId)
        const to = get().players.find((p) => p.id === trade.toPlayerId)
        const fromOwnsAll = trade.offer.propertyIds.every(
          (id) => (get().tiles.find((t) => t.id === id) as PropertyTile | undefined)?.ownerId === from?.id,
        )
        const toOwnsAll = trade.request.propertyIds.every(
          (id) => (get().tiles.find((t) => t.id === id) as PropertyTile | undefined)?.ownerId === to?.id,
        )
        const valid = accept && from && to && fromOwnsAll && toOwnsAll && from.cash >= trade.offer.cash && to.cash >= trade.request.cash

        if (valid) {
          set((state) => {
            const f = state.players.find((p) => p.id === trade.fromPlayerId)!
            const t = state.players.find((p) => p.id === trade.toPlayerId)!
            f.cash += trade.request.cash - trade.offer.cash
            t.cash += trade.offer.cash - trade.request.cash
            for (const pid of trade.offer.propertyIds) (state.tiles.find((x) => x.id === pid) as PropertyTile).ownerId = t.id
            for (const pid of trade.request.propertyIds) (state.tiles.find((x) => x.id === pid) as PropertyTile).ownerId = f.id
            const tr = state.pendingTrades.find((x) => x.id === tradeId)!
            tr.status = 'ACCEPTED'
          })
          pushLog('🤝', `Trade between ${from?.name} and ${to?.name} accepted`)
        } else {
          set((state) => {
            const tr = state.pendingTrades.find((x) => x.id === tradeId)!
            tr.status = 'REJECTED'
          })
          pushLog('🚫', `Trade between ${from?.name} and ${to?.name} rejected`)
        }
      },

      endTurn: () => {
        set((state) => {
          let next = state.currentPlayerIndex
          for (let i = 0; i < state.players.length; i++) {
            next = (next + 1) % state.players.length
            if (!state.players[next].bankrupt) break
          }
          const wrapped = next <= state.currentPlayerIndex
          state.currentPlayerIndex = next
          if (wrapped) {
            state.roundNumber += 1
            state.activeEvents = state.activeEvents
              .map((e) => ({ ...e, remainingRounds: e.remainingRounds - 1 }))
              .filter((e) => e.remainingRounds > 0)
          }
          state.diceValue = null
          state.phase = 'ROLLING'
        })
        checkEndCondition()
      },

      resetGame: () => {
        set({
          tiles: [],
          players: [],
          currentPlayerIndex: 0,
          roundNumber: 1,
          diceValue: null,
          phase: 'ROLLING',
          pendingMovePath: null,
          activeEvents: [],
          pendingTrades: [],
          auction: null,
          lastEvent: null,
          eventLog: [],
          finalRanking: null,
        })
      },
    }
  }),
)
