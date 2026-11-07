/*
 * Store catalogue. India configuration: points are free and can never be bought, so the "Chips" tab only
 * hands out free grants. Everything with a price is cosmetic and goes through platform billing.
 */

export type CosmeticSlot = 'felt' | 'cardBack' | 'frame' | 'theme'

export interface Cosmetic {
  id: string
  slot: CosmeticSlot
  name: string
  description: string
  /** CSS colours used to preview and render it */
  colors: [string, string]
  /** free once the player reaches this level */
  unlockLevel?: number
  /** platform price in rupees (cosmetic only) */
  priceInr?: number
  vipOnly?: boolean
}

export const COSMETICS: Cosmetic[] = [
  { id: 'felt-royal', slot: 'felt', name: 'Royal Green', description: 'The club’s classic green felt.', colors: ['#1f9d3c', '#0b5d22'], unlockLevel: 1 },
  { id: 'felt-midnight', slot: 'felt', name: 'Midnight Blue', description: 'Deep blue felt with a gold rim.', colors: ['#1d4fb8', '#0b2560'], unlockLevel: 5 },
  { id: 'felt-crimson', slot: 'felt', name: 'Crimson Velvet', description: 'Red velvet for high rollers.', colors: ['#b3192b', '#5e0812'], priceInr: 79 },
  { id: 'felt-amethyst', slot: 'felt', name: 'Amethyst', description: 'Purple felt from the VIP room.', colors: ['#7b2fd0', '#3a0f74'], vipOnly: true },
  { id: 'back-royal', slot: 'cardBack', name: 'Royal Red', description: 'Red back with a gold crown.', colors: ['#b3192b', '#f4c542'], unlockLevel: 1 },
  { id: 'back-onyx', slot: 'cardBack', name: 'Onyx Gold', description: 'Black and gold filigree.', colors: ['#141414', '#e8b84a'], unlockLevel: 8 },
  { id: 'back-sapphire', slot: 'cardBack', name: 'Sapphire', description: 'Blue lattice back.', colors: ['#1d4fb8', '#cfe1ff'], priceInr: 49 },
  { id: 'frame-gold', slot: 'frame', name: 'Gold Ring', description: 'Polished gold avatar ring.', colors: ['#ffe08a', '#b07a14'], unlockLevel: 1 },
  { id: 'frame-laurel', slot: 'frame', name: 'Laurel', description: 'A champion’s laurel ring.', colors: ['#fff1b8', '#d39b1e'], unlockLevel: 10 },
  { id: 'frame-ruby', slot: 'frame', name: 'Ruby Crown', description: 'Ruby-studded avatar frame.', colors: ['#ff5a6b', '#8f0e1d'], priceInr: 99 },
  { id: 'frame-diamond', slot: 'frame', name: 'Diamond', description: 'Ice-white diamond frame.', colors: ['#e8f6ff', '#6fb6e6'], vipOnly: true },
  { id: 'theme-casino', slot: 'theme', name: 'Grand Casino', description: 'Gold chandeliers (default).', colors: ['#2a1a06', '#e8b84a'], unlockLevel: 1 },
  { id: 'theme-neon', slot: 'theme', name: 'Neon Night', description: 'Purple neon city glow.', colors: ['#1a0838', '#b56cff'], unlockLevel: 6 },
  { id: 'theme-emerald', slot: 'theme', name: 'Emerald Lounge', description: 'Green marble lounge.', colors: ['#06261a', '#3ee08f'], priceInr: 149 },
]

export const DEFAULT_EQUIPPED: Record<CosmeticSlot, string> = { felt: 'felt-royal', cardBack: 'back-royal', frame: 'frame-gold', theme: 'theme-casino' }

export const cosmetic = (id: string) => COSMETICS.find((c) => c.id === id)

export const VIP_PRICE_INR = 299
export const VIP_PERKS = ['VIP tables (bigger blinds, faster play)', 'Amethyst felt and Diamond frame', 'Double daily bonus', 'Gold name at every table']

/** Google Play product ids. Cosmetics are one-time products; VIP is a monthly subscription. */
export const PLAY_PRODUCTS: Record<string, { itemId: string; type: 'inapp' | 'subs' }> = {
  ...Object.fromEntries(COSMETICS.filter((c) => c.priceInr).map((c) => [`rpc_${c.id.replace(/-/g, '_')}`, { itemId: c.id, type: 'inapp' as const }])),
  rpc_vip_monthly: { itemId: 'vip', type: 'subs' },
}
export const productIdFor = (itemId: string) => Object.entries(PLAY_PRODUCTS).find(([, v]) => v.itemId === itemId)?.[0]
