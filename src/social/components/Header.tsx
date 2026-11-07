import { Link, useLocation } from 'react-router-dom'
import { Gem } from 'lucide-react'
import { usePlayerStore, xpForLevel } from '@/social/stores/usePlayerStore'
import { useHub } from '@/net/hub'
import NotificationBell from './NotificationBell'
import { isImmersiveRoute } from './BottomNav'
import { Avatar } from './ui'

export default function Header() {
  const profile = usePlayerStore((s) => s.profile)
  const status = useHub((s) => s.status)
  const { pathname } = useLocation()
  if (isImmersiveRoute(pathname)) return null
  const need = xpForLevel(profile.level)
  const pct = Math.min(100, Math.round((profile.xp / need) * 100))

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-surface-0/80 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl md:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <Link to="/profile" className="flex min-w-0 items-center gap-2.5">
          <Avatar emoji={profile.avatarEmoji} size="sm" online={status === 'online'} />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold leading-tight text-white">{profile.name}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] font-black text-brand-2">LV {profile.level}</span>
              <span className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${pct}%` }} />
              </span>
            </div>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link to="/rewards" className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-[13px] font-extrabold text-white ring-1 ring-white/10">
            <span className="text-[13px]">🪙</span>
            {profile.coins.toLocaleString()}
          </Link>
          <Link to="/premium" className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-[13px] font-extrabold text-white ring-1 ring-white/10">
            <Gem size={13} className="text-gem" />
            {profile.gems.toLocaleString()}
          </Link>
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
