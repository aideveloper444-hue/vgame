import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useLudoStore, botChooseMove, ordinal, ROLL_TIMEOUT_MS, type LegalMove, type LudoPlayer } from './ludoStore'
import { getBoard, seatColors } from './ludoBoards'
import { TEAM_BUILD } from './ludoCharacters'
import { COLOR_DEEP, COLOR_GLOW, type LudoColor } from './ludoBoardLayout'
import LudoScene3D, { type BoardSlot } from './LudoScene3D'
import LudoPlayerCard from './LudoPlayerCard'
import LudoBackdrop from './LudoBackdrop'
import LudoTopBar from './LudoTopBar'
import LudoResultsBoard from './LudoResultsBoard'
import LudoRankCelebration from './LudoRankCelebration'
import LudoFireworks from './LudoFireworks'
import GameResultScreen from '@/games/shared/GameResultScreen'
import { GAME_REGISTRY } from '@/games/registry'
import { ChatBar, EmoteBar, FloatingEmotes, GiftButton, GiftSheet, Toast, VoiceChip, type GiftDef } from './LudoControls'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import LudoDice from './LudoDice'
import { ludoSfx } from '@/lib/sound'
import LudoMenu from './LudoMenu'
import LudoLoadingScreen from './LudoLoadingScreen'
import { useLudoMatch } from './ludoMatch'
import { broadcastSay, broadcastSpin, leaveRoom, sendToHost, setNetHandlers, useLudoRoom } from './ludoNet'

const BOT_GIRLS = ['Diya', 'Ananya', 'Meera', 'Priya']
const BOT_BOYS = ['Rohan', 'Vikram', 'Arjun', 'Kabir']
/** The lounge crew from the poster: each team's hero, when a computer player takes that seat. */
const BOT_BY_COLOR: Partial<Record<LudoColor, string>> = { RED: 'Rabhindra Patra', GREEN: 'anishhh', BLUE: 'Geethika Chowdary', YELLOW: 'Doctor' }

const CAPTURE_LINES = ['Nice move! 🔥', 'Got you! 💥', 'Boom! 💥', 'Ouch, that hurt! 😈']
const FINISH_LINES = ['Home safe! ✅', 'Yes! 🎉', 'One down! 🙌']
const RANK_LINES = ['All home! 🎆', 'Done! 🎉', 'Made it! 🏁']
const BOT_REPLIES = ['Bring it on! 😎', 'Haha 😂', 'Good luck! 😜', 'GG 🤝', 'Watch this! 🎲']

/** How long the die tumbles before the roll resolves in the store. */
const ROLL_SPIN_MS = 650
const game = GAME_REGISTRY.ludo

const BOT_ROLL_DELAY_MS = 550
const BOT_PICK_DELAY_MS = 500
/** How long the crackers play after a player finishes before play resumes (and before the results board, at the end). */
const RANK_CELEBRATION_MS = 4200
/** Small crackers when a single token reaches home. */
const HOME_POP_MS = 2600

/** Width / height of the match column, matching the lounge poster the table is styled after. */
const COLUMN_ASPECT = 0.94
/** Wider columns are laid out at this width (the phone layout) and zoomed up to fill the column. */
const DESIGN_WIDTH = 500
/** Minimum design height: squat screens scale by height too, so cards and controls never squeeze the board. */
const DESIGN_HEIGHT = 780

/** Easy bots mostly move a random token; smart bots always take the best-looking move. */
function pickBotMove(level: 'easy' | 'smart', moves: LegalMove[], players: LudoPlayer[], color: LudoPlayer['color']): string {
  if (level === 'easy' && Math.random() < 0.7) return moves[Math.floor(Math.random() * moves.length)].tokenId
  return botChooseMove(getBoard(useLudoStore.getState().arms), moves, players, color)
}

function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

function useLockBodyScroll() {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])
}

/** Ludo entry point: the mode menu until a match begins, then the match itself. */
export default function LudoGame() {
  const screen = useLudoMatch((s) => s.screen)
  const matchId = useLudoMatch((s) => s.matchId)

  // leaving the Ludo route always closes any room and forgets the match
  useEffect(
    () => () => {
      leaveRoom()
      useLudoMatch.getState().backToMenu()
      useLudoStore.getState().resetGame()
    },
    [],
  )

  if (screen === 'menu') return <LudoMenuScreen />
  return <LudoMatchView key={matchId} />
}

