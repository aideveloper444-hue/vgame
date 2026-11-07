import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useLudoStore, botChooseMove, botChoosePower, strikePairs, type LegalMove, type LudoPlayer, type PowerKind } from './ludoStore'
import { getBoard, seatColors } from './ludoBoards'
import { TEAM_BUILD } from './ludoCharacters'
import { COLOR_GLOW, type LudoColor } from './ludoBoardLayout'
import LudoScene3D, { type BoardSlot } from './LudoScene3D'
import LudoPlayerCard from './LudoPlayerCard'
import LudoBackdrop from './LudoBackdrop'
import LudoTopBar from './LudoTopBar'
import LudoWinnerBanner from './LudoWinnerBanner'
import GameResultScreen from '@/games/shared/GameResultScreen'
import { GAME_REGISTRY } from '@/games/registry'
import { ChatBar, EmoteBar, FloatingEmotes, GiftButton, GiftSheet, PowerUpsPanel, PowerUpsStrip, Toast, VoiceChip, type GiftDef } from './LudoControls'
import { useLudoAim } from './ludoAim'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import LudoDice from './LudoDice'
import LudoMenu from './LudoMenu'
import LudoLoadingScreen from './LudoLoadingScreen'
import { useLudoMatch } from './ludoMatch'
import { broadcastSay, broadcastSpin, leaveRoom, sendToHost, setNetHandlers, useLudoRoom, type PowerAction } from './ludoNet'

const BOT_GIRLS = ['Diya', 'Ananya', 'Meera', 'Priya']
const BOT_BOYS = ['Rohan', 'Vikram', 'Arjun', 'Kabir']
/** The lounge crew from the poster: each team's hero, when a computer player takes that seat. */
const BOT_BY_COLOR: Partial<Record<LudoColor, string>> = { RED: 'Rabhindra Patra', GREEN: 'anishhh', BLUE: 'Geethika Chowdary', YELLOW: 'Doctor' }

const CAPTURE_LINES = ['Nice move! 🔥', 'Got you! 💀', 'Boom! 💥', 'Ouch, that hurt! 😈']
const FINISH_LINES = ['Home safe! ✅', 'Yes! 🎉', 'One down! 🙌']
const BOT_REPLIES = ['Bring it on! 😎', 'Haha 😂', 'Good luck! 😜', 'GG 🤝', 'Watch this! 🎲']

/** How long the die tumbles before the roll resolves in the store. */
const ROLL_SPIN_MS = 650
const game = GAME_REGISTRY.ludo

