import chipsBlue from '../ui/art/chips_blue.webp'
import chipsRed from '../ui/art/chips_red.webp'
import chipsGold from '../ui/art/chips_gold.webp'
import chipsPurple from '../ui/art/chips_purple.webp'

export * from './cosmetics'

/** Free points grants shown on the Chips tab (layout of the reference shop, with no prices). */
export interface FreeGrant {
  id: 'daily' | 'ad' | 'missions' | 'level'
  amount: number
  title: string
  art: string
  popular?: boolean
}

export const FREE_GRANTS: FreeGrant[] = [
  { id: 'daily', amount: 2000, title: 'Daily Bonus', art: chipsBlue },
  { id: 'ad', amount: 1000, title: 'Watch & Earn', art: chipsRed, popular: true },
  { id: 'missions', amount: 10000, title: 'Daily Missions', art: chipsGold },
  { id: 'level', amount: 25000, title: 'Level-Up Bonus', art: chipsPurple },
]

