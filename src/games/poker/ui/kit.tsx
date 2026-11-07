import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { create } from 'zustand'
import { ChevronLeft, X } from 'lucide-react'
import { cardName, rankLabel, suitOf, type Card } from '../engine/cards'
import { cosmetic } from '../data/catalog'
import { portrait } from '../data/players'
import { shown, useProfile } from '../state/profileStore'
import { useNav } from '../state/nav'
import { CoinIcon, CrownIcon, SpadeIcon, SuitGlyph } from './icons'
import { pokerSfx } from './sound'
import emblem from './art/emblem.webp'

export const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
export const fmtShort = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}K` : fmt(n))

/* ---------------------------------------------------------------- logo */

export function Logo({ size = 1, tagline = true }: { size?: number; tagline?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ fontSize: `${size}em` }}>
      <img src={emblem} alt="" className="rpc-float" style={{ width: '6.2em', marginBottom: '-0.6em', mixBlendMode: 'lighten', maskImage: 'radial-gradient(closest-side, #000 82%, transparent)' }} />
      <h1 className="rpc-logo-type gold-text" style={{ fontSize: '2.6em' }}>
        ROYAL
        <br />
        POKER CLUB
      </h1>
      {tagline && <p className="rpc-display mt-1 text-[1.25em] font-medium text-[#ffe9b0]">Play · Win · Enjoy</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- avatar */

export function Avatar({ avatar, size = 56, frame, glow, className = '' }: { avatar: string; size?: number; frame?: string; glow?: boolean; className?: string }) {
  const p = useProfile()
  const f = cosmetic(frame ?? shown(p, 'frame'))
  const style = { width: size, height: size, '--ring-a': f?.colors[0] ?? '#ffe08a', '--ring-b': f?.colors[1] ?? '#b07a14' } as CSSProperties
  return (
    <div className={`rpc-avatar shrink-0 ${glow ? 'rpc-turn' : ''} ${className}`} style={style}>
      <img src={portrait(avatar)} alt="" draggable={false} />
    </div>
  )
}

/* ---------------------------------------------------------------- headers */

export function ScreenHeader({ title, icon, right, onBack }: { title: string; icon?: ReactNode; right?: ReactNode; onBack?: () => void }) {
  const back = useNav((s) => s.back)
  return (
    <header className="relative z-10 flex h-14 items-center justify-between px-3">
      <button aria-label="Back" onClick={() => (onBack ? onBack() : back())} className="grid h-10 w-10 place-items-center rounded-full text-[#f5e6c0] active:bg-white/10">
        <ChevronLeft size={30} strokeWidth={2.2} />
      </button>
      <h2 className="rpc-display flex items-center gap-2 text-[1.45em] text-white">
        {icon}
        {title}
      </h2>
      <div className="flex min-w-10 justify-end">{right}</div>
    </header>
  )
}

export function PointsPill({ amount, onAdd, compact }: { amount: number; onAdd?: () => void; compact?: boolean }) {
  return (
    <div className="dark-frame flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1" style={{ boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.6)' }}>
      <CoinIcon size={compact ? 22 : 26} />
      <span className="rpc-display px-0.5 text-[1.05em] text-white" aria-label={`${fmt(amount)} points`}>
        {fmt(amount)}
      </span>
      {onAdd && (
        <button aria-label="Get free points" onClick={onAdd} className="btn btn-green grid h-7 w-7 place-items-center rounded-lg text-xl leading-none">
          +
        </button>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- tabs */

export function Tabs<T extends string>({ value, options, onChange, className = '' }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={`rpc-tabs ${className}`}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className="rpc-tab text-[1.05em]" onClick={() => (pokerSfx.tap(), onChange(o.id))}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- sheets & toasts */

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/65" onClick={onClose} role="dialog" aria-modal aria-label={title}>
      <div className="gold-frame rpc-sheet max-h-[88%] overflow-y-auto rounded-t-[26px] px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-[#e9b33a]/50" />
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h3 className="rpc-display gold-text text-[1.35em]">{title}</h3>
            <button aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-[#e9d9b0] active:bg-white/10">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

interface ToastState {
  text: string | null
  kind: 'info' | 'good' | 'bad'
  at: number
  show: (text: string, kind?: 'info' | 'good' | 'bad') => void
}
export const useToast = create<ToastState>((set) => ({ text: null, kind: 'info', at: 0, show: (text, kind = 'info') => set({ text, kind, at: Date.now() }) }))
export const toast = (text: string, kind: 'info' | 'good' | 'bad' = 'info') => useToast.getState().show(text, kind)

export function ToastHost() {
  const { text, kind, at } = useToast()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!text) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 2600)
    return () => clearTimeout(t)
  }, [text, at])
  if (!visible || !text) return null
  const color = kind === 'good' ? '#4ade80' : kind === 'bad' ? '#f87171' : 'var(--gold-2)'
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[70] flex justify-center px-4" role="status" aria-live="polite">
      <div key={at} className="gold-frame rpc-pop max-w-sm rounded-2xl px-4 py-2.5 text-center text-[0.95em] font-semibold" style={{ color }}>
        {text}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- cards */

/** A face-up card. `width` is px or any CSS length (e.g. "15cqw"); everything inside scales with it. */
export function PlayingCard({ card, width, className = '', style, fourColor }: { card: Card; width: number | string; className?: string; style?: CSSProperties; fourColor?: boolean }) {
  const s = suitOf(card)
  const tone = fourColor ? { h: 'red', d: 'blue', c: 'green', s: '' }[s] : s === 'h' || s === 'd' ? 'red' : ''
  const w = typeof width === 'number' ? `${width}px` : width
  return (
    <div className={`pcard ${tone} ${className}`} style={{ width: w, ['--w' as string]: w, ...style }} role="img" aria-label={cardName(card)}>
      <span className="pc-rank" style={{ fontSize: 'calc(var(--w) * 0.36)', letterSpacing: card[0] === 'T' ? '-0.08em' : 0 }}>
        {rankLabel(card)}
      </span>
      <span className="pc-small" style={{ top: 'calc(var(--w) * 0.42)' }}>
        <SuitGlyph suit={s} size="calc(var(--w) * 0.22)" />
      </span>
      <span className="pc-big">
        <SuitGlyph suit={s} size="calc(var(--w) * 0.56)" />
      </span>
    </div>
  )
}

export function CardBack({ width, className = '', style }: { width: number | string; className?: string; style?: CSSProperties }) {
  const p = useProfile()
  const c = cosmetic(shown(p, 'cardBack'))
  const [a, b] = c?.colors ?? ['#b3192b', '#f4c542']
  const px = typeof width === 'number' ? width : 22
  return (
    <div
      className={`pcard-back grid place-items-center ${className}`}
      style={{
        width,
        background: `repeating-linear-gradient(45deg, ${a} 0 4px, color-mix(in srgb, ${a} 70%, black) 4px 8px)`,
        boxShadow: `inset 0 0 0 ${Math.max(1.5, px * 0.06)}px #fff, inset 0 0 0 ${Math.max(2.5, px * 0.09)}px ${b}, 0 3px 8px rgba(0,0,0,.5)`,
        ...style,
      }}
      aria-hidden
    >
      <span style={{ display: 'block', width: '40%' }}>
        <SpadeIcon size={'100%' as unknown as number} fill={b} style={{ display: 'block', height: 'auto' }} />
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- chips */

