import { useMemo, useState } from 'react'
import { MessageCircle, Send, Smile, X } from 'lucide-react'
import { useChatStore } from '@/social/stores/useChatStore'
import { useCityStore, type CityPlayer } from './cityStore'
import { cityCharacterColor } from './cityCharacters'
import { useLudoPortraits } from '@/games/ludo/ludoPortraits'

function FeedAvatar({ item }: { item: FeedItem }) {
  const portrait = useLudoPortraits((s) => (item.playerColor ? s.portraits[cityCharacterColor(item.playerColor)] : undefined))
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[11px]"
      style={{ boxShadow: `0 0 0 1.5px ${item.color}` }}
    >
      {portrait ? <img src={portrait} alt="" className="h-full w-full scale-110 object-cover" draggable={false} /> : item.avatar}
    </span>
  )
}

export const CITY_CHAT = 'city-game'

interface FeedItem {
  id: string
  ts: number
  avatar: string
  name: string | null
  color: string
  playerColor: string | null
  text: string
  chat: boolean
}

const DEFAULT_SAMPLE_CHATS: Omit<FeedItem, 'ts'>[] = [
  { id: 'sc1', avatar: '🌸', name: 'Sneha', color: '#22c55e', playerColor: '#22c55e', text: 'Nice move! 👏', chat: true },
  { id: 'sc2', avatar: '😎', name: 'Rohan', color: '#38bdf8', playerColor: '#38bdf8', text: 'Watch out! ⚠️', chat: true },
  { id: 'sc3', avatar: '🧢', name: 'Diya', color: '#ec4899', playerColor: '#ec4899', text: 'Attacked Arjun! -80 💥', chat: true },
  { id: 'sc4', avatar: '⚡', name: 'Arjun', color: '#f97316', playerColor: '#f97316', text: 'Back to the game! 😎', chat: true },
]

export default function CityChatPanel({
  players,
  you,
  since,
  compact,
  onSend,
}: {
  players: CityPlayer[]
  you: CityPlayer | undefined
  since: number
  compact: boolean
  onSend?: (text: string) => void
}) {
  const eventLog = useCityStore((s) => s.eventLog)
  const partyMessages = useChatStore((s) => s.messages[CITY_CHAT])
  const appendLocal = useChatStore((s) => s.appendLocal)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(true)

  const feed = useMemo<FeedItem[]>(() => {
    const byName = (text: string) => players.find((p) => text.startsWith(`${p.name} `) || text.startsWith(`${p.name}:`))
    const events: FeedItem[] = eventLog.slice(0, 6).map((e) => {
      const p = byName(e.text)
      return {
        id: e.id,
        ts: e.timestamp,
        avatar: e.icon,
        name: p?.name ?? null,
        color: p?.color ?? '#94a3b8',
        playerColor: p?.color ?? null,
        text: p ? e.text.slice(p.name.length).replace(/^:?\s*/, '') : e.text,
        chat: false,
      }
    })
    const chats: FeedItem[] = (partyMessages ?? [])
      .filter((m) => m.timestamp >= since)
      .map((m) => {
        const p = players.find((x) => x.id === m.senderId || x.name === m.senderName)
        return {
          id: m.id,
          ts: m.timestamp,
          avatar: p?.avatarEmoji ?? '💬',
          name: m.senderName,
          color: p?.color ?? '#38bdf8',
          playerColor: p?.color ?? null,
          text: m.text,
          chat: true,
        }
      })

    const combined = [...events, ...chats].sort((a, b) => b.ts - a.ts).slice(0, 4).reverse()
    if (combined.length === 0) {
      return DEFAULT_SAMPLE_CHATS.map((sc, i) => ({ ...sc, ts: Date.now() - (4 - i) * 60000 }))
    }
    return combined
  }, [eventLog, partyMessages, players, since])

  function send(text: string) {
    if (!text.trim()) return
    if (onSend) {
      onSend(text.trim())
      setDraft('')
      return
    }
    appendLocal(CITY_CHAT, { senderId: you?.id ?? 'you', senderName: you?.name ?? 'You', text: text.trim() })
    setDraft('')
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open chat" className="hud-glass relative flex h-10 w-10 items-center justify-center rounded-full text-white">
        <MessageCircle size={18} />
      </button>
    )
  }

  return (
    <div
      className={`hud-glass relative rounded-[20px] p-2.5 ${compact ? 'w-[min(90vw,280px)]' : 'w-[260px]'}`}
      style={{ border: '1.5px solid rgba(56,189,248,0.3)', boxShadow: '0 0 16px rgba(0,0,0,0.5)' }}
    >
      {compact && (
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white">
          <X size={13} />
        </button>
      )}

      {/* Message rows */}
      <ul className="flex flex-col gap-1.5 px-0.5 pb-2">
        {feed.map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <FeedAvatar item={f} />
            <p className="min-w-0 flex-1 truncate text-[12px] leading-tight text-white">
              {f.name && (
                <span className="mr-1.5 font-bold" style={{ color: f.color }}>
                  {f.name}
                </span>
              )}
              <span className="font-semibold text-slate-200">{f.text}</span>
            </p>
          </li>
        ))}
      </ul>

      {/* Input bar matching screenshot */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 ring-1 ring-white/15"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent text-[11.5px] text-white placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => send('GG 😎')}
          className="text-slate-400 hover:text-amber-300"
          aria-label="Emoji"
        >
          <Smile size={15} />
        </button>
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim()}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white shadow-[0_0_8px_rgba(56,189,248,0.7)] disabled:opacity-40"
        >
          <Send size={11} strokeWidth={2.5} />
        </button>
      </form>
    </div>
  )
}
