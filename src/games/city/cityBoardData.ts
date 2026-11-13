export type PropertyCategory =
  | 'OFFICE'
  | 'RESTAURANT'
  | 'HOTEL'
  | 'CINEMA'
  | 'MALL'
  | 'STORE'
  | 'FACTORY'
  /** Utility concerns: Airport + Steamer Company (rulebook §17) */
  | 'TRAVEL'
  /** Railway + Transport */
  | 'TRANSIT'
  /** Radio Station + Post Office */
  | 'MEDIA'

/** A site you can develop, or a concern (company) whose rent depends on owning its partner. */
export type PropertyKind = 'SITE' | 'CONCERN'

export interface PropertyTile {
  id: number
  type: 'PROPERTY'
  kind: PropertyKind
  name: string
  category: PropertyCategory
  basePrice: number
  /** Sites: rent by erection [site only, office, bungalow, godown]. Concerns: [alone, with partner]. */
  rentTable: number[]
  /** Cost of each erection, paid to the Bank. */
  upgradeCost: number
  maxLevel: number
  ownerId: string | null
  level: number
  /** Mortgaged to the Bank: rent is shared half and half with the Bank, card shown face down. */
  mortgaged: boolean
}

export type SimpleTileType = 'PARK' | 'CHANCE' | 'COMMUNITY' | 'GO' | 'JAIL' | 'TAX' | 'EVENT' | 'GO_TO_JAIL' | 'CLUB'

export interface SimpleTile {
  id: number
  type: SimpleTileType
  name: string
  amount?: number // for TAX
}

export type CityTile = PropertyTile | SimpleTile

export const CATEGORY_ICON: Record<PropertyCategory, string> = {
  OFFICE: '🏢',
  RESTAURANT: '🍔',
  HOTEL: '🏨',
  CINEMA: '🎬',
  MALL: '🛍️',
  STORE: '🏪',
  FACTORY: '🏭',
  TRAVEL: '✈️',
  TRANSIT: '🚆',
  MEDIA: '📻',
}

/** Board icon for a tile: concerns and special spaces get their own. */
export const TILE_ICON: Record<string, string> = {
  Airport: '✈️',
  'Steamer Co.': '🚢',
  Railway: '🚆',
  Transport: '🚚',
  'Radio Station': '📻',
  'Post Office': '📮',
  "Merchant's Club": '🎩',
  'Milk Bar': '🥛',
  'Income Tax': '🧾',
  'Sales Tax': '💰',
  Chance: '❓',
  Republic: '🏛️',
}

/** Development stages a site can be raised through, in order (rulebook §11). */
export const ERECTION_NAMES = ['Site', 'Office', 'Bungalow', 'Godown'] as const

/**
 * Rent scaled from the rulebook's property card (Tatanagar, price ₹3,500): site ₹425, office ₹1,100,
 * bungalow ₹2,000, godown ₹3,000, each erection ₹4,000. Every site keeps the same proportions to its
 * printed board price.
 */
const RENT_RATIOS = [425 / 3500, 1100 / 3500, 2000 / 3500, 3000 / 3500]
const ERECTION_RATIO = 4000 / 3500

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step)

function rentTableFor(basePrice: number): number[] {
  return RENT_RATIOS.map((r) => roundTo(basePrice * r, 5))
}

/** Concern rent from the rulebook's Airport card (₹5,000): ₹700 alone, ₹1,500 with the Steamer Company. */
const CONCERN_RATIOS = [700 / 5000, 1500 / 5000]

/** Rulebook §15: the Bank lends 50% of the purchase price and charges 10% interest on redemption. */
export function mortgageValue(tile: PropertyTile): number {
  return Math.round(tile.basePrice * 0.5)
}
export function redeemCost(tile: PropertyTile): number {
  return Math.round(mortgageValue(tile) * 1.1)
}

/** Colour groups are the card colours on the board (the category tint). */
export function groupOf(tiles: CityTile[], tile: PropertyTile): PropertyTile[] {
  return tiles.filter((t): t is PropertyTile => t.type === 'PROPERTY' && t.category === tile.category)
}
export function ownsFullGroup(tiles: CityTile[], tile: PropertyTile): boolean {
  return tile.ownerId !== null && groupOf(tiles, tile).every((t) => t.ownerId === tile.ownerId)
}

