import { GiftIcon, HomeIcon, PokerIcon, ProfileIcon, ShopIcon } from './icons'
import { useNav, useRoute, type ScreenName } from '../state/nav'
import { pokerSfx } from './sound'

const ITEMS: { id: ScreenName; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'poker', label: 'Poker', Icon: PokerIcon },
  { id: 'shop', label: 'Shop', Icon: ShopIcon },
  { id: 'rewards', label: 'Rewards', Icon: GiftIcon },
  { id: 'profile', label: 'Profile', Icon: ProfileIcon },
]

/** The five-tab bar. Screens reached from a tab (friends, history…) keep that tab lit. */
const PARENT: Partial<Record<ScreenName, ScreenName>> = { friends: 'profile', history: 'profile', points: 'profile', settings: 'profile', achievements: 'profile', tournament: 'poker', room: 'poker', help: 'profile' }

export default function BottomNav() {
  const route = useRoute()
  const tab = useNav((s) => s.tab)
  const current = PARENT[route.name] ?? route.name
  return (
    <nav className="rpc-nav" aria-label="Main">
      {ITEMS.map(({ id, label, Icon }) => (
        <button key={id} aria-current={current === id ? 'page' : undefined} onClick={() => (pokerSfx.tap(), tab(id))}>
          <Icon size={30} />
          {label}
        </button>
      ))}
    </nav>
  )
}
