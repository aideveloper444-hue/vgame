import { create } from 'zustand'
import { createMatchStore, type BotName } from '@/games/shared/online/matchStore'
import type { VariantId } from './cityBoardData'

export const useCityMatch = createMatchStore()

export const CITY_BOT_NAMES: BotName[] = [
  { name: 'Divya', avatarEmoji: '🧢' },
  { name: 'Sneha', avatarEmoji: '🌸' },
  { name: 'Doctor', avatarEmoji: '🩺' },
]

export const CITY_MIN_PLAYERS = 2
export const CITY_MAX_PLAYERS = 4

/** The rule-book variant picked on the menu; the host's choice is what everyone plays. */
export const useTycoonVariant = create<{ variant: VariantId; setVariant: (v: VariantId) => void }>((set) => ({
  variant: 'CLASSIC',
  setVariant: (variant) => set({ variant }),
}))
