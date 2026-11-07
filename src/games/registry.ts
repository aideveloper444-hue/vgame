import type { LucideIcon } from 'lucide-react'
import { Dices, Building2, Footprints, PawPrint, Sparkles, Spade, Trees } from 'lucide-react'

export type GameId = 'ludo' | 'city' | 'mess' | 'amazon' | 'mystery' | 'poker' | 'wildbound'

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
      'Roll and move around the city.',
      'Buy unowned properties or let them go to auction.',
      'Collect rent when others land on your properties.',
      'Grow the highest net worth before the game ends.',
    ],
    rewardsBlurb: 'Coins scale with your final net worth.',
    singlePlayerCapable: true,
  },
  mess: {
    id: 'mess',
    name: 'Mess With My Friend',
    tagline: 'Race, sabotage and survive',
    description: 'Race to the finish while freezing, pushing and trapping everyone in your way.',
    playersLabel: '4 Players',
    minPlayers: 4,
    maxPlayers: 4,
    difficulty: 'Medium',
    accentVar: '--color-mess-accent',
    accentHex: '#f59e0b',
    icon: Footprints,
    route: 'mess',
    howToPlay: [
      'Run forward automatically toward the finish.',
      'Use Freeze, Push, Reverse and Trap on your rivals.',
      'Watch for boost pads, traps and obstacles on the track.',
      'First to cross the finish line wins.',
    ],
    rewardsBlurb: 'Bonus coins for every rival you mess with.',
    singlePlayerCapable: true,
  },
  amazon: {
    id: 'amazon',
    name: 'Amazon Wild Run',
    tagline: 'Choose your beast. Become Alpha.',
    description: 'An endless run through the Amazon jungle. Pick your animal, then run solo, race the computer or race your friends online. Whoever runs the farthest is crowned Alpha.',
    playersLabel: '1–6 Players',
    minPlayers: 1,
    maxPlayers: 6,
    difficulty: 'Medium',
    accentVar: '--color-amazon-accent',
    accentHex: '#22c55e',
    icon: PawPrint,
    route: 'amazon',
    howToPlay: [
      'Pick your animal: wolf, hyena, leopard, cheetah, tiger, lion or black panther, each with its own speed, jump and stamina.',
      'Swipe left or right to change lanes and dodge boulders.',
      'Swipe up to jump fallen logs, swipe down to slide under hanging branches.',
      'Grab coins, shields and magnets. Run solo for your best distance, or race friends and rivals: the farthest runner becomes Alpha.',
    ],
    rewardsBlurb: 'Coins for every metre and coin you collect, plus a bonus for finishing as Alpha.',
    singlePlayerCapable: true,
  },
  mystery: {
    id: 'mystery',
    name: 'Mystery Wild',
    tagline: 'Investigate. Share clues. Solve it.',
    description: 'A body, a theft, a disappearance — every investigator holds different clues. Compare notes with your friends and crack the case together.',
    playersLabel: '1–4 Players',
    minPlayers: 1,
    maxPlayers: 4,
    difficulty: 'Medium',
    accentVar: '--color-mystery-accent',
    accentHex: '#8b5cf6',
    icon: Sparkles,
    route: 'mystery',
    howToPlay: [
      'Each investigator starts with their own private clues.',
      'Ask your fellow investigators to share what they know.',
      'Cross suspects, items and locations off the board as clues rule them out.',
      'Make your accusation — fewer guesses earns more stars.',
    ],
    rewardsBlurb: 'Stars unlock bonus coins on every case.',
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
