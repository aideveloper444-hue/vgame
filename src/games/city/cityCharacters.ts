import type { LudoColor } from '@/games/ludo/ludoBoardLayout'

const BY_HEX: Record<string, LudoColor> = {
  '#3b82f6': 'BLUE',
  '#ec4899': 'PINK',
  '#22c55e': 'GREEN',
  '#f97316': 'ORANGE',
  '#ef4444': 'RED',
  '#eab308': 'YELLOW',
  '#d946ef': 'PURPLE',
}

/** Which dressed human character (shared with Ludo) plays a City player of this colour. */
export function cityCharacterColor(hex: string): LudoColor {
  return BY_HEX[hex.toLowerCase()] ?? 'PURPLE'
}
