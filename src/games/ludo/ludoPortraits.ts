import { create } from 'zustand'
import type { LudoColor } from './ludoBoardLayout'
import type { CharacterStyleId } from './ludoThemes'

/**
 * Rendered head-and-shoulders portraits, as data URLs: each team's 3D character in the chosen warrior
 * style (player cards), and one hero shot per warrior style (the style picker).
 */
export const useLudoPortraits = create<{
  portraits: Partial<Record<LudoColor, string>>
  styles: Partial<Record<CharacterStyleId, string>>
  setPortraits: (p: Partial<Record<LudoColor, string>>) => void
  setStyles: (p: Partial<Record<CharacterStyleId, string>>) => void
}>((set) => ({
  portraits: {},
  styles: {},
  setPortraits: (portraits) => set({ portraits }),
  setStyles: (styles) => set({ styles }),
}))
