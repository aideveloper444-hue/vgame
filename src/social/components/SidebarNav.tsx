import { NavLink } from 'react-router-dom'
import { Tent, ShoppingBag } from 'lucide-react'
import { NAV_ITEMS } from './navItems'
import { Badge, useChatTabBadge } from './ui'

export default function SidebarNav() {
  const chatBadge = useChatTabBadge()
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col gap-1 border-r border-border-soft bg-surface-1 p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 font-black text-white">
          V
        </div>
        <span className="text-lg font-bold tracking-tight">VIBO</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand/15 text-white ring-1 ring-brand/40'
                  : 'text-slate-400 hover:bg-surface-2 hover:text-slate-100'
              }`
            }
          >
            <item.icon size={19} />
            <span className="flex-1">{item.label}</span>
            {item.badge === 'chat' && <Badge count={chatBadge} />}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-border-soft pt-3">
        <NavLink
          to="/rewards"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand/15 text-white' : 'text-slate-400 hover:bg-surface-2 hover:text-slate-100'
            }`
          }
        >
          <Tent size={19} />
          Rewards
        </NavLink>
        <NavLink
          to="/premium"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand/15 text-white' : 'text-slate-400 hover:bg-surface-2 hover:text-slate-100'
            }`
          }
        >
          <ShoppingBag size={19} />
          Store / Alpha Pass
        </NavLink>
      </div>
    </aside>
  )
}
