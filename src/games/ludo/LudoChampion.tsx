import { useMemo } from 'react'
import { COLOR_GLOW } from './ludoBoardLayout'
import type { LudoPlayer } from './ludoStore'
import LudoAvatar from './LudoAvatar'

/** The "WINNER" style gold ribbon. */
export function ChampionRibbon({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute -left-5 top-2 h-[70%] w-8 bg-gradient-to-b from-amber-700 to-amber-900 [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,35%_50%)]" />
      <span className="absolute -right-5 top-2 h-[70%] w-8 bg-gradient-to-b from-amber-700 to-amber-900 [clip-path:polygon(0_0,100%_0,65%_50%,100%_100%,0_100%)]" />
      <div className="relative rounded-md bg-gradient-to-b from-[#ffe58a] via-[#f5b52a] to-[#b86e08] px-7 py-1 shadow-[0_6px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.7)]">
        <p className="text-2xl font-black uppercase tracking-[0.12em] text-[#4a2a02] [text-shadow:0_1px_0_rgba(255,255,255,0.5)]">{text}</p>
      </div>
    </div>
  )
}

const FLAKES = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 37.3) % 100}%`,
  top: `${(i * 53.9) % 100}%`,
  rot: (i * 47) % 180,
  delay: `${((i * 0.29) % 2.2).toFixed(2)}s`,
  w: 5 + (i % 3) * 2,
}))

/**
 * The table's current leader shown the way the finished game crowns its winner: gold helmet shield,
 * ribbon and a glowing name plate, with gold flakes drifting around it.
 */
export default function LudoChampionCard({ player, label }: { player: LudoPlayer; label: string }) {
  const flakes = useMemo(() => FLAKES, [])
  return (
    <div className="pointer-events-none relative flex flex-col items-center">
      <div className="absolute -inset-x-10 -inset-y-6">
        {flakes.map((f, i) => (
          <span
            key={i}
            className="ludo-twinkle absolute rounded-[1px]"
            style={{
              left: f.left,
              top: f.top,
              width: f.w,
              height: f.w * 1.6,
              transform: `rotate(${f.rot}deg)`,
              background: 'linear-gradient(180deg, #fff3b0, #f5a70a)',
              boxShadow: '0 0 6px rgba(255,200,60,0.9)',
              animationDelay: f.delay,
            }}
          />
        ))}
      </div>
      <div className="absolute left-1/2 top-[28%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/25 blur-3xl" />
      <img src="/assets/ludo/champion-crest.png" alt="" draggable={false} className="relative h-[7.6rem] w-auto drop-shadow-[0_0_24px_rgba(251,191,36,0.55)]" />
      <ChampionRibbon text={label} className="-mt-5" />
      <div
        className="mt-2 flex items-center gap-3 rounded-2xl py-2 pl-2 pr-6"
        style={{
          background: 'linear-gradient(150deg, rgba(60,40,10,0.85), rgba(16,12,30,0.92))',
          border: '1.5px solid rgba(255,210,74,0.8)',
          boxShadow: '0 0 30px -4px rgba(255,190,60,0.6), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full" style={{ boxShadow: `0 0 0 2.5px #ffd24a, 0 0 14px ${COLOR_GLOW[player.color]}` }}>
          <LudoAvatar name={player.name} color={player.color} className="h-full w-full" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold text-white">{player.name}</p>
          <p className="text-[15px] font-bold text-amber-300">Warrior Champion</p>
        </div>
      </div>
    </div>
  )
}
