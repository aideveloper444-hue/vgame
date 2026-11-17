import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useCityStore, canBuildOn, ownedBy, type CityPlayer, type TradeOffer } from './cityStore'
import { isProperty, type PropertyTile } from './cityBoardData'
import CityMenu from './CityMenu'
import { useCityBotAutomation } from './useCityBotAutomation'
import { useCityFx } from './useCityFx'
import { useCityMatch, useTycoonVariant } from './cityMatch'
import { broadcastCityChat, leaveCityRoom, sendCityAction, setCityNetHandlers, useCityRoom } from './cityNet'
import { money } from './cityFormat'
import TycoonStage, { ALL_TYCOON_ART, BOARD_IMG, TYCOON_CHAT, type HubState } from './tycoon/TycoonStage'
import {
  AuctionPanel,
  BankPanel,
  BuyPanel,
  CardModal,
  CasinoPanel,
  CasinoResultView,
  HeadlineToast,
  InfoPanel,
  ItemsPanel,
  MyCardsPanel,
  SettingsPanel,
  TileInfoPanel,
  TradeComposer,
  TradeInboxPanel,
  TurnBannerView,
} from './tycoon/TycoonPanels'
import GameResultScreen from '@/games/shared/GameResultScreen'
import { GAME_REGISTRY } from '@/games/registry'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { useChatStore } from '@/social/stores/useChatStore'

const game = GAME_REGISTRY.city

function useLockBodyScroll() {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])
}

/** Resolves once the board art is decoded, so the board doesn't pop in piece by piece. */
function useArtReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all(
      ALL_TYCOON_ART.map((src) => {
        const img = new Image()
        img.src = src
        return img.decode().catch(() => undefined)
      }),
    ).then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])
  return ready
}

/** World Tycoon entry point: the mode menu until a match begins, then the match itself. */
export default function CityGame() {
  const screen = useCityMatch((s) => s.screen)
  const matchId = useCityMatch((s) => s.matchId)

  useEffect(() => {
    // leaving the page always closes any room and forgets the match
    return () => {
      leaveCityRoom()
      useCityMatch.getState().backToMenu()
      useCityStore.getState().resetGame()
    }
  }, [])

  if (screen === 'menu') return <CityMenuScreen />
  return <CityMatchView key={matchId} />
}

function CityMenuScreen() {
  useLockBodyScroll()
  useEffect(() => {
    useCityStore.getState().resetGame()
  }, [])
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#03040c] text-white">
      <div className="absolute inset-0 scale-110 bg-cover bg-center blur-[6px] brightness-[0.45]" style={{ backgroundImage: `url(${BOARD_IMG})` }} />
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-4">
        <p className="tycoon-title text-[44px] leading-none" style={{ fontFamily: 'Bangers, Oswald, sans-serif' }}>
          WORLD TYCOON
        </p>
      </div>
      <div className="absolute inset-0 z-20 overflow-y-auto px-3 pb-8 pt-20">
        <CityMenu />
      </div>
    </div>
  )
}

type Sheet = 'cards' | 'bank' | 'info' | 'items' | 'settings' | 'trade' | null

