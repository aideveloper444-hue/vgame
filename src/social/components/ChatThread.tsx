import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Clock, SendHorizonal } from 'lucide-react'
import { useChatStore, type ChatMessage } from '@/social/stores/useChatStore'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { Avatar } from './ui'

const QUICK = ['👋 Hi!', '🎮 Let\'s play!', '😂', '🔥 GG', '⏳ 1 min', '👍']

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function dayLabel(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(Date.now() - 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function Bubble({ m, first, avatar, showName, compact }: { m: ChatMessage; first: boolean; avatar?: string; showName: boolean; compact?: boolean }) {
  const mine = m.senderId === 'you'
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-2.5' : 'mt-0.5'}`}>
      {!mine && <span className="w-7 shrink-0">{first && avatar && <Avatar emoji={avatar} size="xs" />}</span>}
      <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {!mine && first && showName && <span className="mb-0.5 ml-1 text-[11px] font-bold text-brand-2">{m.senderName}</span>}
        <div
          className={`rounded-[20px] px-3.5 py-2 ${compact ? 'text-[13px]' : 'text-[14.5px]'} leading-snug break-words whitespace-pre-wrap ${
            mine ? 'rounded-br-md bg-gradient-to-br from-brand to-[#9a6bff] text-white' : 'rounded-bl-md bg-surface-3/90 text-slate-100'
          }`}
        >
          {m.text}
        </div>
        <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] font-semibold text-slate-500">
          {clock(m.timestamp)}
          {mine && m.status === 'sending' && (
            <span className="flex items-center gap-0.5 text-amber-300/80">
              <Clock size={10} /> waiting to deliver
            </span>
          )}
          {mine && m.status === 'sent' && <Check size={11} className="text-brand-2" />}
        </span>
      </div>
    </div>
  )
}

/** Message list and composer for one conversation. Marks it as read while on screen. */
export default function ChatThread({ conversationId, compact, emptyHint }: { conversationId: string; compact?: boolean; emptyHint?: string }) {
  const messages = useChatStore((s) => s.messages[conversationId]) ?? []
  const convo = useChatStore((s) => s.conversations.find((c) => c.id === conversationId))
  const sendMessage = useChatStore((s) => s.sendMessage)
  const setViewing = useChatStore((s) => s.setViewing)
  const members = usePartyStore((s) => s.members)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const isParty = convo?.kind === 'party'

  useEffect(() => {
    setViewing(conversationId)
    return () => {
      if (useChatStore.getState().viewing === conversationId) setViewing(null)
    }
  }, [conversationId, setViewing])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const avatarFor = (m: ChatMessage) => (isParty ? members.find((x) => x.id === m.senderId)?.avatarEmoji ?? '🙂' : convo?.avatarEmoji)

  function send(text: string) {
    if (!text.trim()) return
    sendMessage(conversationId, text)
    setDraft('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-1">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
            <span className="text-4xl">💬</span>
            <p className="mt-2 text-sm font-semibold text-slate-400">{emptyHint ?? 'No messages yet — say hi!'}</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || new Date(prev.timestamp).toDateString() !== new Date(m.timestamp).toDateString()
          const first = newDay || !prev || prev.senderId !== m.senderId || prev.system === true || m.timestamp - prev.timestamp > 5 * 60000
          return (
            <div key={m.id}>
              {newDay && !compact && (
                <p className="my-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{dayLabel(m.timestamp)}</p>
              )}
              {m.system ? (
                <p className="mx-auto my-2 w-fit max-w-[90%] rounded-full bg-white/[0.05] px-3 py-1 text-center text-[11px] font-semibold text-slate-400">{m.text}</p>
              ) : (
                <Bubble m={m} first={first} avatar={avatarFor(m)} showName={isParty} compact={compact} />
              )}
            </div>
          )
        })}
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => send(q)} className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-200 ring-1 ring-white/10 active:scale-95">
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-center gap-2 border-t border-white/[0.06] px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          maxLength={500}
          enterKeyHint="send"
          aria-label="Message"
          className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-4 py-3 text-[15px] text-white ring-1 ring-white/10 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand/60"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_8px_20px_-8px_rgba(124,92,255,0.9)] transition-transform active:scale-90 disabled:opacity-40"
        >
          <SendHorizonal size={19} />
        </button>
      </form>
    </div>
  )
}
