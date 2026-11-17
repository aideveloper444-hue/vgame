// World Tycoon board data, taken from the rule book (World_Tycoon_Game.pdf): 36 squares, 20 cities in
// 8 colour groups, 6 companies in 3 partner pairs, Chance and Treasury decks, Casino and Grand Club.

export type GroupId = 'BLUE' | 'PINK' | 'PURPLE' | 'GREEN' | 'RED' | 'YELLOW' | 'TEAL' | 'ORANGE'

export const GROUP_INFO: Record<GroupId, { name: string; color: string }> = {
  BLUE: { name: 'Blue', color: '#2f86e0' },
  PINK: { name: 'Pink', color: '#e84393' },
  PURPLE: { name: 'Purple', color: '#8e44ad' },
  GREEN: { name: 'Green', color: '#27ae60' },
  RED: { name: 'Red', color: '#e74c3c' },
  YELLOW: { name: 'Yellow', color: '#f1c40f' },
  TEAL: { name: 'Teal', color: '#16a085' },
  ORANGE: { name: 'Orange', color: '#e67e22' },
}

/** A city you can build on, or a company whose rent depends on owning its partner. */
export type PropertyKind = 'SITE' | 'COMPANY'

export interface PropertyTile {
  id: number
  type: 'PROPERTY'
  kind: PropertyKind
  name: string
  /** City landmark printed on the deed; "Company" for companies. */
  landmark: string
  /** Colour group for cities; null for companies. */
  group: GroupId | null
  /** Deed colour (group colour, or the company's own band). */
  color: string
  /** Partner company tile id (companies only). */
  partnerId: number | null
  basePrice: number
  /** Cities: [site only, office, bungalow, godown]. Companies: [alone, with partner]. */
  rentTable: number[]
  /** Cost of each erection (cities). */
  upgradeCost: number
  maxLevel: number
  ownerId: string | null
  /** 0 = site only, 1 = Office, 2 = Bungalow, 3 = Godown (one building at a time). */
  level: number
  mortgaged: boolean
}

export type SimpleTileType = 'GO' | 'TREASURY' | 'CHANCE' | 'TAX' | 'JAIL' | 'CASINO' | 'CLUB'

export interface SimpleTile {
  id: number
  type: SimpleTileType
  name: string
}

export type CityTile = PropertyTile | SimpleTile

export const BOARD_SIZE = 36
export const START_TILE_ID = 0
export const JAIL_TILE_ID = 9
export const CASINO_TILE_ID = 18
export const CLUB_TILE_ID = 27
export const LONDON_TILE_ID = 2

/** Building stages, in order; each upgrade replaces the previous building. */
export const ERECTION_NAMES = ['Site', 'Office', 'Bungalow', 'Godown'] as const
export const ERECTION_ICON = ['', '🏢', '🏡', '🏭'] as const

function city(id: number, name: string, landmark: string, group: GroupId, price: number, rents: [number, number, number, number], build: number): PropertyTile {
  return {
    id,
    type: 'PROPERTY',
    kind: 'SITE',
    name,
    landmark,
    group,
    color: GROUP_INFO[group].color,
    partnerId: null,
    basePrice: price,
    rentTable: rents,
    upgradeCost: build,
    maxLevel: 3,
    ownerId: null,
    level: 0,
    mortgaged: false,
  }
}

function company(id: number, name: string, color: string, price: number, alone: number, withPartner: number, partnerId: number): PropertyTile {
  return {
    id,
    type: 'PROPERTY',
    kind: 'COMPANY',
    name,
    landmark: 'Company',
    group: null,
    color,
    partnerId,
    basePrice: price,
    rentTable: [alone, withPartner],
    upgradeCost: 0,
    maxLevel: 0,
    ownerId: null,
    level: 0,
    mortgaged: false,
  }
}

const simple = (id: number, type: SimpleTileType, name: string): SimpleTile => ({ id, type, name })

