export type PropertyCategory = 'OFFICE' | 'RESTAURANT' | 'HOTEL' | 'CINEMA' | 'MALL' | 'STORE' | 'FACTORY'

export interface PropertyTile {
  id: number
  type: 'PROPERTY'
  name: string
  category: PropertyCategory
  basePrice: number
  rentTable: number[] // length 5, index = upgrade level 0..4
  upgradeCost: number
  maxLevel: number
  ownerId: string | null
  level: number
}

export type SimpleTileType = 'PARK' | 'CHANCE' | 'COMMUNITY' | 'GO' | 'JAIL' | 'TAX' | 'EVENT' | 'GO_TO_JAIL'

export interface SimpleTile {
  id: number
  type: SimpleTileType
  name: string
  amount?: number // for TAX
}

export type CityTile = PropertyTile | SimpleTile

interface CategoryInfo {
  basePrice: number
  baseRent: number
  upgradeCost: number
}

export const CATEGORY_INFO: Record<PropertyCategory, CategoryInfo> = {
  STORE: { basePrice: 60, baseRent: 12, upgradeCost: 40 },
  RESTAURANT: { basePrice: 90, baseRent: 16, upgradeCost: 60 },
  CINEMA: { basePrice: 120, baseRent: 20, upgradeCost: 80 },
  FACTORY: { basePrice: 140, baseRent: 24, upgradeCost: 90 },
  OFFICE: { basePrice: 160, baseRent: 28, upgradeCost: 110 },
  MALL: { basePrice: 180, baseRent: 32, upgradeCost: 130 },
  HOTEL: { basePrice: 220, baseRent: 40, upgradeCost: 150 },
}

export const CATEGORY_ICON: Record<PropertyCategory, string> = {
  OFFICE: '🏢',
  RESTAURANT: '🍔',
  HOTEL: '🏨',
  CINEMA: '🎬',
  MALL: '🛍️',
  STORE: '🏪',
  FACTORY: '🏭',
}

function rentTableFor(basePrice: number): number[] {
  const baseRent = Math.max(8, Math.round(basePrice * 0.16))
  return [baseRent, baseRent * 2, baseRent * 4, baseRent * 8, baseRent * 16]
}

function property(id: number, name: string, category: PropertyCategory, customPrice?: number): PropertyTile {
  const info = CATEGORY_INFO[category]
  const basePrice = customPrice ?? info.basePrice
  return {
    id,
    type: 'PROPERTY',
    name,
    category,
    basePrice,
    rentTable: rentTableFor(basePrice),
    upgradeCost: Math.round(basePrice * 0.65),
    maxLevel: 4,
    ownerId: null,
    level: 0,
  }
}

function simple(id: number, type: SimpleTileType, name: string, amount?: number): SimpleTile {
  return { id, type, name, amount }
}

export function buildBoard(): CityTile[] {
  // The ALPHAZOX board: GO bottom-left, then left-to-right along the bottom, up the right side,
  // right-to-left along the top and down the left side (27 tiles, laid out like the reference art).
  return [
    simple(0, 'GO', 'Go'),
    property(1, 'Los Angeles', 'STORE', 60),
    property(2, 'Las Vegas', 'CINEMA', 50),
    property(3, 'Miami', 'RESTAURANT', 40),
    simple(4, 'CHANCE', 'Chance'),
    property(5, 'Chicago', 'OFFICE', 30),
    property(6, 'Mumbai', 'STORE', 20),
    property(7, 'Sydney', 'FACTORY', 100),

    simple(8, 'JAIL', 'Just Visiting'),
    simple(9, 'COMMUNITY', 'Community Chest'),
    property(10, 'Hong Kong', 'MALL', 110),
    property(11, 'Bangkok', 'RESTAURANT', 120),
    property(12, 'Singapore', 'OFFICE', 130),
    property(13, 'Dubai', 'HOTEL', 140),

    simple(14, 'PARK', 'Free Parking'),
    property(15, 'Tokyo', 'CINEMA', 150),
    property(16, 'Berlin', 'STORE', 160),
    simple(17, 'CHANCE', 'Chance'),
    property(18, 'Paris', 'MALL', 180),
    property(19, 'London', 'OFFICE', 200),
    property(20, 'New York', 'HOTEL', 220),

    simple(21, 'GO_TO_JAIL', 'Go to Jail'),
    property(22, 'Bali', 'RESTAURANT', 60),
    property(23, 'Seoul', 'CINEMA', 70),
    simple(24, 'COMMUNITY', 'Community Chest'),
    property(25, 'Shanghai', 'FACTORY', 80),
    property(26, 'Cairo', 'STORE', 90),
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

export const JAIL_TILE_ID = 8

export const CHANCE_CARDS: CardEffect[] = [
  { id: 'c1', text: 'Investment pays off! +200 coins', cashDelta: 200 },
  { id: 'c2', text: 'Parking fine. -80 coins', cashDelta: -80 },
  { id: 'c3', text: 'Advance to Go, collect 200', moveTo: 0, cashDelta: 200 },
  { id: 'c4', text: 'Consulting fee. +120 coins', cashDelta: 120 },
  { id: 'c5', text: 'Caught speeding — go to Jail!', moveTo: JAIL_TILE_ID, sendToJail: true },
  { id: 'c6', text: 'Special card: take a free flight to any city! +100 coins travel bonus', cashDelta: 100 },
]

export const COMMUNITY_CARDS: CardEffect[] = [
  { id: 'm1', text: 'Community grant. +150 coins', cashDelta: 150 },
  { id: 'm2', text: 'Repair costs. -100 coins', cashDelta: -100 },
  { id: 'm3', text: 'Tax refund! +100 coins', cashDelta: 100 },
  { id: 'm4', text: 'Charity drive. -60 coins', cashDelta: -60 },
]

export const CATEGORY_TINT: Record<PropertyCategory, string> = {
  OFFICE: '#0ea5e9',
  RESTAURANT: '#f97316',
  HOTEL: '#8b5cf6',
  CINEMA: '#ec4899',
  MALL: '#ef4444',
  STORE: '#22c55e',
  FACTORY: '#eab308',
}
