import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { ChevronLeft, X } from 'lucide-react'
import type { AnimalId } from '../engine/content'
import { festival, useSave } from '../state/progress'
import { ART } from './art'
import { sfx } from './sfx'

// ---------------------------------------------------------------- navigation

export type Screen = 'home' | 'select' | 'preview' | 'run' | 'store' | 'missions' | 'worlds' | 'events' | 'rewards' | 'more' | 'settings' | 'leaderboard' | 'race'
export type StoreTab = 'characters' | 'powerups' | 'coins' | 'bundles'

interface Nav {
  screen: Screen
  back: Screen[]
  previewId: AnimalId
  storeTab: StoreTab
  /** start the next run as the tutorial */
  tutorial: boolean
  levelUp: number | null
  go: (s: Screen, opts?: { previewId?: AnimalId; storeTab?: StoreTab; replace?: boolean }) => void
  pop: () => void
}

export const useNav = create<Nav>((set, get) => ({
  screen: 'home',
  back: [],
  previewId: 'sonic',
  storeTab: 'characters',
  tutorial: false,
  levelUp: null,
  go: (screen, opts = {}) => {
    const cur = get()
    set({
      screen,
      back: opts.replace || screen === 'home' ? (screen === 'home' ? [] : cur.back) : [...cur.back, cur.screen].slice(-8),
      previewId: opts.previewId ?? cur.previewId,
      storeTab: opts.storeTab ?? cur.storeTab,
    })
  },
  pop: () => {
    const b = [...get().back]
    const prev = b.pop() ?? 'home'
    set({ screen: prev === 'run' ? 'home' : prev, back: b })
  },
}))

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number
  text: string
  tone: 'info' | 'good' | 'bad'
}
export const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }))
let toastId = 1
export function toast(text: string, tone: Toast['tone'] = 'info') {
  const t = { id: toastId++, text, tone }
  useToasts.setState((s) => ({ list: [...s.list.slice(-2), t] }))
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((x) => x.id !== t.id) })), 2400)
}

export function Toasts() {
  const list = useToasts((s) => s.list)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[18%] z-[90]">
      {list.map((t, i) => (
        <div key={t.id} className="wb-toast" style={{ top: i * 46 }}>
          <div
            className="rounded-full px-5 py-2 text-[17px] font-bold wb-shadow"
            style={{
              background: t.tone === 'bad' ? 'linear-gradient(180deg,#a3231b,#5c0f0a)' : t.tone === 'good' ? 'linear-gradient(180deg,#2d9a1a,#14550b)' : 'linear-gradient(180deg,#25456e,#0d1d33)',
              boxShadow: '0 0 0 1.5px rgba(255,255,255,0.35), 0 6px 18px rgba(0,0,0,0.5)',
            }}
          >
            {t.text}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- numbers, icons

export const fmt = (n: number) => Math.floor(n).toLocaleString('en-IN')

export function Coin({ size = 22 }: { size?: number }) {
  return <img src={ART.coin} alt="" className="wb-round-ic inline-block" style={{ width: size, height: size }} />
}
export function Gem({ size = 22 }: { size?: number }) {
  return <img src={ART.gem} alt="" className="wb-round-ic inline-block" style={{ width: size, height: size }} />
}

/** Coins, gems and the store cart (top right of most screens). */
export function Wallet({ compact = false }: { compact?: boolean }) {
  const coins = useSave((s) => s.coins)
  const gems = useSave((s) => s.gems)
  const go = useNav((s) => s.go)
  return (
    <div className="flex items-center gap-2">
      <button className="wb-pill" onClick={() => (sfx.tap(), go('store', { storeTab: 'coins' }))} aria-label="Coins, get more">
        <Coin size={30} />
        <span className={compact ? 'min-w-[44px]' : 'min-w-[58px]'}>{fmt(coins)}</span>
        <span className="wb-plus">+</span>
      </button>
      <button className="wb-pill" onClick={() => (sfx.tap(), go('store', { storeTab: 'coins' }))} aria-label="Gems, get more">
        <Gem size={30} />
        <span className={compact ? 'min-w-[30px]' : 'min-w-[40px]'}>{fmt(gems)}</span>
        <span className="wb-plus">+</span>
      </button>
      {!compact && (
        <button className="wb-pill h-[34px] w-[40px] justify-center !p-0" onClick={() => (sfx.tap(), go('store'))} aria-label="Store">
          <img src={ART.cart} alt="" className="h-[30px] w-[34px] rounded-md object-cover" />
        </button>
      )}
    </div>
  )
}

/** Screen header: back arrow, title, wallet, optional close. */
export function Header({ title, onBack, close, wallet = true }: { title: string; onBack?: () => void; close?: boolean; wallet?: boolean }) {
  const pop = useNav((s) => s.pop)
  const back = onBack ?? pop
  return (
    <div className="flex items-center gap-3">
      <button className="wb-btn wb-btn-dark h-10 w-10 shrink-0 !rounded-full" onClick={() => (sfx.tap(), back())} aria-label="Back">
        <ChevronLeft size={26} strokeWidth={3} />
      </button>
      <h1 className="wb-title wb-stroke min-w-0 flex-1 truncate text-[30px] leading-none">{title}</h1>
      {wallet && <Wallet compact />}
      {close && (
        <button className="wb-btn wb-btn-dark h-10 w-10 shrink-0 !rounded-full" onClick={() => (sfx.tap(), useNav.getState().go('home'))} aria-label="Close">
          <X size={24} strokeWidth={3} />
        </button>
      )}
    </div>
  )
}

/** Jungle backdrop for the menu screens (the forest photo, softened). */
export function Backdrop({ dim = 0.35 }: { dim?: number }) {
  return (
    <div className="wb-layer">
      <div className="wb-layer" style={{ backgroundImage: 'url(/models/wildbound/tex/sky_2k.jpg)', backgroundSize: 'cover', backgroundPosition: '50% 45%', filter: 'blur(3px) saturate(1.25)', transform: 'scale(1.06)' }} />
      <div className="wb-layer" style={{ background: `linear-gradient(180deg, rgba(4,16,6,${dim}) 0%, rgba(4,16,6,${dim * 0.6}) 40%, rgba(2,10,4,${dim + 0.25}) 100%)` }} />
    </div>
  )
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`wb-layer wb-safe flex flex-col ${className}`}>{children}</div>
}

/** 5 segment bar used for stats. */
export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="wb-bar w-full">
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={i < value ? 'on' : ''} style={i < value ? { background: color } : undefined} />
      ))}
    </div>
  )
}

/** "2d : 12h : 30m" style countdown, refreshed every 30 s. */
export function useCountdown(to: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const ms = Math.max(0, to - now)
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${d}d : ${h}h : ${m}m`
}

/** This weekend's festival as stored (an old weekend's progress reads as not joined). */
export function useFestival() {
  const ev = useSave((s) => s.event)
  const f = festival()
  return { ...f, joined: ev.id === f.id && ev.joined, tokens: ev.id === f.id ? ev.tokens : 0, claimed: ev.id === f.id ? ev.claimed : [] }
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="wb-layer wb-dim z-[80] flex items-center justify-center p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="wb-in max-h-full w-full max-w-[460px] overflow-y-auto wb-scroll">{children}</div>
    </div>
  )
}
