import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ban, Check, ChevronLeft, MessageCircle, MoreVertical, Phone, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { useChatStore, PARTY_CONVERSATION } from '@/social/stores/useChatStore'
import { useFriendsStore, type Friend } from '@/social/stores/useFriendsStore'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { useVoiceStore } from '@/social/stores/useVoiceStore'
import { getGame } from '@/games/registry'
import ChatThread from '@/social/components/ChatThread'
import { PartyMembersRow, VoiceControls, InviteFriendsSheet } from '@/social/components/PartyPanel'
import { AddFriendForm, MyFriendCode } from '@/social/components/FriendCode'
import { Avatar, Badge, Card, SectionTitle, Sheet } from '@/social/components/ui'
import { openReport } from '@/social/components/ReportSheet'

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

/** Start a voice call with a friend: a two-person party with voice on. */
async function callFriend(friendId: string) {
  const party = usePartyStore.getState()
  if (!party.active) party.createParty()
  const ok = await usePartyStore.getState().inviteFriend(friendId)
  if (ok) await useVoiceStore.getState().joinVoice()
  return ok
}

function ChatsList() {
  const navigate = useNavigate()
  const conversations = useChatStore((s) => s.conversations)
  const unread = useChatStore((s) => s.unread)
  const messages = useChatStore((s) => s.messages)
  const friends = useFriendsStore((s) => s.friends)
  const party = usePartyStore()
  const preview = useChatStore((s) => s.lastMessagePreview)

  const dms = conversations.filter((c) => c.kind === 'dm').sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="space-y-2">
      {party.invites.map((inv) => (
        <Card key={inv.partyId} className="flex items-center gap-3 p-3">
          <Avatar emoji={inv.fromEmoji} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-white">{inv.fromName}'s party</p>
            <p className="text-xs text-slate-400">invited you {ago(inv.at)} ago</p>
          </div>
          <button type="button" onClick={() => void party.acceptInvite(inv.partyId)} className="rounded-full bg-brand px-3.5 py-2 text-xs font-black text-white">
            Join
          </button>
          <button type="button" onClick={() => party.declineInvite(inv.partyId)} aria-label="Decline" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
            <X size={15} />
          </button>
        </Card>
      ))}

      {party.active && (
        <button
          type="button"
          onClick={() => navigate(`/chat/${PARTY_CONVERSATION}`)}
          className="flex w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-emerald-500/15 to-transparent p-3 text-left ring-1 ring-emerald-400/25"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xl">🎉</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-extrabold text-white">Party chat</span>
              <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-black text-emerald-300">{party.members.length}</span>
            </span>
            <span className="block truncate text-[13px] text-slate-400">{preview(PARTY_CONVERSATION)}</span>
          </span>
          <Badge count={unread[PARTY_CONVERSATION] ?? 0} />
        </button>
      )}

      {dms.map((c) => {
        const f = friends.find((x) => x.id === c.friendId)
        const list = messages[c.id] ?? []
        const last = list[list.length - 1]
        const n = unread[c.id] ?? 0
        return (
          <button key={c.id} type="button" onClick={() => navigate(`/chat/${c.id}`)} className="flex w-full items-center gap-3 rounded-3xl p-3 text-left transition-colors hover:bg-white/[0.03]">
            <Avatar emoji={f?.avatarEmoji ?? c.avatarEmoji} size="md" online={f?.online ?? false} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[15px] font-extrabold text-white">{f?.name ?? c.title}</span>
                {last && <span className="shrink-0 text-[11px] font-semibold text-slate-500">{ago(last.timestamp)}</span>}
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className={`truncate text-[13px] ${n ? 'font-bold text-slate-100' : 'text-slate-400'}`}>
                  {f?.online && f.activity && !last ? f.activity : preview(c.id)}
                </span>
                <Badge count={n} />
              </span>
            </span>
          </button>
        )
      })}

      {!party.active && dms.length === 0 && party.invites.length === 0 && (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand/15 text-brand-2">
            <MessageCircle size={30} />
          </span>
          <p className="mt-3 text-base font-extrabold text-white">No chats yet</p>
          <p className="mt-1 text-sm text-slate-400">Add a friend with their code, then message them or start a party.</p>
        </div>
      )}
    </div>
  )
}