/** Why a site can't take its next erection right now, or null if it can (cash aside). */
export function buildBlocker(tiles: CityTile[], tile: PropertyTile): string | null {
  if (tile.kind === 'CONCERN') return 'Concern'
  if (tile.level >= tile.maxLevel) return 'MAX'
  if (tile.mortgaged) return 'Mortgaged'
  if (!ownsFullGroup(tiles, tile)) return 'Need set'
  const group = groupOf(tiles, tile)
  if (group.some((t) => t.mortgaged)) return 'Set mortgaged'
  // an office on every site before a bungalow, a bungalow on every site before a godown
  if (tile.level > Math.min(...group.map((t) => t.level))) return 'Build evenly'
  return null
}

function property(id: number, name: string, category: PropertyCategory, basePrice: number): PropertyTile {
  return {
    id,
    type: 'PROPERTY',
    kind: 'SITE',
    name,
    category,
    basePrice,
    rentTable: rentTableFor(basePrice),
    upgradeCost: roundTo(basePrice * ERECTION_RATIO, 50),
    maxLevel: ERECTION_NAMES.length - 1,
    ownerId: null,
    level: 0,
    mortgaged: false,
  }
}

function concern(id: number, name: string, category: PropertyCategory, basePrice: number): PropertyTile {
  return {
    id,
    type: 'PROPERTY',
    kind: 'CONCERN',
    name,
    category,
    basePrice,
    rentTable: CONCERN_RATIOS.map((r) => roundTo(basePrice * r, 10)),
    upgradeCost: 0,
    maxLevel: 0,
    ownerId: null,
    level: 0,
    mortgaged: false,
  }
}

function simple(id: number, type: SimpleTileType, name: string, amount?: number): SimpleTile {
  return { id, type, name, amount }
}

export const TILES_PER_SIDE = 10

export function buildBoard(): CityTile[] {
  // 40 spaces: Start bottom-left, then left-to-right along the bottom, up the right side, right-to-left
  // along the top and down the left side. Prices follow the rulebook (₹1,500 – ₹7,000).
  return [
    simple(0, 'GO', 'Start'),
    property(1, 'Mumbai', 'STORE', 1500),
    simple(2, 'COMMUNITY', 'Republic'),
    property(3, 'Cairo', 'STORE', 1600),
    simple(4, 'TAX', 'Income Tax'),
    concern(5, 'Railway', 'TRANSIT', 7000),
    property(6, 'Bali', 'RESTAURANT', 1700),
    simple(7, 'CHANCE', 'Chance'),
    property(8, 'Miami', 'RESTAURANT', 1700),
    property(9, 'Bangkok', 'RESTAURANT', 2000),

    simple(10, 'JAIL', 'Jail'),
    property(11, 'Seoul', 'CINEMA', 2300),
    concern(12, 'Radio Station', 'MEDIA', 2000),
    property(13, 'Las Vegas', 'CINEMA', 2300),
    property(14, 'Tokyo', 'CINEMA', 2500),
    concern(15, 'Airport', 'TRAVEL', 5000),
    property(16, 'Shanghai', 'FACTORY', 2500),
    simple(17, 'COMMUNITY', 'Republic'),
    property(18, 'Sydney', 'FACTORY', 2700),
    property(19, 'Chicago', 'FACTORY', 3000),

    simple(20, 'PARK', 'Free Parking'),
    property(21, 'Singapore', 'OFFICE', 3000),
    simple(22, 'CHANCE', 'Chance'),
    property(23, 'Berlin', 'OFFICE', 3500),
    property(24, 'Hong Kong', 'OFFICE', 3500),
    concern(25, 'Steamer Co.', 'TRAVEL', 7000),
    property(26, 'London', 'MALL', 4000),
    simple(27, 'CLUB', "Merchant's Club"),
    property(28, 'Paris', 'MALL', 4000),
    concern(29, 'Post Office', 'MEDIA', 2000),

    simple(30, 'GO_TO_JAIL', 'Go to Jail'),
    property(31, 'Dubai', 'MALL', 4500),
    concern(32, 'Transport', 'TRANSIT', 4000),
    simple(33, 'COMMUNITY', 'Republic'),
    property(34, 'Los Angeles', 'HOTEL', 4500),
    simple(35, 'CHANCE', 'Chance'),
    simple(36, 'CLUB', 'Milk Bar'),
    property(37, 'New York', 'HOTEL', 5000),
    simple(38, 'TAX', 'Sales Tax'),
    simple(39, 'CHANCE', 'Chance'),
  ]
}

