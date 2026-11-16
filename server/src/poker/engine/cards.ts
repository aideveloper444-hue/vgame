/*
 * Cards are two-character strings: rank (23456789TJQKA) + suit (s h d c), e.g. "As", "Td".
 * Shuffling uses the platform CSPRNG; the deck never leaves the authoritative device.
 */

export type Suit = 's' | 'h' | 'd' | 'c'
export type Card = string

export const RANKS = '23456789TJQKA'
export const SUITS: Suit[] = ['s', 'h', 'd', 'c']

export const rankIndex = (card: Card): number => RANKS.indexOf(card[0])
export const suitOf = (card: Card): Suit => card[1] as Suit

export function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s)
  return deck
}

/** Uniform random integer in [0, n) without modulo bias. */
export function secureInt(n: number): number {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / n) * n
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

/** Fisher–Yates with the CSPRNG. */
export function shuffle(deck: Card[], rand: (n: number) => number = secureInt): Card[] {
  const d = deck.slice()
  for (let i = d.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

const RANK_LABEL: Record<string, string> = { T: '10' }
export const rankLabel = (card: Card) => RANK_LABEL[card[0]] ?? card[0]

const SUIT_NAME: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const RANK_NAME: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten' }
/** Screen-reader label, e.g. "Ace of spades". */
export const cardName = (card: Card) => `${RANK_NAME[card[0]] ?? card[0]} of ${SUIT_NAME[suitOf(card)]}`
