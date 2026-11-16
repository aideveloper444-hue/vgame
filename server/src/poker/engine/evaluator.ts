import { rankIndex, suitOf, type Card } from './cards'

/*
 * Texas Hold'em hand evaluator: best five of up to seven cards. Scores are plain numbers that compare
 * directly (higher wins, equal splits): category * 15^5 plus the tiebreak ranks in base 15.
 */

export const CATEGORY_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Royal Flush',
] as const

export interface HandValue {
  score: number
  /** 0 = high card … 8 = straight flush, 9 = royal flush (scored as a straight flush) */
  category: number
  name: string
  best: Card[]
}

const B = 15
const pack = (cat: number, ranks: number[]) => {
  let s = cat
  for (let i = 0; i < 5; i++) s = s * B + (ranks[i] ?? 0)
  return s
}

/** Highest rank of a straight in a sorted-unique rank list (descending), or -1. Ranks are 0 (two) … 12 (ace). */
function straightHigh(uniq: number[]): number {
  const set = new Set(uniq)
  for (let hi = 12; hi >= 3; hi--) {
    if (hi === 3) {
      // the wheel: A-2-3-4-5
      if (set.has(12) && set.has(0) && set.has(1) && set.has(2) && set.has(3)) return 3
    } else if ([0, 1, 2, 3, 4].every((k) => set.has(hi - k))) return hi
  }
  return -1
}

export function evaluate5(cards: Card[]): { score: number; category: number } {
  const ranks = cards.map(rankIndex).sort((a, b) => b - a)
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]))
  const uniq = [...new Set(ranks)]
  const sh = uniq.length === 5 ? straightHigh(uniq) : -1
  if (flush && sh >= 0) return { score: pack(8, [sh]), category: 8 }

  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  // groups ordered by size then rank, which is exactly the tiebreak order
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const order = groups.map((g) => g[0])
  const shape = groups.map((g) => g[1]).join('')

  if (shape === '41') return { score: pack(7, order), category: 7 }
  if (shape === '32') return { score: pack(6, order), category: 6 }
  if (flush) return { score: pack(5, ranks), category: 5 }
  if (sh >= 0) return { score: pack(4, [sh]), category: 4 }
  if (shape === '311') return { score: pack(3, order), category: 3 }
  if (shape === '221') return { score: pack(2, order), category: 2 }
  if (shape === '2111') return { score: pack(1, order), category: 1 }
  return { score: pack(0, ranks), category: 0 }
}

/** Best five-card hand from 5–7 cards. */
export function evaluate(cards: Card[]): HandValue {
  let bestScore = -1
  let bestCat = 0
  let best: Card[] = []
  const n = cards.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]]
            const v = evaluate5(five)
            if (v.score > bestScore) {
              bestScore = v.score
              bestCat = v.category
              best = five
            }
          }
  const royal = bestCat === 8 && best.some((c) => c[0] === 'A') && best.some((c) => c[0] === 'K')
  const category = royal ? 9 : bestCat
  return { score: bestScore, category, name: CATEGORY_NAMES[category], best }
}

/** Fast score-only path for simulations (same comparison as evaluate().score). */
export function scoreOf(cards: Card[]): number {
  let best = -1
  const n = cards.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const s = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]).score
            if (s > best) best = s
          }
  return best
}
