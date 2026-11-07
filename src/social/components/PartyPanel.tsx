import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Headphones, HeadphoneOff, Loader2, LogOut, MessageCircle, Mic, MicOff, PhoneOff, UserMinus, UserPlus, Users } from 'lucide-react'
import { usePartyStore, MAX_PARTY } from '@/social/stores/usePartyStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { useVoiceStore } from '@/social/stores/useVoiceStore'
import { useChatStore, PARTY_CONVERSATION } from '@/social/stores/useChatStore'
import { getGame } from '@/games/registry'
import { Avatar, Badge, BTN_PRIMARY, BTN_SOFT, Card, Sheet } from './ui'
import { MyFriendCode } from './FriendCode'
import { openReport } from './ReportSheet'

/** Join/leave voice plus mic and speaker toggles. */
export function VoiceControls({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const active = usePartyStore((s) => s.active)
  const { joined, joining, micMuted, deafened, error, joinVoice, leaveVoice, toggleMic, toggleDeafen } = useVoiceStore()
  if (!active) return null
  const btn = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'
  const icon = size === 'sm' ? 18 : 20

  if (!joined)
    return (
      <div>
        <button type="button" onClick={() => void joinVoice()} disabled={joining} className={`${BTN_PRIMARY} w-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_10px_24px_-10px_rgba(16,185,129,0.9)]`}>
          {joining ? <Loader2 size={18} className="animate-spin" /> : <Headphones size={18} />} {joining ? 'Connecting mic…' : 'Join voice chat'}
        </button>
        {error && <p className="mt-2 text-xs font-semibold text-rose-300">{error}</p>}
      </div>
    )

  return (
    <div className="flex items-center justify-center gap-2.5">
      <button
        type="button"
        onClick={() => toggleMic()}
        aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={micMuted}
        className={`${btn} flex items-center justify-center rounded-full transition-transform active:scale-90 ${micMuted ? 'bg-rose-500 text-white' : 'bg-white/10 text-white ring-1 ring-white/15'}`}
      >
        {micMuted ? <MicOff size={icon} /> : <Mic size={icon} />}
      </button>
      <button
        type="button"
        onClick={toggleDeafen}
        aria-label={deafened ? 'Turn speaker on' : 'Turn speaker off'}
        aria-pressed={deafened}
        className={`${btn} flex items-center justify-center rounded-full transition-transform active:scale-90 ${deafened ? 'bg-rose-500 text-white' : 'bg-white/10 text-white ring-1 ring-white/15'}`}
      >
        {deafened ? <HeadphoneOff size={icon} /> : <Headphones size={icon} />}
      </button>
      <button type="button" onClick={leaveVoice} aria-label="Leave voice chat" className={`${btn} flex items-center justify-center rounded-full bg-rose-600/90 text-white transition-transform active:scale-90`}>
        <PhoneOff size={icon} />
      </button>
    </div>
  )
}

/** The party's members as avatars, ringed green while they talk. */
export function PartyMembersRow({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const members = usePartyStore((s) => s.members)
  const speaking = useVoiceStore((s) => s.speaking)
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={m.isUser}
          onClick={() => openReport(m.id, m.name)}
          aria-label={m.isUser ? 'You' : `${m.name}: block or report`}
          className="flex w-14 shrink-0 flex-col items-center disabled:cursor-default"
        >
          <span className="relative">
            <Avatar emoji={m.avatarEmoji} size={size === 'sm' ? 'sm' : 'md'} speaking={!!speaking[m.id]} muted={m.inVoice && m.micMuted} />
            {m.isLeader && <Crown size={13} className="absolute -top-2 left-1/2 -translate-x-1/2 fill-amber-300 text-amber-300" />}
            {m.inVoice && !m.micMuted && !speaking[m.id] && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-surface-1">
                <Mic size={9} strokeWidth={3} />
              </span>
            )}
          </span>
          <span className="mt-1 w-full truncate text-center text-[11px] font-bold text-slate-200">{m.isUser ? 'You' : m.name}</span>
        </button>
      ))}
    </div>
  )
}

