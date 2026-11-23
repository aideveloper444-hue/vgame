import type { LucideIcon } from 'lucide-react'
import { Dices, Building2 } from 'lucide-react'

export type GameId = 'ludo' | 'city'

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
    name: 'World Tycoon',
    tagline: 'Buy · Build · Bank the world',
    description: 'Fly around the world, buy famous cities, build Offices, Bungalows and Godowns, win the Grand Club pot and gamble for the Casino jackpot.',
    playersLabel: '2–4 Players',
    minPlayers: 2,
    maxPlayers: 4,
    difficulty: 'Medium',
    accentVar: '--color-city-accent',
    accentHex: '#10b981',
    icon: Building2,
    route: 'city',
    howToPlay: [
      'Everyone starts with $25,000. Roll two dice and move clockwise; passing START pays $1000. Double six rolls again, three in a row is Jail.',
      'Buy unowned cities and companies at the printed price, or the Bank auctions them from $100. Owners collect the rent on the deed.',
      'Own a whole colour to double its site rent, then build an Office, Bungalow and Godown evenly. Companies earn more with their partner.',
      'Taxes and fines fill the Grand Club pot: land on the Grand Club to win it. At the Casino, bet $1000 and roll a 6 for the jackpot.',
      'Short of cash? Sell buildings for half and mortgage deeds for half the price (10% to lift). Last tycoon in business wins.',
    ],
    rewardsBlurb: 'Coins and XP for every game, more for the winner.',
    singlePlayerCapable: true,
  },
}

export const GAME_LIST: GameDefinition[] = Object.values(GAME_REGISTRY)

export function getGame(id: string | undefined): GameDefinition | undefined {
  if (!id) return undefined
  return GAME_REGISTRY[id as GameId]
}