/** The 36 squares, clockwise from START (bottom-left corner of the board art). */
export function buildBoard(): CityTile[] {
  return [
    simple(0, 'GO', 'Start'),
    simple(1, 'TREASURY', 'Treasury'),
    city(2, 'London', 'Big Ben', 'BLUE', 4500, [550, 1400, 2550, 3850], 3000),
    city(3, 'Rome', 'Colosseum', 'BLUE', 1500, [175, 450, 850, 1300], 3000),
    city(4, 'Istanbul', 'Hagia Sophia', 'BLUE', 2500, [300, 800, 1400, 2150], 3000),
    simple(5, 'TAX', 'Income Tax'),
    city(6, 'Madrid', 'Royal Palace', 'PINK', 3000, [350, 950, 1700, 2600], 2500),
    simple(7, 'CHANCE', 'Chance'),
    city(8, 'Amsterdam', 'Canal Ring', 'PINK', 2000, [250, 600, 1150, 1700], 2500),
    simple(9, 'JAIL', 'Jail'),
    city(10, 'Vienna', 'Schönbrunn Palace', 'PURPLE', 2300, [275, 700, 1300, 2000], 2500),
    city(11, 'Zurich', 'Lake Zurich', 'PURPLE', 2700, [325, 850, 1550, 2300], 2500),
    company(12, 'Cruise Line', '#1f6391', 7000, 800, 1600, 31),
    city(13, 'Cape Town', 'Table Mountain', 'PURPLE', 1500, [175, 450, 850, 1300], 2500),
    company(14, 'Postal Service', '#c0790f', 2000, 300, 800, 24),
    city(15, 'Singapore', 'Marina Bay', 'GREEN', 2500, [300, 800, 1400, 2150], 4000),
    city(16, 'Sydney', 'Opera House', 'GREEN', 4000, [475, 1250, 2300, 3450], 4000),
    city(17, 'Dubai', 'Burj Khalifa', 'GREEN', 3500, [425, 1100, 2000, 3000], 4000),
    simple(18, 'CASINO', 'Casino'),
    city(19, 'New York', 'Statue of Liberty', 'RED', 5000, [600, 1550, 2850, 4300], 4000),
    simple(20, 'CHANCE', 'Chance'),
    city(21, 'Athens', 'Acropolis', 'RED', 2500, [300, 800, 1400, 2150], 4000),
    city(22, 'Prague', 'Charles Bridge', 'RED', 2000, [250, 600, 1150, 1700], 4000),
    company(23, 'Transport Co.', '#6d1f2b', 4000, 600, 1200, 33),
    company(24, 'Radio Station', '#5b2c6f', 2000, 300, 800, 14),
    city(25, 'Lisbon', 'Belém Tower', 'YELLOW', 1700, [200, 550, 950, 1450], 1500),
    city(26, 'Nairobi', 'National Park', 'YELLOW', 1500, [175, 450, 850, 1300], 1500),
    simple(27, 'CLUB', 'Grand Club'),
    simple(28, 'TREASURY', 'Treasury'),
    city(29, 'Toronto', 'CN Tower', 'TEAL', 2500, [300, 800, 1400, 2150], 3500),
    city(30, 'Hong Kong', 'Victoria Harbour', 'TEAL', 4000, [475, 1250, 2300, 3450], 3500),
    company(31, 'Airport', '#c0392b', 5000, 700, 1500, 12),
    simple(32, 'TAX', 'Sales Tax'),
    company(33, 'Railway', '#7b3f00', 7000, 1000, 2000, 23),
    city(34, 'Berlin', 'Brandenburg Gate', 'ORANGE', 3500, [425, 1100, 2000, 3000], 3000),
    city(35, 'Budapest', 'Parliament', 'ORANGE', 1600, [200, 500, 900, 1400], 3000),
  ]
}

export const TILE_ICON: Record<string, string> = {
  Start: '🏁',
  Treasury: '💰',
  Chance: '❓',
  'Income Tax': '🧾',
  'Sales Tax': '🧾',
  Jail: '🚔',
  Casino: '🎰',
  'Grand Club': '👑',
  'Cruise Line': '🛳️',
  'Postal Service': '✉️',
  'Transport Co.': '🚚',
  'Radio Station': '📡',
  Airport: '✈️',
  Railway: '🚆',
}

/* ------------------------------------------------------------------ rules helpers */

export function isProperty(t: CityTile | undefined): t is PropertyTile {
  return t?.type === 'PROPERTY'
}

export function mortgageValue(tile: PropertyTile): number {
  return Math.round(tile.basePrice / 2)
}

/** Lifting a mortgage costs the mortgage plus 10% interest (none in Kids Mode). */
export function redeemCost(tile: PropertyTile, interest = 0.1): number {
  return Math.round(mortgageValue(tile) * (1 + interest))
}

export function groupOf(tiles: CityTile[], tile: PropertyTile): PropertyTile[] {
  if (!tile.group) return [tile]
  return tiles.filter((t): t is PropertyTile => isProperty(t) && t.group === tile.group)
}

export function ownsFullGroup(tiles: CityTile[], tile: PropertyTile): boolean {
  return tile.kind === 'SITE' && tile.ownerId !== null && groupOf(tiles, tile).every((t) => t.ownerId === tile.ownerId)
}

export function ownsPartner(tiles: CityTile[], tile: PropertyTile): boolean {
  if (tile.partnerId === null || tile.ownerId === null) return false
  const partner = tiles[tile.partnerId]
  return isProperty(partner) && partner.ownerId === tile.ownerId
}

export function groupHasBuildings(tiles: CityTile[], tile: PropertyTile): boolean {
  return groupOf(tiles, tile).some((t) => t.level > 0)
}

