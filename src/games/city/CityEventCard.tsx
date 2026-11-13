import { Plane } from 'lucide-react'
import type { CityEventModifier } from './cityStore'
import type { CardKind, CardReveal } from './useCityFx'

const KIND_STYLE: Record<CardKind, { title: string; icon: string; from: string; to: string; ring: string }> = {
  CHANCE: { title: 'Chance', icon: '❓', from: '#a855f7', to: '#4c1d95', ring: '#d8b4fe' },
  COMMUNITY: { title: 'Republic', icon: '🏛️', from: '#3b82f6', to: '#1e3a8a', ring: '#93c5fd' },
  EVENT: { title: 'City Event', icon: '✨', from: '#ec4899', to: '#6d28d9', ring: '#f9a8d4' },
}

function CardFace({ kind, text, footer, size }: { kind: CardKind; text: string; footer?: string; size: 'lg' | 'sm' }) {
  const s = KIND_STYLE[kind]
  const lg = size === 'lg'
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${lg ? 'w-[260px] p-1.5' : 'w-[220px] p-1'}`}
      style={{ background: `linear-gradient(160deg, ${s.ring}, ${s.from} 30%, ${s.to})`, boxShadow: `0 0 34px ${s.from}88, 0 18px 40px -12px rgba(0,0,0,0.8)` }}
    >
      <div className="relative rounded-xl bg-gradient-to-b from-[#101a45] to-[#070b22] p-3 text-center">
        <p className={`font-black uppercase tracking-[0.22em] ${lg ? 'text-[12px]' : 'text-[10px]'}`} style={{ color: s.ring }}>
          {lg ? s.title : 'Special Card'}
        </p>
        <div
          className={`mx-auto my-2 flex items-center justify-center rounded-2xl ${lg ? 'h-24 w-24 text-[52px]' : 'h-12 w-12 text-[26px]'}`}
          style={{ background: `radial-gradient(circle at 35% 30%, ${s.from}, ${s.to})`, boxShadow: `0 0 24px ${s.from}aa, inset 0 2px 0 rgba(255,255,255,0.35)` }}
        >
          {s.icon}
        </div>
        <p className={`font-extrabold leading-snug text-white ${lg ? 'text-[16px]' : 'text-[12.5px]'}`}>{text}</p>
        {footer && <p className="mt-1.5 text-[10.5px] font-semibold text-slate-300">{footer}</p>}
        <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.14) 48%, transparent 60%)' }} />
      </div>
    </div>
  )
}

/** Collectible card flipping into the centre when Chance / Community / City Event resolves. */
export function CardRevealModal({ card, onClose }: { card: CardReveal; onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="flex flex-col items-center gap-3" style={{ animation: 'city-card-in 0.6s cubic-bezier(.2,.8,.2,1)' }} onClick={(e) => e.stopPropagation()}>
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-200">{card.playerName} drew a card</p>
        <CardFace kind={card.kind} text={card.text} size="lg" />
        {!card.byBot && (
          <button onClick={onClose} className="rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 px-8 py-2.5 text-[13px] font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(99,102,241,0.6)] transition-transform hover:scale-105 active:scale-95">
            OK
          </button>
        )}
      </div>
    </div>
  )
}

/** Realistic Indian Rupee banknotes fanned on the table behind the special card */
function RupeeBanknoteFan() {
  const notes = [
    { val: '₹500', bg: 'linear-gradient(135deg, #15803d, #22c55e)', border: '#86efac', rot: 'rotate-12 translate-x-4 translate-y-3' },
    { val: '₹200', bg: 'linear-gradient(135deg, #ea580c, #f97316)', border: '#fed7aa', rot: 'rotate-6 translate-x-2 translate-y-1' },
    { val: '₹100', bg: 'linear-gradient(135deg, #2563eb, #38bdf8)', border: '#bae6fd', rot: '-rotate-3 -translate-x-1' },
    { val: '₹50', bg: 'linear-gradient(135deg, #0d9488, #2dd4bf)', border: '#99f6e4', rot: '-rotate-8 -translate-x-3 -translate-y-1' },
  ]
  return (
    <div className="pointer-events-none absolute -bottom-3 -right-3 z-0 flex items-center justify-end opacity-85">
      {notes.map((n, i) => (
        <div
          key={i}
          className={`absolute h-10 w-24 rounded-md shadow-lg ${n.rot}`}
          style={{
            background: n.bg,
            border: `1px solid ${n.border}88`,
            boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
          }}
        >
          <div className="flex h-full w-full items-center justify-between px-2 text-[10px] font-black text-white/90">
            <span>{n.val}</span>
            <span className="text-[7px] tracking-widest text-white/70">RESERVE</span>
            <span>{n.val}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Bottom-right slot: the iconic "SPECIAL CARD" flight card with fanned banknotes matching screenshot */
export function SpecialCardSlot({ events, lastCard }: { events: CityEventModifier[]; lastCard: CardReveal | null }) {
  const ev = events[0]
  const cardText = ev ? ev.description : lastCard ? lastCard.text : 'Take a free flight to any city!'

  return (
    <div className="relative">
      <RupeeBanknoteFan />
      <div
        className="hud-glass relative z-10 w-[218px] overflow-hidden rounded-[20px] p-2 transition-all"
        style={{
          border: '1.5px solid rgba(56,189,248,0.65)',
          boxShadow: '0 0 20px rgba(56,189,248,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}
      >
        {/* Header pill */}
        <div className="flex items-center justify-between pb-1 px-1">
          <span className="rounded-full bg-sky-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-sky-200 ring-1 ring-sky-400/50">
            SPECIAL CARD
          </span>
          <Plane size={13} className="text-sky-300" />
        </div>

        {/* Airplane Illustration Box */}
        <div
          className="relative my-1 flex h-[74px] w-full items-center justify-center overflow-hidden rounded-xl"
          style={{
            background: 'linear-gradient(180deg, #1e3a8a 0%, #38bdf8 55%, #e0f2fe 100%)',
          }}
        >
          {/* Cloud layers */}
          <div className="absolute -bottom-2 -left-2 h-7 w-20 rounded-full bg-white/70 blur-[3px]" />
          <div className="absolute -bottom-3 right-0 h-9 w-28 rounded-full bg-white/85 blur-[4px]" />
          <div className="absolute -bottom-1 left-10 h-6 w-24 rounded-full bg-white/60 blur-[2px]" />

          {/* Jet Plane */}
          <svg viewBox="0 0 64 64" className="relative z-10 h-14 w-14 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
            <g transform="rotate(-18 32 32)">
              {/* fuselage */}
              <ellipse cx="32" cy="30" rx="6" ry="24" fill="#ffffff" />
              {/* cockpit windows */}
              <ellipse cx="32" cy="12" rx="3.5" ry="3" fill="#0284c7" />
              {/* wings */}
              <path d="M32 24 L6 36 L12 40 L32 32 Z" fill="#e2e8f0" />
              <path d="M32 24 L58 36 L52 40 L32 32 Z" fill="#e2e8f0" />
              {/* jet engines */}
              <rect x="18" y="32" width="4" height="8" rx="2" fill="#0284c7" />
              <rect x="42" y="32" width="4" height="8" rx="2" fill="#0284c7" />
              {/* tail */}
              <path d="M32 46 L22 54 L32 52 Z" fill="#0284c7" />
              <path d="M32 46 L42 54 L32 52 Z" fill="#0284c7" />
            </g>
          </svg>
        </div>

        {/* Description text */}
        <p className="px-1 pt-1 text-center text-[11px] font-bold leading-tight text-white">
          {cardText}
        </p>
      </div>
    </div>
  )
}