const CHIP_COLORS: [number, string][] = [
  [100000, '#7b2fd0'],
  [10000, '#e8b830'],
  [1000, '#1d1d1d'],
  [100, '#1d5fd1'],
  [0, '#d11a2a'],
]

export function Chip({ value = 100, size = 18, style }: { value?: number; size?: number; style?: CSSProperties }) {
  const color = CHIP_COLORS.find(([v]) => value >= v)?.[1] ?? '#d11a2a'
  return (
    <span
      aria-hidden
      className="inline-block rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color} 0 38%, #fff 39% 44%, ${color} 45%), repeating-conic-gradient(#fff 0 18deg, ${color} 18deg 45deg)`,
        backgroundBlendMode: 'normal',
        boxShadow: `inset 0 0 0 ${size * 0.12}px ${color}, 0 2px 0 color-mix(in srgb, ${color} 60%, black), 0 3px 4px rgba(0,0,0,.5)`,
        ...style,
      }}
    />
  )
}

/** A short stack of chips for bets and pots. */
export function ChipStack({ amount, size = 16 }: { amount: number; size?: number }) {
  const n = Math.min(4, Math.max(1, Math.ceil(Math.log10(Math.max(10, amount)) - 1)))
  return (
    <span className="relative inline-block" style={{ width: size, height: size + (n - 1) * 3 }}>
      {Array.from({ length: n }, (_, i) => (
        <Chip key={i} value={amount / (i + 1)} size={size} style={{ position: 'absolute', left: 0, bottom: i * 3 }} />
      ))}
    </span>
  )
}

/* ---------------------------------------------------------------- misc */

export function Countdown({ to, className = '' }: { to: number; className?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, to - now)
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  const pad = (v: number) => String(v).padStart(2, '0')
  return <span className={className}>{`${pad(h)}:${pad(m)}:${pad(s)}`}</span>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="relative h-7 w-12 shrink-0 rounded-full transition-colors" style={{ background: checked ? 'var(--gold-fill)' : '#3a3026', boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.5)' }}>
      <span className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: checked ? 26 : 4 }} />
    </button>
  )
}

export function Progress({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  return (
    <div className={`h-3 overflow-hidden rounded-full bg-black/70 ${className}`} style={{ boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.45)' }} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: 'var(--gold-fill)', boxShadow: '0 0 10px rgba(255,200,80,.7)' }} />
    </div>
  )
}

export function LevelBadge({ level, className = '' }: { level: number; className?: string }) {
  return (
    <span className={`rpc-display inline-flex items-center gap-1 text-[#ffd85e] ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path fill="url(#rpcGold)" d="m12 1.8 3 6.5 7.1.8-5.3 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L1.9 9.1 9 8.3l3-6.5Z" />
      </svg>
      Lv.{level}
    </span>
  )
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="dark-frame flex flex-col items-center gap-2 rounded-2xl px-5 py-7 text-center">
      <CrownIcon size={34} />
      <p className="rpc-display text-[1.1em] text-white">{title}</p>
      {body && <p className="rpc-muted text-[0.92em]">{body}</p>}
      {action}
    </div>
  )
}
