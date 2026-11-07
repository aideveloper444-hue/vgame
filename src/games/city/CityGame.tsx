import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useCityStore, netWorthOf, type CityPhase, type CityPlayer, type TradeOffer } from './cityStore'
import type { PropertyTile } from './cityBoardData'
import CityScene3D, { type HudInsets } from './CityScene3D'
import LudoBackdrop from '@/games/ludo/LudoBackdrop'
import CityTopHUD from './CityTopHUD'
import { CITY_CHAT } from './CityChatPanel'
import CityMenu from './CityMenu'
import { CardRevealModal } from './CityEventCard'
import { AuctionPanel, BuildPanel, BuyPanel, EventsPanel, ItemsPanel, TradeComposer, TradeInboxPanel } from './CityModals'
import { LandingToastView, SoldView, TurnBannerView } from './CityFxOverlay'
import { useCityBotAutomation } from './useCityBotAutomation'
import { useCityFx } from './useCityFx'
import AlphaStage, { type DiceAction } from './alpha/AlphaStage'
import { ALL_ALPHA_ART } from './alpha/alphaArt'
import { useCityMatch } from './cityMatch'
import { broadcastCityChat, leaveCityRoom, sendCityAction, setCityNetHandlers, useCityRoom } from './cityNet'
import GameResultScreen from '@/games/shared/GameResultScreen'
import { GAME_REGISTRY } from '@/games/registry'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { useChatStore } from '@/social/stores/useChatStore'

const game = GAME_REGISTRY.city

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return vp
}

function useLockBodyScroll() {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])
}

function statusFor(player: CityPlayer, isActive: boolean, phase: CityPhase, controlledHere: boolean): string | null {
  if (player.bankrupt) return 'Bankrupt'
  if (player.inJail) return 'In jail'
  if (!isActive) return null
  switch (phase) {
    case 'ROLLING':
      return controlledHere ? 'Your turn' : 'Rolling…'
    case 'MOVING':
      return 'Moving…'
    case 'AWAITING_BUY_DECISION':
      return 'Deciding…'
    case 'AUCTION':
      return 'Auction'
    case 'POST_MOVE_ACTIONS':
      return controlledHere ? 'Your move' : 'Playing…'
    default:
      return null
  }
}

