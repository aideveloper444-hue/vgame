import { useEffect } from 'react'
import {
  useCityStore,
  botBuyDecision,
  botAuctionDecision,
  botUpgradeDecision,
  botRedeemDecision,
  botShouldPayJailFine,
  botTradeAcceptDecision,
} from './cityStore'
import type { PropertyTile } from './cityBoardData'

/**
 * Drives bot turns, bot auction bids and bot trade responses. Pure game behaviour — no rendering.
 * Disabled on a guest's device in online matches: only the host's game makes moves.
 */
export function useCityBotAutomation(enabled = true) {
  const tiles = useCityStore((s) => s.tiles)
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const phase = useCityStore((s) => s.phase)
  const auction = useCityStore((s) => s.auction)
  const pendingTrades = useCityStore((s) => s.pendingTrades)
  const rollAndMove = useCityStore((s) => s.rollAndMove)
  const resolveBuyDecision = useCityStore((s) => s.resolveBuyDecision)
  const submitAuctionAction = useCityStore((s) => s.submitAuctionAction)
  const upgradeProperty = useCityStore((s) => s.upgradeProperty)
  const respondToTrade = useCityStore((s) => s.respondToTrade)
  const endTurn = useCityStore((s) => s.endTurn)

  const currentPlayer = players[currentPlayerIndex]
  const currentTile = currentPlayer ? tiles[currentPlayer.position] : null

  useEffect(() => {
    if (!enabled || !currentPlayer || phase === 'GAME_OVER') return
    if (!currentPlayer.isBot) return
    if (phase === 'ROLLING') {
      const t = setTimeout(() => {
        const st = useCityStore.getState()
        const me = st.players[st.currentPlayerIndex]
        if (me && botShouldPayJailFine(me, st.config)) st.payJailFine()
        rollAndMove()
      }, 700)
      return () => clearTimeout(t)
    }
    if (phase === 'AWAITING_BUY_DECISION' && currentTile?.type === 'PROPERTY') {
      const t = setTimeout(() => resolveBuyDecision(botBuyDecision(currentPlayer, currentTile)), 700)
      return () => clearTimeout(t)
    }
    if (phase === 'POST_MOVE_ACTIONS') {
      const t = setTimeout(() => {
        if (!currentPlayer.bankrupt) {
          const redeemId = botRedeemDecision(currentPlayer, tiles)
          if (redeemId !== null) useCityStore.getState().redeemProperty(redeemId)
          const st = useCityStore.getState()
          const upgradeId = botUpgradeDecision(st.players[st.currentPlayerIndex], st.tiles)
          if (upgradeId !== null) upgradeProperty(upgradeId)
        }
        endTurn()
      }, 700)
      return () => clearTimeout(t)
    }
  }, [enabled, phase, currentPlayer, currentTile, tiles, rollAndMove, resolveBuyDecision, upgradeProperty, endTurn])

  useEffect(() => {
    if (!enabled || phase !== 'AUCTION' || !auction) return
    const bidderId = auction.queue[0]
    const bidder = players.find((p) => p.id === bidderId)
    if (!bidder?.isBot) return
    const tile = tiles.find((t) => t.id === auction.tileId) as PropertyTile
    const t = setTimeout(() => {
      const decision = botAuctionDecision(bidder, tile, auction.currentBid, useCityStore.getState().config.bidIncrement)
      submitAuctionAction(bidder.id, decision)
    }, 600)
    return () => clearTimeout(t)
  }, [enabled, phase, auction, players, tiles, submitAuctionAction])

  useEffect(() => {
    const pending = pendingTrades.find((t) => t.status === 'PENDING')
    if (!enabled || !pending) return
    const target = players.find((p) => p.id === pending.toPlayerId)
    if (!target?.isBot) return
    const t = setTimeout(() => {
      respondToTrade(pending.id, botTradeAcceptDecision(pending, tiles))
    }, 800)
    return () => clearTimeout(t)
  }, [enabled, pendingTrades, players, tiles, respondToTrade])
}
