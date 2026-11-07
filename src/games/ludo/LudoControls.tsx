import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Coins, Mic, MicOff, Send, Smile, X } from 'lucide-react'
import { COLOR_GLOW, COLOR_HEX } from './ludoBoardLayout'
import type { LudoPlayer, PowerKind, PowerStock } from './ludoStore'
import LudoAvatar from './LudoAvatar'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { useVoiceStore } from '@/social/stores/useVoiceStore'
import { usePlayerStore } from '@/social/stores/usePlayerStore'

/*
 * The lounge's game controls, as in the poster: Power Ups (Speed, Shield, Bomb),
 * Quick Chat & Emotes, Voice Chat, the chat box, Send Gift.
 */

const glass = {
  background: 'linear-gradient(125deg, rgba(255,255,255,0.18), rgba(255,255,255,0.035) 18%, transparent 44%), linear-gradient(180deg, rgba(19,38,68,0.72), rgba(3,8,20,0.88))',
  border: '1px solid rgba(133,205,255,0.72)',
  boxShadow: '0 0 22px -7px rgba(56,170,255,0.85), inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -12px 24px rgba(0,0,0,0.38), inset 0 0 14px -9px rgba(120,210,255,0.9)',
  backdropFilter: 'blur(20px) saturate(1.45)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.45)',
} as const

// ---------------------------------------------------------------- power ups

const POWER_META: Record<PowerKind, { label: string; icon: string; ring: string; glow: string }> = {
  speed: { label: 'Speed', icon: '⚡', ring: '#a855f7', glow: '#facc15' },
  shield: { label: 'Shield', icon: '🛡️', ring: '#3b82f6', glow: '#60a5fa' },
  bomb: { label: 'Bomb', icon: '💣', ring: '#6b21a8', glow: '#f97316' },
}

