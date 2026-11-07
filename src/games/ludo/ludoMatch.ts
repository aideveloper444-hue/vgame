import { createMatchStore, type BotName, type GameMode } from '@/games/shared/online/matchStore'

export type { BotLevel, MatchRole, Seat, SeatKind } from '@/games/shared/online/matchStore'
export type LudoMode = GameMode

export const useLudoMatch = createMatchStore()

export const BOT_NAMES: BotName[] = [
  { name: 'Rohan', avatarEmoji: '🧑' },
  { name: 'Diya', avatarEmoji: '👩' },
  { name: 'Vikram', avatarEmoji: '🧔' },
  { name: 'Ananya', avatarEmoji: '👧' },
  { name: 'Arjun', avatarEmoji: '👦' },
  { name: 'Meera', avatarEmoji: '👩‍🦱' },
  { name: 'Kabir', avatarEmoji: '🧑‍🦱' },
]
