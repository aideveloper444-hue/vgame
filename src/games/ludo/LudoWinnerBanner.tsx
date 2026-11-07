import { useMemo } from 'react'
import { Crown, RotateCcw } from 'lucide-react'
import { COLOR_GLOW, COLOR_HEX } from './ludoBoardLayout'
import type { LudoPlayer } from './ludoStore'
import LudoAvatar from './LudoAvatar'
const CONFETTI_COLORS = ['#ffd24a', '#ff4f73', '#3dffb5', '#5aa5ff', '#fff4c2', '#f59e0b']

function makeConfetti() {
  return Array.from({ length: 44 }, (_, i) => ({
    left: `${(i * 23.7) % 100}%`,
    w: 5 + (i % 4) * 2,
    h: 8 + (i % 3) * 4,
    delay: `${((i * 0.137) % 2.4).toFixed(2)}s`,
    duration: `${2.6 + (i % 5) * 0.45}s`,
    drift: `${((i % 7) - 3) * 18}px`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 5 === 0,
  }))
}

export default function LudoWinnerBanner({
  winner,
  onContinue,
  onRematch,
}: {
  winner: LudoPlayer
  onContinue: () => void
  onRematch: () => void
}) {
  const confetti = useMemo(() => makeConfetti(), [])
  const glow = COLOR_GLOW[winner.color]

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-[#05030d]/70 backdrop-blur-[3px]">
      {/* rotating light rays behind the emblem */}
      <div
        className="ludo-rays pointer-events-none absolute left-1/2 top-[40%] h-[150vmax] w-[150vmax] opacity-40"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(255,210,74,0.34) 0deg 7deg, transparent 7deg 22deg)',
          maskImage: 'radial-gradient(circle, black 0%, transparent 42%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 42%)',
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-[40%] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/25 blur-3xl" />

      <div className="pointer-events-none absolute inset-0">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="ludo-confetti absolute -top-6"
            style={{
              left: c.left,
              width: c.w,
              height: c.round ? c.w : c.h,
              borderRadius: c.round ? '999px' : '2px',
              background: c.color,
              boxShadow: `0 0 6px ${c.color}88`,
              animationDelay: c.delay,
              animationDuration: c.duration,
              ['--drift' as string]: c.drift,
            }}
          />
        ))}
      </div>

      <div className="ludo-winner-in relative flex w-full max-w-[22rem] flex-col items-center px-5 text-center">
        <img src="/assets/ludo/champion-crest.png" alt="" draggable={false} className="h-36 w-auto drop-shadow-[0_0_30px_rgba(251,191,36,0.55)] sm:h-40" />

        {/* WINNER ribbon */}
        <div className="relative -mt-7">
          <span className="absolute -left-5 top-2 h-9 w-8 bg-gradient-to-b from-amber-700 to-amber-900 [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,35%_50%)]" />
          <span className="absolute -right-5 top-2 h-9 w-8 bg-gradient-to-b from-amber-700 to-amber-900 [clip-path:polygon(0_0,100%_0,65%_50%,100%_100%,0_100%)]" />
          <div className="relative rounded-md bg-gradient-to-b from-[#ffe58a] via-[#f5b52a] to-[#b86e08] px-7 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.7)]">
            <p className="text-2xl font-black uppercase tracking-[0.18em] text-[#4a2a02] [text-shadow:0_1px_0_rgba(255,255,255,0.5)] sm:text-3xl">
              Winner
            </p>
          </div>
        </div>

        <div
          className="mt-5 flex w-full items-center gap-3 rounded-2xl p-2.5 pr-4 text-left"
          style={{
            background: 'linear-gradient(150deg, rgba(60,40,10,0.85), rgba(16,12,30,0.92))',
            border: '1px solid rgba(255,210,74,0.7)',
            boxShadow: '0 0 30px -4px rgba(255,190,60,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          <span className="relative h-14 w-14 shrink-0">
            <span className="ludo-spin absolute -inset-[3px] rounded-full" style={{ background: 'conic-gradient(#ffd24a, transparent 35%, #ffd24a 55%, transparent 85%, #ffd24a)' }} />
            <span className="absolute inset-0 overflow-hidden rounded-full ring-2 ring-amber-300">
              <LudoAvatar name={winner.name} color={winner.color} className="h-full w-full" />
            </span>
            <Crown size={18} className="absolute -top-3 left-1/2 -translate-x-1/2 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,1)]" fill="currentColor" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black text-white">{winner.name}</p>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-300">Warrior Champion</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-300">
              <span style={{ color: glow }}>â—</span> {winner.captures} capture{winner.captures === 1 ? '' : 's'} Â· 4/4 home
            </p>
          </div>
        </div>

        <div className="mt-5 flex w-full gap-2.5">
          <button
            type="button"
            onClick={onRematch}
            className="ludo-glass flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-transform active:scale-95"
          >
            <RotateCcw size={15} strokeWidth={2.8} /> Rematch
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex-[1.4] rounded-full bg-gradient-to-b from-[#ffe58a] via-[#f5b52a] to-[#c47a0a] py-3 text-sm font-black uppercase tracking-wide text-[#3d2200] shadow-[0_0_24px_rgba(251,191,36,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] transition-transform active:scale-95"
          >
            Collect Rewards
          </button>
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400" style={{ color: `${COLOR_HEX[winner.color]}` }}>
          {winner.isBot ? 'Better luck next match' : 'Victory is yours'}
        </p>
      </div>
    </div>
  )
}
