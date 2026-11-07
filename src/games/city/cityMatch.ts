import { createMatchStore, type BotName } from '@/games/shared/online/matchStore'

export const useCityMatch = createMatchStore()

export const CITY_BOT_NAMES: BotName[] = [
  { name: 'Diya', avatarEmoji: '🧢' },
  { name: 'Sneha', avatarEmoji: '🌸' },
  { name: 'Doctor', avatarEmoji: '🩺' },
]

export const CITY_MIN_PLAYERS = 2
export const CITY_MAX_PLAYERS = 4
