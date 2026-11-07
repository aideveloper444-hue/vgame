import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, LayoutGrid, Users, Shield } from 'lucide-react'
import type { GameDefinition } from '@/games/registry'
import { completeGameSession } from '@/lib/gameSession'
import { usePartyStore } from '@/social/stores/usePartyStore'
import Confetti from './Confetti'

export interface ResultStat {
  label: string
  value: string | number
}

interface GameResultScreenProps {
  game: GameDefinition
  won: boolean
  title: string
  subtitle?: string
  coins: number
  xp: number
  stats: ResultStat[]
  onRematch: () => void
  extraActions?: ReactNode
}

export default function GameResultScreen({
  game,
  won,
  title,
  subtitle,
  coins,
  xp,
  stats,
  onRematch,
  extraActions,
}: GameResultScreenProps) {
  const navigate = useNavigate()
  const selectGame = usePartyStore((s) => s.selectGame)
  const awarded = useRef(false)

  useEffect(() => {
    if (awarded.current) return
    awarded.current = true
    completeGameSession({ gameId: game.id, won, coins, xp })
  }, [game.id, won, coins, xp])

  return (
    <div className="relative mx-auto flex max-w-xl flex-col items-center overflow-hidden px-4 py-12 text-center">
      {won && <Confetti />}
      {won ? (
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 shadow-[0_0_40px_10px_rgba(251,191,36,0.35)]">
          <Shield size={44} className="text-white drop-shadow" fill="currentColor" fillOpacity={0.15} />
          <span className="absolute text-2xl">🏆</span>
        </div>
      ) : (
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-4xl"
          style={{ backgroundColor: `${game.accentHex}33` }}
        >
          🎮
        </div>
      )}
      <h1
        className={
          won
            ? 'mt-5 bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-3xl font-black uppercase tracking-wide text-transparent drop-shadow-sm'
            : 'mt-4 text-2xl font-black'
        }
      >
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}

      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-surface-2 px-5 py-3 text-sm font-bold">
        <span className="text-coin">+{coins} Coins</span>
        <span className="text-brand-2">+{xp} XP</span>
      </div>

      <div className="mt-6 grid w-full grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-surface-1 px-4 py-3 text-left">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-0.5 text-base font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex w-full flex-col gap-2.5 sm:flex-row">
        <button
          onClick={onRematch}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: game.accentHex }}
        >
          <RotateCcw size={16} /> Rematch
        </button>
        <button
          onClick={() => {
            selectGame(null)
            navigate('/games')
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 py-3 text-sm font-bold hover:bg-surface-3"
        >
          <LayoutGrid size={16} /> Choose Another Game
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 py-3 text-sm font-bold hover:bg-surface-3"
        >
          <Users size={16} /> Return to Party
        </button>
      </div>

      {extraActions && <div className="mt-3 w-full">{extraActions}</div>}
    </div>
  )
}
