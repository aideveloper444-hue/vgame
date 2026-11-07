import { Crown } from 'lucide-react'
import type { CityPlayer } from './cityStore'
import { CATEGORY_TINT, type PropertyTile } from './cityBoardData'
import type { CashDelta } from './useCityFx'
import { money } from './cityFormat'
import { cityCharacterColor } from './cityCharacters'
import { useLudoPortraits } from '@/games/ludo/ludoPortraits'

/** The player's own 3D character, rendered head-and-shoulders; the emoji stands in until it is ready. */
function Avatar({ player, size, emojiSize }: { player: CityPlayer; size: number; emojiSize: number }) {
  const src = useLudoPortraits((s) => s.portraits[cityCharacterColor(player.color)])
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, fontSize: emojiSize, background: `radial-gradient(circle at 35% 30%, ${player.color}77, #0b1230 72%)` }}
    >
      {src ? <img src={src} alt="" className="h-full w-full scale-110 object-cover" draggable={false} /> : player.avatarEmoji}
    </div>
  )
}

function Deltas({ deltas }: { deltas: CashDelta[] }) {
  return (
    <div className="pointer-events-none absolute -top-1 right-2 flex flex-col items-end">
      {deltas.map((d) => (
        <span
          key={d.id}
          className={`absolute right-0 whitespace-nowrap text-[15px] font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] sm:text-[18px] ${d.amount > 0 ? 'text-emerald-300' : 'text-rose-400'}`}
          style={{ animation: `${d.amount > 0 ? 'city-float-up' : 'city-float-down'} 1.7s ease-out forwards` }}
        >
          {d.amount > 0 ? '+' : '-'}
          {money(Math.abs(d.amount))}
        </span>
      ))}
    </div>
  )
}

export default function CityPlayerHUD({
  player,
  rank,
  isActive,
  isLeading: _isLeading,
  status,
  owned,
  level,
  deltas,
  compact,
}: {
  player: CityPlayer
  rank: number
  isActive: boolean
  isLeading: boolean
  status: string | null
  owned: PropertyTile[]
  level: number | null
  deltas: CashDelta[]
  compact: boolean
}) {
  const c = player.color
  const ring = `conic-gradient(from 200deg, ${c}, #ffffff, ${c}, ${c}88, ${c})`
  const displayLevel = level !== null ? level : player.name === 'Rohan' ? 3 : player.name === 'Diya' ? 2 : rank

  // 5 status/property dots matching screenshot
  const dots = [
    owned[0] ? CATEGORY_TINT[owned[0].category] : c,
    owned[1] ? CATEGORY_TINT[owned[1].category] : c,
    owned[2] ? CATEGORY_TINT[owned[2].category] : `${c}66`,
    owned[3] ? CATEGORY_TINT[owned[3].category] : `${c}44`,
    owned[4] ? CATEGORY_TINT[owned[4].category] : `${c}22`,
  ]

  if (compact) {
    return (
      <div
        className={`hud-glass relative flex min-w-0 items-center gap-2 rounded-2xl px-2.5 py-1.5 transition-all ${isActive ? 'city-pulse' : ''}`}
        style={{ ['--glow' as string]: `${c}88`, borderColor: isActive ? c : `${c}44`, opacity: player.bankrupt ? 0.45 : 1 }}
      >
        <div className="relative shrink-0 rounded-full p-[2px]" style={{ background: ring }}>
          <Avatar player={player} size={36} emojiSize={20} />
          <span
            className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-black text-white ring-1 ring-black/50"
            style={{ background: c }}
          >
            {displayLevel}
          </span>
        </div>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1">
            <span className="text-[12px]">🇮🇳</span>
            <p className="truncate text-[12px] font-black text-white">{player.name}</p>
            <Crown size={11} className="text-amber-300" fill="currentColor" />
          </div>
          <p className="truncate text-[11px] font-bold text-slate-300">
            Cash: <span className="font-black text-amber-300">{player.bankrupt ? 'Bankrupt' : `₹ ${player.cash.toLocaleString()}`}</span>
          </p>
        </div>
        <Deltas deltas={deltas} />
      </div>
    )
  }

  return (
    <div
      className={`hud-glass relative w-[236px] rounded-[24px] p-2.5 transition-all ${isActive ? 'city-pulse' : ''}`}
      style={{
        ['--glow' as string]: `${c}99`,
        borderColor: isActive ? c : `${c}66`,
        boxShadow: `0 0 ${isActive ? 22 : 14}px ${c}55, inset 0 1px 0 rgba(255,255,255,0.2)`,
        opacity: player.bankrupt ? 0.45 : 1,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[24px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)' }} />
      <div className="relative flex items-center gap-3">
        {/* Avatar with glowing ring and level circle badge */}
        <div className="relative shrink-0 rounded-full p-[3px]" style={{ background: ring, boxShadow: `0 0 16px ${c}99` }}>
          <Avatar player={player} size={54} emojiSize={28} />
          <span
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-black text-white ring-2 ring-[#0b1230]"
            style={{ background: `linear-gradient(to bottom, ${c}, ${c}dd)`, boxShadow: `0 0 8px ${c}` }}
          >
            {displayLevel}
          </span>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">🇮🇳</span>
            <p className="truncate text-[16px] font-black leading-tight text-white">{player.name}</p>
            <Crown size={15} className="text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]" fill="currentColor" />
          </div>
          <p className="mt-0.5 text-[13px] font-bold text-slate-300">
            Cash: <span className="font-black text-white">₹ {player.bankrupt ? '0' : player.cash.toLocaleString()}</span>
          </p>

          {/* 5 Status Dots Row underneath cash */}
          <div className="mt-1.5 flex items-center gap-1.5">
            {dots.map((dotColor, i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full ring-1 ring-white/30"
                style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
              />
            ))}
          </div>
        </div>
      </div>

      {status && (
        <span
          className="absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-950 shadow-lg"
          style={{ background: isActive ? c : '#94a3b8' }}
        >
          {status}
        </span>
      )}
      <Deltas deltas={deltas} />
    </div>
  )
}
