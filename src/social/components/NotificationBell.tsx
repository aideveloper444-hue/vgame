import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useNotificationStore } from '@/social/stores/useNotificationStore'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const unread = notifications.filter((n) => !n.read).length
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function handleSelect(id: string, deepLink: { screen: string; conversationId?: string }) {
    markRead(id)
    setOpen(false)
    if (deepLink.screen === 'chat') navigate(`/chat${deepLink.conversationId ? `/${deepLink.conversationId}` : ''}`)
    else if (deepLink.screen === 'friends') navigate('/chat?tab=friends')
    else if (deepLink.screen === 'me') navigate('/profile')
    else navigate(`/${deepLink.screen}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-surface-3"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute -right-2 z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl glass-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <button onClick={markAllRead} className="text-xs text-brand-2 hover:underline">
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="p-4 text-sm text-slate-400">No notifications yet</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleSelect(n.id, n.deepLink)}
                className={`flex w-full items-start gap-3 border-b border-border-soft/60 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                  n.read ? 'opacity-60' : ''
                }`}
              >
                <span className="text-lg">{n.icon}</span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="block text-xs text-slate-400">{n.body}</span>
                </span>
                {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-2" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
