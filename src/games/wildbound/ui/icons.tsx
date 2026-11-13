import { useId, type ReactNode } from 'react'
import {
  ChevronsRight,
  ChevronsUp,
  Coins,
  EyeOff,
  Flame,
  Footprints,
  Gem as GemLine,
  Hammer,
  Heart,
  Magnet,
  Mountain,
  MoveUp,
  Rocket,
  RotateCw,
  Shield,
  Shuffle,
  Snowflake,
  Sparkles,
  Star,
  Trophy,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { AbilityKind, PowerUpKind } from '../engine/content'

/*
 * Wildbound's icon system: thin line icons (legible at speed, calm in menus) and two engraved currency marks, all
 * drawn as vectors in the champagne-gold palette. They replace the painted, glowing badges of the first version.
 */

const POWER: Record<PowerUpKind, LucideIcon> = { speed: Zap, magnet: Magnet, shield: Shield, superjump: ChevronsUp, megajump: Rocket, boost: Flame }
const ABILITY: Record<AbilityKind, LucideIcon> = { boost: Zap, roar: Waves, leap: MoveUp, stealth: EyeOff, dodge: Shuffle, frost: Snowflake, smash: Hammer, charge: ChevronsRight, roll: RotateCw, cliff: Mountain }
const TRAIT: Record<string, LucideIcon> = { magnet: Magnet, loyal: Heart, shield: Shield, speed: Zap, gems: GemLine, coins: Coins }
const MISSION: Record<'trophy' | 'run' | 'bolt' | 'star', LucideIcon> = { trophy: Trophy, run: Footprints, bolt: Zap, star: Star }

export function PowerIcon({ kind, size = 22 }: { kind: PowerUpKind; size?: number }) {
  const I = POWER[kind]
  return <I size={size} strokeWidth={1.6} />
}
export function AbilityIcon({ kind, size = 28 }: { kind: AbilityKind; size?: number }) {
  const I = ABILITY[kind]
  return <I size={size} strokeWidth={1.5} />
}

/** An icon in a hairline gold ring (store items, traits, missions, ability badges). */
export function Ring({ size = 44, children, tone = 'gold' }: { size?: number; children: ReactNode; tone?: 'gold' | 'quiet' }) {
  return (
    <span className={`wb-ring ${tone === 'quiet' ? 'is-quiet' : ''}`} style={{ width: size, height: size }}>
      {children}
    </span>
  )
}
export function PowerBadge({ kind, size = 44 }: { kind: PowerUpKind; size?: number }) {
  return (
    <Ring size={size}>
      <PowerIcon kind={kind} size={Math.round(size * 0.48)} />
    </Ring>
  )
}
export function AbilityBadge({ kind, size = 44 }: { kind: AbilityKind; size?: number }) {
  return (
    <Ring size={size}>
      <AbilityIcon kind={kind} size={Math.round(size * 0.5)} />
    </Ring>
  )
}
export function TraitBadge({ icon, size = 30 }: { icon: string; size?: number }) {
  const I = TRAIT[icon] ?? Star
  return (
    <Ring size={size} tone="quiet">
      <I size={Math.round(size * 0.52)} strokeWidth={1.6} />
    </Ring>
  )
}
export function MissionBadge({ icon, size = 44 }: { icon: 'trophy' | 'run' | 'bolt' | 'star'; size?: number }) {
  const I = MISSION[icon]
  return (
    <Ring size={size}>
      <I size={Math.round(size * 0.48)} strokeWidth={1.5} />
    </Ring>
  )
}

/** The coin: minted gold, a raised rim and an engraved paw. */
export function CoinMark({ size = 22 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="inline-block shrink-0 align-middle">
      <defs>
        <radialGradient id={`c${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#fbefcf" />
          <stop offset="0.45" stopColor="#dcb974" />
          <stop offset="1" stopColor="#8a6631" />
        </radialGradient>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e6bd" />
          <stop offset="1" stopColor="#7d5a2a" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#r${id})`} />
      <circle cx="16" cy="16" r="12.6" fill={`url(#c${id})`} />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="#7d5a2a" strokeOpacity="0.45" strokeWidth="0.6" />
      {/* engraved paw */}
      <g fill="#7d5a2a" fillOpacity="0.62">
        <ellipse cx="16" cy="19" rx="3.6" ry="3" />
        <ellipse cx="11.6" cy="14.6" rx="1.45" ry="1.9" />
        <ellipse cx="14.4" cy="12" rx="1.45" ry="1.95" />
        <ellipse cx="17.6" cy="12" rx="1.45" ry="1.95" />
        <ellipse cx="20.4" cy="14.6" rx="1.45" ry="1.9" />
      </g>
    </svg>
  )
}

/** The gem: a brilliant cut in deep sapphire with fine facet lines and one cool highlight. */
export function GemMark({ size = 22 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="inline-block shrink-0 align-middle">
      <defs>
        <linearGradient id={`g${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#c9e6f2" />
          <stop offset="0.35" stopColor="#5f9fc2" />
          <stop offset="1" stopColor="#1d3d62" />
        </linearGradient>
      </defs>
      <path d="M9 5h14l6 7.5L16 28 3 12.5z" fill={`url(#g${id})`} />
      <g fill="none" stroke="#eaf6fb" strokeOpacity="0.55" strokeWidth="0.7" strokeLinejoin="round">
        <path d="M3 12.5h26M9 5l3.4 7.5L16 28l3.6-15.5L23 5M12.4 12.5L16 5l3.6 7.5" />
      </g>
      <path d="M9.6 6.2h4.6l-2.4 5.2H5.4z" fill="#ffffff" fillOpacity="0.35" />
    </svg>
  )
}

/** A gem pack in the store: one to four stones by size, set on a dark velvet disc. */
export function GemPackMark({ n, size = 64 }: { n: number; size?: number }) {
  const count = n >= 1500 ? 4 : n >= 650 ? 3 : n >= 250 ? 2 : 1
  const spots: [number, number, number][] = [
    [[0.5, 0.52, 0.62]],
    [
      [0.38, 0.55, 0.52],
      [0.64, 0.48, 0.46],
    ],
    [
      [0.3, 0.58, 0.44],
      [0.52, 0.44, 0.5],
      [0.72, 0.6, 0.4],
    ],
    [
      [0.26, 0.6, 0.4],
      [0.44, 0.42, 0.46],
      [0.66, 0.46, 0.42],
      [0.54, 0.68, 0.38],
    ],
  ][count - 1] as [number, number, number][]
  return (
    <span className="wb-gempack" style={{ width: size, height: size }}>
      {spots.map(([x, y, s], i) => (
        <span key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)' }}>
          <GemMark size={Math.round(size * s)} />
        </span>
      ))}
    </span>
  )
}

/** Level up: a gold chevron rising between two laurel sprigs. */
export function LevelEmblem({ size = 120 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  const leaf = (x: number, y: number, r: number) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx="2.4" ry="5.2" transform={`rotate(${r} ${x} ${y})`} />
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 120 74" aria-hidden className="wb-level-emblem">
      <defs>
        <linearGradient id={`l${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3e3bd" />
          <stop offset="0.6" stopColor="#dcc08a" />
          <stop offset="1" stopColor="#a9864e" />
        </linearGradient>
      </defs>
      <g fill={`url(#l${id})`}>
        {[
          [30, 58, -40],
          [24, 48, -25],
          [21, 37, -10],
          [21, 26, 5],
          [24, 16, 22],
        ].map(([x, y, r]) => leaf(x, y, r))}
        {[
          [90, 58, 40],
          [96, 48, 25],
          [99, 37, 10],
          [99, 26, -5],
          [96, 16, -22],
        ].map(([x, y, r]) => leaf(x, y, r))}
        <path d="M60 10l18 18h-9v4H51v-4h-9z" />
        <path d="M60 30l18 18h-9v4H51v-4h-9z" opacity="0.55" />
      </g>
    </svg>
  )
}

/** The festival token: a gold spark in a ring (replaces the painted tribal mask). */
export function TokenMark({ size = 24 }: { size?: number }) {
  return (
    <Ring size={size}>
      <Sparkles size={Math.round(size * 0.56)} strokeWidth={1.6} />
    </Ring>
  )
}
