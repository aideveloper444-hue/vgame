import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, MoreHorizontal, Plus, RotateCcw, Settings } from 'lucide-react'
import { usePlayerStore } from '@/social/stores/usePlayerStore'

/** Eases a displayed number toward `value` whenever it changes (and counts up on first mount). */
function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(from + (value - from) * eased)
      setShown(v)
      fromRef.current = v
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

function CoinIcon() {
  return (
    <span className="relative flex h-[1.15rem] w-[1.15rem] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 text-[9px] font-black @min-[56rem]:h-8! @min-[56rem]:w-8! @min-[56rem]:text-base! text-amber-900 shadow-[0_0_8px_rgba(251,191,36,0.7),inset_0_-2px_0_rgba(146,64,14,0.5)] ring-1 ring-amber-200/70">
      $
    </span>
  )
}

function GemIcon() {
  return (
    <svg viewBox="0 0 20 18" className="h-[1.05rem] w-[1.15rem] shrink-0 drop-shadow-[0_0_6px_rgba(217,70,239,0.8)]" aria-hidden>
      <defs>
        <linearGradient id="ludo-gem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5b5ff" />
          <stop offset="55%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#6b21a8" />
        </linearGradient>
      </defs>
      <path d="M5 1 L15 1 L19 6 L10 17 L1 6 Z" fill="url(#ludo-gem)" />
      <path d="M1 6 L19 6 M5 1 L7.5 6 L10 17 L12.5 6 L15 1" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.8" fill="none" />
    </svg>
  )
}

function Currency({ icon, value, tone, onAdd, label }: { icon: ReactNode; value: number; tone: string; onAdd: () => void; label: string }) {
  const shown = useCountUp(value)
  return (
    <div className="flex h-8 items-center gap-1 rounded-full py-0.5 pl-1.5 pr-0.5 max-[380px]:gap-0.5 max-[380px]:pl-1 sm:h-9 sm:gap-1.5 sm:pl-2 @min-[56rem]:h-12! @min-[56rem]:gap-2.5! @min-[56rem]:[&>svg]:h-7! @min-[56rem]:[&>svg]:w-8!">
      {icon}
      <span className={`min-w-[1.4rem] text-[12px] max-[380px]:text-[11px] font-extrabold tabular-nums sm:text-sm @min-[56rem]:text-[1.35rem]! ${tone}`}>{shown.toLocaleString()}</span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={label}
        className="flex h-[1.35rem] w-[1.35rem] items-center justify-center rounded-full bg-gradient-to-b from-emerald-300 to-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.6)] transition-transform active:scale-90 sm:h-6 sm:w-6 @min-[56rem]:h-10! @min-[56rem]:w-10!"
      >
        <Plus size={13} strokeWidth={3.5} className="@min-[56rem]:h-6! @min-[56rem]:w-6!" />
      </button>
    </div>
  )
}

export default function LudoTopBar({ onBack, onRestart, onLeave }: { onBack?: () => void; onRestart?: () => void; onLeave?: () => void }) {
  const navigate = useNavigate()
  const coins = usePlayerStore((s) => s.profile.coins)
  const gems = usePlayerStore((s) => s.profile.gems)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="pointer-events-auto relative z-30 flex items-center justify-between gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5 max-[380px]:gap-1 sm:gap-2.5">
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate(-1))}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-90 max-[380px]:h-8 max-[380px]:w-8 sm:h-10 sm:w-10 @min-[56rem]:h-14! @min-[56rem]:w-12! [filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.8))]"
        >
          <ArrowLeft size={18} strokeWidth={2.6} className="@min-[56rem]:h-9! @min-[56rem]:w-9!" />
        </button>
        <div className="ludo-glass ludo-logo-plate flex min-w-0 shrink-0 items-center gap-1.5 rounded-2xl py-1 pl-2 pr-2.5 max-[380px]:gap-1 max-[380px]:pl-1.5 max-[380px]:pr-2 sm:gap-2 sm:py-1.5 sm:pl-2.5 sm:pr-3.5 @min-[56rem]:gap-3! @min-[56rem]:rounded-[1.4rem]! @min-[56rem]:py-2! @min-[56rem]:pl-4! @min-[56rem]:pr-7!">
          {/* the mark: a neon-cut diamond, the same crystal that hovers over the board's finish */}
          <svg viewBox="0 0 32 32" aria-hidden className="ludo-logo-mark h-7 w-7 shrink-0 @min-[56rem]:h-12! @min-[56rem]:w-12!">
            <defs>
              <linearGradient id="ludo-mark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#00e5ff" />
                <stop offset="0.5" stopColor="#ff2d95" />
                <stop offset="1" stopColor="#ffe600" />
              </linearGradient>
            </defs>
            <path d="M16 2 L29 16 L16 30 L3 16 Z" fill="none" stroke="url(#ludo-mark)" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M16 9 L23 16 L16 23 L9 16 Z" fill="url(#ludo-mark)" opacity="0.9" />
          </svg>
          <div className="min-w-0 leading-none">
            <p className="ludo-logo-text text-[1.2rem] font-extrabold uppercase leading-[1.05] tracking-[0.18em] max-[380px]:text-[1.05rem] sm:text-[1.45rem] @min-[56rem]:text-[2.6rem]!">Ludo</p>
            <p className="mt-0.5 whitespace-nowrap text-[7px] max-[380px]:text-[6px] font-bold uppercase tracking-[0.08em] text-slate-300/90 min-[400px]:tracking-[0.16em] sm:text-[9px] sm:tracking-[0.22em] @min-[56rem]:mt-1! @min-[56rem]:text-[1.05rem]! @min-[56rem]:font-semibold! @min-[56rem]:normal-case! @min-[56rem]:tracking-wide! @min-[56rem]:text-white!">
              Neon Edition
            </p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 max-[380px]:gap-0.5 sm:gap-1.5">
        {/* coins and gems share one neon pill */}
        <div className="ludo-glass ludo-currency-pill flex items-center gap-1 rounded-full max-[380px]:gap-0 sm:gap-2 @min-[56rem]:gap-4! @min-[56rem]:px-1.5! @min-[56rem]:py-1!">
          <Currency icon={<CoinIcon />} value={coins} tone="text-amber-100" onAdd={() => navigate('/rewards')} label="Get more coins" />
          <Currency icon={<GemIcon />} value={gems} tone="text-fuchsia-100" onAdd={() => navigate('/premium')} label="Get more gems" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More options"
            aria-expanded={menuOpen}
            className="ludo-glass flex h-8 w-8 items-center justify-center rounded-full text-white transition-transform active:scale-90 sm:h-9 sm:w-9 @min-[56rem]:h-14! @min-[56rem]:w-14!"
          >
            <MoreHorizontal size={18} strokeWidth={2.6} className="@min-[56rem]:h-7! @min-[56rem]:w-7!" />
          </button>
          {menuOpen && (
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
              <div className="ludo-glass-strong ludo-pop absolute right-0 top-full z-50 mt-2 w-44 origin-top-right overflow-hidden rounded-2xl p-1.5">
                {[
                  { icon: Settings, label: 'Settings', run: () => navigate('/settings') },
                  ...(onRestart ? [{ icon: RotateCcw, label: 'Restart match', run: onRestart }] : []),
                  { icon: LogOut, label: onLeave ? 'Leave match' : 'Exit Ludo', run: onLeave ?? (() => navigate('/games/ludo')) },
                ].map(({ icon: Icon, label, run }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      run()
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-slate-100 transition-colors hover:bg-white/10 active:bg-white/15"
                  >
                    <Icon size={16} className="text-slate-300" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
