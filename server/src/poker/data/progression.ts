/* Levels, missions and achievements: shared by the app and the game server. */

export const xpForLevel = (level: number) => 400 * level + 200
export function levelInfo(xp: number) {
  let level = 1
  let rest = xp
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level)
    level++
  }
  return { level, xp: rest, need: xpForLevel(level) }
}

export const STARTER_POINTS = 25000
export const DAILY_POINTS = 2000
export const AD_POINTS = 1000
export const ADS_PER_DAY = 5


export interface Mission {
  id: string
  title: string
  goal: number
  reward: number
}

export const MISSIONS: Mission[] = [
  { id: 'play10', title: 'Play 10 hands', goal: 10, reward: 1500 },
  { id: 'win3', title: 'Win 3 hands', goal: 3, reward: 2000 },
  { id: 'showdown', title: 'Win a showdown', goal: 1, reward: 1500 },
  { id: 'tourney', title: 'Play a tournament', goal: 1, reward: 3000 },
  { id: 'friends', title: 'Play a hand with friends', goal: 1, reward: 2000 },
]

export interface AchievementDef {
  id: string
  name: string
  description: string
  art: 'star' | 'blue' | 'pro'
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'poker-star', name: 'Poker Star', description: 'Win 25 hands.', art: 'star' },
  { id: 'big-winner', name: 'Big Winner', description: 'Win a pot of 50,000 points or more.', art: 'blue' },
  { id: 'tournament-pro', name: 'Tournament Pro', description: 'Finish in the prizes of a tournament.', art: 'pro' },
  { id: 'royal', name: 'Royal Flush', description: 'Make a royal flush.', art: 'star' },
  { id: 'regular', name: 'Club Regular', description: 'Play 500 hands.', art: 'blue' },
  { id: 'champion', name: 'Champion', description: 'Win a tournament.', art: 'pro' },
]

