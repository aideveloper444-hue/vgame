import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ANIMALS, getAnimal } from './amazonTrackData'

interface AmazonProgress {
  selected: string
  owned: string[]
  /** Rewarded ads watched toward an animal's unlock. */
  adsWatched: Record<string, number>
  best: number
  totalRuns: number
  select: (id: string) => void
  unlock: (id: string) => void
  addAdView: (id: string) => void
  recordRun: (distance: number) => boolean
}

const FREE = ANIMALS.filter((a) => a.price === 0).map((a) => a.id)

/** Which animals this player owns, which one is picked and their best run (saved on the device). */
export const useAmazonProgress = create<AmazonProgress>()(
  persist(
    (set, get) => ({
      selected: 'wolf',
      owned: FREE,
      adsWatched: {},
      best: 0,
      totalRuns: 0,
      select: (id) => {
        if (get().owned.includes(id)) set({ selected: id })
      },
      unlock: (id) => set((s) => ({ owned: s.owned.includes(id) ? s.owned : [...s.owned, id], selected: id })),
      addAdView: (id) => {
        const n = (get().adsWatched[id] ?? 0) + 1
        set((s) => ({ adsWatched: { ...s.adsWatched, [id]: n } }))
        if (n >= (getAnimal(id).ads ?? Infinity)) get().unlock(id)
      },
      recordRun: (distance) => {
        const isBest = distance > get().best
        set((s) => ({ best: Math.max(s.best, Math.round(distance)), totalRuns: s.totalRuns + 1 }))
        return isBest
      },
    }),
    {
      name: 'vibo-amazon-progress',
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AmazonProgress>
        const owned = Array.from(new Set([...FREE, ...(saved.owned ?? [])]))
        return { ...current, ...saved, owned }
      },
    },
  ),
)
