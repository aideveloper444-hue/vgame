import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Plus, SendHorizontal, Settings, Smile, Users } from 'lucide-react'
import { useCityStore, type CityPlayer } from '../cityStore'
import { DICE_ROLL_MS } from '../cityBoardLayout'
import { CITY_CHAT } from '../CityChatPanel'
import type { CashDelta } from '../useCityFx'
import { useChatStore } from '@/social/stores/useChatStore'
import { ACTION_RECTS, CHAT_RECT, DESIGN_H, DESIGN_W, SEATS, SPECIAL_RECT, type Rect } from './alphaLayout'
import { AVATAR_ART, BUTTON_ART, COIN_IMG, CROWN_IMG, GEM_IMG, LOGO_IMG, SPECIAL_IMG } from './alphaArt'
import AlphaBoard from './AlphaBoard'
import '@fontsource/roboto-condensed/500.css'
import '@fontsource/roboto-condensed/700.css'
import './alpha.css'

const QUICK_LINES = ['Nice move! 👏', 'Watch out! ⚠️', 'Good luck! 🍀', 'Ha ha! 😂', 'Your turn! ⏳', 'GG! 🏆']

export type DiceAction = { kind: 'roll'; onClick: () => void } | { kind: 'end'; onClick: () => void } | { kind: 'wait' }

export interface AlphaStageProps {
  players: CityPlayer[]
  currentIndex: number
  rankOf: (id: string) => number
  ownedCount: (id: string) => number
  statusOf: (p: CityPlayer) => string | null
  cashDeltas: Record<string, CashDelta[]>
  diceAction: DiceAction
  rollKey: number
  mapView: boolean
  onMap: () => void
  canBuild: boolean
  buildCount: number
  onBuild: () => void
  onAttack: () => void
  onDefend: () => void
  onItems: () => void
  onSpecial: () => void
  onBack: () => void
  onSettings: () => void
  onChat: (text: string) => void
  coins: number
  gems: number
  activePlayers: number
  /** modals, toasts and banners, drawn above the stage at screen scale */
  children?: ReactNode
}