function CityMatchView() {
  const tiles = useCityStore((s) => s.tiles)
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const phase = useCityStore((s) => s.phase)
  const auction = useCityStore((s) => s.auction)
  const pendingTrades = useCityStore((s) => s.pendingTrades)
  const finalRanking = useCityStore((s) => s.finalRanking)
  const config = useCityStore((s) => s.config)
  const dice = useCityStore((s) => s.dice)
  const extraTurn = useCityStore((s) => s.extraTurn)
  const roundNumber = useCityStore((s) => s.roundNumber)
  const clubPot = useCityStore((s) => s.clubPot)
  const casinoTray = useCityStore((s) => s.casinoTray)
  const casinoResult = useCityStore((s) => s.casinoResult)
  const eventLog = useCityStore((s) => s.eventLog)
  const startGame = useCityStore((s) => s.startGame)
  const resetGame = useCityStore((s) => s.resetGame)
  const profileCoins = usePlayerStore((s) => s.profile.coins)
  const profileGems = usePlayerStore((s) => s.profile.gems)

  const role = useCityMatch((s) => s.role)
  const seats = useCityMatch((s) => s.seats)
  const localSeatIds = useCityMatch((s) => s.localSeatIds)
  const backToMenu = useCityMatch((s) => s.backToMenu)
  const roomStatus = useCityRoom((s) => s.status)
  const authoritative = role !== 'guest'

  const [sheet, setSheet] = useState<Sheet>(null)
  const [mapView, setMapView] = useState(false)
  const [infoTileId, setInfoTileId] = useState<number | null>(null)
  const [seenCasino, setSeenCasino] = useState<number | null>(null)
  const startedAt = useRef(Date.now())

  const isLocal = useCallback((id: string) => localSeatIds.includes(id), [localSeatIds])
  useCityBotAutomation(authoritative)
  const fx = useCityFx(isLocal)
  const artReady = useArtReady()
  useLockBodyScroll()

  const participants = useMemo(() => seats.map((s) => ({ id: s.id, name: s.name, avatarEmoji: s.avatarEmoji, isBot: s.kind === 'bot' })), [seats])

  useEffect(() => {
    startedAt.current = Date.now()
    // guests receive the game from the host instead of starting their own
    if (authoritative) startGame(participants, useTycoonVariant.getState().variant)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- actions: applied here, or sent to the host from a guest's device */
  const act = useMemo(() => {
    const st = () => useCityStore.getState()
    return {
      roll: () => (authoritative ? st().rollAndMove() : sendCityAction({ t: 'roll' })),
      buy: (buy: boolean) => (authoritative ? st().resolveBuyDecision(buy) : sendCityAction({ t: 'buy', buy })),
      bid: (playerId: string, action: 'BID' | 'PASS', raise?: number) => (authoritative ? st().submitAuctionAction(playerId, action, raise) : sendCityAction({ t: 'auction', action, raise })),
      casino: (bet: boolean) => (authoritative ? st().casinoDecision(bet) : sendCityAction({ t: 'casino', bet })),
      upgrade: (tileId: number) => (authoritative ? st().upgradeProperty(tileId) : sendCityAction({ t: 'upgrade', tileId })),
      sell: (tileId: number) => (authoritative ? st().sellBuilding(tileId) : sendCityAction({ t: 'sell', tileId })),
      mortgage: (tileId: number) => (authoritative ? st().mortgageProperty(tileId) : sendCityAction({ t: 'mortgage', tileId })),
      redeem: (tileId: number) => (authoritative ? st().redeemProperty(tileId) : sendCityAction({ t: 'redeem', tileId })),
      payFine: () => (authoritative ? st().payJailFine() : sendCityAction({ t: 'payFine' })),
      freePass: () => (authoritative ? st().useFreePass() : sendCityAction({ t: 'freePass' })),
      trade: (offer: Omit<TradeOffer, 'id' | 'status'>) =>
        authoritative
          ? st().proposeTrade(offer)
          : sendCityAction({ t: 'trade', toPlayerId: offer.toPlayerId, offerIds: offer.offer.propertyIds, requestIds: offer.request.propertyIds, offerCash: offer.offer.cash, requestCash: offer.request.cash }),
      reply: (tradeId: string, accept: boolean) => (authoritative ? st().respondToTrade(tradeId, accept) : sendCityAction({ t: 'tradeReply', tradeId, accept })),
      end: () => (authoritative ? st().endTurn() : sendCityAction({ t: 'end' })),
    }
  }, [authoritative])

  /* ---------------- chat: local party chat, relayed through the host in online matches */
  const postChat = useCallback((playerId: string, name: string, text: string) => {
    useChatStore.getState().appendLocal(TYCOON_CHAT, { senderId: playerId, senderName: name, text })
  }, [])

  useEffect(() => {
    if (role === 'solo') return
    setCityNetHandlers({
      onChat: (playerId, name, text, fromSeat) => {
        postChat(playerId, name, text)
        if (role === 'host') broadcastCityChat(playerId, name, text, fromSeat)
      },
    })
  }, [role, postChat])

  const current = players[currentPlayerIndex] as CityPlayer | undefined
  const myTurn = current !== undefined && isLocal(current.id)
  const canManage = myTurn && (phase === 'ROLLING' || phase === 'POST_MOVE_ACTIONS')

  // managing property is only allowed on your own turn; drop those sheets once the window closes
  useEffect(() => {
    if (canManage) return
    setSheet((s) => (s === 'trade' ? null : s))
  }, [canManage])

  function leaveToMenu() {
    leaveCityRoom()
    resetGame()
    backToMenu()
  }

  function handleRematch() {
    if (!authoritative) {
      leaveToMenu()
      return
    }
    resetGame()
    startedAt.current = Date.now()
    startGame(participants, useTycoonVariant.getState().variant)
  }

  // "you" is whoever this device is playing right now: the current player on their turn, else the first local seat
  const you = current && myTurn ? current : players.find((p) => isLocal(p.id))

  if (phase === 'GAME_OVER' && finalRanking) {
    const winnerId = finalRanking[0].playerId
    const winner = players.find((p) => p.id === winnerId)!
    const won = isLocal(winnerId)
    const yourRank = you ? finalRanking.findIndex((r) => r.playerId === you.id) + 1 : 0
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <GameResultScreen
          game={game}
          won={won}
          title={won ? (localSeatIds.length > 1 ? `🏆 ${winner.name} Wins!` : '🏆 You Win!') : `${winner.name} Wins`}
          subtitle={you && localSeatIds.length === 1 ? `You finished #${yourRank} of ${players.length}` : undefined}
          coins={won ? 350 : 90}
          xp={won ? 220 : 50}
          stats={finalRanking.slice(0, 4).map((r, i) => {
            const p = players.find((x) => x.id === r.playerId)!
            return { label: `#${i + 1} ${p.name}`, value: p.bankrupt ? 'Bankrupt' : money(r.netWorth) }
          })}
          onRematch={handleRematch}
        />
      </div>
    )
  }

  if (players.length === 0 || tiles.length === 0 || !current || !artReady) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03040c] text-sm font-bold text-slate-300">
        <span>{authoritative ? 'Setting up the board…' : 'Waiting for the host…'}</span>
      </div>
    )
  }

  const currentTile = tiles[current.position]
  const localTrade = pendingTrades.find((t) => t.status === 'PENDING' && isLocal(t.toPlayerId))
  const yourOwned = you ? ownedBy(tiles, you.id) : []
  const buildable = you && canManage ? yourOwned.filter((t) => canBuildOn(you, t, tiles, config)).length : 0
  const auctionBidder = auction ? players.find((p) => p.id === auction.queue[0]) : undefined
  const auctionYou = auctionBidder && isLocal(auctionBidder.id) ? auctionBidder : you
  const showCasinoResult = casinoResult && casinoResult.seq !== seenCasino

  /* ---------------- the centre hub: what's happening and the main buttons */
  const hub: HubState = (() => {
    const who = myTurn && localSeatIds.length === 1 ? 'Your turn' : `${current.name}'s turn`
    const title = `Round ${roundNumber} · ${who}`
    const total = dice ? dice[0] + dice[1] : 0
    switch (phase) {
      case 'ROLLING':
        if (!myTurn) return { title, message: current.inJail ? `${current.name} is in Jail…` : `${current.name} is rolling…`, buttons: [] }
        if (current.inJail)
          return {
            title,
            message: `In Jail (${config.jailTurns - current.jailTurnsServed} ${config.jailTurns - current.jailTurnsServed === 1 ? 'try' : 'tries'} left): roll a double six, pay the fine or use a Free Pass.`,
            buttons: [
              { label: 'Roll', tone: 'gold', onClick: act.roll },
              { label: `Pay ${money(config.jailFine)}`, tone: 'ghost', onClick: act.payFine, disabled: current.cash < config.jailFine },
              ...(current.freePasses.length > 0 ? [{ label: 'Free Pass', tone: 'green' as const, onClick: act.freePass }] : []),
            ],
          }
        return { title, message: extraTurn ? 'Double six! Roll again.' : 'Roll the dice and move clockwise.', buttons: [{ label: 'Roll dice', tone: 'gold', onClick: act.roll }] }
      case 'MOVING':
        return { title, message: `${current.name} moves ${total} spaces…`, buttons: [] }
      case 'AWAITING_BUY_DECISION':
        return { title, message: myTurn ? `Buy ${currentTile.name} or send it to auction.` : `${current.name} is deciding on ${currentTile.name}…`, buttons: [] }
      case 'AUCTION':
        return { title, message: `The Bank is auctioning ${auction ? tiles[auction.tileId].name : ''}`, buttons: [] }
      case 'CASINO':
        return { title, message: myTurn ? 'Place a bet at the Casino, or walk away.' : `${current.name} is at the Casino…`, buttons: [] }
      case 'POST_MOVE_ACTIONS': {
        if (!myTurn) return { title, message: `${current.name} is on ${currentTile.name}`, buttons: [] }
        const where = current.inJail ? 'You are in Jail. You can still build and trade.' : `On ${currentTile.name}. Build, trade or end your turn.`
        return { title, message: where, buttons: [{ label: extraTurn && !current.inJail ? 'Roll again' : 'End turn', tone: 'green', onClick: act.end }] }
      }
      default:
        return { title, message: '', buttons: [] }
    }
  })()

  const chatSend = (text: string) => {
    if (!you) return
    postChat(you.id, you.name, text)
    if (role === 'host') broadcastCityChat(you.id, you.name, text)
    else if (role === 'guest') sendCityAction({ t: 'chat', text })
  }

  return (
    <TycoonStage
      isLocal={isLocal}
      cashDeltas={fx.cashDeltas}
      hub={hub}
      mapView={mapView}
      onMap={() => setMapView((v) => !v)}
      onTileClick={setInfoTileId}
      onAction={(k) => setSheet(k)}
      badges={{ cards: buildable, bank: yourOwned.filter((t) => t.mortgaged).length, items: you?.freePasses.length ?? 0 }}
      onBack={() => setSheet('settings')}
      onSettings={() => setSheet('settings')}
      onChat={chatSend}
      onSeatRoll={myTurn && phase === 'ROLLING' ? act.roll : undefined}
      coins={profileCoins}
      gems={profileGems}
    >
      {fx.banner && <TurnBannerView banner={fx.banner} />}
      {fx.toast && <HeadlineToast key={fx.toast.id} text={fx.toast.text} />}

      {phase === 'AWAITING_BUY_DECISION' && myTurn && isProperty(currentTile) && (
        <BuyPanel tile={currentTile} tiles={tiles} cash={current.cash} config={config} onBuy={() => act.buy(true)} onAuction={() => act.buy(false)} />
      )}
      {phase === 'CASINO' && myTurn && <CasinoPanel cash={current.cash} tray={casinoTray} config={config} onBet={() => act.casino(true)} onWalk={() => act.casino(false)} />}
      {phase === 'AUCTION' && auction && (
        <AuctionPanel
          auction={auction}
          tile={tiles[auction.tileId] as PropertyTile}
          tiles={tiles}
          players={players}
          you={auctionYou}
          config={config}
          onBid={(raise) => auctionYou && act.bid(auctionYou.id, 'BID', raise)}
          onPass={() => auctionYou && act.bid(auctionYou.id, 'PASS')}
        />
      )}
      {localTrade && (
        <TradeInboxPanel
          trade={localTrade}
          from={players.find((p) => p.id === localTrade.fromPlayerId)}
          tiles={tiles}
          onAccept={() => act.reply(localTrade.id, true)}
          onReject={() => act.reply(localTrade.id, false)}
        />
      )}

      {sheet === 'cards' && you && (
        <MyCardsPanel you={you} tiles={tiles} config={config} canManage={canManage && you.id === current.id} onBuild={act.upgrade} onSell={act.sell} onTrade={() => setSheet('trade')} onClose={() => setSheet(null)} />
      )}
      {sheet === 'trade' && you && canManage && (
        <TradeComposer
          you={you}
          players={players}
          tiles={tiles}
          onSend={(to, offerIds, requestIds, offerCash, requestCash) =>
            act.trade({ fromPlayerId: you.id, toPlayerId: to, offer: { cash: offerCash, propertyIds: offerIds }, request: { cash: requestCash, propertyIds: requestIds } })
          }
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'bank' && (
        <BankPanel
          you={you}
          tiles={tiles}
          config={config}
          canManage={canManage && you?.id === current.id}
          clubPot={clubPot}
          casinoTray={casinoTray}
          onMortgage={act.mortgage}
          onRedeem={act.redeem}
          onSell={act.sell}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'info' && <InfoPanel log={eventLog} players={players} tiles={tiles} config={config} round={roundNumber} onClose={() => setSheet(null)} />}
      {sheet === 'items' && (
        <ItemsPanel
          you={you}
          canUseNow={myTurn && phase === 'ROLLING' && current.inJail}
          onUse={() => {
            act.freePass()
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'settings' && <SettingsPanel config={config} round={roundNumber} onLeave={leaveToMenu} onClose={() => setSheet(null)} />}
      {infoTileId !== null && tiles[infoTileId] && (
        <TileInfoPanel tile={tiles[infoTileId]} tiles={tiles} players={players} config={config} clubPot={clubPot} casinoTray={casinoTray} onClose={() => setInfoTileId(null)} />
      )}

      {showCasinoResult && <CasinoResultView result={casinoResult} player={players.find((p) => p.id === casinoResult.playerId)} onClose={() => setSeenCasino(casinoResult.seq)} />}
      {fx.card && <CardModal card={fx.card} onClose={fx.dismissCard} />}

      {role === 'guest' && roomStatus === 'closed' && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
          <div className="tycoon-panel w-full max-w-xs rounded-3xl p-6 text-center">
            <WifiOff size={36} className="mx-auto text-rose-300" />
            <p className="mt-3 text-lg font-black text-white">Host left the match</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">The game ended because the host disconnected.</p>
            <button type="button" onClick={leaveToMenu} className="tycoon-btn tycoon-btn-gold mt-5 w-full py-3 text-sm">
              Back to menu
            </button>
          </div>
        </div>
      )}
    </TycoonStage>
  )
}

