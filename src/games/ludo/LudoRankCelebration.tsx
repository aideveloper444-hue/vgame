import { useMemo } from 'react'
import { COLOR_GLOW, COLOR_HEX } from './ludoBoardLayout'
import { ordinal, rankEmoji, type LudoPlayer } from './ludoStore'
import LudoAvatar from './LudoAvatar'
import LudoFireworks from './LudoFireworks'

const CONFETTI = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 23.7) % 100}%`,
  w: 5 + (i % 4) * 2,
  h: 8 + (i % 3) * 4,
  delay: `${((i * 0.137) % 1.6).toFixed(2)}s`,
  duration: `${2.4 + (i % 5) * 0.4}s`,
  drift: `${((i % 7) - 3) * 18}px`,
  round: i % 5 === 0,
}))

const RANK_TONE: Record<number, { from: string; via: string; to: string; ink: string }> = {
  1: { from: '#ffe58a', via: '#f5b52a', to: '#b86e08', ink: '#4a2a02' },
  2: { from: '#f4f7fb', via: '#c4ccd8', to: '#7d8797', ink: '#1f2533' },
  3: { from: '#ffcf9e', via: '#d98a4a', to: '#8a4a1c', ink: '#3a1a04' },
}

/**
 * Crackers over the table when a player brings their last token home: a medal ribbon with their place.
 * It does not block the board — the match carries on underneath once it fades.
 */
export default function LudoRankCelebration({ player, rank }: { player: LudoPlayer; rank: number }) {
  const tone = RANK_TONE[rank] ?? { from: '#c9b8ff', via: '#8b6cf0', to: '#4a2fa8', ink: '#ffffff' }
  const glow = COLOR_GLOW[player.color]
  const colors = useMemo(() => [glow, COLOR_HEX[player.color]], [glow, player.color])
  // first place gets the biggest show
  const rockets = rank === 1 ? 26 : rank === 2 ? 18 : 14

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {/* rotating light rays behind the medal, in the team colour */}
      <div
        className="ludo-rays absolute left-1/2 top-[30%] h-[150vmax] w-[150vmax] opacity-50"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${glow}55 0deg 7deg, transparent 7deg 22deg)`,
          maskImage: 'radial-gradient(circle, black 0%, transparent 38%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 38%)',
        }}
      />
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="ludo-confetti absolute -top-6"
          style={{
            left: c.left,
            width: c.w,
            height: c.round ? c.w : c.h,
            borderRadius: c.round ? '999px' : '2px',
            background: i % 3 === 0 ? '#ffd24a' : i % 3 === 1 ? glow : '#fff4c2',
            boxShadow: `0 0 6px ${glow}88`,
            animationDelay: c.delay,
            animationDuration: c.duration,
            ['--drift' as string]: c.drift,
          }}
        />
      ))}
      <LudoFireworks rockets={rockets} durationMs={4000} colors={colors} />
      <div className="absolute inset-x-0 top-[22%] flex justify-center px-4">
        <div className="ludo-winner-in flex flex-col items-center text-center">
          <span className="relative h-20 w-20">
            <span className="ludo-spin absolute -inset-[4px] rounded-full" style={{ background: `conic-gradient(${glow}, transparent 35%, ${glow} 55%, transparent 85%, ${glow})` }} />
            <span className="absolute inset-0 overflow-hidden rounded-full" style={{ boxShadow: `0 0 0 3px ${glow}, 0 0 30px ${glow}` }}>
              <LudoAvatar name={player.name} color={player.color} className="h-full w-full" />
            </span>
            <span className="absolute -bottom-2 -right-2 text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">{rankEmoji(rank)}</span>
          </span>
          <div
            className="mt-4 rounded-md px-6 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.7)]"
            style={{ background: `linear-gradient(180deg, ${tone.from}, ${tone.via}, ${tone.to})` }}
          >
            <p className="text-2xl font-black uppercase tracking-[0.16em]" style={{ color: tone.ink }}>
              {ordinal(rank)} Place
            </p>
          </div>
          <p className="mt-2 max-w-[18rem] truncate text-lg font-black text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">{player.name}</p>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]" style={{ color: glow }}>
            All warriors home!
          </p>
        </div>
      </div>
    </div>
  )
}
