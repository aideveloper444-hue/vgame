import type { ReactNode } from 'react'
import { Crown } from 'lucide-react'
import { COLOR_DEEP, COLOR_GLOW, COLOR_HEX, type LudoColor } from './ludoBoardLayout'
import { getBoard } from './ludoBoards'
import { useLudoStore, type LudoPlayer, type LudoPhase, type LudoToken } from './ludoStore'
import LudoAvatar from './LudoAvatar'
import { useLudoPortraits } from './ludoPortraits'

function PawnIcon({ token, color, finish }: { token: LudoToken; color: LudoColor; finish: number }) {
  const home = token.distance >= finish
  const inBase = token.distance === -1
  const fill = home ? '#ffd24a' : COLOR_HEX[color]
  return (
    <svg
      viewBox="0 0 12 14"
      className="h-[13px] w-[11px] shrink-0 transition-opacity"
      style={{
        opacity: inBase ? 0.32 : 1,
        filter: inBase ? undefined : `drop-shadow(0 0 3px ${home ? '#ffd24a' : COLOR_GLOW[color]})`,
      }}
      aria-hidden
    >
      <circle cx="6" cy="3.4" r="2.6" fill={fill} />
      <path d="M1.6 13 C1.6 8.4 3.4 6.8 6 6.8 C8.6 6.8 10.4 8.4 10.4 13 Z" fill={fill} />
      {home && <path d="M4.3 9.9 L5.6 11.1 L7.8 8.8" stroke="#3b2600" strokeWidth="1.1" fill="none" strokeLinecap="round" />}
    </svg>
  )
}

