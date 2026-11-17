import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MessageCircle, SendHorizontal, X } from 'lucide-react'
import { netWorthOf, ownedBy, useCityStore, type CityPlayer } from '../cityStore'
import { ERECTION_ICON, ERECTION_NAMES, isProperty, type CityTile } from '../cityBoardData'
import { useCityMatch } from '../cityMatch'
import { money } from '../cityFormat'
import type { CashDelta } from '../useCityFx'
import { useChatStore } from '@/social/stores/useChatStore'
import {
  ACTION_RECTS,
  BACK_BTN,
  CHAT_BTN,
  COIN_TEXT,
  DESIGN_H,
  DESIGN_W,
  DICE_ROLL_MS,
  GEM_TEXT,
  HUB_CENTER,
  LOGO_COVER,
  PLAYERS_TEXT,
  PRICE_PATCHES,
  SEAT_GEOM,
  SETTINGS_BTN,
  STEP_MS,
  TILE_RECTS,
  fanDirection,
  tileSide,
  tokenAnchor,
  type ActionKey,
  type Rect,
} from './tycoonLayout'
import boardImg from './art/board.jpg'
import tokPlayer from './art/tok_player.png'
import tokDivya from './art/tok_divya.png'
import tokSneha from './art/tok_sneha.png'
import tokDoctor from './art/tok_doctor.png'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/oswald/700.css'
import '@fontsource/bangers/400.css'
import './tycoon.css'

export const TYCOON_CHAT = 'city-game'
export const BOARD_IMG = boardImg
const TOKEN_ART = [tokPlayer, tokDivya, tokSneha, tokDoctor]
export const ALL_TYCOON_ART = [boardImg, ...TOKEN_ART]

const QUICK_LINES = ['Nice move! 👏', 'Watch out! ⚠️', 'Good luck! 🍀', 'Ha ha! 😂', 'Your turn! ⏳', 'Deal? 🤝', 'Jackpot! 🎰', 'GG! 🏆']
const TOKEN_H = 84

export interface HubButton {
  label: string
  onClick: () => void
  tone: 'gold' | 'green' | 'ghost' | 'red'
  disabled?: boolean
}

export interface HubState {
  title: string
  message: string
  buttons: HubButton[]
}

export interface TycoonStageProps {
  isLocal: (id: string) => boolean
  cashDeltas: Record<string, CashDelta[]>
  hub: HubState
  mapView: boolean
  onMap: () => void
  onTileClick: (tileId: number) => void
  onAction: (key: Exclude<ActionKey, 'map'>) => void
  badges: Partial<Record<ActionKey, number>>
  onBack: () => void
  onSettings: () => void
  onChat: (text: string) => void
  /** Set when a player on this device can roll right now: tapping their seat's dice rolls. */
  onSeatRoll?: () => void
  coins: number
  gems: number
  /** modals, toasts and banners, drawn above the board at screen scale */
  children?: ReactNode
}

const box = ([x0, y0, x1, y1]: Rect): CSSProperties => ({ position: 'absolute', left: x0, top: y0, width: x1 - x0, height: y1 - y0 })

/* ------------------------------------------------------------------ fitting: landscape art on any screen */

