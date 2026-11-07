import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { makeId } from '@/lib/id'

export interface FloatingReaction {
  id: string
  emoji: string
  x: number
}

interface ReactionState {
  reactions: FloatingReaction[]
  fire: (emoji: string) => void
  remove: (id: string) => void
}

export const useReactionStore = create<ReactionState>()(
  immer((set) => ({
    reactions: [],
    fire: (emoji) => {
      const id = makeId('reaction')
      set((state) => {
        state.reactions.push({ id, emoji, x: 10 + Math.random() * 80 })
      })
      setTimeout(() => {
        set((state) => {
          state.reactions = state.reactions.filter((r) => r.id !== id)
        })
      }, 1800)
    },
    remove: (id) =>
      set((state) => {
        state.reactions = state.reactions.filter((r) => r.id !== id)
      }),
  })),
)