function FriendRow({ f }: { f: Friend }) {
  const navigate = useNavigate()
  const ensureDm = useChatStore((s) => s.ensureDmConversation)
  const removeFriend = useFriendsStore((s) => s.removeFriend)
  const inviteFriend = usePartyStore((s) => s.inviteFriend)
  const inParty = usePartyStore((s) => s.members.some((m) => m.id === f.id))
  const [menu, setMenu] = useState(false)
  const [invited, setInvited] = useState(false)
  const pending = f.status === 'pending'

  return (
    <li className="flex items-center gap-3 rounded-2xl p-2.5">
      <Avatar emoji={f.avatarEmoji} size="md" online={pending ? undefined : f.online} className={!pending && !f.online ? 'opacity-60' : ''} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-white">
          {f.name} {!pending && <span className="text-[11px] font-bold text-slate-500">Lv {f.level}</span>}
        </p>
        <p className={`truncate text-xs ${f.online ? 'text-emerald-300' : 'text-slate-500'}`}>
          {pending ? 'Request sent — waiting for them' : f.online ? (inParty ? 'In your party' : (f.activity ?? 'Online')) : 'Offline'}
        </p>
      </div>
      {!pending && (
        <>
          <button type="button" onClick={() => navigate(`/chat/${ensureDm(f.id)}`)} aria-label={`Message ${f.name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white active:scale-90">
            <MessageCircle size={16} />
          </button>
          {f.online && !inParty && (
            <button
              type="button"
              onClick={async () => setInvited(await inviteFriend(f.id))}
              aria-label={`Invite ${f.name} to party`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/80 text-white active:scale-90"
            >
              {invited ? <Check size={16} /> : <UserPlus size={16} />}
            </button>
          )}
        </>
      )}
      <button type="button" onClick={() => setMenu(true)} aria-label="More" className="flex h-9 w-6 items-center justify-center text-slate-500">
        <MoreVertical size={16} />
      </button>
      <Sheet open={menu} onClose={() => setMenu(false)} title={f.name}>
        <button
          type="button"
          onClick={() => {
            removeFriend(f.id)
            setMenu(false)
          }}
          className="flex w-full items-center gap-3 rounded-2xl bg-rose-500/10 p-3 text-sm font-bold text-rose-300"
        >
          <UserMinus size={18} /> {pending ? 'Cancel request' : 'Remove friend'}
        </button>
        {!pending && (
          <button
            type="button"
            onClick={() => {
              setMenu(false)
              openReport(f.id, f.name)
            }}
            className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] p-3 text-sm font-bold text-white"
          >
            <Ban size={18} /> Block or report
          </button>
        )}
      </Sheet>
    </li>
  )
}

function FriendsTab() {
  const friends = useFriendsStore((s) => s.friends)
  const requests = useFriendsStore((s) => s.requests)
  const acceptRequest = useFriendsStore((s) => s.acceptRequest)
  const declineRequest = useFriendsStore((s) => s.declineRequest)
  const accepted = friends.filter((f) => f.status === 'friend')
  const online = accepted.filter((f) => f.online)
  const offline = accepted.filter((f) => !f.online)
  const pending = friends.filter((f) => f.status === 'pending')

  return (
    <div className="space-y-5">
      <MyFriendCode />
      <div>
        <SectionTitle>Add a friend</SectionTitle>
        <AddFriendForm />
      </div>

      {requests.length > 0 && (
        <div>
          <SectionTitle>Friend requests</SectionTitle>
          <ul className="space-y-1.5">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-cyan-500/10 p-2.5 ring-1 ring-cyan-400/20">
                <Avatar emoji={r.avatarEmoji} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-white">{r.name}</p>
                  <p className="text-xs text-slate-400">wants to be friends</p>
                </div>
                <button type="button" onClick={() => acceptRequest(r.id)} className="rounded-full bg-cyan-500 px-3.5 py-2 text-xs font-black text-white">
                  Accept
                </button>
                <button type="button" onClick={() => declineRequest(r.id)} aria-label="Decline" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {[
        { label: `Online — ${online.length}`, list: online },
        { label: `Offline — ${offline.length}`, list: offline },
        { label: 'Sent requests', list: pending },
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{g.label}</p>
            <ul>
              {g.list.map((f) => (
                <FriendRow key={f.id} f={f} />
              ))}
            </ul>
          </div>
        ))}

      {accepted.length === 0 && pending.length === 0 && (
        <p className="px-4 text-center text-sm text-slate-500">No friends yet. Share your code above, or type a friend's code to add them.</p>
      )}
    </div>
  )
}

function Conversation({ id }: { id: string }) {
  const navigate = useNavigate()
  const convo = useChatStore((s) => s.conversations.find((c) => c.id === id))
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const friends = useFriendsStore((s) => s.friends)
  const party = usePartyStore()
  const voiceJoined = useVoiceStore((s) => s.joined)
  const [inviting, setInviting] = useState(false)
  const [menu, setMenu] = useState(false)
  const [calling, setCalling] = useState(false)
  const isParty = id === PARTY_CONVERSATION
  const friend = friends.find((f) => f.id === convo?.friendId)

  if (isParty && !party.active)
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-extrabold text-white">You're not in a party</p>
        <button type="button" onClick={() => navigate('/chat')} className="rounded-full bg-brand px-5 py-2.5 text-sm font-black text-white">
          Back to chats
        </button>
      </div>
    )
  if (!isParty && !convo)
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-extrabold text-white">Chat not found</p>
        <button type="button" onClick={() => navigate('/chat')} className="rounded-full bg-brand px-5 py-2.5 text-sm font-black text-white">
          Back to chats
        </button>
      </div>
    )

  const game = friend?.currentGameId ? getGame(friend.currentGameId) : undefined
  const subtitle = isParty
    ? `${party.members.length} members`
    : friend?.status === 'pending'
      ? 'Waiting for them to accept'
      : friend?.online
        ? (friend.activity ?? 'Online')
        : 'Offline — messages are delivered when they come online'

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface-0 md:static md:h-[calc(100dvh-1rem)]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-surface-1/90 px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
        <button type="button" onClick={() => navigate('/chat')} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/10">
          <ChevronLeft size={24} />
        </button>
        {isParty ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-lg">🎉</span>
        ) : (
          <Avatar emoji={friend?.avatarEmoji ?? convo!.avatarEmoji} size="sm" online={friend?.online} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-white">{isParty ? 'Party chat' : (friend?.name ?? convo!.title)}</p>
          <p className={`truncate text-[11px] font-semibold ${friend?.online || isParty ? 'text-emerald-300' : 'text-slate-500'}`}>{subtitle}</p>
        </div>
        {isParty ? (
          <button type="button" onClick={() => setInviting(true)} aria-label="Invite friends" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-white">
            <UserPlus size={18} />
          </button>
        ) : (
          <>
            {friend?.online && friend.status === 'friend' && (
              <button
                type="button"
                disabled={calling || (voiceJoined && party.members.some((m) => m.id === friend.id))}
                onClick={async () => {
                  setCalling(true)
                  const ok = await callFriend(friend.id)
                  setCalling(false)
                  if (ok) navigate(`/chat/${PARTY_CONVERSATION}`)
                }}
                aria-label={`Voice call ${friend.name}`}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white disabled:opacity-50"
              >
                <Phone size={17} />
              </button>
            )}
            <button type="button" onClick={() => setMenu(true)} aria-label="More" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300">
              <MoreVertical size={18} />
            </button>
          </>
        )}
      </div>

      {isParty && (
        <div className="border-b border-white/[0.06] bg-surface-1/60 px-4 py-3">
          <PartyMembersRow />
          <div className="mt-2">
            <VoiceControls />
          </div>
        </div>
      )}
      {!isParty && game && friend?.online && (
        <button
          type="button"
          onClick={() => navigate(`/games/${game.id}/play`)}
          className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-left text-xs font-bold text-slate-200"
          style={{ background: `linear-gradient(90deg, ${game.accentHex}30, transparent)` }}
        >
          <img src={`/posters/${game.id}.webp`} alt="" className="h-7 w-7 rounded-lg object-cover" />
          <span className="flex-1">
            {friend.name} is playing {game.name}
          </span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-black text-white" style={{ background: game.accentHex }}>
            Play too
          </span>
        </button>
      )}

      <ChatThread
        conversationId={id}
        emptyHint={isParty ? 'Say hi to your party! Turn on voice to talk while you play.' : `Say hi to ${friend?.name ?? 'your friend'}!`}
      />

      <InviteFriendsSheet open={inviting} onClose={() => setInviting(false)} />
      <Sheet open={menu} onClose={() => setMenu(false)} title={friend?.name ?? convo?.title}>
        <div className="space-y-2">
          {friend?.online && friend.status === 'friend' && (
            <button
              type="button"
              onClick={async () => {
                setMenu(false)
                await usePartyStore.getState().inviteFriend(friend.id)
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] p-3 text-sm font-bold text-white"
            >
              <Users size={18} /> Invite to party
            </button>
          )}
          {friend && (
            <button
              type="button"
              onClick={() => {
                setMenu(false)
                openReport(friend.id, friend.name)
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] p-3 text-sm font-bold text-white"
            >
              <Ban size={18} /> Block or report {friend.name}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              deleteConversation(id)
              setMenu(false)
              navigate('/chat')
            }}
            className="flex w-full items-center gap-3 rounded-2xl bg-rose-500/10 p-3 text-sm font-bold text-rose-300"
          >
            <Trash2 size={18} /> Delete chat
          </button>
        </div>
      </Sheet>
    </div>
  )
}

export default function ChatScreen() {
  const { conversationId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'friends' ? 'friends' : 'chats'
  const requests = useFriendsStore((s) => s.requests.length)

  if (conversationId) return <Conversation id={conversationId} />

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-4">
      <h1 className="text-[1.75rem] font-black text-white">Chat</h1>
      <div className="sticky top-[60px] z-10 -mx-4 mt-3 bg-surface-0/90 px-4 py-2 backdrop-blur-xl">
        <div className="flex gap-1 rounded-full bg-white/[0.05] p-1 ring-1 ring-white/[0.06]">
          {(['chats', 'friends'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setParams(t === 'friends' ? { tab: 'friends' } : {}, { replace: true })}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-extrabold transition-colors ${tab === t ? 'bg-brand text-white shadow' : 'text-slate-400'}`}
            >
              {t === 'chats' ? 'Chats' : 'Friends'}
              {t === 'friends' && <Badge count={requests} />}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">{tab === 'chats' ? <ChatsList /> : <FriendsTab />}</div>
    </div>
  )
}