function LudoMenuScreen() {
  useLockBodyScroll()
  useEffect(() => {
    useLudoStore.getState().resetGame()
  }, [])
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#07040f]">
      <LudoBackdrop />
      {/* the real board idles behind the menu, blurred, while the characters load */}
      <LudoScene3D className="absolute inset-0 h-full w-full" slot={null} showLoader={false} />
      <div className="absolute inset-0 bg-[#07040f]/50 backdrop-blur-[3px]" />
      <div className="absolute inset-0 z-10 overflow-y-auto px-3 pb-8 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="@container mx-auto max-w-[34rem]">
          <LudoTopBar />
        </div>
        <div className="mt-5">
          <LudoMenu />
        </div>
      </div>
    </div>
  )
}

function LudoMatchView() {
  const players = useLudoStore((s) => s.players)
  const phase = useLudoStore((s) => s.phase)
  const currentPlayerIndex = useLudoStore((s) => s.currentPlayerIndex)
  const lastRoll = useLudoStore((s) => s.lastRoll)
  const rollCount = useLudoStore((s) => s.rollCount)
  const legalMoves = useLudoStore((s) => s.legalMoves)
  const lastEvent = useLudoStore((s) => s.lastEvent)
  const pendingMove = useLudoStore((s) => s.pendingMove)
  const rankings = useLudoStore((s) => s.rankings)
  const bestRoll = useLudoStore((s) => s.bestRoll)
  const startGame = useLudoStore((s) => s.startGame)
  const selectToken = useLudoStore((s) => s.selectToken)
  const resetGame = useLudoStore((s) => s.resetGame)
  const logChat = useLudoStore((s) => s.logChat)

  const role = useLudoMatch((s) => s.role)
  const seats = useLudoMatch((s) => s.seats)
  const localSeatIds = useLudoMatch((s) => s.localSeatIds)
  const botLevel = useLudoMatch((s) => s.botLevel)
  const backToMenu = useLudoMatch((s) => s.backToMenu)
  const roomStatus = useLudoRoom((s) => s.status)
  const authoritative = role !== 'guest'

  const rootRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState<BoardSlot | null>(null)
  const [spinning, setSpinning] = useState(false)
  const spinningRef = useRef(false)
  const spinTimer = useRef<number | undefined>(undefined)
  const [sixBurst, setSixBurst] = useState(0)
  const [speech, setSpeech] = useState<Record<string, string>>({})
  const [statsRevealed, setStatsRevealed] = useState(false)
  const [giftOpen, setGiftOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [celebration, setCelebration] = useState<{ id: string; playerId: string; rank: number } | null>(null)
  const celebratingRef = useRef(false)
  celebratingRef.current = !!celebration
  const [homePop, setHomePop] = useState<string | null>(null)
  const [emotes, setEmotes] = useState<{ id: number; emoji: string; x: number }[]>([])
  const lastActorTokenId = useRef<string | null>(null)
  const { width: viewportWidth, height: viewportHeight } = useViewportSize()
  // the match is laid out in a column shaped like the lounge poster (a touch wider than tall) on every screen
  const columnWidth = Math.min(viewportWidth, viewportHeight * COLUMN_ASPECT)
  const zoom = Math.max(1, Math.min(columnWidth / DESIGN_WIDTH, viewportHeight / DESIGN_HEIGHT))
  // tablets and big screens held sideways: players and controls move to side columns so the board can use the full height
  const landscape = viewportWidth >= 900 && viewportHeight >= 480 && viewportWidth / viewportHeight >= 1.3
  // short landscape screens (7-inch tablets) use the slim player cards
  const sideCompact = viewportHeight < 720
  useLockBodyScroll()

  // The intro screen paints first; the 3D table mounts a couple of frames later (its setup blocks the
  // main thread), and the intro fades out once the scene reports its characters are drawn.
  const [sceneMounted, setSceneMounted] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [introGone, setIntroGone] = useState(false)
  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSceneMounted(true))
    })
    const minShow = window.setTimeout(() => setIntroDone(true), 900)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(minShow)
    }
  }, [])
  const revealed = sceneReady && introDone
  useEffect(() => {
    if (!revealed) return
    const t = window.setTimeout(() => setIntroGone(true), 600)
    return () => window.clearTimeout(t)
  }, [revealed])
  const handleSceneReady = useCallback(() => setSceneReady(true), [])

  // bots get a name that fits the character on their seat (girls' seats have long-haired heroines)
  const participants = useMemo(() => {
    const colors = seatColors(seats.length)
    const pools = { female: [...BOT_GIRLS], male: [...BOT_BOYS] }
    return seats.map((s, i) => {
      const build = TEAM_BUILD[colors[i] ?? 'RED']
      const name = s.kind === 'bot' ? (BOT_BY_COLOR[colors[i]] ?? pools[build].shift() ?? s.name) : s.name
      return { id: s.id, name, avatarEmoji: s.avatarEmoji, isBot: s.kind === 'bot' }
    })
  }, [seats])
  const isLocal = useCallback((id: string) => localSeatIds.includes(id), [localSeatIds])

  useEffect(() => {
    // guests receive the game from the host instead of starting their own
    if (authoritative) startGame(participants)
    return () => window.clearTimeout(spinTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track the board slot's rectangle so the 3D camera can frame the board inside it.
  useLayoutEffect(() => {
    const root = rootRef.current
    const el = slotRef.current
    if (!root || !el) return
    const measure = () => {
      const r = root.getBoundingClientRect()
      const s = el.getBoundingClientRect()
      const next = { left: s.left - r.left, top: s.top - r.top, width: s.width, height: s.height }
      setSlot((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next,
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    ro.observe(el)
    return () => ro.disconnect()
  }, [statsRevealed, landscape])

  const say = useCallback((playerId: string, text: string, ms = 2400) => {
    setSpeech((prev) => ({ ...prev, [playerId]: text }))
    window.setTimeout(() => {
      setSpeech((prev) => {
        if (prev[playerId] !== text) return prev
        const next = { ...prev }
        delete next[playerId]
        return next
      })
    }, ms)
  }, [])

  useEffect(() => {
    if (pendingMove) lastActorTokenId.current = pendingMove.tokenId
  }, [pendingMove])

  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'capture' || lastEvent.type === 'finish' || lastEvent.type === 'win') {
      const tokenId = lastActorTokenId.current
      const actor = useLudoStore.getState().players.find((p) => p.tokens.some((t) => t.id === tokenId))
      if (actor) {
        const lines = lastEvent.type === 'capture' ? CAPTURE_LINES : lastEvent.type === 'win' ? RANK_LINES : FINISH_LINES
        say(actor.id, lines[Math.floor(Math.random() * lines.length)], 2600)
      }
    }
  }, [lastEvent, say])

  // a player bringing their last warrior home: crackers and their place, then play resumes for the rest
  useEffect(() => {
    if (lastEvent?.type !== 'win' || !lastEvent.effectId || !lastEvent.playerId || !lastEvent.rank) return
    setCelebration({ id: lastEvent.effectId, playerId: lastEvent.playerId, rank: lastEvent.rank })
  }, [lastEvent])
  const celebrationId = celebration?.id
  useEffect(() => {
    if (!celebrationId) return
    const t = window.setTimeout(() => setCelebration((c) => (c?.id === celebrationId ? null : c)), RANK_CELEBRATION_MS)
    return () => window.clearTimeout(t)
  }, [celebrationId])

  // every token that reaches home gets a little burst of crackers
  useEffect(() => {
    if (lastEvent?.type !== 'finish' || !lastEvent.effectId) return
    setHomePop(lastEvent.effectId)
  }, [lastEvent])
  useEffect(() => {
    if (!homePop) return
    const t = window.setTimeout(() => setHomePop((h) => (h === homePop ? null : h)), HOME_POP_MS)
    return () => window.clearTimeout(t)
  }, [homePop])

  // a six celebrates on every device, whoever rolled it
  useEffect(() => {
    if (rollCount && useLudoStore.getState().lastRoll === 6) setSixBurst((n) => n + 1)
  }, [rollCount])

  useEffect(() => {
    if (!sixBurst) return
    const t = window.setTimeout(() => setSixBurst(0), 1400)
    return () => window.clearTimeout(t)
  }, [sixBurst])

  const currentPlayer = players[currentPlayerIndex]

  /** Tumble the die; on the device that runs the game, resolve the roll once the animation lands. */
  const startSpin = useCallback(() => {
    if (spinningRef.current) return
    spinningRef.current = true
    setSpinning(true)
    spinTimer.current = window.setTimeout(() => {
      spinningRef.current = false
      setSpinning(false)
      if (authoritative) useLudoStore.getState().rollDice()
    }, ROLL_SPIN_MS)
  }, [authoritative])

  const performRoll = useCallback(() => {
    if (!authoritative) {
      if (!spinningRef.current) sendToHost({ t: 'roll' })
      return
    }
    if (spinningRef.current || celebratingRef.current || useLudoStore.getState().phase !== 'rolling') return
    if (role === 'host') broadcastSpin()
    startSpin()
  }, [authoritative, role, startSpin])

  const requestSelect = useCallback(
    (tokenId: string) => (authoritative ? useLudoStore.getState().selectToken(tokenId) : sendToHost({ t: 'select', tokenId })),
    [authoritative],
  )

  /** Show and log a chat line on the device that runs the game, and relay it to connected friends. */
  const postChat = useCallback(
    (playerId: string, text: string, fromSeat?: string, allowBotReply = true) => {
      say(playerId, text, 2200)
      logChat(playerId, text)
      if (role === 'host') broadcastSay(playerId, text, fromSeat)
      const bots = useLudoStore.getState().players.filter((p) => p.isBot)
      if (allowBotReply && bots.length && Math.random() < 0.5) {
        const bot = bots[Math.floor(Math.random() * bots.length)]
        const reply = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)]
        window.setTimeout(() => postChat(bot.id, reply, undefined, false), 900 + Math.random() * 600)
      }
    },
    [say, logChat, role],
  )

  // network callbacks always see the latest handlers
  const handlersRef = useRef({ performRoll, startSpin, postChat, say })
  handlersRef.current = { performRoll, startSpin, postChat, say }
  useEffect(() => {
    setNetHandlers({
      onRoll: () => handlersRef.current.performRoll(),
      onChat: (playerId, text) => handlersRef.current.postChat(playerId, text, playerId),
      onSpin: () => handlersRef.current.startSpin(),
      onSay: (playerId, text) => handlersRef.current.say(playerId, text, 2200),
    })
    return () => setNetHandlers({})
  }, [])

  useEffect(() => {
    if (!revealed || !authoritative || !currentPlayer || phase === 'gameOver' || !currentPlayer.isBot || celebration) return
    if (phase === 'rolling' && !spinning) {
      const t = window.setTimeout(performRoll, BOT_ROLL_DELAY_MS)
      return () => window.clearTimeout(t)
    }
    if (phase === 'selecting') {
      const t = window.setTimeout(() => selectToken(pickBotMove(botLevel, legalMoves, players, currentPlayer.color)), BOT_PICK_DELAY_MS)
      return () => window.clearTimeout(t)
    }
  }, [revealed, authoritative, phase, currentPlayerIndex, currentPlayer, legalMoves, players, spinning, performRoll, selectToken, botLevel, celebration])

  // the countdown ring on the dice, shown on every device while a person is due to roll
  const [rollClock, setRollClock] = useState<{ key: number; ms: number } | null>(null)
  const awaitingHumanRoll = revealed && !!currentPlayer && !currentPlayer.isBot && phase === 'rolling' && !spinning && !celebration
  useEffect(() => {
    setRollClock(awaitingHumanRoll ? { key: Date.now(), ms: ROLL_TIMEOUT_MS } : null)
  }, [awaitingHumanRoll, rollCount, currentPlayerIndex])

  // a big banner sweeps in whenever the turn passes to someone new
  const [turnBanner, setTurnBanner] = useState<{ id: number; text: string; color: LudoColor; mine: boolean } | null>(null)
  // only once the loading screen has cleared (it used to flash over the intro)
  const bannerSeat = revealed && introGone && phase !== 'gameOver' ? currentPlayer : undefined
  useEffect(() => {
    if (!bannerSeat) return
    const mine = isLocal(bannerSeat.id)
    const id = Date.now()
    setTurnBanner({ id, text: mine ? 'YOUR TURN' : `${bannerSeat.name.split(' ')[0]}'s turn`, color: bannerSeat.color, mine })
    const t = window.setTimeout(() => setTurnBanner((b) => (b?.id === id ? null : b)), 1500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerSeat?.id])

  // a soft chime when it becomes this device's turn to roll
  const myRollDue = awaitingHumanRoll && !!currentPlayer && isLocal(currentPlayer.id)
  // nobody out on the board yet: remind the player that only a six brings a warrior out of home
  const homeFinish = getBoard(useLudoStore.getState().arms).finish
  const needSix =
    myRollDue &&
    !!currentPlayer &&
    currentPlayer.tokens.some((t) => t.distance === -1) &&
    currentPlayer.tokens.every((t) => t.distance === -1 || t.distance >= homeFinish)
  useEffect(() => {
    if (myRollDue) ludoSfx.yourTurn()
  }, [myRollDue, currentPlayerIndex])

  // people get 10 seconds to roll; after that the turn passes on (bots roll on their own schedule)
  useEffect(() => {
    if (!revealed || !authoritative || !currentPlayer || currentPlayer.isBot || phase !== 'rolling' || spinning || celebration) return
    const t = window.setTimeout(() => {
      if (!spinningRef.current) useLudoStore.getState().skipTurn()
    }, ROLL_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [revealed, authoritative, currentPlayer, phase, spinning, celebration, rollCount, currentPlayerIndex])

  const speaker = currentPlayer && isLocal(currentPlayer.id) ? currentPlayer : players.find((p) => isLocal(p.id))

  function handleQuickChat(text: string) {
    if (!speaker) return
    if (authoritative) postChat(speaker.id, text)
    else {
      say(speaker.id, text, 2200)
      sendToHost({ t: 'chat', text })
    }
  }

  const showToast = useCallback((text: string) => {
    const id = Date.now()
    setToast({ id, text })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2600)
  }, [])

  // a roll that wasn't a six while every warrior was still at home: say why nothing moved
  useEffect(() => {
    if (lastEvent?.type !== 'noMove') return
    const st = useLudoStore.getState()
    const entry = st.eventLog.find((e) => e.icon === '🚫')
    const roller = entry && st.players.find((pl) => pl.color === entry.color)
    if (!roller) return
    const fin = getBoard(st.arms).finish
    const allHome = roller.tokens.every((t) => t.distance === -1 || t.distance >= fin)
    if (!allHome) return
    showToast(isLocal(roller.id) ? 'You need a 6 to bring a warrior out!' : `${roller.name.split(' ')[0]} needs a 6 to leave home`)
  }, [lastEvent, showToast, isLocal])

  function sendEmote(emoji: string) {
    setEmotes((list) => [...list.slice(-5), { id: Date.now() + Math.random(), emoji, x: 20 + Math.random() * 55 }])
    handleQuickChat(emoji)
  }

  function sendGift(toId: string, gift: GiftDef) {
    const to = players.find((p) => p.id === toId)
    if (!to || !speaker || !usePlayerStore.getState().spendCoins(gift.price)) return
    setGiftOpen(false)
    setEmotes((list) => [...list.slice(-5), { id: Date.now() + Math.random(), emoji: gift.emoji, x: 45 }])
    handleQuickChat(`${gift.emoji} for ${to.name}!`)
    if (to.isBot) window.setTimeout(() => say(to.id, `Thanks! ${gift.emoji}`, 2200), 1200)
  }

  function leaveToMenu() {
    window.clearTimeout(spinTimer.current)
    leaveRoom()
    resetGame()
    backToMenu()
  }

  function handleRematch() {
    if (!authoritative) {
      leaveToMenu()
      return
    }
    window.clearTimeout(spinTimer.current)
    spinningRef.current = false
    setSpinning(false)
    resetGame()
    startGame(participants)
    setStatsRevealed(false)
    setSpeech({})
    setCelebration(null)
    setHomePop(null)
  }


  const gameOver = phase === 'gameOver'
  const standings = gameOver ? rankings.map((id) => players.find((p) => p.id === id)).filter((p): p is LudoPlayer => !!p) : []
  const winner = standings[0]
  const celebrated = celebration ? players.find((p) => p.id === celebration.playerId) : undefined

  if (winner && statsRevealed) {
    // with several players on this device, the best-placed of them counts
    const myRank = standings.findIndex((p) => isLocal(p.id)) + 1 || standings.length
    const me = standings[myRank - 1]
    const won = myRank === 1
    const shared = localSeatIds.length > 1
    const title = won ? (shared ? `🏆 ${winner.name} Wins!` : '🏆 You Win!') : shared ? `🏆 ${winner.name} Wins` : `You finished ${ordinal(myRank)}`
    // rewards step down with each place
    const share = standings.length > 1 ? (standings.length - myRank) / (standings.length - 1) : 1
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <GameResultScreen
          game={game}
          won={won}
          title={title}
          coins={Math.round(80 + 220 * share)}
          xp={Math.round(40 + 160 * share)}
          stats={[
            { label: 'Your Place', value: `${ordinal(myRank)} of ${standings.length}` },
            { label: 'Warriors Home', value: `${me.finishedCount}/4` },
            { label: 'Captures', value: me.captures },
            { label: 'Best Roll', value: bestRoll },
          ]}
          onRematch={handleRematch}
        />
      </div>
    )
  }

  const byColor = (c: LudoColor) => players.find((p) => p.color === c)
  const myTurn = !!currentPlayer && isLocal(currentPlayer.id)
  const canRollNow = phase === 'rolling' && myTurn && !spinning && !celebration
  const diceAccent = currentPlayer ? COLOR_GLOW[currentPlayer.color] : '#8b5cf6'

  // 5–8 players: every player gets a compact card in a grid above the board, in turn order
  const manyPlayers = players.length > 4
  // 5+ players get the same full cards as the 4-player game (dice, turn ribbon, progress), split into a
  // row above the board and a row below it in turn order, instead of a strip of tiny compact cards
  const topRow = players.slice(0, Math.ceil(players.length / 2))
  const bottomRow = players.slice(Math.ceil(players.length / 2))

  function card(color: LudoColor, bubble: 'below' | 'above', side: 'left' | 'right', compact = false) {
    const p = byColor(color)
    if (!p) return <div className="min-h-[4.5rem]" />
    // cap the card width so wide screens get a big board, not stretched cards
    return <div className={`w-full min-w-0 max-w-[24rem] ${side === 'left' ? 'justify-self-start' : 'justify-self-end'}`}>{cardFor(p, bubble, side, compact)}</div>
  }

  function cardFor(p: LudoPlayer, bubble: 'below' | 'above', side: 'left' | 'right', compact = false) {
    const idx = players.indexOf(p)
    return (
      <LudoPlayerCard
        key={p.id}
        player={p}
        isActive={idx === currentPlayerIndex && phase !== 'gameOver'}
        isLeading={false}
        phase={phase}
        speech={speech[p.id]}
        bubble={bubble}
        side={side}
        controlledHere={isLocal(p.id)}
        compact={compact}
        // landscape side panels are narrow: the dice sits under the board there instead of crushing the card
        dice={!compact && !landscape && idx === currentPlayerIndex && phase !== 'gameOver' ? cardDice : undefined}
        ribbon={!compact && idx === currentPlayerIndex && phase !== 'gameOver' ? ribbonFor(p) : null}
      />
    )
  }

  function ribbonFor(p: LudoPlayer) {
    if (!isLocal(p.id)) return `${p.name.split(' ')[0]}'s turn`
    if (spinning) return 'Rolling…'
    if (phase === 'selecting') return 'Pick a warrior'
    return 'Your turn'
  }

  const cardDice = (
    <div className="pointer-events-auto relative">
      {sixBurst > 0 && (
        <div key={sixBurst} className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2">
          <span className="ludo-six ludo-glass-strong flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 shadow-[0_0_18px_rgba(251,191,36,0.45)] [border-color:rgba(251,191,36,0.7)]">
            <span className="text-[12px] font-black italic text-amber-300">SIX!</span>
          </span>
        </div>
      )}
      {/* a round holder for the round dice (a square box around it read as a mismatched frame) */}
      <div
        className="rounded-full p-[0.4rem] @min-[56rem]:p-[0.6rem]"
        style={{
          background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.12), rgba(12,14,40,0.85) 70%)',
          boxShadow: `0 0 0 2px ${diceAccent}, 0 0 ${canRollNow ? 22 : 12}px ${diceAccent}`,
        }}
      >
        <LudoDice value={lastRoll ?? 6} spinning={spinning} accent={diceAccent} canRoll={canRollNow} onRoll={performRoll} countdown={rollClock} sizeClassName="h-[3.4rem] w-[3.4rem] @min-[56rem]:h-[5.2rem] @min-[56rem]:w-[5.2rem]" />
      </div>
    </div>
  )

  // "roll a 6" reminder, pinned to the bottom edge of the board area so it never covers the player cards
  const needSixHint = needSix && !turnBanner && (
    <div className="pointer-events-none absolute inset-x-0 bottom-1 z-30 flex justify-center px-4">
      <div
        className="ludo-pop flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-black text-white sm:text-[15px]"
        style={{ background: 'linear-gradient(90deg, rgba(24,18,52,0.92), rgba(48,30,90,0.92))', boxShadow: '0 0 0 1.5px #ffd24a, 0 0 22px rgba(255,210,74,0.45)' }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[12px] font-black text-slate-900 shadow">6</span>
        Roll a 6 to bring a warrior out
      </div>
    </div>
  )

  // one slim row: voice, chat and emotes (the gift lives in the emote strip), so the board gets the height
  const controlsBlock = (
    <div className="relative z-20 flex w-full items-center gap-1.5">
      <VoiceChip compact onInfo={showToast} />
      <ChatBar onSend={handleQuickChat} />
      <EmoteBar inline onEmote={sendEmote} onGift={() => setGiftOpen(true)} />
    </div>
  )


  return (
    <div ref={rootRef} className="fixed inset-0 z-50 select-none overflow-hidden bg-[#080a12]">
      {sceneMounted && (
        <LudoScene3D
          className="absolute inset-0 h-full w-full"
          slot={slot}
          authoritative={authoritative}
          localIds={localSeatIds}
          onSelectToken={requestSelect}
          showLoader={false}
          onReady={handleSceneReady}
        />
      )}
      {!introGone && <LudoLoadingScreen seats={seats.map((seat, i) => ({ ...seat, name: participants[i]?.name ?? seat.name }))} ready={revealed} />}

      {landscape ? (
        <div className="@container pointer-events-none absolute inset-0 z-10 flex flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-6">
          <div className="mx-auto w-full max-w-[60rem]">
            <LudoTopBar onBack={leaveToMenu} onRestart={authoritative ? handleRematch : undefined} onLeave={leaveToMenu} />
          </div>
          <div className="mt-2 grid min-h-0 flex-1 grid-cols-[clamp(12rem,19.5vw,21rem)_minmax(0,1fr)_clamp(12rem,19.5vw,21rem)] gap-3 lg:gap-5">
            <div className="relative z-20 flex min-h-0 flex-col justify-between gap-3 py-2">
              {manyPlayers ? (
                <div className="flex flex-col gap-2">{topRow.map((p) => <div key={p.id} className="w-full min-w-0">{cardFor(p, 'below', 'left', sideCompact)}</div>)}</div>
              ) : (
                card('RED', 'below', 'left', sideCompact)
              )}
              <div className="flex flex-col gap-2">
                <VoiceChip onInfo={showToast} />
                <EmoteBar onEmote={sendEmote} onGift={() => setGiftOpen(true)} />
              </div>
              {manyPlayers ? <div /> : card('BLUE', 'above', 'left', sideCompact)}
            </div>
            <div className="flex min-h-0 flex-col">
              {/* the 3D board is framed into this slot by the scene's camera rig */}
              <div ref={slotRef} className="relative my-2 min-h-0 flex-1">{needSixHint}</div>
              {phase !== 'gameOver' && <div className="pointer-events-none relative z-20 mb-2 flex justify-center">{cardDice}</div>}
              <div className="pointer-events-none relative z-20 flex items-center gap-2">
                <ChatBar onSend={handleQuickChat} />
                <GiftButton onClick={() => setGiftOpen(true)} />
              </div>
            </div>
            <div className="relative z-20 flex min-h-0 flex-col items-stretch justify-between gap-3 py-2">
              {manyPlayers ? (
                <div className="flex flex-col gap-2">{bottomRow.map((p) => <div key={p.id} className="w-full min-w-0">{cardFor(p, 'below', 'right', sideCompact)}</div>)}</div>
              ) : (
                card('GREEN', 'below', 'right', sideCompact)
              )}
              <div />
              {manyPlayers ? <div /> : card('YELLOW', 'above', 'right', sideCompact)}
            </div>
          </div>
        </div>
      ) : (
      <div className="pointer-events-none absolute inset-0 z-10 flex justify-center">
      <div
        className="@container pointer-events-none relative flex w-full flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]"
        style={zoom > 1 ? { width: columnWidth / zoom, height: viewportHeight / zoom, zoom } : { maxWidth: columnWidth }}
      >
        <LudoTopBar onBack={leaveToMenu} onRestart={authoritative ? handleRematch : undefined} onLeave={leaveToMenu} />

        {manyPlayers ? (
          <div className="relative z-20 mt-1.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${topRow.length}, minmax(0, 1fr))` }}>
            {topRow.map((p, i) => (
              <div key={p.id} className="min-w-0">{cardFor(p, 'below', i < topRow.length / 2 ? 'left' : 'right', false)}</div>
            ))}
          </div>
        ) : (
          <div className={`relative z-20 grid grid-cols-2 mt-1.5 gap-2`}>
            {card('RED', 'below', 'left', false)}
            {card('GREEN', 'below', 'right', false)}
          </div>
        )}

        {/* the 3D board is framed into this slot by the scene's camera rig */}
        <div ref={slotRef} className="relative min-h-0 flex-1">{needSixHint}</div>

        {manyPlayers && (
          <div className="relative z-20 mb-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${bottomRow.length}, minmax(0, 1fr))` }}>
            {bottomRow.map((p, i) => (
              <div key={p.id} className="min-w-0">{cardFor(p, 'above', i < bottomRow.length / 2 ? 'left' : 'right', false)}</div>
            ))}
          </div>
        )}

        {!manyPlayers && (
          <div className={`relative z-20 grid grid-cols-2 mb-2 gap-2`}>
            {card('BLUE', 'above', 'left', false)}
            {card('YELLOW', 'above', 'right', false)}
          </div>
        )}

        {controlsBlock}
      </div>
      </div>
      )}

      {turnBanner && (
        <div key={`banner-${turnBanner.id}`} className="pointer-events-none absolute inset-x-0 top-[38%] z-40 flex justify-center px-6">
          <div
            className="ludo-turn-banner rounded-2xl px-7 py-2.5 text-center sm:px-10 sm:py-3.5"
            style={{
              background: `linear-gradient(90deg, transparent, ${COLOR_DEEP[turnBanner.color]}e6 18%, ${COLOR_DEEP[turnBanner.color]}e6 82%, transparent)`,
              boxShadow: `0 0 40px ${COLOR_GLOW[turnBanner.color]}66`,
              borderTop: `1.5px solid ${COLOR_GLOW[turnBanner.color]}`,
              borderBottom: `1.5px solid ${COLOR_GLOW[turnBanner.color]}`,
            }}
          >
            <p
              className={`font-black uppercase italic tracking-[0.12em] text-white ${turnBanner.mine ? 'text-[26px] sm:text-[40px]' : 'text-[20px] sm:text-[30px]'}`}
              style={{ textShadow: `0 0 18px ${COLOR_GLOW[turnBanner.color]}, 0 2px 4px rgba(0,0,0,0.7)` }}
            >
              {turnBanner.text}
            </p>
          </div>
        </div>
      )}
      <FloatingEmotes items={emotes} />
      {toast && <Toast key={`toast-${toast.id}`} text={toast.text} />}
      {giftOpen && <GiftSheet players={players} fromId={speaker?.id} onSend={sendGift} onClose={() => setGiftOpen(false)} />}
      {homePop && !celebration && <LudoFireworks key={`fireworks-${homePop}`} rockets={7} durationMs={2000} />}
      {celebration && celebrated && <LudoRankCelebration key={`rank-${celebration.id}`} player={celebrated} rank={celebration.rank} />}
      {winner && !celebration && <LudoResultsBoard standings={standings} isLocal={isLocal} onContinue={() => setStatsRevealed(true)} onRematch={handleRematch} />}

      {role === 'guest' && roomStatus === 'closed' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
          <div className="ludo-glass-strong ludo-pop w-full max-w-xs rounded-3xl p-6 text-center">
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
    </div>
  )
}
