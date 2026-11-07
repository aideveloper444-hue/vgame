import { freshDeck, rankIndex, suitOf, type Card } from './cards'
import { scoreOf } from './evaluator'
import { legalActions, potTotal, type PlayerAction, type TableState } from './table'

/*
 * Computer players. They see exactly what a person in their seat would: their own two cards, the board,
 * the pot and the bets. Strength comes from a quick Monte Carlo equity estimate against random hands.
 */

export type BotStyle = 'tight' | 'loose' | 'aggressive' | 'balanced'

export function estimateEquity(hole: Card[], board: Card[], opponents: number, iterations = 220): number {
  const known = new Set([...hole, ...board])
  const rest = freshDeck().filter((c) => !known.has(c))
  let wins = 0
  for (let it = 0; it < iterations; it++) {
    // partial shuffle: draw just the cards this run needs
    const need = 5 - board.length + opponents * 2
    const d = rest.slice()
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(Math.random() * (d.length - k))
      ;[d[k], d[j]] = [d[j], d[k]]
    }
    const full = [...board, ...d.slice(0, 5 - board.length)]
    const mine = scoreOf([...hole, ...full])
    let best = true
    let tie = 0
    for (let o = 0; o < opponents; o++) {
      const off = 5 - board.length + o * 2
      const theirs = scoreOf([d[off], d[off + 1], ...full])
      if (theirs > mine) {
        best = false
        break
      }
      if (theirs === mine) tie++
    }
    if (best) wins += tie ? 1 / (tie + 1) : 1
  }
  return wins / iterations
}

/** Rough pre-flop strength from 0 to 1 (pairs, high cards, suited, connected). */
function preflopStrength(hole: Card[]): number {
  const [a, b] = hole.map(rankIndex).sort((x, y) => y - x)
  const pair = a === b
  const suited = suitOf(hole[0]) === suitOf(hole[1])
  let v = (a + b) / 24
  if (pair) v = 0.55 + a / 26
  if (suited) v += 0.06
  if (a - b === 1) v += 0.04
  if (a === 12) v += 0.08
  return Math.min(1, v)
}

const STYLE = {
  tight: { loose: -0.06, aggro: 0.8, bluff: 0.03 },
  loose: { loose: 0.08, aggro: 0.9, bluff: 0.08 },
  aggressive: { loose: 0.03, aggro: 1.35, bluff: 0.12 },
  balanced: { loose: 0, aggro: 1, bluff: 0.06 },
} satisfies Record<BotStyle, { loose: number; aggro: number; bluff: number }>

const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step)

export function decideBot(s: TableState, seatIndex: number, style: BotStyle = 'balanced'): PlayerAction {
  const legal = legalActions(s, seatIndex)
  if (!legal) return { type: 'fold' }
  const seat = s.seats[seatIndex]!
  const hole = s.holes[seatIndex] ?? []
  const st = STYLE[style]
  const opponents = Math.max(1, s.seats.filter((x, i) => i !== seatIndex && x && x.inHand && !x.folded).length)
  const equity = s.board.length === 0 ? preflopStrength(hole) * 0.55 + estimateEquity(hole, [], opponents, 90) * 0.45 : estimateEquity(hole, s.board, opponents)
  const pot = potTotal(s)
  const potOdds = legal.toCall / Math.max(1, pot + legal.toCall)
  const noise = (Math.random() - 0.5) * 0.08
  const strength = equity + st.loose + noise
  const bb = s.config.bigBlind

  const raiseTo = (fraction: number): PlayerAction => {
    const target = roundTo(s.currentBet + Math.max(legal.minTo - s.currentBet, pot * fraction * st.aggro), Math.max(1, Math.floor(bb / 2)))
    const to = Math.min(legal.maxTo, Math.max(legal.minTo, target))
    if (to >= legal.maxTo) return { type: 'allin' }
    return { type: legal.isBet ? 'bet' : 'raise', amount: to }
  }

  // monsters: build the pot
  if (strength > 0.78 && legal.canRaise) return raiseTo(0.9)
  if (strength > 0.62 && legal.canRaise && Math.random() < 0.55 * st.aggro) return raiseTo(0.6)
  // the occasional bluff when it is cheap to try
  if (legal.canRaise && legal.toCall === 0 && Math.random() < st.bluff) return raiseTo(0.5)

  if (legal.canCheck) return { type: 'check' }
  // pot odds with a little room for implied odds; short calls relative to the stack are easier
  const cheap = legal.toCall <= Math.max(bb, seat.stack * 0.04)
  if (strength > potOdds + 0.06 || (cheap && strength > 0.3)) return legal.canCall ? { type: 'call' } : { type: 'check' }
  return { type: 'fold' }
}
