import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UserPlus, Users, X } from 'lucide-react'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { getGame } from '@/games/registry'
import { Avatar } from './ui'

function Toast({ icon, title, body, accept, acceptLabel, decline, accent = '#7c5cff' }: {
  icon: React.ReactNode
  title: string
  body: string
  accept: () => void
  acceptLabel: string
  decline: () => void
  accent?: string
}) {
  return (
    <div
      className="toast-in pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-3xl border border-white/10 bg-surface-1/95 p-3 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      style={{ boxShadow: `0 0 0 1px ${accent}55, 0 20px 50px -12px rgba(0,0,0,0.9)` }}
      role="alert"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-white">{title}</p>
        <p className="truncate text-xs text-slate-400">{body}</p>
      </div>
      <button type="button" onClick={accept} className="shrink-0 rounded-full px-3.5 py-2 text-xs font-black text-white active:scale-95" style={{ background: accent }}>
        {acceptLabel}
      </button>
      <button type="button" onClick={decline} aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
        <X size={15} />
      </button>
    </div>
  )
}

/** Party invites, "come play" calls and friend requests, shown over any screen (games included). */
export default function SocialToasts() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const invite = usePartyStore((s) => s.invites[0])
  const call = usePartyStore((s) => s.gameCall)
  const acceptInvite = usePartyStore((s) => s.acceptInvite)
  const declineInvite = usePartyStore((s) => s.declineInvite)
  const dismissGameCall = usePartyStore((s) => s.dismissGameCall)
  const request = useFriendsStore((s) => s.requests[0])
  const acceptRequest = useFriendsStore((s) => s.acceptRequest)
  const declineRequest = useFriendsStore((s) => s.declineRequest)

  // game calls go stale after a couple of minutes
  useEffect(() => {
    if (!call) return
    const t = setTimeout(dismissGameCall, Math.max(0, 120000 - (Date.now() - call.at)))
    return () => clearTimeout(t)
  }, [call, dismissGameCall])

  const game = call ? getGame(call.gameId) : undefined
  const onChatList = pathname === '/chat'

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
      {call && game && (
        <Toast
          accent={game.accentHex}
          icon={<img src={`/posters/${game.id}.webp`} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />}
          title={`${call.fromName} wants to play ${game.name}`}
          body={call.roomCode ? `Room ${call.roomCode} is open — jump in!` : 'Your party is heading in.'}
          acceptLabel="Join"
          accept={() => {
            dismissGameCall()
            navigate(`/games/${game.id}/play${call.roomCode ? `?room=${call.roomCode}&join=1` : ''}`)
          }}
          decline={dismissGameCall}
        />
      )}
      {invite && (
        <Toast
          icon={
            <span className="relative">
              <Avatar emoji={invite.fromEmoji} size="md" />
              <Users size={14} className="absolute -bottom-1 -right-1 rounded-full bg-brand p-0.5 text-white" />
            </span>
          }
          title={`${invite.fromName} invited you`}
          body="Join their party to chat, talk and play"
          acceptLabel="Join"
          accept={() => void acceptInvite(invite.partyId)}
          decline={() => declineInvite(invite.partyId)}
        />
      )}
      {request && !invite && !call && !onChatList && (
        <Toast
          accent="#0891b2"
          icon={
            <span className="relative">
              <Avatar emoji={request.avatarEmoji} size="md" />
              <UserPlus size={14} className="absolute -bottom-1 -right-1 rounded-full bg-cyan-600 p-0.5 text-white" />
            </span>
          }
          title={`${request.name} wants to be friends`}
          body="Accept to chat and play together"
          acceptLabel="Accept"
          accept={() => acceptRequest(request.id)}
          decline={() => declineRequest(request.id)}
        />
      )}
    </div>
  )
}