/** Why a city can't take its next building right now, or null if it can (cash aside). */
export function buildBlocker(tiles: CityTile[], tile: PropertyTile, evenBuild = true): string | null {
  if (tile.kind === 'COMPANY') return 'Company'
  if (tile.level >= tile.maxLevel) return 'Godown built'
  if (!ownsFullGroup(tiles, tile)) return 'Need full set'
  if (groupOf(tiles, tile).some((t) => t.mortgaged)) return 'Set mortgaged'
  if (evenBuild && tile.level > Math.min(...groupOf(tiles, tile).map((t) => t.level))) return 'Build evenly'
  return null
}

/** Why a building can't be sold from this city right now, or null if it can. */
export function sellBlocker(tiles: CityTile[], tile: PropertyTile, evenBuild = true): string | null {
  if (tile.level === 0) return 'No building'
  if (evenBuild && tile.level < Math.max(...groupOf(tiles, tile).map((t) => t.level))) return 'Sell evenly'
  return null
}

/** Why a deed can't be mortgaged right now, or null if it can. */
export function mortgageBlocker(tiles: CityTile[], tile: PropertyTile): string | null {
  if (tile.mortgaged) return 'Mortgaged'
  if (tile.kind === 'SITE' && groupHasBuildings(tiles, tile)) return 'Sell buildings first'
  return null
}

/* ------------------------------------------------------------------ Chance and Treasury */

export type CardAction =
  | { kind: 'cash'; amount: number } // + from the Bank, - into the Grand Club pot
  | { kind: 'payBank'; amount: number }
  | { kind: 'perBuilding'; amount: number } // to the Bank
  | { kind: 'fromEach'; amount: number }
  | { kind: 'toEach'; amount: number }
  | { kind: 'jail' }
  | { kind: 'freePass' }
  | { kind: 'moveTo'; tileId: number }
  | { kind: 'back'; steps: number }

export type Deck = 'CHANCE' | 'TREASURY'

export interface CardDef {
  id: string
  deck: Deck
  text: string
  action: CardAction
}

const card = (deck: Deck, n: number, text: string, action: CardAction): CardDef => ({ id: `${deck === 'CHANCE' ? 'c' : 't'}${n}`, deck, text, action })

export const CHANCE_CARDS: CardDef[] = [
  card('CHANCE', 1, 'Collect $800 lottery prize.', { kind: 'cash', amount: 800 }),
  card('CHANCE', 2, 'Go to Jail. Do not pass START.', { kind: 'jail' }),
  card('CHANCE', 3, 'Advance to START. Collect $1000.', { kind: 'moveTo', tileId: START_TILE_ID }),
  card('CHANCE', 4, 'Earthquake repairs: pay $1000 to the Bank for each building you own.', { kind: 'perBuilding', amount: 1000 }),
  card('CHANCE', 5, 'Pay $200 hospital bill.', { kind: 'cash', amount: -200 }),
  card('CHANCE', 6, 'Collect $2000 from the Bank for an accident claim.', { kind: 'cash', amount: 2000 }),
  card('CHANCE', 7, 'Your grandfather leaves you $2500.', { kind: 'cash', amount: 2500 }),
  card('CHANCE', 8, 'Pay $2200 fine for disturbing the neighbourhood.', { kind: 'cash', amount: -2200 }),
  card('CHANCE', 9, 'Collect $1000 first prize at the Business Awards.', { kind: 'cash', amount: 1000 }),
  card('CHANCE', 10, 'Collect $1500 for winning the football match.', { kind: 'cash', amount: 1500 }),
  card('CHANCE', 11, 'Advance to the Casino. You may place a bet.', { kind: 'moveTo', tileId: CASINO_TILE_ID }),
  card('CHANCE', 12, 'Advance to London. If you pass START, collect $1000.', { kind: 'moveTo', tileId: LONDON_TILE_ID }),
  card('CHANCE', 13, 'Your app goes viral! Collect $2000.', { kind: 'cash', amount: 2000 }),
  card('CHANCE', 14, 'Get Out of Jail Free. Keep this card until needed.', { kind: 'freePass' }),
  card('CHANCE', 15, 'It is your birthday! Collect $200 from every player.', { kind: 'fromEach', amount: 200 }),
  card('CHANCE', 16, 'Go back 3 spaces.', { kind: 'back', steps: 3 }),
]

