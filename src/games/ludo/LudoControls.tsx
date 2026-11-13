import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Coins, Mic, MicOff, Send, Smile, X } from 'lucide-react'
import { COLOR_GLOW, COLOR_HEX } from './ludoBoardLayout'
import type { LudoPlayer } from './ludoStore'
import LudoAvatar from './LudoAvatar'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { useVoiceStore } from '@/social/stores/useVoiceStore'
import { usePlayerStore } from '@/social/stores/usePlayerStore'

/*
 * The lounge's game controls, as in the poster: Quick Chat & Emotes, Voice Chat, the chat box, Send Gift.
 */

const glass = {
  background: 'linear-gradient(125deg, rgba(255,255,255,0.18), rgba(255,255,255,0.035) 18%, transparent 44%), linear-gradient(180deg, rgba(19,38,68,0.72), rgba(3,8,20,0.88))',
  border: '1px solid rgba(133,205,255,0.72)',
  boxShadow: '0 0 22px -7px rgba(56,170,255,0.85), inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -12px 24px rgba(0,0,0,0.38), inset 0 0 14px -9px rgba(120,210,255,0.9)',
  backdropFilter: 'blur(20px) saturate(1.45)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.45)',
} as const

// ---------------------------------------------------------------- emotes, voice, chat, gift

export const EMOTES = ['👍', '😆', '😡', '❤️']

export function EmoteBar({ onEmote, onGift, inline = false }: { onEmote: (emoji: string) => void; onGift: () => void; inline?: boolean }) {
  return (
    <div className={`pointer-events-auto flex min-w-0 shrink-0 flex-col items-center ${inline ? 'h-12 justify-center rounded-full px-1.5' : 'rounded-2xl px-1.5 pb-1 pt-1.5'}`} style={glass}>
      <div className="flex items-center gap-1">
        {EMOTES.map((e, i) => (
          // in the slim phone row only two emotes fit beside a usable chat field
          <button key={e} type="button" onClick={() => onEmote(e)} className={`flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/5 text-[17px] ring-1 ring-sky-300/40 transition-transform active:scale-90 ${inline && i >= 2 ? 'max-[440px]:hidden' : ''}`} aria-label={`Send ${e}`}>
            {e}
          </button>
        ))}
        <button type="button" onClick={onGift} className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/5 text-[16px] ring-1 ring-pink-300/50 transition-transform active:scale-90" aria-label="Send a gift">
          🎁
        </button>
      </div>
      {!inline && <p className="mt-0.5 text-[9.5px] font-black tracking-wide text-sky-200">Quick Chat &amp; Emotes</p>}
    </div>
  )
}

export function VoiceChip({ onInfo, compact = false }: { onInfo: (text: string) => void; compact?: boolean }) {
  const partyActive = usePartyStore((s) => s.active)
  const joined = useVoiceStore((s) => s.joined)
  const joining = useVoiceStore((s) => s.joining)
  const micMuted = useVoiceStore((s) => s.micMuted)
  const error = useVoiceStore((s) => s.error)
  const live = joined && !micMuted
  useEffect(() => {
    if (error) onInfo(error)
  }, [error, onInfo])

  function toggle() {
    const v = useVoiceStore.getState()
    if (!partyActive) {
      onInfo('Voice chat talks to your party. Start a party from Home, then come back here.')
      return
    }
    if (!v.joined) void v.joinVoice()
    else v.toggleMic()
  }

  return (
    <button type="button" onClick={toggle} className={`pointer-events-auto flex shrink-0 items-center gap-1 transition-transform active:scale-95 ${compact ? 'h-12 rounded-full px-1.5' : 'h-[3.4rem] rounded-2xl px-1.5'}`} style={glass} aria-pressed={live} aria-label="Voice chat">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: live ? 'radial-gradient(circle, #38bdf8, #1d4ed8)' : 'radial-gradient(circle, #1e3a8a, #0b1236)', boxShadow: live ? '0 0 14px #38bdf8' : '0 0 0 1.5px #3b82f6' }}
      >
        {joined && micMuted ? <MicOff size={17} className="text-white" /> : <Mic size={17} className="text-white" />}
      </span>
      <span className={`flex min-w-0 flex-col items-start max-[379px]:hidden ${compact ? 'hidden' : ''}`}>
        <span className="flex h-4 items-end gap-[2px]" aria-hidden>
          {[5, 9, 13, 8, 12, 6, 10].map((h, i) => (
            <span key={i} className={`w-[2.5px] rounded-full bg-sky-300 ${live ? 'ludo-wave' : ''}`} style={{ height: live ? h : 3, animationDelay: `${i * 90}ms`, opacity: live ? 1 : 0.5 }} />
          ))}
        </span>
        <span className="whitespace-nowrap text-[10px] font-black text-white">{joining ? 'Joining…' : 'Voice Chat'}</span>
      </span>
    </button>
  )
}

const CHAT_EMOJI = ['😀', '😂', '😎', '🔥', '👏', '😭', '🤝', '🎉']

