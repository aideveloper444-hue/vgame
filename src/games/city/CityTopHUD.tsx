import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Gem, Plus, Settings, Users } from 'lucide-react'
import { usePlayerStore } from '@/social/stores/usePlayerStore'

function AlphaMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]">
      <defs>
        <linearGradient id="az-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#93c5fd" />
        </linearGradient>
      </defs>
      <path d="M20 3 L37 36 L28 36 L20 19 L12 36 L3 36 Z" fill="url(#az-a)" />
      <path d="M20 19 L24 27 L16 27 Z" fill="#38bdf8" />
    </svg>
  )
}

export default function CityTopHUD({
  activePlayers,
  totalPlayers,
  round,
  maxRounds,
  compact,
  onBack,
  menu = false,
}: {
  activePlayers: number
  totalPlayers: number
  round: number
  maxRounds: number
  compact: boolean
  /** Replaces the default "go back a page" (e.g. leave the match for the mode menu). */
  onBack?: () => void
  /** On the mode menu: no round counter or seat count yet. */
  menu?: boolean
}) {
  const navigate = useNavigate()
  const coins = usePlayerStore((s) => s.profile.coins)
  const gems = usePlayerStore((s) => s.profile.gems)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-2.5 pt-2.5 sm:px-4 sm:pt-3">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={() => (onBack ? onBack() : navigate(-1))}
          aria-label="Back"
          className="hud-glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 sm:h-11 sm:w-11"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <AlphaMark size={compact ? 26 : 36} />
          <div className="hidden leading-none min-[440px]:block">
            <p className="text-[17px] font-black tracking-[0.08em] text-white drop-shadow-[0_0_10px_rgba(96,165,250,0.55)] sm:text-[24px]">ALPHAZOX</p>
            {!compact && <p className="mt-1 text-[11px] font-semibold tracking-wide text-slate-300">Play • Connect • Win</p>}
          </div>
        </div>
      </div>

      {!compact && !menu && (
        <div className="hud-glass pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-sky-200">
          Round {round}
          <span className="text-slate-500">/{maxRounds}</span>
        </div>
      )}

      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="hud-glass flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1 sm:gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-600 text-[13px] shadow-[0_0_10px_rgba(251,191,36,0.6)] sm:h-7 sm:w-7">🪙</span>
          <span className="text-[13px] font-black text-white sm:text-[15px]">{(coins ?? 0).toLocaleString()}</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.7)] sm:h-6 sm:w-6">
            <Plus size={14} strokeWidth={3} />
          </span>
        </div>
        {!compact && (
          <div className="hud-glass flex items-center gap-2 rounded-full py-1 pl-1 pr-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-fuchsia-400 to-violet-700 shadow-[0_0_10px_rgba(192,38,211,0.6)]">
              <Gem size={15} className="text-white" />
            </span>
            <span className="text-[15px] font-black text-white">{(gems ?? 0).toLocaleString()}</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.7)]">
              <Plus size={14} strokeWidth={3} />
            </span>
          </div>
        )}
        <div className={`hud-glass flex items-center gap-1.5 rounded-full py-1 pl-2 pr-1 text-white sm:gap-2 sm:px-3 ${menu ? 'hidden' : ''}`}>
          <Users size={compact ? 14 : 17} />
          <span className="text-[12px] font-black sm:text-[15px]">
            {activePlayers || 4}/{totalPlayers || 4}
          </span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.7)] sm:h-6 sm:w-6">
            <Plus size={14} strokeWidth={3} />
          </span>
        </div>
        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          className="hud-glass flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform hover:rotate-45 active:scale-95 sm:h-11 sm:w-11"
        >
          <Settings size={19} />
        </button>
      </div>
    </div>
  )
}