/** Phones held upright get the board turned sideways so it fills the screen. */
function useFrame() {
  const read = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rotate = vh > vw * 1.1 && vw < 900
    return { vw, vh, rotate, W: rotate ? vh : vw, H: rotate ? vw : vh }
  }
  const [f, setF] = useState(read)
  useLayoutEffect(() => {
    const update = () => setF(read())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return f
}

export default function TycoonStage(props: TycoonStageProps) {
  const { vw, rotate, W, H } = useFrame()
  // the board fills the screen edge to edge: square corners, no bars (stretched to the screen's shape)
  const sx = W / DESIGN_W
  const sy = H / DESIGN_H
  const frameStyle: CSSProperties = rotate
    ? { position: 'absolute', width: W, height: H, left: vw, top: 0, transform: 'rotate(90deg)', transformOrigin: 'top left' }
    : { position: 'absolute', inset: 0 }

  return (
    <div className="tycoon-root fixed inset-0 z-50 overflow-hidden text-white">
      <div style={frameStyle} className="overflow-hidden">
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${sx}, ${sy})` }}>
          <Board {...props} />
        </div>
        {props.mapView && (
          <button type="button" onClick={props.onMap} className="tycoon-btn tycoon-btn-gold absolute left-1/2 top-3 z-30 -translate-x-1/2 px-5 py-2 text-[13px]">
            Close map
          </button>
        )}
        {props.children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the board picture and everything drawn on it */

function useWalkStep() {
  const pendingMovePath = useCityStore((s) => s.pendingMovePath)
  const phase = useCityStore((s) => s.phase)
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (phase !== 'MOVING' || !pendingMovePath) return
    setStep(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    let interval: ReturnType<typeof setInterval> | undefined
    timers.push(
      setTimeout(() => {
        let i = 0
        interval = setInterval(() => {
          i += 1
          setStep(i)
          if (i >= pendingMovePath.length) {
            clearInterval(interval)
            // guests only animate what the host sends; the host resolves the landing
            if (useCityMatch.getState().role !== 'guest') timers.push(setTimeout(() => useCityStore.getState().completeMove(), STEP_MS))
          }
        }, STEP_MS)
      }, DICE_ROLL_MS),
    )
    return () => {
      timers.forEach(clearTimeout)
      if (interval) clearInterval(interval)
    }
  }, [pendingMovePath, phase])
  return step
}

/** True while the dice tumble after a roll. */
/** While the dice tumble after a roll (`rolling`), and a little after, while the total shows (`showing`). */
function useRolling() {
  const rollSeq = useCityStore((s) => s.rollSeq)
  const [state, setState] = useState({ rolling: false, showing: false })
  const first = useRef(rollSeq)
  useEffect(() => {
    if (rollSeq === first.current) return
    setState({ rolling: true, showing: true })
    const t1 = setTimeout(() => setState({ rolling: false, showing: true }), DICE_ROLL_MS)
    const t2 = setTimeout(() => setState({ rolling: false, showing: false }), DICE_ROLL_MS + 1700)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [rollSeq])
  return state
}

function Board(props: TycoonStageProps) {
  const tiles = useCityStore((s) => s.tiles)
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const pendingMovePath = useCityStore((s) => s.pendingMovePath)
  const phase = useCityStore((s) => s.phase)
  const step = useWalkStep()

  const walking = phase === 'MOVING' && pendingMovePath !== null && step > 0
  const tileOf = (i: number) => (i === currentPlayerIndex && walking ? pendingMovePath![Math.min(step, pendingMovePath!.length) - 1] : players[i].position)
  const current = players[currentPlayerIndex]
  const focus = current ? tokenAnchor(tileOf(currentPlayerIndex)) : HUB_CENTER
  const landedTile = current && phase !== 'MOVING' && phase !== 'ROLLING' ? current.position : null

  return (
    <div
      className="absolute inset-0 transition-transform duration-700 ease-out"
      style={{ transform: props.mapView ? 'scale(1.9)' : 'none', transformOrigin: `${focus[0]}px ${focus[1] - 40}px` }}
    >
      <img src={boardImg} alt="World Tycoon board" draggable={false} className="absolute inset-0 h-full w-full select-none" />

      <LogoCover />
      <TopBar {...props} activePlayers={players.filter((p) => !p.bankrupt).length} total={players.length} />

      {PRICE_PATCHES.map((p) => (
        <span
          key={p.tileId}
          className={`pointer-events-none flex items-center justify-center rounded-[6px] leading-none ${p.tone === 'red' ? 'tycoon-patch-red' : 'tycoon-patch-cream'}`}
          style={{ ...box(p.rect), fontSize: p.tone === 'small' ? p.rect[3] - p.rect[1] - 3 : 22 }}
        >
          {p.text}
        </span>
      ))}

      {tiles.map((t) => (
        <TileOverlay key={t.id} tile={t} players={players} landed={landedTile === t.id} activeColor={current?.color ?? '#fff'} onClick={() => props.onTileClick(t.id)} />
      ))}

      <Tokens players={players} currentPlayerIndex={currentPlayerIndex} tileOf={tileOf} walking={walking} step={step} />

      {[0, 1, 2, 3].map((i) => (
        <SeatOverlay
          key={i}
          index={i}
          player={players[i]}
          active={i === currentPlayerIndex && phase !== 'GAME_OVER'}
          deltas={players[i] ? (props.cashDeltas[players[i].id] ?? []) : []}
          onRoll={i === currentPlayerIndex ? props.onSeatRoll : undefined}
        />
      ))}

      <StandingsBar players={players} current={phase === 'GAME_OVER' ? -1 : currentPlayerIndex} />

      <Hub hub={props.hub} />

      {(Object.keys(ACTION_RECTS) as ActionKey[]).map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k}
          onClick={() => (k === 'map' ? props.onMap() : props.onAction(k))}
          className="tycoon-hotspot"
          style={box(ACTION_RECTS[k])}
        >
          {props.badges[k] ? (
            <span className="absolute -right-1 -top-1 flex h-9 min-w-9 items-center justify-center rounded-full bg-rose-500 px-2 text-[20px] font-bold text-white" style={{ border: '3px solid #fff', boxShadow: '0 0 12px rgba(255,80,120,0.8)' }}>
              {props.badges[k]}
            </span>
          ) : null}
        </button>
      ))}

      <button type="button" aria-label="Back" onClick={props.onBack} className="rounded-full" style={box(BACK_BTN)} />
      <button type="button" aria-label="Settings" onClick={props.onSettings} className="rounded-full" style={box(SETTINGS_BTN)} />
      <ChatDock onSend={props.onChat} />
    </div>
  )
}

/* ------------------------------------------------------------------ header */

function LogoCover() {
  return (
    <div className="pointer-events-none absolute flex items-center justify-center" style={box(LOGO_COVER)}>
      <div className="tycoon-banner-plate relative flex h-[74px] w-[330px] items-center justify-center overflow-hidden rounded-[22px]">
        <span className="tycoon-title text-[50px] leading-none">WORLD TYCOON</span>
        <span className="absolute inset-y-0 w-[30%]" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent)', animation: 'tycoon-sheen 4.5s ease-in-out infinite' }} />
      </div>
    </div>
  )
}

function TopBar({ coins, gems, activePlayers, total }: TycoonStageProps & { activePlayers: number; total: number }) {
  const cell = (r: Rect, text: string, size = 30) => (
    <span className="tycoon-navy tycoon-hud-text pointer-events-none flex items-center justify-start rounded-[10px] pl-1" style={{ ...box(r), fontSize: size }}>
      {text}
    </span>
  )
  return (
    <>
      {cell(COIN_TEXT, coins.toLocaleString('en-US'), coins >= 100000 ? 27 : 30)}
      {cell(GEM_TEXT, gems.toLocaleString('en-US'))}
      {cell(PLAYERS_TEXT, `${activePlayers}/${total}`)}
    </>
  )
}

/* ------------------------------------------------------------------ squares */

function TileOverlay({ tile, players, landed, activeColor, onClick }: { tile: CityTile; players: CityPlayer[]; landed: boolean; activeColor: string; onClick: () => void }) {
  const r = TILE_RECTS[tile.id]
  const owner = isProperty(tile) && tile.ownerId ? players.find((p) => p.id === tile.ownerId) : undefined
  const side = tileSide(tile.id)
  // the owner pin sits on the outer end of the square
  const pin: CSSProperties =
    side === 'left' ? { left: -6, top: '50%', marginTop: -15 } : side === 'right' ? { right: -6, top: '50%', marginTop: -15 } : side === 'top' ? { left: '50%', marginLeft: -15, top: -12 } : { left: '50%', marginLeft: -15, bottom: -12 }
  return (
    <button type="button" aria-label={tile.name} onClick={onClick} style={box(r)} className="rounded-[14px]">
      {owner && (
        <span className="pointer-events-none absolute inset-[2px] rounded-[12px]" style={{ border: `3px solid ${owner.color}`, boxShadow: `0 0 12px ${owner.color}, inset 0 0 10px ${owner.color}66` }} />
      )}
      {landed && <span className="pointer-events-none absolute -inset-[3px] rounded-[16px]" style={{ border: '4px solid #fff6b0', boxShadow: `0 0 24px ${activeColor}`, animation: 'tycoon-pulse 1.1s ease-in-out infinite' }} />}
      {isProperty(tile) && tile.mortgaged && (
        <span className="pointer-events-none absolute inset-[3px] flex items-center justify-center rounded-[11px] bg-[#0b1240]/70">
          <span className="-rotate-6 rounded-md bg-amber-300 px-2 py-[1px] text-[15px] font-bold uppercase tracking-wide text-[#3d2200]">Mortgaged</span>
        </span>
      )}
      {owner && (
        <span
          className="pointer-events-none absolute flex h-[30px] w-[30px] items-center justify-center rounded-full text-[15px] font-bold text-white"
          style={{ ...pin, background: owner.color, border: '3px solid #fff', boxShadow: `0 0 10px ${owner.color}` }}
        >
          {owner.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {isProperty(tile) && tile.level > 0 && (
        <span
          className="pointer-events-none absolute flex items-center gap-1 rounded-full bg-[#0b1240]/90 px-2 py-[1px] text-[16px] font-bold text-emerald-200"
          style={{ border: '2px solid #34d399', boxShadow: '0 0 10px rgba(52,211,153,0.7)', ...(side === 'bottom' ? { top: -14, left: 6 } : side === 'top' ? { bottom: -12, left: 6 } : side === 'right' ? { right: '100%', marginRight: 2, top: 6 } : { left: '100%', marginLeft: 2, top: 6 }) }}
          title={ERECTION_NAMES[tile.level]}
        >
          <span className="text-[18px] leading-none">{ERECTION_ICON[tile.level]}</span>
          {ERECTION_NAMES[tile.level]}
        </span>
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ tokens */

function Tokens({ players, currentPlayerIndex, tileOf, walking, step }: { players: CityPlayer[]; currentPlayerIndex: number; tileOf: (i: number) => number; walking: boolean; step: number }) {
  const placed = useMemo(() => {
    const alive = players.map((p, i) => ({ p, i })).filter(({ p }) => !p.bankrupt)
    return alive.map(({ p, i }) => {
      const tile = tileOf(i)
      const mates = alive.filter(({ i: j }) => tileOf(j) === tile)
      const k = mates.findIndex(({ i: j }) => j === i)
      const [ax, ay] = tokenAnchor(tile)
      const [fx, fy] = fanDirection(tile)
      const offset = tileSide(tile) === 'left' || tileSide(tile) === 'right' ? k : k - (mates.length - 1) / 2
      return { p, i, x: ax + fx * offset, y: ay + fy * offset + (k % 2) * 4 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, step, walking, currentPlayerIndex])

  return (
    <>
      {[...placed]
        .sort((a, b) => a.y - b.y)
        .map(({ p, i, x, y }) => {
          const active = i === currentPlayerIndex
          const moving = active && walking
          const h = active ? TOKEN_H * 1.12 : TOKEN_H
          return (
            <div key={p.id} className="pointer-events-none absolute" style={{ left: x, top: y, zIndex: 10 + Math.round(y), transition: `left ${STEP_MS - 30}ms ease-in-out, top ${STEP_MS - 30}ms ease-in-out` }}>
              <div
                className="absolute h-[22px] w-[70px] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
                style={{ background: `radial-gradient(ellipse, ${p.color}cc 0%, ${p.color}44 55%, transparent 72%)`, border: `2px solid ${p.color}`, boxShadow: `0 0 14px ${p.color}`, opacity: active ? 1 : 0.75 }}
              />
              <div className="absolute bottom-0 left-0" style={{ transform: 'translate(-50%, 0)', animation: moving ? `tycoon-hop ${STEP_MS}ms ease-in-out infinite` : active ? 'tycoon-idle 1.6s ease-in-out infinite' : undefined }}>
                <img
                  src={TOKEN_ART[i % 4]}
                  alt={p.name}
                  draggable={false}
                  className="block w-auto max-w-none select-none"
                  style={{ height: h, filter: `drop-shadow(0 4px 4px rgba(0,0,0,0.6)) drop-shadow(0 0 ${active ? 9 : 2}px ${p.color})` }}
                />
              </div>
            </div>
          )
        })}
    </>
  )
}

/* ------------------------------------------------------------------ seats */

function useSeatRolls() {
  const rollSeq = useCityStore((s) => s.rollSeq)
  const [rolls, setRolls] = useState<Record<string, [number, number]>>({})
  useEffect(() => {
    const st = useCityStore.getState()
    const p = st.players[st.currentPlayerIndex]
    if (!p || !st.dice) return
    const dice = st.dice
    const t = setTimeout(() => setRolls((r) => ({ ...r, [p.id]: dice })), DICE_ROLL_MS)
    return () => clearTimeout(t)
  }, [rollSeq])
  return rolls
}

/**
 * Live standings, always on screen: every player ranked by net worth with their cash and cities owned, in the
 * open sky at the top of the board (between the title and the wallet). The painted seat cards' own cash line is
 * too small to read once the board is scaled down to a phone.
 */
/** $25k, $22.3k, $1.2M: short enough for four players across the standings bar */
function shortMoney(n: number) {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k`
  return `${sign}$${a}`
}

function StandingsBar({ players, current }: { players: CityPlayer[]; current: number }) {
  const tiles = useCityStore((s) => s.tiles)
  const config = useCityStore((s) => s.config)
  const ranked = players.map((p, i) => ({ p, i, worth: netWorthOf(p, tiles, config), cities: ownedBy(tiles, p.id).length })).sort((a, b) => Number(a.p.bankrupt) - Number(b.p.bankrupt) || b.worth - a.worth)
  return (
    <div className="tycoon-standings pointer-events-none absolute flex items-stretch gap-1.5 rounded-[18px] p-1.5" style={{ left: 458, top: 4, width: 572, height: 82 }} aria-label="Standings">
      {ranked.map(({ p, i, worth, cities }, rank) => (
        <div
          key={p.id}
          className={`flex min-w-0 flex-1 items-center gap-1 rounded-[13px] px-1 ${p.bankrupt ? 'opacity-40' : ''}`}
          style={{ background: i === current ? `${p.color}33` : 'rgba(255,255,255,0.05)', boxShadow: i === current ? `inset 0 0 0 2px ${p.color}` : 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
          title={`${p.name}: net worth ${money(worth)}`}
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-[#0b1030]" style={{ background: p.color }}>
            {rank + 1}
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-[29px] font-bold tabular-nums text-[#ffe58a]">{shortMoney(p.cash)}</span>
            <span className="mt-[4px] truncate text-[18px] font-semibold text-white/80">
              {p.name.split(' ')[0]} · {cities}🏙
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

function SeatOverlay({ index, player, active, deltas, onRoll }: { index: number; player: CityPlayer | undefined; active: boolean; deltas: CashDelta[]; onRoll?: () => void }) {
  const g = SEAT_GEOM[index]
  const rolls = useSeatRolls()
  const { rolling, showing } = useRolling()
  const dice = useCityStore((s) => s.dice)
  if (!player) {
    return (
      <div className="pointer-events-none absolute flex items-center justify-center rounded-[40px] bg-[#050824]/80" style={box(g.card)}>
        <span className="text-[22px] font-semibold uppercase tracking-widest text-white/40">Empty seat</span>
      </div>
    )
  }
  const [ax, ay, ar] = g.avatar
  const last = rolls[player.id]
  return (
    <>
      {active && (
        <>
          <span className="pointer-events-none absolute rounded-[44px]" style={{ ...box(g.card), border: `4px solid ${player.color}`, boxShadow: `0 0 28px ${player.color}, inset 0 0 18px ${player.color}88`, animation: 'tycoon-pulse 1.4s ease-in-out infinite' }} />
          <span className="pointer-events-none absolute rounded-full" style={{ left: ax - ar - 6, top: ay - ar - 6, width: (ar + 6) * 2, height: (ar + 6) * 2, border: '5px dashed #fff3a8', boxShadow: `0 0 20px ${player.color}`, animation: 'tycoon-spin-glow 6s linear infinite' }} />
        </>
      )}
      <div className="tycoon-navy pointer-events-none absolute flex flex-col justify-center rounded-[12px] px-1.5" style={box(g.text)}>
        <span className="tycoon-hud-text truncate text-[25px] leading-[30px]">{player.name}</span>
        <span className="tycoon-hud-text whitespace-nowrap text-[18px] font-medium leading-[24px] text-[#dfe6ff]">Cash: {money(player.cash)}</span>
      </div>
      <button
        type="button"
        disabled={!onRoll}
        onClick={onRoll}
        aria-label={onRoll ? 'Roll the dice' : undefined}
        className={`tycoon-navy absolute flex items-center justify-center rounded-[12px] ${onRoll ? '' : 'pointer-events-none'} ${g.dice[2] - g.dice[0] < 70 ? 'flex-col gap-1' : 'gap-1.5'}`}
        style={{ ...box(g.dice), ...(onRoll ? { boxShadow: '0 0 0 3px #ffe58a, 0 0 22px rgba(255,214,90,0.9)', animation: 'tycoon-pulse 1s ease-in-out infinite' } : {}) }}
      >
        {onRoll ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-[32px]">🎲</span>
            <span className="mt-0.5 rounded-full bg-gradient-to-b from-[#ffe58a] to-[#f5b52a] px-2 py-[2px] text-[14px] font-bold text-[#3b1a00]">ROLL</span>
          </span>
        ) : player.inJail ? (
          <span className="flex flex-col items-center text-[15px] font-bold uppercase leading-tight text-amber-200">
            <span className="text-[28px] leading-none">🔒</span>Jail
          </span>
        ) : last ? (
          <>
            <MiniDie value={last[0]} small={g.dice[2] - g.dice[0] < 70} />
            <MiniDie value={last[1]} small={g.dice[2] - g.dice[0] < 70} />
          </>
        ) : (
          <span className="text-[30px] leading-none opacity-80">🎲</span>
        )}
      </button>
      {active && showing && dice && <DiceTray index={index} dice={dice} rolling={rolling} color={player.color} />}
      {player.freePasses.length > 0 && (
        <span className="pointer-events-none absolute rounded-full bg-emerald-500 px-2 text-[15px] font-bold text-white" style={{ left: g.text[0] + 2, top: g.text[3] - 2, border: '2px solid #fff' }}>
          🎫 ×{player.freePasses.length}
        </span>
      )}
      {player.bankrupt && (
        <div className="pointer-events-none absolute flex items-center justify-center rounded-[40px] bg-[#1a0508]/75" style={box(g.card)}>
          <span className="-rotate-6 rounded-lg border-4 border-rose-400 px-3 text-[30px] font-bold uppercase tracking-widest text-rose-300">Bankrupt</span>
        </div>
      )}
      {deltas.map((d) => (
        <span
          key={d.id}
          className="pointer-events-none absolute whitespace-nowrap text-[30px] font-bold"
          style={{
            left: (g.text[0] + g.text[2]) / 2,
            top: index < 2 ? g.card[3] - 8 : g.card[1] - 40,
            color: d.amount > 0 ? '#5dff9f' : '#ff6b81',
            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            animation: 'tycoon-float-up 1.8s ease-out forwards',
          }}
        >
          {d.amount > 0 ? '+' : ''}
          {money(d.amount)}
        </span>
      ))}
    </>
  )
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

export function Die({ value, size, rolling = false }: { value: number; size: number; rolling?: boolean }) {
  const [face, setFace] = useState(value)
  useEffect(() => {
    if (!rolling) {
      setFace(value)
      return
    }
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90)
    return () => clearInterval(t)
  }, [rolling, value])
  return (
    <div className="tycoon-die grid grid-cols-3 grid-rows-3" style={{ width: size, height: size, padding: size * 0.14, animation: rolling ? 'tycoon-roll 0.42s linear infinite' : undefined }}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[face]?.includes(i) && <span className="rounded-full" style={{ width: size * 0.19, height: size * 0.19, background: face === 1 ? '#d61f2c' : '#1b1d3d' }} />}
        </span>
      ))}
    </div>
  )
}

function MiniDie({ value, small }: { value: number; small?: boolean }) {
  return <Die value={value} size={small ? 28 : 32} />
}

/** The throw itself: two big dice tumbling out beside the roller's card, then the total. */
function DiceTray({ index, dice, rolling, color }: { index: number; dice: [number, number]; rolling: boolean; color: string }) {
  const g = SEAT_GEOM[index]
  const W = 208
  const H = 92
  const leftSeat = index === 0 || index === 2
  const x = leftSeat ? g.card[2] + 12 : g.card[0] - 12 - W
  const y = (g.card[1] + g.card[3]) / 2 - H / 2
  return (
    <div
      className="tycoon-hub pointer-events-none absolute flex items-center justify-center gap-3 rounded-[26px]"
      style={{ left: x, top: y, width: W, height: H, zIndex: 980, borderColor: color, boxShadow: `0 0 26px ${color}, inset 0 2px 0 rgba(255,255,255,0.18)`, animation: 'tycoon-pop 0.25s ease-out' }}
    >
      <Die value={dice[0]} size={56} rolling={rolling} />
      <Die value={dice[1]} size={56} rolling={rolling} />
      {!rolling && (
        <span className="absolute -bottom-4 rounded-full bg-gradient-to-b from-[#ffe58a] to-[#f5b52a] px-3 text-[22px] font-bold leading-[30px] text-[#3b1a00]" style={{ animation: 'tycoon-pop 0.2s ease-out' }}>
          {dice[0] === 6 && dice[1] === 6 ? 'Double six!' : dice[0] + dice[1]}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ centre hub */

function Hub({ hub }: { hub: HubState }) {
  const clubPot = useCityStore((s) => s.clubPot)
  const casinoTray = useCityStore((s) => s.casinoTray)
  const casinoEnabled = useCityStore((s) => s.config.casinoEnabled)
  const [cx, cy] = HUB_CENTER
  const W = 430
  return (
    <div className="tycoon-hub absolute flex flex-col items-center rounded-[30px] px-5 pb-4 pt-3" style={{ left: cx - W / 2, top: cy - 80, width: W, zIndex: 900 }}>
      <div className="flex w-full items-center justify-between text-[17px] font-semibold">
        <span className="rounded-full bg-black/30 px-3 py-0.5 text-amber-200" title="Grand Club pot: taxes, fines and penalties">
          👑 Pot {money(clubPot)}
        </span>
        {casinoEnabled && (
          <span className="rounded-full bg-black/30 px-3 py-0.5 text-pink-200" title="Casino jackpot tray">
            🎰 Jackpot {money(casinoTray)}
          </span>
        )}
      </div>
      <p className="mt-1 text-[24px] font-bold leading-tight text-white">{hub.title}</p>
      <p className="mt-2 min-h-[24px] text-center text-[17px] font-medium leading-snug text-slate-200">{hub.message}</p>
      {hub.buttons.length > 0 && (
        <div className="mt-2 flex w-full gap-2">
          {hub.buttons.map((b) => (
            <button key={b.label} type="button" onClick={b.onClick} disabled={b.disabled} className={`tycoon-btn tycoon-btn-${b.tone} flex-1 py-2.5 text-[20px]`}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ chat */

function ChatDock({ onSend }: { onSend: (text: string) => void }) {
  const messages = useChatStore((s) => s.messages[TYCOON_CHAT])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const recent = (messages ?? []).filter((m) => now - m.timestamp < 7000).slice(-3)
  const send = (line: string) => {
    const v = line.trim()
    if (!v) return
    onSend(v.slice(0, 120))
    setText('')
    setOpen(false)
  }
  const [x0, y0] = CHAT_BTN
  return (
    <>
      <div className="pointer-events-none absolute flex flex-col items-start gap-1.5" style={{ left: x0, bottom: DESIGN_H - y0 + 10, zIndex: 950 }}>
        {recent.map((m) => (
          <span key={m.id} className="whitespace-nowrap rounded-[16px] bg-[#0b1350]/90 px-3 py-1 text-[20px] font-medium text-white ring-2 ring-sky-400/60" style={{ animation: 'tycoon-pop 0.3s ease-out' }}>
            <b className="text-sky-300">{m.senderName}:</b> {m.text}
          </span>
        ))}
      </div>
      <button
        type="button"
        aria-label="Chat"
        onClick={() => setOpen((o) => !o)}
        className="tycoon-btn flex items-center justify-center bg-gradient-to-b from-sky-400 to-indigo-600"
        style={{ ...box(CHAT_BTN), border: '3px solid #fff', boxShadow: '0 0 18px rgba(80,160,255,0.8)' }}
      >
        {open ? <X size={30} /> : <MessageCircle size={32} />}
      </button>
      {open && (
        <div className="tycoon-panel absolute rounded-[24px] p-3" style={{ left: x0, bottom: DESIGN_H - y0 + 12, width: 440, zIndex: 960, animation: 'tycoon-pop 0.25s ease-out' }}>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_LINES.map((l) => (
              <button key={l} type="button" onClick={() => send(l)} className="rounded-full bg-white/10 px-3 py-1.5 text-left text-[19px] font-medium hover:bg-white/20">
                {l}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1"
            onSubmit={(e) => {
              e.preventDefault()
              send(text)
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something…" className="min-w-0 flex-1 bg-transparent text-[20px] outline-none placeholder:text-white/40" />
            <button type="submit" aria-label="Send">
              <SendHorizontal size={24} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
