import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, MicOff, X } from 'lucide-react'
import { useChatStore, totalUnread } from '@/social/stores/useChatStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { usePartyStore } from '@/social/stores/usePartyStore'

const SIZES = { xs: 'h-7 w-7 text-sm', sm: 'h-9 w-9 text-lg', md: 'h-11 w-11 text-xl', lg: 'h-16 w-16 text-3xl', xl: 'h-24 w-24 text-5xl' }

/** Emoji avatar with optional online dot, speaking ring and muted badge. */
export function Avatar({
  emoji,
  size = 'md',
  online,
  speaking,
  muted,
  ring,
  className = '',
}: {
  emoji: string
  size?: keyof typeof SIZES
  online?: boolean
  speaking?: boolean
  muted?: boolean
  ring?: string
  className?: string
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span
        className={`flex items-center justify-center rounded-full bg-gradient-to-br from-surface-3 to-surface-2 ${SIZES[size]} ${speaking ? 'speaking-ring text-emerald-400' : ''}`}
        style={{ boxShadow: speaking ? '0 0 0 2.5px #34d399' : ring ? `0 0 0 2px ${ring}` : 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
      >
        <span className="leading-none text-white">{emoji}</span>
      </span>
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface-1 ${online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      )}
      {muted && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white ring-2 ring-surface-1">
          <MicOff size={9} strokeWidth={3} />
        </span>
      )}
    </span>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-extrabold tracking-tight text-white">{children}</h2>
      {action}
    </div>
  )
}

export function Card({ children, className = '', glow }: { children: ReactNode; className?: string; glow?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-surface-2/80 to-surface-1/90 ${className}`}
      style={glow ? { boxShadow: `0 18px 40px -24px ${glow}` } : undefined}
    >
      {children}
    </div>
  )
}

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="sheet-in relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/10 bg-surface-1 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold text-white">{title}</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Badge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-surface-1 ${className}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Unread chats plus friend requests and party invites waiting on the Chat tab. */
export function useChatTabBadge(): number {
  const unread = useChatStore((s) => totalUnread(s))
  const requests = useFriendsStore((s) => s.requests.length)
  const invites = usePartyStore((s) => s.invites.length)
  return unread + requests + invites
}

export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-[#9b7bff] px-4 py-3 text-sm font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(124,92,255,0.9)] transition-transform active:scale-[0.97] disabled:opacity-40'
export const BTN_SOFT =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm font-bold text-slate-100 ring-1 ring-white/10 transition-transform active:scale-[0.97] disabled:opacity-40'

/** Back to the previous screen, or Profile when the page was opened directly. */
export function BackButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/profile'))}
      aria-label="Back"
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white ring-1 ring-white/10 active:scale-90 ${className}`}
    >
      <ChevronLeft size={22} />
    </button>
  )
}