export function ChatBar({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('')
  const [picker, setPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  function send() {
    const t = text.trim()
    if (!t) return
    onSend(t.slice(0, 40))
    setText('')
    inputRef.current?.blur()
  }
  return (
    <div className="pointer-events-auto relative flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full pl-1.5 pr-1.5" style={glass}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-sky-300 to-blue-600 text-white shadow-[0_0_10px_rgba(56,189,248,0.8)]">
        <span className="text-[15px]">💬</span>
      </span>
      <input
        ref={inputRef}
        value={text}
        maxLength={40}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send()
        }}
        placeholder="Tap to chat..."
        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white outline-none placeholder:text-slate-400"
        aria-label="Chat message"
      />
      {text.trim() ? (
        <button type="button" onClick={send} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white active:scale-90" aria-label="Send">
          <Send size={16} />
        </button>
      ) : (
        <button type="button" onClick={() => setPicker((p) => !p)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-200 ring-1 ring-white/25 active:scale-90" aria-label="Emoji">
          <Smile size={19} />
        </button>
      )}
      {picker && (
        <div className="absolute bottom-full right-0 mb-2 grid grid-cols-4 gap-1 rounded-2xl p-2" style={glass}>
          {CHAT_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setPicker(false)
                onSend(e)
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[20px] active:scale-90"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function GiftButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pointer-events-auto flex h-12 shrink-0 items-center gap-1.5 rounded-full pl-2 pr-2.5 transition-transform active:scale-95" style={glass}>
      <span className="text-[20px]">🎁</span>
      <span className="text-[13px] font-black text-white">Send Gift</span>
      <ChevronRight size={16} className="text-slate-200" />
    </button>
  )
}

export interface GiftDef {
  id: string
  emoji: string
  name: string
  price: number
}

export const GIFTS: GiftDef[] = [
  { id: 'rose', emoji: '🌹', name: 'Rose', price: 10 },
  { id: 'choco', emoji: '🍫', name: 'Chocolate', price: 25 },
  { id: 'trophy', emoji: '🏆', name: 'Trophy', price: 50 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', price: 100 },
  { id: 'crown', emoji: '👑', name: 'Crown', price: 200 },
]

export function GiftSheet({ players, fromId, onSend, onClose }: { players: LudoPlayer[]; fromId: string | undefined; onSend: (toId: string, gift: GiftDef) => void; onClose: () => void }) {
  const others = players.filter((p) => p.id !== fromId)
  const [to, setTo] = useState(others[0]?.id ?? '')
  const coins = usePlayerStore((s) => s.profile.coins)
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div className="ludo-pop w-full max-w-sm rounded-t-3xl p-4 sm:rounded-3xl" style={glass} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-lg font-black text-white">🎁 Send a Gift</p>
          <span className="flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-[12px] font-black text-amber-300">
            <Coins size={13} /> {coins.toLocaleString()}
          </span>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="mt-3 text-[11px] font-black uppercase tracking-wider text-sky-200">To</p>
        <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
          {others.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setTo(p.id)}
              className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl p-1.5"
              style={{ background: to === p.id ? `${COLOR_HEX[p.color]}44` : 'transparent', boxShadow: to === p.id ? `0 0 0 2px ${COLOR_GLOW[p.color]}` : undefined }}
            >
              <span className="h-11 w-11 overflow-hidden rounded-full" style={{ boxShadow: `0 0 0 2px ${COLOR_GLOW[p.color]}` }}>
                <LudoAvatar name={p.name} color={p.color} className="h-full w-full" />
              </span>
              <span className="w-full truncate text-center text-[10px] font-bold text-white">{p.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] font-black uppercase tracking-wider text-sky-200">Gift</p>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {GIFTS.map((g) => (
            <button
              key={g.id}
              type="button"
              disabled={!to || coins < g.price}
              onClick={() => onSend(to, g)}
              className="flex flex-col items-center gap-0.5 rounded-2xl bg-white/5 py-2 ring-1 ring-white/10 transition-transform active:scale-90 disabled:opacity-40"
            >
              <span className="text-[24px]">{g.emoji}</span>
              <span className="text-[9.5px] font-bold text-white">{g.name}</span>
              <span className="flex items-center gap-0.5 text-[9.5px] font-black text-amber-300">
                <Coins size={9} />
                {g.price}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- overlays


export function Toast({ text }: { text: ReactNode }) {
  return (
    <div className="ludo-pop pointer-events-none absolute left-1/2 top-[38%] z-40 max-w-[85%] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-center text-[13px] font-bold text-white" style={glass}>
      {text}
    </div>
  )
}

/** Big emoji that float up from the middle of the board. */
export function FloatingEmotes({ items }: { items: { id: number; emoji: string; x: number }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {items.map((it) => (
        <span key={it.id} className="ludo-emote-float absolute bottom-[22%] text-[44px]" style={{ left: `${it.x}%` }}>
          {it.emoji}
        </span>
      ))}
    </div>
  )
}
