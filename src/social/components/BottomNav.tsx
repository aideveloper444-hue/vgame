import { NavLink, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from './navItems'
import { Badge, useChatTabBadge } from './ui'

/** Routes that fill the whole screen with their own controls. */
export function isImmersiveRoute(path: string): boolean {
  return /^\/games\/[^/]+\/play/.test(path) || /^\/chat\/[^/]+/.test(path)
}

export default function BottomNav() {
  const { pathname } = useLocation()
  const chatBadge = useChatTabBadge()
  if (isImmersiveRoute(pathname)) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 px-3 md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-md items-stretch gap-1 rounded-[26px] border border-white/10 bg-surface-1/85 p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] py-2 text-[11px] font-bold transition-all ${
                isActive ? 'bg-gradient-to-b from-brand/30 to-brand/10 text-white ring-1 ring-brand/40' : 'text-slate-400 active:scale-95'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <item.icon size={21} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-brand-2' : ''} />
                  {item.badge === 'chat' && <Badge count={chatBadge} className="absolute -right-3 -top-2" />}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