/** Fits the 900-wide design to the screen; tall phones get the spare height between the sections. */
function useStageFit() {
  const [fit, setFit] = useState({ scale: 1, height: DESIGN_H, left: 0, top: 0 })
  useLayoutEffect(() => {
    const update = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (vw / vh <= DESIGN_W / DESIGN_H) {
        const scale = vw / DESIGN_W
        const height = Math.min(vh / scale, DESIGN_H * 1.3)
        setFit({ scale, height, left: 0, top: Math.max(0, (vh - height * scale) / 2) })
      } else {
        const scale = vh / DESIGN_H
        setFit({ scale, height: DESIGN_H, left: (vw - DESIGN_W * scale) / 2, top: 0 })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return fit
}

const at = ([x0, y0, x1, y1]: Rect, dy = 0) => ({ left: x0, top: y0 + dy, width: x1 - x0, height: y1 - y0 })

export default function AlphaStage(props: AlphaStageProps) {
  const { scale, height, left, top } = useStageFit()
  const extra = height - DESIGN_H
  // spare height: a little under the header, more around the board, the rest above the chat row
  const dyBoard = extra * 0.4
  const dyButtons = extra * 0.55
  const dyChat = extra

  const lastRolls = useLastRolls(props.rollKey, props.currentIndex)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="alpha-root fixed inset-0 z-50 overflow-hidden text-white">
      <div className="alpha-bg absolute inset-0" />
      <div
        className="absolute origin-top-left"
        style={{ width: DESIGN_W, height, transform: `translate(${left}px, ${top}px) scale(${scale})` }}
      >
        <Header {...props} />

        <div className="absolute inset-x-0" style={{ top: dyBoard, height: DESIGN_H }}>
          <AlphaBoard mapView={props.mapView} />
          {props.players.slice(0, 4).map((p, i) => (
            <PlayerCard
              key={p.id}
              player={p}
              seatIndex={i}
              active={i === props.currentIndex}
              rank={props.rankOf(p.id)}
              owned={props.ownedCount(p.id)}
              status={props.statusOf(p)}
              deltas={props.cashDeltas[p.id] ?? []}
              dice={lastRolls.values[p.id] ?? [5, 5, 4, 6][i]}
              rolling={lastRolls.rollingId === p.id}
              action={i === props.currentIndex ? props.diceAction : { kind: 'wait' }}
            />
          ))}
        </div>

        <ActionButtons {...props} dy={dyButtons} onSoon={setToast} />
        <ChatBar onSend={props.onChat} dy={dyChat} />
        <button
          type="button"
          onClick={props.onSpecial}
          className="alpha-press absolute overflow-hidden rounded-[22px]"
          style={{ ...at(SPECIAL_RECT, dyChat), boxShadow: '0 0 0 3px #7dd3fc, 0 0 26px rgba(56,189,248,0.75)' }}
        >
          <img src={SPECIAL_IMG} alt="Special card: take a free flight to any city" draggable={false} className="h-full w-full" />
          <span className="alpha-sheen absolute inset-0" />
        </button>

        {toast && (
          <div className="alpha-toast absolute left-1/2 -translate-x-1/2 rounded-full px-7 py-3 text-[28px] font-bold" style={{ top: 1250 + dyButtons }}>
            {toast}
          </div>
        )}
      </div>
      {props.children}
    </div>
  )
}

/* ------------------------------------------------------------------ header */

function Header({ onBack, onSettings, coins, gems, activePlayers, players }: AlphaStageProps) {
  const fmt = (n: number) => n.toLocaleString('en-IN')
  return (
    <>
      <button type="button" onClick={onBack} aria-label="Back" className="alpha-press alpha-roundbtn absolute" style={{ left: 18, top: 9, width: 60, height: 60 }}>
        <ArrowLeft size={36} strokeWidth={2.6} />
      </button>
      <img src={LOGO_IMG} alt="ALPHAZOX · Play · Connect · Win" draggable={false} className="absolute" style={{ left: 106, top: 13, width: 196, height: 52 }} />

      <div className="alpha-pill absolute flex items-center" style={{ left: 372, top: 12, width: 168, height: 56 }}>
        <img src={COIN_IMG} alt="" className="ml-[6px] h-[44px] w-[44px]" draggable={false} />
        <span className="alpha-num ml-2 flex-1 text-[30px]">{fmt(coins)}</span>
        <span className="alpha-plus mr-[5px]">
          <Plus size={30} strokeWidth={3.4} />
        </span>
      </div>
      <div className="alpha-pill absolute flex items-center" style={{ left: 555, top: 12, width: 142, height: 56 }}>
        <img src={GEM_IMG} alt="" className="ml-[6px] h-[42px] w-[46px]" draggable={false} />
        <span className="alpha-num ml-1 flex-1 text-[30px]">{fmt(gems)}</span>
        <span className="alpha-plus mr-[5px]">
          <Plus size={30} strokeWidth={3.4} />
        </span>
      </div>
      <div className="alpha-pill absolute flex items-center justify-center gap-2" style={{ left: 711, top: 12, width: 102, height: 56 }}>
        <Users size={34} className="fill-white" strokeWidth={2} />
        <span className="alpha-num text-[28px]">
          {activePlayers}/{players.length}
        </span>
      </div>
      <button type="button" onClick={onSettings} aria-label="Settings" className="alpha-press alpha-roundbtn absolute" style={{ left: 830, top: 11, width: 56, height: 56 }}>
        <Settings size={34} strokeWidth={2.6} />
      </button>
    </>
  )
}

/* ------------------------------------------------------------------ player cards */

function useLastRolls(rollKey: number, currentIndex: number) {
  const players = useCityStore((s) => s.players)
  const diceValue = useCityStore((s) => s.diceValue)
  const [values, setValues] = useState<Record<string, number>>({})
  const [rollingId, setRollingId] = useState<string | null>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const p = players[currentIndex]
    if (!p || diceValue == null) return
    setRollingId(p.id)
    const t = setTimeout(() => {
      setRollingId(null)
      setValues((v) => ({ ...v, [p.id]: diceValue }))
    }, DICE_ROLL_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey])
  return { values, rollingId }
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

function Die({ value, rolling, size }: { value: number; rolling: boolean; size: number }) {
  const [spinFace, setSpinFace] = useState(value)
  useEffect(() => {
    if (!rolling) return
    const iv = setInterval(() => setSpinFace(1 + Math.floor(Math.random() * 6)), 90)
    return () => clearInterval(iv)
  }, [rolling])
  const shown = rolling ? spinFace : value
  const pip = size * 0.19
  return (
    <div className="alpha-die grid grid-cols-3 grid-rows-3" style={{ width: size, height: size, padding: size * 0.13, animation: rolling ? 'alpha-roll 0.45s linear infinite' : undefined }}>
      {Array.from({ length: 9 }, (_, k) => (
        <span key={k} className="flex items-center justify-center">
          {PIPS[shown]?.includes(k) && <span className="rounded-full bg-[#111827]" style={{ width: pip, height: pip }} />}
        </span>
      ))}
    </div>
  )
}

function IndiaFlag() {
  return (
    <svg width="28" height="19" viewBox="0 0 30 20" className="shrink-0 rounded-[3px] shadow">
      <rect width="30" height="6.67" fill="#ff9933" />
      <rect y="6.67" width="30" height="6.67" fill="#ffffff" />
      <rect y="13.33" width="30" height="6.67" fill="#138808" />
      <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth="0.9" />
    </svg>
  )
}

function PlayerCard({
  player,
  seatIndex,
  active,
  rank,
  owned,
  status,
  deltas,
  dice,
  rolling,
  action,
}: {
  player: CityPlayer
  seatIndex: number
  active: boolean
  rank: number
  owned: number
  status: string | null
  deltas: CashDelta[]
  dice: number
  rolling: boolean
  action: DiceAction
}) {
  const seat = SEATS[seatIndex % 4]
  const [x0, y0, x1, y1] = seat.card
  const [ax] = seat.avatar
  const h = y1 - y0
  const avatarR = 62
  const textLeft = ax + avatarR + 10 - x0
  const narrow = x1 - x0 < 340
  const dieSize = h * (narrow ? 0.5 : 0.56)
  return (
    <div className="absolute" style={{ left: x0, top: y0 - 10, width: x1 - x0, height: h + 20, opacity: player.bankrupt ? 0.45 : 1 }}>
      {/* glowing pill */}
      <div
        className="absolute inset-x-0 rounded-full"
        style={{
          top: 10,
          height: h,
          background: 'linear-gradient(180deg, rgba(18,22,70,0.78), rgba(8,10,40,0.88))',
          border: `3.5px solid ${seat.color}`,
          boxShadow: `0 0 ${active ? 34 : 18}px ${seat.glow}, inset 0 0 18px ${seat.glow}55`,
          animation: active ? 'alpha-cardpulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
      {/* avatar with ring, crown and rank badge */}
      <div className="absolute" style={{ left: ax - x0 - avatarR, top: 10 + h / 2 - avatarR, width: avatarR * 2, height: avatarR * 2 }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${seat.glow}, ${seat.color})`, boxShadow: `0 0 22px ${seat.glow}, 0 0 0 3px rgba(255,255,255,0.65)` }}
        />
        <img src={AVATAR_ART[seat.key]} alt="" draggable={false} className="absolute inset-[7px] rounded-full" style={{ width: avatarR * 2 - 14, height: avatarR * 2 - 14 }} />
        <img src={CROWN_IMG} alt="" draggable={false} className="absolute" style={{ right: -14, top: -24, width: 58, transform: 'rotate(14deg)' }} />
        <span
          className="alpha-num absolute flex items-center justify-center rounded-full text-[26px]"
          style={{ right: -12, bottom: -6, width: 44, height: 44, background: seat.color, border: '3px solid #fff', boxShadow: `0 0 12px ${seat.glow}` }}
        >
          {rank}
        </span>
      </div>

      {/* name, cash and progress dots */}
      <div className="absolute flex flex-col" style={{ left: textLeft, top: 10 + h * 0.1, right: dieSize + 14 }}>
        <div className="flex items-center gap-2">
          <IndiaFlag />
          <span className="alpha-name truncate text-[27px]">{player.name}</span>
        </div>
        <span className="alpha-cash whitespace-nowrap leading-[31px] tracking-[-0.01em]" style={{ fontSize: narrow ? 20 : 22 }}>Cash: ₹ {player.cash.toLocaleString('en-IN')}</span>
        <div className="mt-[5px] flex gap-[12px]">
          {Array.from({ length: 5 }, (_, k) => (
            <span
              key={k}
              className="rounded-full"
              style={{
                width: 16,
                height: 16,
                background: `radial-gradient(circle at 35% 30%, #fff, ${seat.glow} 45%, ${seat.color})`,
                boxShadow: `0 0 8px ${seat.glow}`,
                opacity: k < Math.max(1, owned) ? 1 : 0.4,
              }}
            />
          ))}
        </div>
      </div>

      {/* dice: tap to roll on your turn, then it turns into the finish-turn button */}
      <div className="absolute" style={{ right: 12, top: 10 + (h - dieSize) / 2 }}>
        {action.kind === 'end' ? (
          <button type="button" onClick={action.onClick} className="alpha-press alpha-endbtn flex flex-col items-center justify-center" style={{ width: dieSize, height: dieSize }}>
            <Check size={36} strokeWidth={3.6} />
            <span className="text-[16px] font-black leading-none">END</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={action.kind !== 'roll'}
            onClick={action.kind === 'roll' ? action.onClick : undefined}
            className={action.kind === 'roll' ? 'alpha-press alpha-tapdie relative' : 'relative'}
            aria-label={action.kind === 'roll' ? 'Roll the dice' : `Last roll ${dice}`}
          >
            <Die value={dice} rolling={rolling} size={dieSize} />
            {action.kind === 'roll' && <span className="alpha-tap absolute -bottom-[14px] left-1/2 -translate-x-1/2 rounded-full px-2 text-[15px] font-black">ROLL</span>}
          </button>
        )}
      </div>

      {status && (
        <span
          className="absolute rounded-full px-3 text-[17px] font-black uppercase tracking-wide"
          style={{ right: 26, top: 0, background: seat.color, boxShadow: `0 0 12px ${seat.glow}`, border: '2px solid rgba(255,255,255,0.8)' }}
        >
          {status}
        </span>
      )}

      {deltas.map((d) => (
        <span
          key={d.id}
          className="alpha-num pointer-events-none absolute text-[34px]"
          style={{ left: textLeft + 120, top: 20, color: d.amount > 0 ? '#4ade80' : '#f87171', animation: 'alpha-delta 1.8s ease-out forwards' }}
        >
          {d.amount > 0 ? '+' : '−'}₹{Math.abs(d.amount)}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ action buttons */

function ActionButtons({
  dy,
  mapView,
  onMap,
  canBuild,
  buildCount,
  onBuild,
  onAttack,
  onDefend,
  onItems,
  onSoon,
}: AlphaStageProps & { dy: number; onSoon: (text: string) => void }) {
  const buttons = [
    { key: 'map' as const, label: 'Map', onClick: onMap, enabled: true, on: mapView },
    { key: 'build' as const, label: 'Build', onClick: onBuild, enabled: canBuild, badge: buildCount },
    {
      key: 'attack' as const,
      label: 'Attack',
      onClick: () => {
        onAttack()
        onSoon('⚔️ Attack — coming soon')
      },
      enabled: true,
    },
    {
      key: 'defend' as const,
      label: 'Defend',
      onClick: () => {
        onDefend()
        onSoon('🛡️ Defend — coming soon')
      },
      enabled: true,
    },
    { key: 'items' as const, label: 'Items', onClick: onItems, enabled: true },
  ]
  return (
    <>
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          aria-label={b.label}
          onClick={b.enabled ? b.onClick : undefined}
          className={`alpha-press alpha-action alpha-action-${b.key} absolute`}
          style={{ ...at(ACTION_RECTS[b.key], dy), filter: b.enabled ? undefined : 'saturate(0.35) brightness(0.65)', outline: b.on ? '4px solid #fff' : undefined }}
        >
          <img src={BUTTON_ART[b.key]} alt="" draggable={false} className="h-full w-full" />
          {b.badge ? (
            <span className="alpha-num absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-[20px]" style={{ border: '3px solid #fff' }}>
              {b.badge}
            </span>
          ) : null}
        </button>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ chat */

function ChatBar({ onSend, dy }: { onSend: (text: string) => void; dy: number }) {
  const messages = useChatStore((s) => s.messages[CITY_CHAT])
  const [draft, setDraft] = useState('')
  const [quick, setQuick] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  const recent = (messages ?? []).filter((m) => now - m.timestamp < 7000).slice(-3)

  const send = (text: string) => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setDraft('')
    setQuick(false)
  }

  const [x0, y0, x1, y1] = CHAT_RECT
  return (
    <>
      <div className="absolute flex flex-col items-start gap-2" style={{ left: x0 + 8, top: y0 + dy - 10, transform: 'translateY(-100%)' }}>
        {recent.map((m) => (
          <span key={m.id} className="alpha-bubble rounded-[18px] px-4 py-1 text-[24px]">
            <b>{m.senderName}:</b> {m.text}
          </span>
        ))}
      </div>
      {quick && (
        <div className="alpha-quick absolute grid grid-cols-2 gap-2 rounded-[22px] p-3" style={{ left: x0, top: y0 + dy - 190, width: 440 }}>
          {QUICK_LINES.map((l) => (
            <button key={l} type="button" onClick={() => send(l)} className="alpha-press rounded-full bg-white/10 px-3 py-2 text-left text-[22px] font-bold">
              {l}
            </button>
          ))}
        </div>
      )}
      <form
        className="alpha-chat absolute flex items-center"
        style={{ left: x0, top: y0 + dy, width: x1 - x0, height: y1 - y0 }}
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <button type="button" aria-label="Quick messages" onClick={() => setQuick((q) => !q)} className="alpha-press ml-4 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white text-[#1d2a8a]">
          <Smile size={40} strokeWidth={2.6} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          maxLength={120}
          className="alpha-input mx-4 min-w-0 flex-1 bg-transparent text-[31px] outline-none"
        />
        <button type="submit" aria-label="Send" className="alpha-press mr-5 text-white">
          <SendHorizontal size={42} strokeWidth={2.6} className="fill-white" />
        </button>
      </form>
    </>
  )
}