export function InviteFriendsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const allFriends = useFriendsStore((s) => s.friends)
  const friends = allFriends.filter((f) => f.status === 'friend')
  const members = usePartyStore((s) => s.members)
  const inviteFriend = usePartyStore((s) => s.inviteFriend)
  const [sent, setSent] = useState<Record<string, 'sending' | 'sent' | 'offline'>>({})
  const sorted = [...friends].sort((a, b) => Number(b.online) - Number(a.online))

  return (
    <Sheet open={open} onClose={onClose} title="Invite to party">
      {sorted.length === 0 ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-slate-400">You haven't added any friends yet. Share your code so they can add you:</p>
          <MyFriendCode compact />
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((f) => {
            const inParty = members.some((m) => m.id === f.id)
            const st = sent[f.id]
            return (
              <li key={f.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-2.5">
                <Avatar emoji={f.avatarEmoji} size="sm" online={f.online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{f.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{f.online ? (f.activity ?? 'Online') : 'Offline'}</p>
                </div>
                {inParty ? (
                  <span className="text-xs font-bold text-emerald-300">In party</span>
                ) : (
                  <button
                    type="button"
                    disabled={!f.online || st === 'sending' || st === 'sent'}
                    onClick={async () => {
                      setSent((s) => ({ ...s, [f.id]: 'sending' }))
                      const ok = await inviteFriend(f.id)
                      setSent((s) => ({ ...s, [f.id]: ok ? 'sent' : 'offline' }))
                    }}
                    className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-extrabold text-white disabled:bg-white/10 disabled:text-slate-400"
                  >
                    {st === 'sent' ? 'Invited ✓' : st === 'sending' ? '…' : st === 'offline' ? 'Offline' : 'Invite'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

/** Party hub card: start a party, see who's in it, talk, chat and invite. */
export default function PartyPanel() {
  const navigate = useNavigate()
  const party = usePartyStore()
  const unread = useChatStore((s) => s.unread[PARTY_CONVERSATION] ?? 0)
  const [inviting, setInviting] = useState(false)
  const leader = party.members.find((m) => m.isLeader)
  const iLead = !!leader?.isUser
  const game = getGame(party.selectedGameId ?? undefined)

  if (!party.active)
    return (
      <Card className="p-4" glow="rgba(124,92,255,0.7)">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand/25 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white">
            {party.joinState === 'joining' ? <Loader2 className="animate-spin" /> : <Users size={24} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-white">{party.joinState === 'joining' ? 'Joining party…' : 'Start a party'}</p>
            <p className="text-xs leading-snug text-slate-400">Hang out with friends — group chat, voice and games together.</p>
          </div>
        </div>
        <div className="relative mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => {
              party.createParty()
              setInviting(true)
            }}
          >
            <UserPlus size={17} /> Create party
          </button>
          <button type="button" className={BTN_SOFT} onClick={() => navigate('/chat?tab=friends')}>
            <Users size={17} /> Friends
          </button>
        </div>
        <InviteFriendsSheet open={inviting} onClose={() => setInviting(false)} />
      </Card>
    )

  return (
    <Card className="p-4" glow="rgba(16,185,129,0.6)">
      <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Party · {party.members.length}/{MAX_PARTY}
          </p>
          <p className="truncate text-[15px] font-extrabold text-white">{iLead ? 'Your party' : `${leader?.name ?? 'Friend'}'s party`}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => navigate(`/chat/${PARTY_CONVERSATION}`)} aria-label="Party chat" className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.08] text-white ring-1 ring-white/10 active:scale-90">
            <MessageCircle size={18} />
            <Badge count={unread} className="absolute -right-1.5 -top-1.5" />
          </button>
          <button type="button" onClick={() => setInviting(true)} aria-label="Invite friends" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.08] text-white ring-1 ring-white/10 active:scale-90">
            <UserPlus size={18} />
          </button>
          <button type="button" onClick={party.leaveParty} aria-label={iLead ? 'End party' : 'Leave party'} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20 active:scale-90">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="relative mt-3">
        <PartyMembersRow />
      </div>
      {iLead && party.members.length > 1 && (
        <details className="relative mt-1">
          <summary className="cursor-pointer text-[11px] font-bold text-slate-500">Manage members</summary>
          <ul className="mt-2 space-y-1">
            {party.members
              .filter((m) => !m.isUser)
              .map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm text-slate-200">
                  <span>{m.avatarEmoji}</span>
                  <span className="flex-1 truncate">{m.name}</span>
                  <button type="button" onClick={() => party.removeMember(m.id)} className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-rose-300">
                    <UserMinus size={12} /> Remove
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}

      {game && (
        <button
          type="button"
          onClick={() => navigate(`/games/${game.id}/play`)}
          className="relative mt-3 flex w-full items-center gap-3 rounded-2xl p-2.5 text-left ring-1 ring-white/10"
          style={{ background: `linear-gradient(100deg, ${game.accentHex}33, transparent)` }}
        >
          <img src={`/posters/${game.id}.webp`} alt="" className="h-10 w-10 rounded-xl object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Party game</span>
            <span className="block truncate text-sm font-extrabold text-white">{game.name}</span>
          </span>
          <span className="rounded-full px-3 py-1.5 text-xs font-black text-white" style={{ background: game.accentHex }}>
            Play
          </span>
        </button>
      )}

      <div className="relative mt-3">
        <VoiceControls />
      </div>
      <InviteFriendsSheet open={inviting} onClose={() => setInviting(false)} />
    </Card>
  )
}
