import { ChevronsRight, ChevronsUp, EyeOff, Flame, Hammer, Magnet, Mountain, MoveUp, Rocket, RotateCw, Shield, Shuffle, Snowflake, Waves, Zap, type LucideIcon } from 'lucide-react'
import type { AbilityKind, PowerUpKind } from '../engine/content'

/** Line icons for the run HUD (premium and legible at speed, instead of painted badges). */
const POWER: Record<PowerUpKind, LucideIcon> = { speed: Zap, magnet: Magnet, shield: Shield, superjump: ChevronsUp, megajump: Rocket, boost: Flame }
const ABILITY: Record<AbilityKind, LucideIcon> = { boost: Zap, roar: Waves, leap: MoveUp, stealth: EyeOff, dodge: Shuffle, frost: Snowflake, smash: Hammer, charge: ChevronsRight, roll: RotateCw, cliff: Mountain }

export function PowerIcon({ kind, size = 22 }: { kind: PowerUpKind; size?: number }) {
  const I = POWER[kind]
  return <I size={size} strokeWidth={1.6} />
}
export function AbilityIcon({ kind, size = 28 }: { kind: AbilityKind; size?: number }) {
  const I = ABILITY[kind]
  return <I size={size} strokeWidth={1.5} />
}
