import type { LucideIcon } from 'lucide-react'
import { Dices, Building2, Spade, Trees } from 'lucide-react'

export type GameId = 'ludo' | 'city' | 'poker' | 'wildbound'

export interface GameDefinition {
  id: GameId
  name: string
  tagline: string
  description: string
  playersLabel: string
  minPlayers: number
  maxPlayers: number
  difficulty: 'Easy' | 'Medium' | 'Hard'
  accentVar: string
  accentHex: string
  icon: LucideIcon
  route: string
  howToPlay: string[]
  rewardsBlurb: string
  singlePlayerCapable: boolean
}

export const GAME_REGISTRY: Record<GameId, GameDefinition> = {
  ludo: {
    id: 'ludo',
    name: 'Ludo',
    tagline: 'Classic strategy with friends',
    description: 'Roll, race and capture your way around the board in the classic four-player board game.',
    playersLabel: '2–6 Players',
    minPlayers: 2,
    maxPlayers: 6,
    difficulty: 'Easy',
    accentVar: '--color-ludo-accent',
    accentHex: '#ef4444',
    icon: Dices,
    route: 'ludo',
    howToPlay: [
      'Roll the dice on your turn.',
      'Roll a 6 to bring a token out of your base.',
      'Land on an opponent to send them back home.',
      'Get all 4 tokens to the center to win.',
    ],
    rewardsBlurb: 'Earn coins for every capture and bonus XP for a win.',
    singlePlayerCapable: true,
  },
  city: {
    id: 'city',
    name: 'City',
    tagline: 'Build your empire',
    description: 'Buy properties, build your empire and outplay your friends in this original city economy game.',
    playersLabel: '2–4 Players',
    minPlayers: 2,
    maxPlayers: 4,
    difficulty: 'Medium',
    accentVar: '--color-city-accent',
    accentHex: '#10b981',
    icon: Building2,
    route: 'city',
    howToPlay: [
      'Everyone starts with ₹25,000. Highest opening roll starts. Roll a 6 to roll again — three 6s in a row sends you to Jail.',
      'Buy cities and concerns (Airport, Steamer, Railway, Transport, Radio, Post Office), or pay ₹250 and the Bank auctions them.',
      'Own both concerns of a pair for higher rent. Taxes cost ₹50 per property; Merchant\'s Club and Milk Bar bills go to the other players.',
      'Own a whole colour set to double its rent, then build an office, bungalow and godown evenly.',
      'Short of cash? Erections sell back at half price and sites mortgage for 50% (10% interest to redeem).',
      'Jail: roll a 6 or pay the fine within 3 turns. Last player standing wins.',
    ],
    rewardsBlurb: 'Coins scale with your final net worth.',
    singlePlayerCapable: true,
  },
  poker: {
    id: 'poker',
    name: 'Royal Poker Club',
    tagline: 'Play · Win · Enjoy',
    description: 'Texas Hold’em with free points: practice, classic and VIP tables, free tournaments, and private rooms with your friends. 18+.',
    playersLabel: '2–6 Players',
    minPlayers: 2,
    maxPlayers: 6,
    difficulty: 'Medium',
    accentVar: '--color-poker-accent',
    accentHex: '#e9b33a',
    icon: Spade,
    route: 'poker',
    howToPlay: [
      'Make the best five-card hand from your two cards and the five on the table.',
      'Fold, check, call, bet or raise when it is your turn; you have 15 seconds.',
      'Win points at Classic and VIP tables, or play free tournaments for point prizes.',
      'Points are free: they can never be bought, sent to others or cashed out.',
    ],
    rewardsBlurb: 'Daily bonuses, missions and tournament prizes, all in free points.',
    singlePlayerCapable: true,
  },
  wildbound: {
    id: 'wildbound',
    name: 'Wildbound',
    tagline: 'Run · Explore · Survive',
    description: 'Deep Forest Run: race Sonic the Rottweiler and nine wild animals through dense forest, waterfall gorges, hilly trails, river crossings and ancient ruins.',
    playersLabel: '1 Player',
    minPlayers: 1,
    maxPlayers: 1,
    difficulty: 'Medium',
    accentVar: '--color-wildbound-accent',
    accentHex: '#f5a623',
    icon: Trees,
    route: 'wildbound',
    howToPlay: [
      'Swipe left or right to change lane, up to jump, down to slide.',
      'Tap ROLL to roll under low obstacles, and your ability button for your animal’s special power.',
      'Collect coins and gems, grab magnets, shields, speed and super jump power-ups.',
      'A new world every 100 m: forest, waterfall, hills, river and ruins.',
    ],
    rewardsBlurb: 'Coins and gems from every run, missions, daily rewards and the weekend Jungle Festival.',
    singlePlayerCapable: true,
  },
}

export const GAME_LIST: GameDefinition[] = Object.values(GAME_REGISTRY)

export function getGame(id: string | undefined): GameDefinition | undefined {
  if (!id) return undefined
  return GAME_REGISTRY[id as GameId]
}