export const TREASURY_CARDS: CardDef[] = [
  card('TREASURY', 1, 'Income tax penalty: pay $750.', { kind: 'cash', amount: -750 }),
  card('TREASURY', 2, 'Sales tax refund: collect $650.', { kind: 'cash', amount: 650 }),
  card('TREASURY', 3, 'Pay $800 insurance premium.', { kind: 'cash', amount: -800 }),
  card('TREASURY', 4, 'Pay $250 for false evidence in court.', { kind: 'cash', amount: -250 }),
  card('TREASURY', 5, 'Collect $1000 for railway damage claim.', { kind: 'cash', amount: 1000 }),
  card('TREASURY', 6, 'Collect $750 interest on savings.', { kind: 'cash', amount: 750 }),
  card('TREASURY', 7, 'Pay $500 for city festival decorations.', { kind: 'cash', amount: -500 }),
  card('TREASURY', 8, 'Pay $100 to each player for a party.', { kind: 'toEach', amount: 100 }),
  card('TREASURY', 9, 'Bank error in your favour. Collect $2000.', { kind: 'cash', amount: 2000 }),
  card('TREASURY', 10, 'Get Out of Jail Free. Keep this card until needed.', { kind: 'freePass' }),
  card('TREASURY', 11, 'Pay $500 school fees.', { kind: 'cash', amount: -500 }),
  card('TREASURY', 12, 'Collect $1500 from selling shares.', { kind: 'cash', amount: 1500 }),
  card('TREASURY', 13, 'Collect $500 consultancy fee.', { kind: 'cash', amount: 500 }),
  card('TREASURY', 14, 'Advance to the Grand Club and collect the pot.', { kind: 'moveTo', tileId: CLUB_TILE_ID }),
  card('TREASURY', 15, 'Pay $400 car repair.', { kind: 'cash', amount: -400 }),
  card('TREASURY', 16, 'Your holiday fund matures: collect $300.', { kind: 'cash', amount: 300 }),
]

export const ALL_CARDS: Record<string, CardDef> = Object.fromEntries([...CHANCE_CARDS, ...TREASURY_CARDS].map((c) => [c.id, c]))

/* ------------------------------------------------------------------ variants */

export type VariantId = 'CLASSIC' | 'FAST' | 'CASINO_NIGHT' | 'KIDS'

export interface CityConfig {
  variant: VariantId
  startingCash: number
  goBonus: number
  /** Every site in a group needs an Office before any gets a Bungalow, and so on. */
  evenBuild: boolean
  /** Multiplier on the printed cost of each erection. */
  buildCostFactor: number
  /** Interest charged on lifting a mortgage. */
  mortgageInterest: number
  casinoEnabled: boolean
  casinoBet: number
  /** Extra paid on a roll of 5 (besides the bet back). */
  casinoFivePays: number
  casinoJackpotStart: number
  /** Bank's bonus on top of the tray on a jackpot. */
  casinoJackpotBonus: number
  jailFine: number
  jailTurns: number
  taxPerSite: number
  taxCap: number
  clubEmptyGift: number
  auctionOpening: number
  /** Double sixes in a row that send you to Jail. */
  doublesToJail: number
  /** Digital safety net: after this many rounds the richest player wins. */
  maxRounds: number
}

const CLASSIC: CityConfig = {
  variant: 'CLASSIC',
  startingCash: 25000,
  goBonus: 1000,
  evenBuild: true,
  buildCostFactor: 1,
  mortgageInterest: 0.1,
  casinoEnabled: true,
  casinoBet: 1000,
  casinoFivePays: 0,
  casinoJackpotStart: 2000,
  casinoJackpotBonus: 1000,
  jailFine: 500,
  jailTurns: 3,
  taxPerSite: 50,
  taxCap: 500,
  clubEmptyGift: 500,
  auctionOpening: 100,
  doublesToJail: 3,
  maxRounds: 100,
}

export const VARIANTS: Record<VariantId, { name: string; blurb: string; config: CityConfig }> = {
  CLASSIC: { name: 'Classic', blurb: '$25,000 each, START pays $1000. Last player in business wins.', config: CLASSIC },
  FAST: {
    name: 'Fast Game',
    blurb: 'About 45 minutes: $15,000 each, START pays $2000, build without the even-build rule.',
    config: { ...CLASSIC, variant: 'FAST', startingCash: 15000, goBonus: 2000, evenBuild: false, maxRounds: 50 },
  },
  CASINO_NIGHT: {
    name: 'Casino Night',
    blurb: 'The Casino bet is $2000, and a roll of 5 also pays $1000.',
    config: { ...CLASSIC, variant: 'CASINO_NIGHT', casinoBet: 2000, casinoFivePays: 1000 },
  },
  KIDS: {
    name: 'Kids Mode',
    blurb: 'No Casino bets, no mortgage interest, and buildings cost half.',
    config: { ...CLASSIC, variant: 'KIDS', casinoEnabled: false, mortgageInterest: 0, buildCostFactor: 0.5 },
  },
}

export function buildCost(tile: PropertyTile, config: CityConfig): number {
  return Math.round(tile.upgradeCost * config.buildCostFactor)
}