/** One token as a tiny hero figure in the team colour: dim while in base, gold once home. */
function HeroFigure({ token, color, finish }: { token: LudoToken; color: LudoColor; finish: number }) {
  const home = token.distance >= finish
  const inBase = token.distance === -1
  const fill = home ? '#ffd24a' : COLOR_HEX[color]
  const glow = home ? '#ffd24a' : COLOR_GLOW[color]
  const id = `hf-${color}-${token.tokenIndex}`
  return (
    <svg
      viewBox="0 0 20 28"
      className="h-[24px] w-[17px] shrink-0 @min-[56rem]:h-[40px] @min-[56rem]:w-[28px]"
      style={{ filter: `drop-shadow(0 0 3px ${glow})`, opacity: inBase ? 0.85 : 1 }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor={fill} />
          <stop offset="1" stopColor={COLOR_DEEP[color]} />
        </linearGradient>
      </defs>
      {/* hood and head */}
      <path d="M10 1.5 C6.2 1.5 4.6 4.6 4.8 8 C5 10.6 6.8 12.2 10 12.2 C13.2 12.2 15 10.6 15.2 8 C15.4 4.6 13.8 1.5 10 1.5 Z" fill={`url(#${id})`} />
      <ellipse cx="10" cy="8.4" rx="3" ry="2.6" fill="#1a1020" opacity="0.75" />
      {/* cloak */}
      <path d="M4.2 27 C3.4 19 4.6 13.4 10 13.2 C15.4 13.4 16.6 19 15.8 27 Z" fill={`url(#${id})`} />
      <path d="M10 14 L10 26.5" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.8" />
      {home && <path d="M6.8 19.6 L9.1 21.8 L13.4 17.2" stroke="#3b2600" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
    </svg>
  )
}

/** One token as a tiny bust of the team's character: dim while in base, gold-ringed once home. */
export function MiniToken({ token, color, finish }: { token: LudoToken; color: LudoColor; finish: number }) {
  const portrait = useLudoPortraits((s) => s.portraits[color])
  if (!portrait) return <PawnIcon token={token} color={color} finish={finish} />
  const home = token.distance >= finish
  const inBase = token.distance === -1
  const ring = home ? '#ffd24a' : COLOR_GLOW[color]
  return (
    <span
      className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full @min-[56rem]:h-[34px] @min-[56rem]:w-[34px]"
      style={{
        boxShadow: `0 0 0 1.5px ${ring}${inBase ? '66' : ''}, 0 0 ${inBase ? 0 : 7}px ${ring}`,
        background: `radial-gradient(circle at 50% 35%, ${COLOR_HEX[color]}, #0b0a1c 80%)`,
        opacity: inBase ? 0.78 : 1,
        filter: inBase ? 'grayscale(0.25) brightness(0.85)' : undefined,
      }}
      title={home ? 'Home' : inBase ? 'In base' : 'On the board'}
    >
      <img src={portrait} alt="" className="h-full w-full scale-125 object-cover" draggable={false} />
    </span>
  )
}

/** Emoji flags don't render on Windows, so the tricolour is drawn. */
function IndiaFlag({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 12" className={`shrink-0 rounded-[2px] ring-1 ring-black/30 ${className}`} aria-label="India">
      <rect width="18" height="4" fill="#ff9933" />
      <rect y="4" width="18" height="4" fill="#ffffff" />
      <rect y="8" width="18" height="4" fill="#138808" />
      <circle cx="9" cy="6" r="1.5" fill="none" stroke="#000080" strokeWidth="0.5" />
    </svg>
  )
}

const SPARKS = [
  { left: '10%', bottom: '20%', delay: '0s', dx: '-6px' },
  { left: '80%', bottom: '30%', delay: '0.6s', dx: '5px' },
  { left: '45%', bottom: '0%', delay: '1.2s', dx: '2px' },
]


export default function LudoPlayerCard({
  player,
  isActive,
  isLeading,
  speech,
  bubble = 'below',
  side = 'left',
  controlledHere = !player.isBot,
  compact = false,
  dice,
  ribbon,
}: {
  player: LudoPlayer
  isActive: boolean
  isLeading: boolean
  phase: LudoPhase
  speech?: string | null
  bubble?: 'below' | 'above'
  side?: 'left' | 'right'
  /** Whether this player's turns are played on this device. */
  controlledHere?: boolean
  /** Small card for 5–8 player tables. */
  compact?: boolean
  /** The die, shown at the end of the active player's card. */
  dice?: ReactNode
  /** Banner under the card, e.g. YOUR TURN. */
  ribbon?: string | null
}) {
  const finish = getBoard(useLudoStore((s) => s.arms)).finish
  const accent = COLOR_HEX[player.color]
  const glow = COLOR_GLOW[player.color]
  const finished = player.finishedCount >= 4
  const tag = player.isBot ? 'Bot' : controlledHere ? null : 'Online'

  const bubbleEl = speech ? (
    <div
      className={`ludo-bubble absolute z-30 max-w-[11rem] whitespace-nowrap rounded-2xl px-3 py-1.5 text-[11.5px] font-bold text-white shadow-xl ${
        // top-row cards keep their bubble inside the card, so it never covers the board below
        bubble === 'below' ? 'right-2 top-[calc(50%-15px)] origin-right' : `bottom-full mb-2 origin-bottom ${side === 'left' ? 'left-3' : 'right-3'}`
      }`}
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0) 50%), rgba(18,22,52,0.72)',
        border: '1px solid rgba(170,210,255,0.45)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 0 18px -2px rgba(120,180,255,0.55), inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 20px -10px rgba(0,0,0,0.8)',
      }}
    >
      {bubble === 'above' && (
        <span
          className={`absolute ${side === 'left' ? 'left-4' : 'right-4'} -bottom-[5px] h-2.5 w-2.5 rotate-45 border-b border-r`}
          style={{ background: 'rgb(24,30,66)', borderColor: 'rgba(170,210,255,0.45)' }}
        />
      )}
      {speech}
    </div>
  ) : null

  if (compact) {
    return (
      <div
        className="pointer-events-auto relative isolate flex min-w-0 items-center gap-1.5 rounded-2xl py-1 pl-1 pr-1.5 transition-[border-color,background,opacity] duration-300"
        style={{
          opacity: isActive || player.finishedCount >= 4 ? 1 : 0.94,
          background: isActive
            ? `linear-gradient(115deg, rgba(255,255,255,0.18), rgba(255,255,255,0.025) 24%, transparent 44%), linear-gradient(120deg, ${accent}2b, rgba(3,7,18,0.9) 72%)`
            : `linear-gradient(115deg, rgba(255,255,255,0.13), rgba(255,255,255,0.015) 24%, transparent 44%), linear-gradient(120deg, ${accent}16, rgba(3,7,18,0.9) 72%)`,
          border: `1px solid ${isActive ? `${glow}dd` : `${glow}66`}`,
          boxShadow: isActive
            ? `0 0 22px -4px ${glow}, inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -10px 24px rgba(0,0,0,0.34)`
            : `0 0 12px -5px ${glow}88, inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -10px 24px rgba(0,0,0,0.42)`,
          backdropFilter: 'blur(20px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.35)',
        }}
      >
        <span aria-hidden className={`ludo-team-halo ${isActive ? 'ludo-team-halo-active' : 'ludo-team-halo-idle'} absolute -inset-[5px] rounded-[22px]`} style={{ ['--turn-glow' as string]: glow }} />
        <div className="relative h-9 w-9 shrink-0">
          {isActive && (
            <span
              className="ludo-spin absolute -inset-[2px] rounded-full"
              style={{ background: `conic-gradient(from 0deg, ${glow}, transparent 30%, ${glow} 50%, transparent 80%, ${glow})` }}
            />
          )}
          <span className="absolute inset-0 overflow-hidden rounded-full" style={{ boxShadow: isActive ? `0 0 0 2px ${glow}, 0 0 12px ${glow}` : `0 0 0 1.5px ${accent}aa` }}>
            <LudoAvatar name={player.name} color={player.color} className="h-full w-full" />
          </span>
          {isLeading && (
            <span className="absolute -left-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 to-amber-500 text-amber-950 ring-1 ring-black/40">
              <Crown size={8} fill="currentColor" strokeWidth={2.5} />
            </span>
          )}
          {tag && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#0b0a1c] px-0.5 py-px text-[5.5px] font-black uppercase leading-none tracking-wider text-slate-200 ring-1 ring-white/25">
              {tag}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-[11px] font-extrabold leading-tight text-white">
            <IndiaFlag className="h-[8px] w-[12px]" />
            <span className="truncate">{player.name}</span>
          </p>
          <div className="mt-1 flex items-center gap-[3px]">
            {player.tokens.map((token) => (
              <MiniToken key={token.id} token={token} color={player.color} finish={finish} />
            ))}
            <span className="ml-1 truncate text-[7px] font-black uppercase tracking-[0.12em] text-white/55">
              {isActive ? (controlledHere ? 'Your turn' : 'Thinking') : finished ? 'Finished' : 'Playing'}
            </span>
          </div>
        </div>
        {bubbleEl}
      </div>
    )
  }

  return (
    <div className={`pointer-events-auto relative isolate flex min-w-0 items-center ${side === 'right' ? 'flex-row-reverse' : ''}`}>
      <span aria-hidden className={`ludo-team-halo ${isActive ? 'ludo-team-halo-active' : 'ludo-team-halo-idle'} absolute -inset-[6px] rounded-[28px]`} style={{ ['--turn-glow' as string]: glow }} />
      {/* big round portrait that breaks out of the plate, with a glowing ring in the team colour */}
      <div className="relative z-10 h-14 w-14 shrink-0 max-[380px]:h-12 max-[380px]:w-12 @min-[56rem]:h-[7.4rem] @min-[56rem]:w-[7.4rem]">
        {isActive && (
          <>
            <span className="ludo-avatar-pulse absolute inset-0 rounded-full" style={{ ['--glow' as string]: `${glow}aa` }} />
            {SPARKS.map((sp, i) => (
              <span
                key={i}
                className="ludo-spark"
                style={{ left: sp.left, bottom: sp.bottom, background: glow, boxShadow: `0 0 6px ${glow}`, animationDelay: sp.delay, ['--dx' as string]: sp.dx }}
              />
            ))}
            <span
              className="ludo-spin absolute -inset-[4px] rounded-full"
              style={{ background: `conic-gradient(from 0deg, ${glow}, transparent 30%, ${glow} 50%, transparent 80%, ${glow})` }}
            />
          </>
        )}
        <span
          className="absolute inset-0 overflow-hidden rounded-full"
          style={{
            boxShadow: isActive
              ? `0 0 0 3px ${glow}, 0 0 24px 4px ${glow}cc`
              : `0 0 0 3px ${glow}, 0 0 16px ${glow}99, 0 6px 14px rgba(0,0,0,0.6)`,
          }}
        >
          <LudoAvatar name={player.name} color={player.color} className="h-full w-full" />
        </span>
        {/* every seat wears the lounge crown; the leader's shines */}
        <span
          className={`absolute -bottom-2 left-1/2 flex h-[22px] w-[26px] -translate-x-1/2 items-center justify-center rounded-[7px] bg-gradient-to-b from-[#fff3b0] via-[#f5c542] to-[#b8860b] text-[#3b2600] ring-[1.5px] ring-[#2a1a00] @min-[56rem]:h-9 @min-[56rem]:w-11 ${isLeading ? 'shadow-[0_0_12px_rgba(251,191,36,1)]' : 'shadow-[0_0_6px_rgba(251,191,36,0.6)]'}`}
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%)' }}
        >
          <Crown size={13} fill="currentColor" strokeWidth={2.4} className="-mt-1 @min-[56rem]:scale-150" />
        </span>
      </div>

      {/* glass plate with a thin neon edge in the team colour */}
      <div
        className={`relative min-w-0 flex-1 overflow-hidden rounded-2xl py-1.5 ${side === 'right' ? '-mr-5 pl-2 pr-6 text-right' : '-ml-5 pl-6 pr-2'} transition-[border-color,background,box-shadow] duration-300 @min-[56rem]:py-3.5 ${side === 'right' ? '@min-[56rem]:-mr-9 @min-[56rem]:pr-12 @min-[56rem]:pl-4' : '@min-[56rem]:-ml-9 @min-[56rem]:pl-12 @min-[56rem]:pr-4'}`}
        style={{
          background: isActive
            ? `linear-gradient(120deg, rgba(255,255,255,0.2), rgba(255,255,255,0.025) 18%, transparent 42%), linear-gradient(100deg, ${accent}2c, rgba(3,7,18,0.9) 68%)`
            : `linear-gradient(120deg, rgba(255,255,255,0.14), rgba(255,255,255,0.015) 18%, transparent 42%), linear-gradient(100deg, ${accent}18, rgba(3,7,18,0.92) 68%)`,
          border: `1.5px solid ${isActive ? `${glow}ee` : `${glow}99`}`,
          boxShadow: isActive
            ? `0 0 28px -2px ${glow}, 0 0 54px -18px ${glow}, inset 0 1px 0 rgba(255,255,255,0.38), inset 0 -18px 28px rgba(0,0,0,0.38), inset 0 0 18px -8px ${glow}`
            : `0 0 17px -5px ${glow}bb, inset 0 1px 0 rgba(255,255,255,0.27), inset 0 -18px 28px rgba(0,0,0,0.44), inset 0 0 12px -9px ${glow}`,
          backdropFilter: 'blur(22px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
        }}
      >
        <p className={`flex items-center gap-1.5 truncate text-[13.5px] font-extrabold leading-tight tracking-wide text-white @min-[56rem]:text-[23px] ${side === 'right' ? 'justify-end' : ''}`}>
          <IndiaFlag className="h-[10px] w-[15px] @min-[56rem]:h-[16px] @min-[56rem]:w-[24px]" />
          <span className="truncate">{player.name}</span>
        </p>
        <div className={`mt-1 flex items-center gap-[3px] @min-[56rem]:mt-1.5 @min-[56rem]:gap-1.5 ${side === 'right' ? 'justify-end' : ''}`}>
          {player.tokens.map((t) => (
            <HeroFigure key={t.id} token={t} color={player.color} finish={finish} />
          ))}
          {finished && <span className="ml-1 text-[10px] font-black uppercase text-amber-300">Done</span>}
        </div>
      </div>

      {dice && <div className="relative z-20 -ml-3 shrink-0">{dice}</div>}

      {ribbon && (
        <span
          className="ludo-ribbon absolute -bottom-[18px] left-[2.6rem] z-20 whitespace-nowrap rounded-b-xl rounded-t-md px-4 py-[3px] text-[13px] font-black uppercase tracking-wide text-white @min-[56rem]:left-[5rem] @min-[56rem]:text-[20px]"
          style={{
            background: `linear-gradient(180deg, ${glow}, ${COLOR_DEEP[player.color]})`,
            boxShadow: `0 0 14px ${glow}, inset 0 1px 0 rgba(255,255,255,0.5)`,
            border: '1.5px solid rgba(255,255,255,0.55)',
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          {ribbon}
        </span>
      )}

      {bubbleEl}
    </div>
  )
}

export function leadingColor(players: LudoPlayer[]): LudoColor | null {
  let best: LudoPlayer | null = null
  let bestScore = 0
  for (const p of players) {
    const score = p.finishedCount * 1000 + p.tokens.reduce((sum, t) => sum + Math.max(0, t.distance), 0)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best ? best.color : null
}