export function PowerUpsPanel({
  powers,
  enabled,
  armed,
  onUse,
}: {
  powers: PowerStock
  /** It is this device's turn and a power-up may be used now. */
  enabled: boolean
  /** The power that is on (Speed) or waiting for a target (Shield, Bomb). */
  armed: PowerKind | null
  onUse: (kind: PowerKind) => void
}) {
  return (
    <div className="pointer-events-auto flex w-[5.7rem] flex-col gap-1 rounded-2xl px-1 pb-1.5 pt-1.5 sm:w-[6.2rem] sm:gap-1.5 sm:px-1.5 sm:pb-2" style={glass}>
      <p className="text-center text-[8px] font-black uppercase leading-tight tracking-[0.08em] text-sky-200 [text-shadow:0_0_8px_rgba(56,189,248,0.8)] sm:text-[9px]">Power Ups</p>
      {(Object.keys(POWER_META) as PowerKind[]).map((k) => {
        const m = POWER_META[k]
        const count = powers[k]
        const usable = enabled && count > 0
        const on = armed === k
        return (
          <button
            key={k}
            type="button"
            disabled={!usable && !on}
            onClick={() => onUse(k)}
            className="flex w-full items-center gap-1.5 rounded-xl py-0.5 pl-0.5 pr-0.5 text-left transition-transform active:scale-90 disabled:opacity-45"
            style={on ? { background: `${m.glow}33`, boxShadow: `0 0 12px ${m.glow}` } : undefined}
            aria-label={`${m.label} (${count} left)`}
          >
            <span
              className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] sm:h-8 sm:w-8 sm:text-[16px]"
              style={{ background: 'radial-gradient(circle at 40% 35%, #2a2f5e, #0a0d24 75%)', boxShadow: `0 0 0 2px ${m.ring}, 0 0 10px ${m.glow}` }}
            >
              <span className={on ? 'animate-pulse' : ''}>{m.icon}</span>
              <span className="absolute -bottom-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-0.5 text-[9px] font-black text-amber-950 ring-1 ring-black/40">
                {count}
              </span>
            </span>
            <span className="min-w-0 truncate text-[8px] font-black leading-none text-emerald-100 sm:text-[9px]">{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Portrait layout: the three power-ups as a slim horizontal strip of round buttons that sits in the gap
 * above the board's far edge, so it never covers tiles.
 */
export function PowerUpsStrip({ powers, enabled, armed, onUse }: { powers: PowerStock; enabled: boolean; armed: PowerKind | null; onUse: (kind: PowerKind) => void }) {
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-full py-1 pl-2 pr-1.5" style={glass}>
      <span className="text-[8px] font-black uppercase leading-[1.05] tracking-[0.08em] text-sky-200 [text-shadow:0_0_8px_rgba(56,189,248,0.8)]">
        Power
        <br />
        Ups
      </span>
      {(Object.keys(POWER_META) as PowerKind[]).map((k) => {
        const m = POWER_META[k]
        const count = powers[k]
        const on = armed === k
        return (
          <button
            key={k}
            type="button"
            disabled={!(enabled && count > 0) && !on}
            onClick={() => onUse(k)}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] transition-transform active:scale-90 disabled:opacity-45"
            style={{ background: 'radial-gradient(circle at 40% 35%, #2a2f5e, #0a0d24 75%)', boxShadow: on ? `0 0 0 2px ${m.ring}, 0 0 14px ${m.glow}` : `0 0 0 2px ${m.ring}, 0 0 8px ${m.glow}88` }}
            aria-label={`${m.label} (${count} left)`}
            title={m.label}
          >
            <span className={on ? 'animate-pulse' : ''}>{m.icon}</span>
            <span className="absolute -bottom-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-0.5 text-[9px] font-black text-amber-950">{count}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Phone layout: the three power-ups as pills in one row (as in the approved mockup). */
export function PowerUpsRow({ powers, enabled, armed, onUse }: { powers: PowerStock; enabled: boolean; armed: PowerKind | null; onUse: (kind: PowerKind) => void }) {
  return (
    <div className="flex min-w-0 flex-1 gap-1.5">
      {(Object.keys(POWER_META) as PowerKind[]).map((k) => {
        const m = POWER_META[k]
        const count = powers[k]
        const on = armed === k
        return (
          <button
            key={k}
            type="button"
            disabled={!(enabled && count > 0) && !on}
            onClick={() => onUse(k)}
            className="pointer-events-auto flex h-[2.6rem] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl px-1 transition-transform active:scale-95 disabled:opacity-50"
            style={{ ...glass, ...(on ? { boxShadow: `0 0 16px ${m.glow}`, borderColor: m.glow } : {}) }}
            aria-label={`${m.label} (${count} left)`}
          >
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px]" style={{ background: 'radial-gradient(circle at 40% 35%, #2a2f5e, #0a0d24 75%)', boxShadow: `0 0 0 2px ${m.ring}` }}>
              <span className={on ? 'animate-pulse' : ''}>{m.icon}</span>
              <span className="absolute -bottom-1 -right-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-0.5 text-[9px] font-black text-amber-950">{count}</span>
            </span>
            <span className="truncate text-[11px] font-black text-white">{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- emotes, voice, chat, gift

export const EMOTES = ['👍', '😆', '😡', '❤️']

export function EmoteBar({ onEmote, onGift }: { onEmote: (emoji: string) => void; onGift: () => void }) {
  return (
    <div className="pointer-events-auto flex min-w-0 flex-col items-center rounded-2xl px-1.5 pb-1 pt-1.5" style={glass}>
      <div className="flex items-center gap-1">
        {EMOTES.map((e) => (
          <button key={e} type="button" onClick={() => onEmote(e)} className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/5 text-[17px] ring-1 ring-sky-300/40 transition-transform active:scale-90" aria-label={`Send ${e}`}>
            {e}
          </button>
        ))}
        <button type="button" onClick={onGift} className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/5 text-[16px] ring-1 ring-pink-300/50 transition-transform active:scale-90" aria-label="Send a gift">
          🎁
        </button>
      </div>
      <p className="mt-0.5 text-[9.5px] font-black tracking-wide text-sky-200">Quick Chat &amp; Emotes</p>
    </div>
  )
}

export function VoiceChip({ onInfo }: { onInfo: (text: string) => void }) {
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
    <button type="button" onClick={toggle} className="pointer-events-auto flex h-[3.4rem] shrink-0 items-center gap-1 rounded-2xl px-1.5 transition-transform active:scale-95" style={glass} aria-pressed={live} aria-label="Voice chat">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: live ? 'radial-gradient(circle, #38bdf8, #1d4ed8)' : 'radial-gradient(circle, #1e3a8a, #0b1236)', boxShadow: live ? '0 0 14px #38bdf8' : '0 0 0 1.5px #3b82f6' }}
      >
        {joined && micMuted ? <MicOff size={17} className="text-white" /> : <Mic size={17} className="text-white" />}
      </span>
      <span className="flex min-w-0 flex-col items-start max-[379px]:hidden">
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
