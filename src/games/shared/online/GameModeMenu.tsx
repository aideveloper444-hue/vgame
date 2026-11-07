import { useEffect, useState, type ReactNode } from 'react'
import { Bot, Check, ChevronLeft, Copy, Globe, KeyRound, Loader2, Share2, Smartphone, User, Users, X } from 'lucide-react'
import type { BotLevel, BotName, MatchStore, Seat } from './matchStore'
import type { RoomControls } from './peerRoom'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { getGame } from '@/games/registry'

/*
 * Shared "choose how to play" menu and pre-game lobbies for board games: Play Online (quick match),
 * Friends Online (room codes), Friends Offline (pass & play), Play Solo (easy bots) and vs Computer
 * (smart bots), each with a player-count picker. Games supply their colours, avatars and preview.
 */

export type ModeKey = 'online' | 'friendsOnline' | 'local' | 'solo' | 'computer'
type Screen = { name: 'home' } | { name: 'setup'; mode: ModeKey } | { name: 'room' } | { name: 'quick' }

export interface SeatStyle {
  /** Main colour of the seat's team. */
  hex: string
  /** Bright version for glows and text. */
  glow: string
  /** Short colour name shown under the player's name. */
  label: string
}

export interface GameModeMenuConfig {
  counts: number[]
  defaultCount: number
  seatStyle: (index: number, total: number) => SeatStyle
  renderAvatar: (name: string, index: number, total: number) => ReactNode
  /** Board/table preview for a player count (title, blurb and picture). */
  renderPreview?: (count: number) => ReactNode
  botNames: BotName[]
  match: MatchStore
  room: RoomControls
  /** Route of the game page, for invite links. */
  invitePath: string
  /** Modes to offer, in order (default: all five). The first one gets the wide hero tile. */
  modes?: ModeKey[]
  /** Overrides for a mode's tile text. */
  modeText?: Partial<Record<ModeKey, { title?: string; blurb?: string }>>
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ludo-glass-strong ludo-chip-in rounded-3xl p-4 ${className}`}>{children}</div>
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl bg-gradient-to-b from-[#ffe58a] via-[#f5b52a] to-[#c47a0a] py-3.5 text-[15px] font-black uppercase tracking-[0.14em] text-[#3d2200] shadow-[0_0_24px_rgba(251,191,36,0.45),inset_0_1px_0_rgba(255,255,255,0.7)] transition-[transform,filter,opacity] active:scale-[0.97] active:brightness-110 disabled:opacity-40 disabled:shadow-none"
    >
      {children}
    </button>
  )
}

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <p className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
      {children}
      {right && <span className="text-slate-300">{right}</span>}
    </p>
  )
}

function PlayerCountPicker({ value, onChange, cfg }: { value: number; onChange: (n: number) => void; cfg: GameModeMenuConfig }) {
  return (
    <div>
      <SectionLabel right={`${value} players`}>Players</SectionLabel>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cfg.counts.length}, minmax(0, 1fr))` }}>
        {cfg.counts.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={n === value}
            className={`rounded-xl py-2.5 text-[13px] font-black transition-all active:scale-95 ${
              n === value ? 'bg-white/15 text-white shadow-[0_0_16px_rgba(251,191,36,0.35)] ring-2 ring-amber-300/80' : 'bg-white/[0.05] text-slate-400 ring-1 ring-white/10'
            }`}
          >
            {n}P
          </button>
        ))}
      </div>
      {cfg.renderPreview && <div className="mt-3">{cfg.renderPreview(value)}</div>}
    </div>
  )
}

interface SeatVisual {
  seat: Seat
  index: number
  total: number
  badge?: string
  compact?: boolean
  onRemove?: () => void
  cfg: GameModeMenuConfig
}

