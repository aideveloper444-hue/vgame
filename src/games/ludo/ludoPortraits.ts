import { create } from 'zustand'
import type { LudoColor } from './ludoBoardLayout'

/** Rendered head-and-shoulders portraits of each team's 3D character, as data URLs. */
export const useLudoPortraits = create<{
  portraits: Partial<Record<LudoColor, string>>
  setPortraits: (p: Partial<Record<LudoColor, string>>) => void
}>((set) => ({
  portraits: {},
  setPortraits: (portraits) => set({ portraits }),
}))
