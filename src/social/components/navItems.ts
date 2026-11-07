import { Home, Gamepad2, MessageCircle, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: 'chat'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/chat', label: 'Chat', icon: MessageCircle, badge: 'chat' },
  { to: '/profile', label: 'Profile', icon: User },
]