function SeatRow({ seat, index, total, badge, compact, onRemove, cfg }: SeatVisual) {
  const st = cfg.seatStyle(index, total)
  const where = seat.kind === 'bot' ? 'computer' : seat.kind === 'remote' ? 'online' : 'this device'
  return (
    <div
      className={`ludo-chip-in flex min-w-0 items-center rounded-2xl ${compact ? 'gap-2 px-2 py-1.5' : 'gap-3 px-2.5 py-2'}`}
      style={{ background: `linear-gradient(100deg, ${st.hex}26, rgba(10,10,28,0.5) 55%)`, border: `1px solid ${st.glow}40`, animationDelay: `${index * 40}ms` }}
    >
      <span className={`shrink-0 overflow-hidden rounded-full ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} style={{ boxShadow: `0 0 0 2px ${st.glow}` }}>
        {cfg.renderAvatar(seat.name, index, total)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-extrabold text-white ${compact ? 'text-[12px]' : 'text-sm'}`}>{seat.name}</p>
        <p className={`truncate font-bold uppercase tracking-wider ${compact ? 'text-[8.5px]' : 'text-[10px]'}`} style={{ color: st.glow }}>
          {compact ? (badge ?? where) : `${st.label} · ${where}`}
        </p>
      </div>
      {badge && !compact && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-200">{badge}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${seat.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-300 active:scale-90">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function EmptySeat({ glow, onAdd, compact }: { glow: string; onAdd?: () => void; compact?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center rounded-2xl border border-dashed border-white/15 ${compact ? 'gap-2 px-2 py-1.5' : 'gap-3 px-2.5 py-2'}`}>
      <span className={`relative flex shrink-0 items-center justify-center rounded-full bg-white/[0.04] ${compact ? 'h-8 w-8' : 'h-10 w-10'}`}>
        <span className="absolute h-2.5 w-2.5 animate-ping rounded-full" style={{ background: glow, opacity: 0.6 }} />
        <span className="h-2 w-2 rounded-full" style={{ background: glow }} />
      </span>
      {onAdd ? (
        <button type="button" onClick={onAdd} className="flex min-w-0 flex-1 items-center gap-1 truncate rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-slate-100 active:scale-95">
          <Bot size={13} className="shrink-0" /> <span className="truncate">Add computer</span>
        </button>
      ) : (
        <p className={`min-w-0 flex-1 truncate font-semibold text-slate-400 ${compact ? 'text-[11px]' : 'text-sm'}`}>Waiting…</p>
      )}
    </div>
  )
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button type="button" onClick={onBack} aria-label="Back to modes" className="ludo-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:scale-90">
        <ChevronLeft size={20} strokeWidth={2.6} />
      </button>
      <div className="min-w-0">
        <h2 className="truncate text-xl font-black text-white">{title}</h2>
        {subtitle && <p className="truncate text-xs font-semibold text-slate-400">{subtitle}</p>}
      </div>
    </div>
  )
}

const MODES: { key: ModeKey; title: string; blurb: string; tag: 'Online' | 'Offline'; icon: typeof Bot; hex: string; glow: string }[] = [
  { key: 'online', title: 'Play Online', blurb: 'Get matched with players online', tag: 'Online', icon: Globe, hex: '#f2b01e', glow: '#ffd24a' },
  { key: 'friendsOnline', title: 'Friends Online', blurb: 'Create or join with a room code', tag: 'Online', icon: KeyRound, hex: '#2f7bff', glow: '#5aa5ff' },
  { key: 'local', title: 'Friends Offline', blurb: 'Pass & play on this phone', tag: 'Offline', icon: Smartphone, hex: '#12b886', glow: '#3dffb5' },
  { key: 'solo', title: 'Play Solo', blurb: 'Relaxed game vs easy bots', tag: 'Offline', icon: User, hex: '#8b3dff', glow: '#b98bff' },
  { key: 'computer', title: 'vs Computer', blurb: 'Take on smart bots', tag: 'Offline', icon: Bot, hex: '#e8284f', glow: '#ff4f73' },
]

function ModeTile({ m, i, hero, onClick }: { m: (typeof MODES)[number]; i: number; hero?: boolean; onClick: () => void }) {
  const Icon = m.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ludo-chip-in group relative flex overflow-hidden rounded-3xl p-3.5 text-left transition-transform active:scale-[0.97] ${
        hero ? 'col-span-2 min-h-[6.5rem] flex-row items-center gap-3.5' : 'min-h-[9.5rem] flex-col'
      }`}
      style={{
        animationDelay: `${i * 60}ms`,
        background: `linear-gradient(160deg, ${m.hex}40 0%, rgba(14,12,34,0.82) 55%, rgba(8,7,20,0.9) 100%)`,
        border: `1px solid ${m.glow}55`,
        boxShadow: `0 14px 30px -16px ${m.glow}88, inset 0 1px 0 rgba(255,255,255,0.14)`,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <span className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl" style={{ background: `${m.glow}55` }} />
      <span
        className={`relative flex shrink-0 items-center justify-center rounded-2xl ${hero ? 'h-14 w-14' : 'h-12 w-12'}`}
        style={{ background: `linear-gradient(160deg, ${m.glow}, ${m.hex})`, boxShadow: `0 6px 16px -4px ${m.glow}aa, inset 0 1px 0 rgba(255,255,255,0.5)` }}
      >
        <Icon size={hero ? 28 : 24} className="text-white" strokeWidth={2.4} />
      </span>
      <span className={`relative ${hero ? '' : 'mt-auto'}`}>
        <span className="mb-1 inline-block rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: m.glow }}>
          {m.tag}
        </span>
        <span className={`block font-black leading-tight text-white ${hero ? 'text-lg' : 'text-[15px]'}`}>{m.title}</span>
        <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-slate-300">{m.blurb}</span>
      </span>
    </button>
  )
}

function modeList(cfg: GameModeMenuConfig) {
  const keys = cfg.modes ?? MODES.map((m) => m.key)
  return keys.map((k) => ({ ...MODES.find((m) => m.key === k)!, ...cfg.modeText?.[k] }))
}

function Home({ pick, cfg }: { pick: (m: ModeKey) => void; cfg: GameModeMenuConfig }) {
  return (
    <div>
      <div className="mb-5 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-300/90">Ready to play?</p>
        <h1 className="mt-1 text-[1.7rem] font-black leading-tight text-white">Choose how to play</h1>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {modeList(cfg).map((m, i, all) => (
          <ModeTile key={m.key} m={m} i={i} hero={i === 0 || (i === all.length - 1 && all.length % 2 === 0)} onClick={() => pick(m.key)} />
        ))}
      </div>
    </div>
  )
}

function SeatList({ seats, count, badgeFor, cfg }: { seats: Seat[]; count: number; badgeFor: (s: Seat, i: number) => string | undefined; cfg: GameModeMenuConfig }) {
  const compact = count > 4
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {seats.map((s, i) => (
        <SeatRow key={s.id} seat={s} index={i} total={count} badge={badgeFor(s, i)} compact={compact} cfg={cfg} />
      ))}
    </div>
  )
}

function Setup({ mode, back, go, initialCode, cfg }: { mode: ModeKey; back: () => void; go: (s: Screen) => void; initialCode: string; cfg: GameModeMenuConfig }) {
  const me = usePlayerStore((s) => s.profile)
  const [count, setCount] = useState(cfg.defaultCount)
  const maxCount = Math.max(...cfg.counts)
  const [names, setNames] = useState<string[]>(() => [me.name, ...Array.from({ length: maxCount - 1 }, (_, i) => `Player ${i + 2}`)])
  const [code, setCode] = useState(initialCode)
  const busy = cfg.room.useRoom((s) => s.status === 'connecting')
  const meta = modeList(cfg).find((m) => m.key === mode) ?? MODES.find((m) => m.key === mode)!

  const botSeats = (): Seat[] => [
    { id: 'you', name: me.name, avatarEmoji: me.avatarEmoji, kind: 'local' },
    ...cfg.botNames.slice(0, count - 1).map((b) => ({ id: `bot-${b.name}`, name: b.name, avatarEmoji: b.avatarEmoji, kind: 'bot' as const })),
  ]
  const startOffline = (level: BotLevel) => cfg.match.getState().begin(mode === 'solo' ? 'solo' : 'computer', 'solo', botSeats(), ['you'], level)

  let body: ReactNode = null
  let action: ReactNode = null
  if (mode === 'solo' || mode === 'computer') {
    body = (
      <div className="mt-4">
        <SectionLabel>{mode === 'solo' ? 'Easy opponents' : 'Smart opponents'}</SectionLabel>
        <SeatList seats={botSeats()} count={count} badgeFor={(_, i) => (i === 0 ? 'You' : 'Bot')} cfg={cfg} />
      </div>
    )
    action = <PrimaryButton onClick={() => startOffline(mode === 'solo' ? 'easy' : 'smart')}>Start Game</PrimaryButton>
  } else if (mode === 'local') {
    const compact = count > 4
    body = (
      <div className="mt-4">
        <SectionLabel>Names</SectionLabel>
        <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {Array.from({ length: count }, (_, i) => {
            const st = cfg.seatStyle(i, count)
            return (
              <label
                key={i}
                className={`ludo-chip-in flex min-w-0 items-center rounded-2xl ${compact ? 'gap-2 px-2 py-1.5' : 'gap-3 px-2.5 py-2'}`}
                style={{ background: `linear-gradient(100deg, ${st.hex}26, rgba(10,10,28,0.5) 55%)`, border: `1px solid ${st.glow}40`, animationDelay: `${i * 40}ms` }}
              >
                <span className={`shrink-0 overflow-hidden rounded-full ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} style={{ boxShadow: `0 0 0 2px ${st.glow}` }}>
                  {cfg.renderAvatar(names[i], i, count)}
                </span>
                <input
                  value={names[i]}
                  maxLength={14}
                  onChange={(e) => setNames((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                  className={`min-w-0 flex-1 rounded-xl bg-black/25 font-bold text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-amber-300/70 ${compact ? 'px-2 py-1.5 text-[12px]' : 'px-3 py-2 text-sm'}`}
                  aria-label={`Player ${i + 1} name`}
                />
              </label>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] font-semibold text-slate-400">Pass the phone to whoever's turn it is.</p>
      </div>
    )
    action = (
      <PrimaryButton
        onClick={() => {
          const seats: Seat[] = names.slice(0, count).map((n, i) => ({ id: `p${i + 1}`, name: n.trim() || `Player ${i + 1}`, avatarEmoji: '🙂', kind: 'local' }))
          cfg.match.getState().begin('local', 'solo', seats, seats.map((s) => s.id))
        }}
      >
        Start Game
      </PrimaryButton>
    )
  } else if (mode === 'online') {
    body = (
      <p className="mt-4 rounded-2xl bg-black/20 p-3 text-[12px] font-semibold leading-relaxed text-slate-300 ring-1 ring-white/5">
        We'll look for an open {count}-player table. If nobody joins within {cfg.room.QUICK_WAIT_MS / 1000} seconds, computer players take the empty seats so you never wait long.
      </p>
    )
    action = (
      <PrimaryButton
        onClick={() => {
          void cfg.room.quickMatch(count)
          go({ name: 'quick' })
        }}
      >
        Find Match
      </PrimaryButton>
    )
  } else {
    action = (
      <PrimaryButton
        disabled={busy}
        onClick={() => {
          void cfg.room.createRoom(count)
          go({ name: 'room' })
        }}
      >
        Create {count}-Player Room
      </PrimaryButton>
    )
  }

  return (
    <div>
      <Header title={meta.title} subtitle={meta.blurb} onBack={back} />
      <Panel>
        <PlayerCountPicker value={count} onChange={setCount} cfg={cfg} />
        {body}
      </Panel>
      <div className="mt-4">{action}</div>
      {mode === 'friendsOnline' && (
        <Panel className="mt-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-white">
            <KeyRound size={15} className="text-sky-300" /> Have a code? Join a friend
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              placeholder="ABCDE"
              inputMode="text"
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-2xl bg-black/30 px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.4em] text-white outline-none ring-1 ring-white/15 placeholder:text-slate-600 focus:ring-2 focus:ring-sky-300/70"
              aria-label="Room code"
            />
            <button
              type="button"
              disabled={code.length !== 5 || busy}
              onClick={() => {
                void cfg.room.joinRoom(code)
                go({ name: 'room' })
              }}
              className="rounded-2xl bg-gradient-to-b from-sky-300 to-blue-600 px-5 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_18px_rgba(90,165,255,0.45)] active:scale-95 disabled:opacity-40"
            >
              Join
            </button>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">The host picks the number of players.</p>
        </Panel>
      )}
    </div>
  )
}

function StatusCard({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <Panel className="flex flex-col items-center py-8 text-center">
      {icon}
      <p className="mt-3 text-lg font-black text-white">{title}</p>
      <p className="mt-1 max-w-[18rem] text-sm font-semibold text-slate-400">{text}</p>
      {action && <div className="mt-5 w-full">{action}</div>}
    </Panel>
  )
}

function Seats({ editable, cfg }: { editable: boolean; cfg: GameModeMenuConfig }) {
  const room = cfg.room.useRoom()
  const compact = room.size > 4
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {Array.from({ length: room.size }, (_, i) => {
        const seat = room.seats[i]
        if (!seat)
          return <EmptySeat key={`empty-${i}`} glow={cfg.seatStyle(i, room.size).glow} compact={compact} onAdd={editable && i === room.seats.length ? cfg.room.addComputerSeat : undefined} />
        const badge = seat.id === room.mySeatId ? 'You' : seat.id === 'host' ? 'Host' : seat.kind === 'bot' ? 'Bot' : undefined
        return (
          <SeatRow
            key={seat.id}
            seat={seat}
            index={i}
            total={room.size}
            badge={badge}
            compact={compact}
            cfg={cfg}
            onRemove={editable && seat.id !== 'host' ? () => cfg.room.removeSeat(seat.id) : undefined}
          />
        )
      })}
    </div>
  )
}

function RoomLobby({ back, cfg }: { back: () => void; cfg: GameModeMenuConfig }) {
  const room = cfg.room.useRoom()
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [called, setCalled] = useState(false)
  const partyOthers = usePartyStore((s) => (s.active ? s.members.filter((m) => !m.isUser).length : 0))
  const gameId = getGame(/\/games\/([^/]+)/.exec(cfg.invitePath)?.[1])?.id
  const inviteLink = room.code ? `${location.origin}${cfg.invitePath}?room=${room.code}` : ''

  function copy(what: 'code' | 'link') {
    void navigator.clipboard?.writeText(what === 'code' ? (room.code ?? '') : inviteLink)
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Play with me', text: `Join my room with code ${room.code}`, url: inviteLink })
        return
      } catch {
        /* dismissed */
      }
    }
    copy('link')
  }
  const leave = () => {
    cfg.room.leaveRoom()
    back()
  }

  if (room.status === 'connecting' || room.status === 'idle')
    return (
      <div>
        <Header title="Friends Online" onBack={leave} />
        <StatusCard icon={<Loader2 size={40} className="animate-spin text-sky-300" />} title={room.isHost ? 'Creating room…' : 'Joining room…'} text="Connecting to the online service." />
      </div>
    )
  if (room.status === 'error')
    return (
      <div>
        <Header title="Friends Online" onBack={leave} />
        <StatusCard icon={<X size={40} className="text-rose-400" />} title="Couldn't connect" text={room.error ?? 'Something went wrong.'} action={<PrimaryButton onClick={leave}>Back</PrimaryButton>} />
      </div>
    )
  if (room.status === 'closed')
    return (
      <div>
        <Header title="Friends Online" onBack={leave} />
        <StatusCard icon={<Users size={40} className="text-slate-300" />} title="Room closed" text="The host closed this room." action={<PrimaryButton onClick={leave}>Back</PrimaryButton>} />
      </div>
    )

  return (
    <div>
      <Header title={room.isHost ? 'Your Room' : 'Room'} subtitle={room.isHost ? 'Share the code with your friends' : 'Waiting for the host to start'} onBack={leave} />
      <Panel className="text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Room code</p>
        <p className="ludo-logo-text mt-1 font-mono text-[2.6rem] font-black not-italic leading-none tracking-[0.3em]">{room.code}</p>
        {room.isHost && (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => copy('code')} className="ludo-glass flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white active:scale-95">
              {copied === 'code' ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />} {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            <button type="button" onClick={() => void share()} className="ludo-glass flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white active:scale-95">
              {copied === 'link' ? <Check size={14} className="text-emerald-300" /> : <Share2 size={14} />} {copied === 'link' ? 'Link copied' : 'Share invite'}
            </button>
          </div>
        )}
        {room.isHost && partyOthers > 0 && room.code && gameId && (
          <button
            type="button"
            onClick={() => {
              usePartyStore.getState().launchGame(gameId, room.code)
              setCalled(true)
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-violet-400 to-violet-700 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_18px_rgba(139,92,246,0.45)] active:scale-95"
          >
            {called ? <Check size={14} /> : <Users size={14} />} {called ? 'Party called — they can join now' : `Call my party (${partyOthers}) to this room`}
          </button>
        )}
      </Panel>
      <Panel className="mt-3">
        <SectionLabel right={`${room.seats.length}/${room.size}`}>Players</SectionLabel>
        <Seats editable={room.isHost} cfg={cfg} />
      </Panel>
      <div className="mt-4">
        {room.isHost ? (
          <PrimaryButton disabled={room.seats.length < 2} onClick={cfg.room.startMatch}>
            {room.seats.length < 2 ? 'Need at least 2 players' : room.seats.length < room.size ? `Start with ${room.seats.length} players` : 'Start Game'}
          </PrimaryButton>
        ) : (
          <p className="flex items-center justify-center gap-2 py-3 text-sm font-bold text-slate-300">
            <Loader2 size={16} className="animate-spin" /> Waiting for host to start…
          </p>
        )}
      </div>
    </div>
  )
}

function QuickMatch({ back, cfg }: { back: () => void; cfg: GameModeMenuConfig }) {
  const room = cfg.room.useRoom()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const leave = () => {
    cfg.room.leaveRoom()
    back()
  }
  const wait = cfg.room.QUICK_WAIT_MS
  const secs = room.searchEndsAt ? Math.max(0, Math.ceil((room.searchEndsAt - now) / 1000)) : null
  const progress = room.searchEndsAt ? 1 - Math.max(0, room.searchEndsAt - now) / wait : 0

  if (room.status === 'error')
    return (
      <div>
        <Header title="Play Online" onBack={leave} />
        <StatusCard icon={<Globe size={40} className="text-amber-300" />} title="No match right now" text={room.error ?? 'Something went wrong.'} action={<PrimaryButton onClick={() => void cfg.room.quickMatch(room.size)}>Try again</PrimaryButton>} />
      </div>
    )
  if (room.status === 'closed')
    return (
      <div>
        <Header title="Play Online" onBack={leave} />
        <StatusCard icon={<Users size={40} className="text-slate-300" />} title="Table closed" text="The table you joined was closed." action={<PrimaryButton onClick={() => void cfg.room.quickMatch(room.size)}>Search again</PrimaryButton>} />
      </div>
    )

  return (
    <div>
      <Header title="Play Online" subtitle={room.code ?? `${room.size}-player tables`} onBack={leave} />
      <Panel className="flex flex-col items-center py-7">
        <div className="relative flex h-32 w-32 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute inset-0 animate-ping rounded-full border border-amber-300/50" style={{ animationDelay: `${i * 0.5}s`, animationDuration: '1.8s' }} />
          ))}
          <span className="absolute inset-4 rounded-full bg-gradient-to-b from-amber-300/30 to-amber-600/10 blur-md" />
          <Globe size={48} className="relative text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
        </div>
        <p className="mt-4 text-lg font-black text-white">{room.mySeatId && !room.isHost ? 'Joined a table!' : 'Finding players…'}</p>
        <p className="mt-1 text-center text-xs font-semibold text-slate-400">
          {room.isHost && secs !== null
            ? `Starting in ${secs}s — empty seats get computer players`
            : room.mySeatId
              ? 'Waiting for the match to start'
              : 'Looking for an open table'}
        </p>
        {room.isHost && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </Panel>
      {room.seats.length > 0 && (
        <Panel className="mt-3">
          <SectionLabel right={`${room.seats.length}/${room.size}`}>Players</SectionLabel>
          <Seats editable={false} cfg={cfg} />
        </Panel>
      )}
      <div className="mt-4 flex gap-2">
        {room.isHost && (
          <div className="flex-1">
            <PrimaryButton onClick={cfg.room.startMatch}>Start now</PrimaryButton>
          </div>
        )}
        <button type="button" onClick={leave} className="ludo-glass flex-1 rounded-2xl py-3.5 text-sm font-black uppercase tracking-wider text-white active:scale-95">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Mode select and pre-game lobbies for a board game. */
export default function GameModeMenu(cfg: GameModeMenuConfig) {
  const params = new URLSearchParams(location.search)
  const inviteCode = params.get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) ?? ''
  // a party call (?room=CODE&join=1) drops straight into the room
  const autoJoin = inviteCode.length === 5 && params.get('join') === '1'
  const [screen, setScreen] = useState<Screen>(autoJoin ? { name: 'room' } : inviteCode ? { name: 'setup', mode: 'friendsOnline' } : { name: 'home' })
  const home = () => setScreen({ name: 'home' })
  useEffect(() => {
    if (autoJoin) void cfg.room.joinRoom(inviteCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto w-full max-w-[26rem]">
      {screen.name === 'home' && <Home pick={(mode) => setScreen({ name: 'setup', mode })} cfg={cfg} />}
      {screen.name === 'setup' && <Setup key={screen.mode} mode={screen.mode} back={home} go={setScreen} initialCode={inviteCode} cfg={cfg} />}
      {screen.name === 'room' && <RoomLobby back={() => setScreen({ name: 'setup', mode: 'friendsOnline' })} cfg={cfg} />}
      {screen.name === 'quick' && <QuickMatch back={() => setScreen({ name: 'setup', mode: 'online' })} cfg={cfg} />}
    </div>
  )
}
