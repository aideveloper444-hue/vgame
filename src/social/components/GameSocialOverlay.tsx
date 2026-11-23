import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GripHorizontal, Megaphone, MessageCircle, Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react'
import type { GameDefinition } from '@/games/registry'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { useVoiceStore, type VoiceChannel } from '@/social/stores/useVoiceStore'
import { useGameVoiceRoster } from '@/net/gameVoiceRoster'
import { useChatStore, PARTY_CONVERSATION, totalUnread } from '@/social/stores/useChatStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import ChatThread from './ChatThread'
import PartyPanel, { PartyMembersRow, VoiceControls } from './PartyPanel'
import { Avatar, Badge } from './ui'

const HIDE_KEY = 'mw-dock-hidden'

const DOCK_Y_KEY = 'mw-dock-y'

function readDockY(fallback = 30) {
  try {
    const v = Number(localStorage.getItem(DOCK_Y_KEY))
    return v >= 12 && v <= 88 ? v : fallback
  } catch {
    return 30
  }
}

function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

function DmList({ open }: { open: (id: string) => void }) {
  const conversations = useChatStore((s) => s.conversations)
  const unread = useChatStore((s) => s.unread)
  const friends = useFriendsStore((s) => s.friends)
  const ensureDm = useChatStore((s) => s.ensureDmConversation)
  const dms = conversations.filter((c) => c.kind === 'dm').sort((a, b) => b.updatedAt - a.updatedAt)
  const online = friends.filter((f) => f.status === 'friend' && f.online && !dms.some((d) => d.friendId === f.id))
  if (dms.length === 0 && online.length === 0) return <p className="px-4 py-8 text-center text-sm text-slate-400">No chats yet. Add friends from the Chat tab.</p>
  return (
    <ul className="space-y-1 px-3 pb-4">
      {dms.map((c) => {
        const f = friends.find((x) => x.id === c.friendId)
        return (
          <li key={c.id}>
            <button type="button" onClick={() => open(c.id)} className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-white/[0.04]">
              <Avatar emoji={f?.avatarEmoji ?? c.avatarEmoji} size="sm" online={f?.online} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{f?.name ?? c.title}</span>
                <span className="block truncate text-xs text-slate-400">{useChatStore.getState().lastMessagePreview(c.id)}</span>
              </span>
              <Badge count={unread[c.id] ?? 0} />
            </button>
          </li>
        )
      })}
      {online.map((f) => (
        <li key={f.id}>
          <button type="button" onClick={() => open(ensureDm(f.id))} className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-white/[0.04]">
            <Avatar emoji={f.avatarEmoji} size="sm" online />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">{f.name}</span>
              <span className="block truncate text-xs text-emerald-300">{f.activity ?? 'Online'}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Party chat, DMs and voice on top of any game. */
export default function GameSocialOverlay({ game }: { game: GameDefinition }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(readHidden)
  const [tab, setTab] = useState<'party' | 'dms'>('party')
  const [dm, setDm] = useState<string | null>(null)
  const [called, setCalled] = useState(false)
  const party = usePartyStore()
  const voice = useVoiceStore()
  const unreadAll = useChatStore((s) => totalUnread(s))
  const unreadParty = useChatStore((s) => s.unread[PARTY_CONVERSATION] ?? 0)
  const others = party.members.filter((m) => !m.isUser)
  // game voice: the other players at this match's table (online games only)
  const roster = useGameVoiceRoster()
  const inGame = !!roster.key
  // entering an online match switches voice to that match's players; leaving it falls back to the party
  useEffect(() => {
    const v = useVoiceStore.getState()
    if (inGame && v.channel !== 'game' && !v.joined) v.setChannel('game')
    if (!inGame && v.channel === 'game') v.setChannel('party')
  }, [inGame])
  const talk = () => {
    const v = useVoiceStore.getState()
    if (v.channel === 'party' && !party.active) party.createParty()
    if (!v.joined) void v.joinVoice()
    else v.toggleMic()
  }
  const pickChannel = (ch: VoiceChannel) => {
    if (ch === 'party' && !party.active) party.createParty()
    useVoiceStore.getState().setChannel(ch)
  }
  const othersTalking = others.some((m) => voice.speaking[m.id])
  // World Tycoon keeps its player cards in the top corners: the dock
  // starts at mid height, clear of them
  const [dockY, setDockY] = useState(() => readDockY(game.id === 'city' ? 52 : 30))

  const moveDock = (y: number) => {
    const v = Math.min(88, Math.max(12, y))
    setDockY(v)
    try {
      localStorage.setItem(DOCK_Y_KEY, String(Math.round(v)))
    } catch {
      /* ignore */
    }
  }

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => moveDock((ev.clientY / window.innerHeight) * 100)
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  const setHide = (v: boolean) => {
    setHidden(v)
    try {
      localStorage.setItem(HIDE_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  if (pathname.startsWith('/games/ludo/play')) return null

  return (
    <>
      {/* edge dock: small, and can be dragged up or down so it never sits on a game's own buttons */}
      <div className="pointer-events-none fixed right-0 z-[60] flex items-center" style={{ top: `${dockY}%`, transform: 'translateY(-50%)' }} data-testid="game-social-dock">
        {hidden ? (
          <button
            type="button"
            onClick={() => setHide(false)}
            aria-label="Show chat and voice"
            className="pointer-events-auto relative flex h-12 w-5 items-center justify-center rounded-l-xl bg-black/55 text-white backdrop-blur-md"
          >
            <ChevronLeft size={14} />
            {unreadAll > 0 && <span className="absolute -left-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />}
          </button>
        ) : (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-l-2xl border border-r-0 border-white/10 bg-black/40 py-1.5 pl-1.5 pr-1 opacity-90 backdrop-blur-md">
            <div className="flex w-10 items-center justify-between">
              <span
                role="slider"
                aria-label="Move chat button"
                aria-valuemin={12}
                aria-valuemax={88}
                aria-valuenow={Math.round(dockY)}
                tabIndex={0}
                onPointerDown={startDrag}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') moveDock(dockY - 4)
                  if (e.key === 'ArrowDown') moveDock(dockY + 4)
                }}
                className="flex h-5 w-6 cursor-grab touch-none items-center justify-center text-white/55 active:cursor-grabbing"
              >
                <GripHorizontal size={14} />
              </span>
              <button type="button" onClick={() => setHide(true)} aria-label="Hide chat and voice" className="flex h-5 w-4 items-center justify-center text-white/55">
                <ChevronRight size={13} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(true)
                setTab(party.active ? 'party' : 'dms')
              }}
              aria-label="Open chat"
              className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-white shadow-lg active:scale-90 ${othersTalking ? 'speaking-ring text-emerald-400' : ''}`}
            >
              <MessageCircle size={18} className="text-white" />
              <Badge count={unreadAll} className="absolute -right-1.5 -top-1.5" />
            </button>
            {/* in an online match: talk to this game's players, or to your party */}
            {inGame && (
              <div className="flex w-10 flex-col gap-0.5 rounded-lg bg-white/[0.06] p-0.5" role="radiogroup" aria-label="Voice channel">
                {(['game', 'party'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    role="radio"
                    aria-checked={voice.channel === ch}
                    onClick={() => pickChannel(ch)}
                    className={`rounded-md py-0.5 text-[8.5px] font-black uppercase tracking-wide ${voice.channel === ch ? 'bg-white text-slate-900' : 'text-white/60'}`}
                  >
                    {ch === 'game' ? 'Game' : 'Party'}
                  </button>
                ))}
              </div>
            )}
            {/* mic: one tap talks on the chosen channel (starting a party if needed), then mutes and unmutes */}
            <button
              type="button"
              onClick={talk}
              aria-label={!voice.joined ? `Talk: join ${voice.channel === 'game' ? 'game' : 'party'} voice` : voice.micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-white active:scale-90 ${!voice.joined ? 'bg-white/15' : voice.micMuted ? 'bg-rose-500' : 'bg-emerald-500'}`}
            >
              {voice.joined && voice.micMuted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            {/* speaker: hear the others on the channel, or silence them (separate from your mic) */}
            {voice.joined && (
              <button
                type="button"
                onClick={() => voice.toggleDeafen()}
                aria-label={voice.deafened ? 'Turn speaker on' : 'Turn speaker off'}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-white active:scale-90 ${voice.deafened ? 'bg-rose-500' : 'bg-white/15'}`}
              >
                {voice.deafened ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* sheet */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Chat and voice">
          <button type="button" aria-label="Close chat" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="sheet-in relative flex h-[72vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-surface-1 shadow-2xl sm:mb-4 sm:rounded-[28px]">
            <div className="flex items-center gap-2 px-4 pb-2 pt-3">
              <div className="flex flex-1 gap-1 rounded-full bg-white/[0.05] p-1">
                {(['party', 'dms'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTab(t)
                      setDm(null)
                    }}
                    className={`relative flex-1 rounded-full py-2 text-xs font-extrabold ${tab === t ? 'bg-brand text-white' : 'text-slate-400'}`}
                  >
                    {t === 'party' ? 'Party' : 'Friends'}
                    {t === 'party' && unreadParty > 0 && tab !== 'party' && <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-rose-500" />}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                <X size={17} />
              </button>
            </div>

            {inGame && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/10">
                <span className="min-w-0 flex-1 text-[12px] font-bold leading-tight text-white">
                  Voice: {voice.channel === 'game' ? `this game (${roster.netIds.length} player${roster.netIds.length === 1 ? '' : 's'})` : 'your party'}
                  <span className="block text-[10.5px] font-semibold text-slate-400">{voice.joined ? (voice.micMuted ? 'Mic muted' : 'Mic on') + (voice.deafened ? ' · speaker off' : ' · speaker on') : 'Tap the mic to talk'}</span>
                </span>
                <div className="flex gap-1 rounded-full bg-black/30 p-0.5">
                  {(['game', 'party'] as const).map((ch) => (
                    <button key={ch} type="button" onClick={() => pickChannel(ch)} className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold ${voice.channel === ch ? 'bg-brand text-white' : 'text-slate-300'}`}>
                      {ch === 'game' ? 'Game' : 'Party'}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={talk} aria-label="Microphone" className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${!voice.joined ? 'bg-white/15' : voice.micMuted ? 'bg-rose-500' : 'bg-emerald-500'}`}>
                  {voice.joined && voice.micMuted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                {voice.joined && (
                  <button type="button" onClick={() => voice.toggleDeafen()} aria-label="Speaker" className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${voice.deafened ? 'bg-rose-500' : 'bg-white/15'}`}>
                    {voice.deafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                )}
              </div>
            )}

            {tab === 'party' &&
              (party.active ? (
                <>
                  <div className="border-b border-white/[0.06] px-4 pb-3">
                    <PartyMembersRow size="sm" />
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1">
                        <VoiceControls size="sm" />
                      </div>
                      {others.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            party.launchGame(game.id)
                            setCalled(true)
                          }}
                          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-2.5 text-[11px] font-extrabold text-white ring-1 ring-white/10"
                        >
                          <Megaphone size={14} /> {called ? 'Called!' : `Call to ${game.name.split(' ')[0]}`}
                        </button>
                      )}
                    </div>
                  </div>
                  <ChatThread conversationId={PARTY_CONVERSATION} compact />
                </>
              ) : (
                <div className="overflow-y-auto p-4">
                  <PartyPanel />
                </div>
              ))}

            {tab === 'dms' &&
              (dm ? (
                <>
                  <button type="button" onClick={() => setDm(null)} className="mx-4 mb-1 flex items-center gap-1 text-xs font-bold text-brand-2">
                    <ChevronLeft size={14} /> All chats
                  </button>
                  <ChatThread conversationId={dm} compact />
                </>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <DmList open={setDm} />
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  )
}
