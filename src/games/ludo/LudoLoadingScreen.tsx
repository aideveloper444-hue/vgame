import { useEffect, useState } from 'react'
import { Crown } from 'lucide-react'
import { COLOR_GLOW, COLOR_HEX } from './ludoBoardLayout'
import { seatColors } from './ludoBoards'
import LudoAvatar from './LudoAvatar'
import type { Seat } from '@/games/shared/online/matchStore'

const TIPS = [
  'Roll a 6 to bring a character out of base.',
  'Land on a rival to send them back home.',
  'Star cells are safe — nobody can capture you there.',
  'A 6 gives you another roll.',
]

/**
 * Full-screen match intro shown while the 3D table, characters and portraits are prepared, so the
 * half-built scene is never visible. Fades out once `ready` turns true.
 */
export default function LudoLoadingScreen({ seats, ready }: { seats: Seat[]; ready: boolean }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length))
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2600)
    return () => clearInterval(id)
  }, [])
  const colors = seatColors(seats.length)

  return (
    <div
      className={`absolute inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-[#07040f]/80 px-6 backdrop-blur-md transition-opacity duration-500 ${
        ready ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-busy={!ready}
      aria-live="polite"
    >
      <div className="ludo-load-glow pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full" />

      <div className="relative flex items-center gap-2.5">
        <Crown size={34} className="text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" fill="currentColor" strokeWidth={1.6} />
        <p className="ludo-logo-text text-5xl font-black italic leading-none tracking-tight">Ludo</p>
      </div>
      <p className="relative mt-1.5 text-[10px] font-extrabold uppercase tracking-[0.34em] text-slate-300">Play · Chat · Win</p>

      <div className="relative mt-9 h-20 w-20">
        <div className="ludo-load-die absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-b from-white to-slate-200 shadow-[0_10px_30px_-6px_rgba(168,85,247,0.7),inset_0_-4px_0_rgba(0,0,0,0.12)]">
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 0, 1, 0, 1, 0, 1, 0, 1].map((on, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-[#1c1433]' : 'bg-transparent'}`} />
            ))}
          </div>
        </div>
        <div className="ludo-load-shadow absolute -bottom-4 left-1/2 h-2 w-14 -translate-x-1/2 rounded-[50%] bg-purple-500/40 blur-[3px]" />
      </div>

      <div className="relative mt-10 flex max-w-md flex-wrap items-center justify-center gap-x-3 gap-y-4">
        {seats.map((seat, i) => {
          const color = colors[i] ?? 'RED'
          return (
            <div key={seat.id} className="ludo-load-seat flex w-16 flex-col items-center" style={{ animationDelay: `${i * 90}ms` }}>
              <span
                className="block h-14 w-14 overflow-hidden rounded-full"
                style={{ boxShadow: `0 0 0 3px ${COLOR_GLOW[color]}, 0 0 18px ${COLOR_GLOW[color]}99` }}
              >
                <LudoAvatar name={seat.name} color={color} className="h-full w-full" />
              </span>
              <span className="mt-2 max-w-full truncate text-[11px] font-extrabold text-white">{seat.name}</span>
              <span className="mt-0.5 h-1 w-6 rounded-full" style={{ background: COLOR_HEX[color], boxShadow: `0 0 6px ${COLOR_GLOW[color]}` }} />
            </div>
          )
        })}
      </div>

      <div className="relative mt-10 w-56">
        <p className="text-center text-[11px] font-black uppercase tracking-[0.22em] text-amber-200">Setting up the table</p>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="ludo-load-bar h-full w-1/3 rounded-full bg-gradient-to-r from-fuchsia-500 via-amber-300 to-cyan-400" />
        </div>
      </div>
      <p key={tip} className="ludo-load-tip relative mt-5 max-w-xs text-center text-[12px] font-semibold text-slate-300">
        💡 {TIPS[tip]}
      </p>
    </div>
  )
}
