import { Crown } from 'lucide-react'
import type { CityPlayer } from './cityStore'

export default function CityRankPanel({ ranked }: { ranked: { player: CityPlayer; netWorth: number }[] }) {
  return (
    <div
      className="hud-glass w-[184px] rounded-[20px] p-2.5"
      style={{ border: '1.5px solid rgba(56,189,248,0.4)', boxShadow: '0 0 16px rgba(56,189,248,0.2)' }}
    >
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Crown size={15} className="text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]" fill="currentColor" />
        <span className="text-[12px] font-black uppercase tracking-[0.16em] text-white">Rank</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {ranked.map(({ player }, i) => (
          <li
            key={player.id}
            className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2 py-1 transition-all"
            style={{ opacity: player.bankrupt ? 0.45 : 1 }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
              style={{ background: player.color, boxShadow: `0 0 8px ${player.color}` }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-white">{player.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: player.color, boxShadow: `0 0 4px ${player.color}` }} />
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: player.color, opacity: 0.8 }} />
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: player.color, opacity: 0.5 }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
