import type { BotStyle } from '../engine/bot'

/* The club's computer regulars and tournament field names (no images, so the server can use them too). */

export const PORTRAIT_KEYS = ['akash', 'rohit', 'queens', 'gamestar', 'rahul', 'queensara', 'pokerking', 'vikram'] as const
export type PortraitKey = (typeof PORTRAIT_KEYS)[number]

export interface Regular {
  name: string
  avatar: PortraitKey
  style: BotStyle
  level: number
}

/** The club's computer regulars. They fill tables, tournaments and the friends screen's "play with" list. */
export const REGULARS: Regular[] = [
  { name: 'Rohit24', avatar: 'rohit', style: 'aggressive', level: 18 },
  { name: 'QueenS', avatar: 'queens', style: 'tight', level: 22 },
  { name: 'GameStar', avatar: 'gamestar', style: 'loose', level: 9 },
  { name: 'Rahul007', avatar: 'rahul', style: 'balanced', level: 14 },
  { name: 'QueenSara', avatar: 'queensara', style: 'tight', level: 11 },
  { name: 'PokerKing', avatar: 'pokerking', style: 'aggressive', level: 27 },
  { name: 'Vikram', avatar: 'vikram', style: 'balanced', level: 16 },
]

const FIELD_NAMES = ['AceArjun', 'PriyaRiver', 'KingKabir', 'NinaNuts', 'Dev_88', 'IshaAllIn', 'RaviRoyal', 'MeeraFlush', 'Zoya7', 'KaranKicker', 'AnanyaAce', 'SamCheck', 'TaraTurn', 'NeelBluff', 'Ritu_QQ', 'OmarOdds']

/** A computer opponent for tournament fields, reusing the regulars' portraits. */
export function fieldPlayer(n: number): Regular {
  const base = REGULARS[n % REGULARS.length]
  const styles: BotStyle[] = ['tight', 'loose', 'aggressive', 'balanced']
  return { name: FIELD_NAMES[n % FIELD_NAMES.length] + (n >= FIELD_NAMES.length ? Math.floor(n / FIELD_NAMES.length) : ''), avatar: base.avatar, style: styles[n % 4], level: 5 + (n * 7) % 25 }
}