const BOT_ROLL_DELAY_MS = 750
const BOT_PICK_DELAY_MS = 700

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
  const winnerId = useLudoStore((s) => s.winnerId)
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
  const [emotes, setEmotes] = useState<{ id: number; emoji: string; x: number }[]>([])
  const speedActive = useLudoStore((s) => s.speedActive)
  const powerUsed = useLudoStore((s) => s.powerUsed)
  const aimMode = useLudoAim((s) => s.mode)
  const botPowerKey = useRef('')
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
    if (lastEvent.type === 'capture' || lastEvent.type === 'finish') {
      const tokenId = lastActorTokenId.current
      const actor = useLudoStore.getState().players.find((p) => p.tokens.some((t) => t.id === tokenId))
      if (actor) {
        const lines = lastEvent.type === 'capture' ? CAPTURE_LINES : FINISH_LINES
        say(actor.id, lines[Math.floor(Math.random() * lines.length)], 2600)
      }
    }
  }, [lastEvent, say])

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
    if (spinningRef.current || useLudoStore.getState().phase !== 'rolling') return
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
      onPower: (a) => {
        const st = useLudoStore.getState()
        if (a.kind === 'speed') st.useSpeed()
        else if (a.kind === 'shield' && a.a) st.useShield(a.a)
        else if (a.kind === 'bomb' && a.a) st.useBomb(a.a)
      },
    })
    return () => setNetHandlers({})
  }, [])

  useEffect(() => {
    if (!revealed || !authoritative || !currentPlayer || phase === 'gameOver' || !currentPlayer.isBot) return
    if (phase === 'rolling' && !spinning) {
      // once per turn, a computer player may bomb, shield or speed up before it rolls
      const key = `${currentPlayerIndex}:${useLudoStore.getState().rollCount}`
      if (botPowerKey.current !== key && !useLudoStore.getState().powerUsed) {
        botPowerKey.current = key
        const st = useLudoStore.getState()
        const choice = botChoosePower(getBoard(st.arms), st.players, st.currentPlayerIndex, botLevel)
        if (choice) {
          const t = window.setTimeout(() => {
            const s2 = useLudoStore.getState()
            if (choice.kind === 'speed') s2.useSpeed()
            else if (choice.kind === 'shield') s2.useShield(choice.token)
            else s2.useBomb(choice.target)
          }, BOT_ROLL_DELAY_MS)
          return () => window.clearTimeout(t)
        }
      }
      const t = window.setTimeout(performRoll, BOT_ROLL_DELAY_MS)
      return () => window.clearTimeout(t)
    }
    if (phase === 'selecting') {
      const t = window.setTimeout(() => selectToken(pickBotMove(botLevel, legalMoves, players, currentPlayer.color)), BOT_PICK_DELAY_MS)
      return () => window.clearTimeout(t)
    }
  }, [revealed, authoritative, phase, currentPlayerIndex, currentPlayer, legalMoves, players, spinning, performRoll, selectToken, botLevel])

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

  /** Run a power-up here (host / offline) or ask the host to (guest). */
  function doPower(a: PowerAction) {
    useLudoAim.getState().cancel()
    if (!authoritative) {
      sendToHost({ t: 'power', ...a })
      return
    }
    const st = useLudoStore.getState()
    const ok = a.kind === 'speed' ? st.useSpeed() : a.kind === 'shield' ? st.useShield(a.a!) : st.useBomb(a.a!)
    if (!ok) showToast('That power-up can’t be used right now')
  }

  const myTurnNow = !!currentPlayer && isLocal(currentPlayer.id)
  const canPower = !!currentPlayer && myTurnNow && phase === 'rolling' && !spinning && !powerUsed && revealed
  const strikeTargets = canPower ? strikePairs(getBoard(useLudoStore.getState().arms), players, currentPlayerIndex) : []
  const myPowers = (myTurnNow ? currentPlayer : speaker)?.powers ?? { speed: 0, shield: 0, bomb: 0 }

  function onPowerButton(kind: PowerKind) {
    const aim = useLudoAim.getState()
    if (aim.mode === kind) {
      aim.cancel()
      return
    }
    if (!canPower || !currentPlayer) return
    if (kind === 'speed') {
      doPower({ kind: 'speed' })
      showToast('⚡ Speed! Your next move goes double')
      return
    }
    const finish = getBoard(useLudoStore.getState().arms).finish
    const targets =
      kind === 'shield'
        ? currentPlayer.tokens.filter((t) => t.distance >= 0 && t.distance < finish && !(t.shieldTurns ?? 0)).map((t) => t.id)
        : strikeTargets.map((pr) => pr.defender.id)
    if (!targets.length) {
      showToast(kind === 'shield' ? 'Bring a token onto the board first' : 'No rival within 6 squares ahead of your tokens')
      return
    }
    aim.start(kind, targets, (id) => doPower({ kind, a: id }))
    showToast(kind === 'shield' ? '🛡️ Tap one of your tokens to shield it' : '💣 Tap a rival token to bomb it')
  }

  // aiming ends when the turn moves on
  useEffect(() => {
    if (!canPower) useLudoAim.getState().cancel()
  }, [canPower])

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
  }


  const winner = phase === 'gameOver' && winnerId ? players.find((p) => p.id === winnerId) : undefined

  if (winner && statsRevealed) {
    const won = isLocal(winner.id)
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <GameResultScreen
          game={game}
          won={won}
          title={won ? (localSeatIds.length > 1 ? `🏆 ${winner.name} Wins!` : '🏆 You Win!') : `😈 ${winner.name} Wins`}
          coins={won ? 300 : 80}
          xp={won ? 200 : 40}
          stats={[
            { label: 'Tokens Finished', value: `${winner.finishedCount}/4` },
            { label: 'Captures', value: winner.captures },
            { label: 'Best Roll', value: bestRoll },
            { label: 'Players', value: players.length },
          ]}
          onRematch={handleRematch}
        />
      </div>
    )
  }

  const byColor = (c: LudoColor) => players.find((p) => p.color === c)
  const myTurn = !!currentPlayer && isLocal(currentPlayer.id)
  const canRollNow = phase === 'rolling' && myTurn && !spinning
  const diceAccent = currentPlayer ? COLOR_GLOW[currentPlayer.color] : '#8b5cf6'

  // 5–8 players: every player gets a compact card in a grid above the board, in turn order
  const manyPlayers = players.length > 4

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
        dice={!compact && idx === currentPlayerIndex && phase !== 'gameOver' ? cardDice : undefined}
        ribbon={!compact && idx === currentPlayerIndex && phase !== 'gameOver' ? ribbonFor(p) : null}
      />
    )
  }

  function ribbonFor(p: LudoPlayer) {
    if (!isLocal(p.id)) return `${p.name.split(' ')[0]}'s turn`
    if (aimMode) return 'Tap a target'
    if (spinning) return 'Rolling…'
    if (phase === 'selecting') return 'Pick a token'
    if (speedActive) return '⚡ Speed on'
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
      <div
        className="rounded-2xl p-1"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0) 50%), rgba(12,14,40,0.8)',
          border: `2px solid ${diceAccent}`,
          boxShadow: `0 0 ${canRollNow ? 22 : 12}px ${diceAccent}`,
        }}
      >
        <LudoDice value={lastRoll ?? 6} spinning={spinning} accent={diceAccent} canRoll={canRollNow} onRoll={performRoll} sizeClassName="h-[3.4rem] w-[3.4rem] @min-[56rem]:h-[5.2rem] @min-[56rem]:w-[5.2rem]" />
      </div>
    </div>
  )

  const armedPower = aimMode === 'shield' ? 'shield' : aimMode === 'bomb' ? 'bomb' : speedActive && myTurn ? 'speed' : null
  // two compact rows, as in the reference: voice and emotes; then chat and gifts. The power-ups
  // sit in a slim panel over the board slot's top-right corner, which the board's perspective leaves empty.
  const controlsBlock = (
    <div className="relative z-20 flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <VoiceChip onInfo={showToast} />
        <div className="flex min-w-0 flex-1 justify-center">
          <EmoteBar onEmote={sendEmote} onGift={() => setGiftOpen(true)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ChatBar onSend={handleQuickChat} />
        <GiftButton onClick={() => setGiftOpen(true)} />
      </div>
    </div>
  )

  const powersBlock = (
    <PowerUpsPanel powers={myPowers} enabled={canPower} armed={armedPower} onUse={onPowerButton} />
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
          <div className="mt-2 grid min-h-0 flex-1 grid-cols-[clamp(12rem,25vw,22rem)_minmax(0,1fr)_clamp(12rem,25vw,22rem)] gap-3 lg:gap-5">
            <div className="relative z-20 flex min-h-0 flex-col justify-between gap-3 py-2">
              {manyPlayers ? (
                <div className="flex flex-col gap-2">{players.slice(0, Math.ceil(players.length / 2)).map((p) => cardFor(p, 'below', 'left', true))}</div>
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
              <div ref={slotRef} className="relative my-2 min-h-0 flex-1" />
              <div className="pointer-events-none relative z-20 flex items-center gap-2">
                <ChatBar onSend={handleQuickChat} />
                <GiftButton onClick={() => setGiftOpen(true)} />
              </div>
            </div>
            <div className="relative z-20 flex min-h-0 flex-col items-stretch justify-between gap-3 py-2">
              {manyPlayers ? (
                <div className="flex flex-col gap-2">{players.slice(Math.ceil(players.length / 2)).map((p) => cardFor(p, 'below', 'right', true))}</div>
              ) : (
                card('GREEN', 'below', 'right', sideCompact)
              )}
              <div className="flex items-center justify-between gap-2">
                {powersBlock}
                <div className="flex flex-col items-center gap-3">
                  {manyPlayers && cardDice}
                          </div>
              </div>
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
          <div
            className="relative z-20 mt-2 grid gap-1.5 sm:mt-3 sm:gap-2"
            style={{ gridTemplateColumns: `repeat(${players.length === 5 ? 5 : 4}, minmax(0, 1fr))` }}
          >
            {players.map((p, i) => cardFor(p, 'below', i < players.length / 2 ? 'left' : 'right', true))}
          </div>
        ) : (
          <div className={`relative z-20 grid grid-cols-2 mt-1.5 gap-2`}>
            {card('RED', 'below', 'left', false)}
            {card('GREEN', 'below', 'right', false)}
          </div>
        )}

        {/* the 3D board is framed into this slot by the scene's camera rig */}
        <div ref={slotRef} className="relative min-h-0 flex-1">
          {manyPlayers && <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2">{cardDice}</div>}
          <div className="pointer-events-none absolute right-1.5 top-1 z-20 max-w-[calc(100%-0.75rem)]">
            <PowerUpsStrip powers={myPowers} enabled={canPower} armed={armedPower} onUse={onPowerButton} />
          </div>
        </div>

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

      <FloatingEmotes items={emotes} />
      {toast && <Toast key={toast.id} text={toast.text} />}
      {giftOpen && <GiftSheet players={players} fromId={speaker?.id} onSend={sendGift} onClose={() => setGiftOpen(false)} />}
      {winner && <LudoWinnerBanner winner={winner} onContinue={() => setStatsRevealed(true)} onRematch={handleRematch} />}

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