/** Resolves once every ALPHAZOX image is decoded, so the board doesn't pop in piece by piece. */
function useArtReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all(
      ALL_ALPHA_ART.map((src) => {
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

/** Monopoly entry point: the mode menu until a match begins, then the match itself. */
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

const MENU_INSETS: HudInsets = { top: 90, bottom: 60, side: 160 }

function CityMenuScreen() {
  useLockBodyScroll()
  const { w, h } = useViewport()
  useEffect(() => {
    useCityStore.getState().resetGame()
  }, [])
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#03040c] text-white">
      <LudoBackdrop />
      {/* the city world idles behind the menu, blurred, while the characters load */}
      <Suspense fallback={null}>
        <CityScene3D className="absolute inset-0 h-full w-full" insets={MENU_INSETS} />
      </Suspense>
      <div className="absolute inset-0 bg-[#05060f]/55 backdrop-blur-[3px]" />
      <CityTopHUD activePlayers={0} totalPlayers={0} round={0} maxRounds={0} compact={w < 1000 || w / h < 1.15} menu />
      <div className="absolute inset-0 z-20 overflow-y-auto px-3 pb-8 pt-20">
        <CityMenu />
      </div>
    </div>
  )
}

function CityMatchView() {
  const tiles = useCityStore((s) => s.tiles)
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const phase = useCityStore((s) => s.phase)
  const pendingMovePath = useCityStore((s) => s.pendingMovePath)
  const auction = useCityStore((s) => s.auction)
  const pendingTrades = useCityStore((s) => s.pendingTrades)
  const activeEvents = useCityStore((s) => s.activeEvents)
  const finalRanking = useCityStore((s) => s.finalRanking)
  const config = useCityStore((s) => s.config)
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

  const [showTrade, setShowTrade] = useState(false)
  const [showBuild, setShowBuild] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [mapView, setMapView] = useState(false)
  const [rollKey, setRollKey] = useState(0)
  const startedAt = useRef(Date.now())

  // bots only think on the device that runs the game
  useCityBotAutomation(authoritative)
  const fx = useCityFx()
  const artReady = useArtReady()
  useLockBodyScroll()
  const handleAttack = useCallback(() => {}, [])
  const handleDefend = useCallback(() => {}, [])

  const participants = useMemo(() => seats.map((s) => ({ id: s.id, name: s.name, avatarEmoji: s.avatarEmoji, isBot: s.kind === 'bot' })), [seats])
  const isLocal = useCallback((id: string) => localSeatIds.includes(id), [localSeatIds])

  useEffect(() => {
    startedAt.current = Date.now()
    // guests receive the game from the host instead of starting their own
    if (authoritative) startGame(participants)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- actions: applied here, or sent to the host from a guest's device */
  const act = useMemo(() => {
    const st = () => useCityStore.getState()
    return {
      roll: () => (authoritative ? st().rollAndMove() : sendCityAction({ t: 'roll' })),
      buy: (buy: boolean) => (authoritative ? st().resolveBuyDecision(buy) : sendCityAction({ t: 'buy', buy })),
      auction: (playerId: string, action: 'BID' | 'PASS') => (authoritative ? st().submitAuctionAction(playerId, action) : sendCityAction({ t: 'auction', action })),
      upgrade: (tileId: number) => (authoritative ? st().upgradeProperty(tileId) : sendCityAction({ t: 'upgrade', tileId })),
      trade: (offer: Omit<TradeOffer, 'id' | 'status'>) =>
        authoritative
          ? st().proposeTrade(offer)
          : sendCityAction({ t: 'trade', toPlayerId: offer.toPlayerId, offerIds: offer.offer.propertyIds, requestIds: offer.request.propertyIds }),
      reply: (tradeId: string, accept: boolean) => (authoritative ? st().respondToTrade(tradeId, accept) : sendCityAction({ t: 'tradeReply', tradeId, accept })),
      end: () => (authoritative ? st().endTurn() : sendCityAction({ t: 'end' })),
    }
  }, [authoritative])

  /* ---------------- chat: local party chat, relayed through the host in online matches */
  const postChat = useCallback((playerId: string, name: string, text: string) => {
    useChatStore.getState().appendLocal(CITY_CHAT, { senderId: playerId, senderName: name, text })
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

  // build/trade are only allowed after your move; drop the panels once that window closes
  const current = players[currentPlayerIndex]
  const actionWindowOpen = phase === 'POST_MOVE_ACTIONS' && current !== undefined && isLocal(current.id)
  useEffect(() => {
    if (actionWindowOpen) return
    setShowTrade(false)
    setShowBuild(false)
  }, [actionWindowOpen])

  useEffect(() => {
    if (!pendingMovePath) return
    setRollKey((k) => k + 1)
  }, [pendingMovePath])

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
    startGame(participants)
  }

  // "you" is whoever this device is playing right now: the current player on their turn, else the first local seat
  const you = current && isLocal(current.id) ? current : players.find((p) => isLocal(p.id))

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
          title={won ? (localSeatIds.length > 1 ? `🏆 ${winner.name} Wins!` : '🏆 You Win!') : `😈 ${winner.name} Wins`}
          subtitle={you && localSeatIds.length === 1 ? `You finished #${yourRank} of ${players.length}` : undefined}
          coins={won ? 350 : 90}
          xp={won ? 220 : 50}
          stats={finalRanking.slice(0, 4).map((r, i) => {
            const p = players.find((x) => x.id === r.playerId)!
            return { label: `#${i + 1} ${p.name}`, value: `₹${r.netWorth}` }
          })}
          onRematch={handleRematch}
        />
      </div>
    )
  }

  // Loading / waiting UI – moved after all hooks to preserve hook order
  const loading = players.length === 0 || tiles.length === 0 || !current || !artReady
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03040c] text-sm font-bold text-slate-300">
        <LudoBackdrop />
        <span className="relative">{authoritative ? 'Setting up the board…' : 'Waiting for the host…'}</span>
      </div>
    );
  }

  const currentTile = tiles[current.position]
  const myTurn = isLocal(current.id)
  const localTrade = pendingTrades.find((t) => t.status === 'PENDING' && isLocal(t.toPlayerId))
  const ownedBy = (id: string) => tiles.filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.ownerId === id)
  const yourOwned = you ? ownedBy(you.id) : []
  const upgradable = yourOwned.filter((t) => t.level < t.maxLevel && (you?.cash ?? 0) >= t.upgradeCost)
  const canAct = myTurn && phase === 'POST_MOVE_ACTIONS'
  const auctionBidder = auction ? players.find((p) => p.id === auction.queue[0]) : undefined
  const auctionYou = auctionBidder && isLocal(auctionBidder.id) ? auctionBidder : you

  const ranked = players.map((p) => ({ player: p, netWorth: netWorthOf(p, tiles) })).sort((a, b) => b.netWorth - a.netWorth)
  const rankOf = (id: string) => ranked.findIndex((r) => r.player.id === id) + 1

  const chatSend =
    role === 'solo'
      ? undefined
      : (text: string) => {
          if (!you) return
          postChat(you.id, you.name, text)
          if (role === 'host') broadcastCityChat(you.id, you.name, text)
          else sendCityAction({ t: 'chat', text })
        }
  const diceAction: DiceAction =
    myTurn && phase === 'ROLLING' ? { kind: 'roll', onClick: act.roll } : canAct ? { kind: 'end', onClick: act.end } : { kind: 'wait' }

  return (
    <AlphaStage
      players={players}
      currentIndex={currentPlayerIndex}
      rankOf={rankOf}
      ownedCount={(id) => ownedBy(id).length}
      statusOf={(p) => statusFor(p, p.id === current.id, phase, isLocal(p.id))}
      cashDeltas={fx.cashDeltas}
      diceAction={diceAction}
      rollKey={rollKey}
      mapView={mapView}
      onMap={() => setMapView((v) => !v)}
      canBuild={canAct && yourOwned.length > 0}
      buildCount={canAct ? upgradable.length : 0}
      onBuild={() => setShowBuild(true)}
      onAttack={handleAttack}
      onDefend={handleDefend}
      onItems={() => setShowItems(true)}
      onSpecial={() => setShowEvents(true)}
      onBack={leaveToMenu}
      onSettings={() => setShowEvents(true)}
      onChat={(text) => {
        if (!you) return
        if (chatSend) chatSend(text)
        else postChat(you.id, you.name, text)
      }}
      coins={profileCoins}
      gems={profileGems}
      activePlayers={players.filter((p) => !p.bankrupt).length}
    >
      {fx.landing && <LandingToastView toast={fx.landing} top={150} />}
      {fx.sold && <SoldView fx={fx.sold} />}
      {fx.banner && <TurnBannerView banner={fx.banner} />}

      {phase === 'AWAITING_BUY_DECISION' && myTurn && currentTile.type === 'PROPERTY' && (
        <BuyPanel tile={currentTile} cash={current.cash} onBuy={() => act.buy(true)} onSkip={() => act.buy(false)} />
      )}
      {phase === 'AUCTION' && auction && (
        <AuctionPanel
          auction={auction}
          tile={tiles.find((t) => t.id === auction.tileId) as PropertyTile}
          players={players}
          you={auctionYou}
          bidIncrement={config.bidIncrement}
          onBid={() => auctionYou && act.auction(auctionYou.id, 'BID')}
          onPass={() => auctionYou && act.auction(auctionYou.id, 'PASS')}
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
      {showTrade && you && canAct && (
        <TradeComposer
          you={you}
          players={players}
          tiles={tiles}
          onSend={(to, offerIds, requestIds) =>
            act.trade({ fromPlayerId: you.id, toPlayerId: to, offer: { cash: 0, propertyIds: offerIds }, request: { cash: 0, propertyIds: requestIds } })
          }
          onClose={() => setShowTrade(false)}
        />
      )}
      {showBuild && you && canAct && <BuildPanel owned={yourOwned} cash={you.cash} onUpgrade={act.upgrade} onClose={() => setShowBuild(false)} />}
      {showEvents && <EventsPanel events={activeEvents} onClose={() => setShowEvents(false)} />}
      {showItems && (
        <ItemsPanel
          onClose={() => setShowItems(false)}
          onUseItem={(it) => {
            if (you) postChat(you.id, you.name, `Used ${it.name}! ${it.icon}`)
          }}
        />
      )}
      {fx.card && <CardRevealModal card={fx.card} onClose={fx.dismissCard} />}

      {role === 'guest' && roomStatus === 'closed' && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
          <div className="hud-glass w-full max-w-xs rounded-3xl p-6 text-center">
            <WifiOff size={36} className="mx-auto text-rose-300" />
            <p className="mt-3 text-lg font-black text-white">Host left the match</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">The game ended because the host disconnected.</p>
            <button
              type="button"
              onClick={leaveToMenu}
              className="mt-5 w-full rounded-2xl bg-gradient-to-b from-[#ffe58a] via-[#f5b52a] to-[#c47a0a] py-3 text-sm font-black uppercase tracking-wider text-[#3d2200] active:scale-95"
            >
              Back to menu
            </button>
          </div>
        </div>
      )}
    </AlphaStage>
  )
}