export interface EventTemplate {
  id: string
  description: string
  affectsCategory: PropertyCategory | 'ALL'
  rentMultiplier: number
  rounds: number
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  { id: 'festival', description: 'Festival Weekend: restaurants earn +50% rent', affectsCategory: 'RESTAURANT', rentMultiplier: 1.5, rounds: 3 },
  { id: 'tourist-rush', description: 'Tourist Rush: hotels earn +50% rent', affectsCategory: 'HOTEL', rentMultiplier: 1.5, rounds: 3 },
  { id: 'construction', description: 'Construction: factory rent -30%', affectsCategory: 'FACTORY', rentMultiplier: 0.7, rounds: 2 },
  { id: 'sale-season', description: 'Sale Season: malls & stores earn +40%', affectsCategory: 'MALL', rentMultiplier: 1.4, rounds: 3 },
  { id: 'boom', description: 'Economic Boom: all rent +25%', affectsCategory: 'ALL', rentMultiplier: 1.25, rounds: 2 },
]

export interface CardEffect {
  id: string
  text: string
  cashDelta?: number
  moveTo?: number
  sendToJail?: boolean
}

export const JAIL_TILE_ID = 10

export const CHANCE_CARDS: CardEffect[] = [
  { id: 'c1', text: 'Your shares pay a dividend. Collect ₹1,500', cashDelta: 1500 },
  { id: 'c2', text: 'Traffic fine. Pay ₹300', cashDelta: -300 },
  { id: 'c3', text: 'Advance to Start', moveTo: 0 },
  { id: 'c4', text: 'You won a business award. Collect ₹2,000', cashDelta: 2000 },
  { id: 'c5', text: 'Caught evading tax — go to Jail!', moveTo: JAIL_TILE_ID, sendToJail: true },
  { id: 'c6', text: 'Repairs on your premises. Pay ₹1,000', cashDelta: -1000 },
  { id: 'c7', text: 'Lottery win! Collect ₹2,500', cashDelta: 2500 },
  { id: 'c8', text: 'Take a flight — advance to the Airport', moveTo: 15 },
  { id: 'c9', text: 'Business trip — advance to New York', moveTo: 37 },
]

export const COMMUNITY_CARDS: CardEffect[] = [
  { id: 'r1', text: 'Republic Day bonus from the Bank. Collect ₹2,000', cashDelta: 2000 },
  { id: 'r2', text: 'Income tax refund. Collect ₹1,000', cashDelta: 1000 },
  { id: 'r3', text: 'Hospital bill. Pay ₹1,000', cashDelta: -1000 },
  { id: 'r4', text: 'School fees. Pay ₹1,500', cashDelta: -1500 },
  { id: 'r5', text: 'Bank error in your favour. Collect ₹2,500', cashDelta: 2500 },
  { id: 'r6', text: 'Insurance premium. Pay ₹500', cashDelta: -500 },
  { id: 'r7', text: 'Go to Jail!', moveTo: JAIL_TILE_ID, sendToJail: true },
  { id: 'r8', text: 'Take the train — advance to the Railway', moveTo: 5 },
]

export const CATEGORY_TINT: Record<PropertyCategory, string> = {
  OFFICE: '#0ea5e9',
  RESTAURANT: '#f97316',
  HOTEL: '#8b5cf6',
  CINEMA: '#ec4899',
  MALL: '#ef4444',
  STORE: '#22c55e',
  FACTORY: '#eab308',
  TRAVEL: '#06b6d4',
  TRANSIT: '#64748b',
  MEDIA: '#a3e635',
}
