import { useEffect } from 'react'
import {
  useCityStore,
  botAuctionRaise,
  botBuyDecision,
  botCasinoDecision,
  botRedeemDecision,
  botTradeAcceptDecision,
  botTradeProposal,
  botUpgradeDecision,
} from './cityStore'
import type { PropertyTile } from './cityBoardData'

const THINK_MS = 750

/** Deeds each bot asked for recently (bot:tile → round), so nobody is pestered every turn. */
const asked = new Map<string, number>()
/** Turns (rollSeq) on which a bot already made its trade offer. */
let offeredOnRoll = -1

/**
 * Drives computer players: rolling, buying, auction bids, Casino bets, Jail, building and trade replies.
 * Disabled on a guest's device in online matches: only the host's game makes moves.
 */
export function useCityBotAutomation(enabled = true) {
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const phase = useCityStore((s) => s.phase)
  const auction = useCityStore((s) => s.auction)
  const pendingTrades = useCityStore((s) => s.pendingTrades)
  const rollSeq = useCityStore((s) => s.rollSeq)

  const current = players[currentPlayerIndex]
  const botTurn = Boolean(enabled && current?.isBot && !current.bankrupt)

  useEffect(() => {
    if (!botTurn) return
    const st = () => useCityStore.getState()
    const t = setTimeout(() => {
      const s = st()
      const me = s.players[s.currentPlayerIndex]
      if (!me?.isBot) return
      switch (s.phase) {
        case 'ROLLING':
          if (me.inJail) {
            if (me.freePasses.length > 0) s.useFreePass()
            else if (me.cash >= s.config.jailFine + 6000) s.payJailFine()
          }
          st().rollAndMove()
          break
        case 'AWAITING_BUY_DECISION':
          s.resolveBuyDecision(botBuyDecision(me, s.tiles[me.position] as PropertyTile, s.tiles))
          break
        case 'CASINO':
          s.casinoDecision(botCasinoDecision(me, s.casinoTray, s.config))
          break
        case 'POST_MOVE_ACTIONS': {
          // wait for the answer to an offer this bot made
          if (s.pendingTrades.some((x) => x.status === 'PENDING' && x.fromPlayerId === me.id)) return
          if (offeredOnRoll !== s.rollSeq) {
            offeredOnRoll = s.rollSeq
            const offer = botTradeProposal(me, s.tiles, s.players, (tileId) => s.roundNumber - (asked.get(`${me.id}:${tileId}`) ?? -99) < 6)
            if (offer) {
              asked.set(`${me.id}:${offer.request.propertyIds[0]}`, s.roundNumber)
              s.proposeTrade(offer)
              return
            }
          }
          const redeemId = botRedeemDecision(me, s.tiles, s.config)
          if (redeemId !== null) s.redeemProperty(redeemId)
          for (let i = 0; i < 3; i++) {
            const now = st()
            const upgradeId = botUpgradeDecision(now.players[now.currentPlayerIndex], now.tiles, now.config)
            if (upgradeId === null) break
            now.upgradeProperty(upgradeId)
          }
          st().endTurn()
          break
        }
      }
    }, THINK_MS)
    return () => clearTimeout(t)
  }, [botTurn, phase, currentPlayerIndex, rollSeq, pendingTrades])

  useEffect(() => {
    if (!enabled || phase !== 'AUCTION' || !auction) return
    const bidder = players.find((p) => p.id === auction.queue[0])
    if (!bidder?.isBot) return
    const t = setTimeout(() => {
      const s = useCityStore.getState()
      if (!s.auction) return
      const tile = s.tiles[s.auction.tileId] as PropertyTile
      const raise = botAuctionRaise(bidder, tile, s.auction, s.tiles, s.config)
      s.submitAuctionAction(bidder.id, raise === null ? 'PASS' : 'BID', raise ?? undefined)
    }, 650)
    return () => clearTimeout(t)
  }, [enabled, phase, auction, players])

  useEffect(() => {
    const pending = pendingTrades.find((t) => t.status === 'PENDING')
    if (!enabled || !pending) return
    const target = players.find((p) => p.id === pending.toPlayerId)
    if (!target?.isBot) return
    const t = setTimeout(() => {
      const s = useCityStore.getState()
      s.respondToTrade(pending.id, botTradeAcceptDecision(pending, s.tiles, s.config))
    }, 900)
    return () => clearTimeout(t)
  }, [enabled, pendingTrades, players])
}
