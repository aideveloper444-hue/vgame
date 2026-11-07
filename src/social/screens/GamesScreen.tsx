import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Info, Play, Trophy, Users } from 'lucide-react'
import { GAME_LIST, type GameDefinition } from '@/games/registry'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { Avatar } from '@/social/components/ui'
import { adsAvailable, removeBanner, showBanner } from '@/lib/ads'

type Filter = 'all' | 'friends' | 'solo'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All games' },
  { key: 'friends', label: 'With friends' },
  { key: 'solo', label: 'Solo' },
]

const KIND: Record<GameDefinition['id'], string> = {
  ludo: 'Board game',
  city: 'Strategy',
  mess: 'Party race',
  amazon: 'Racing',
  mystery: 'Detective',
  poker: 'Card game',
  wildbound: 'Endless runner',
}

function PosterCard({ game, active, onPlay, onInfo, partyCount }: { game: GameDefinition; active: boolean; onPlay: () => void; onInfo: () => void; partyCount: number }) {
  const friends = useFriendsStore((s) => s.friends)
  const playing = friends.filter((f) => f.currentGameId === game.id && f.online)
  const stats = usePlayerStore((s) => s.stats[game.id])

  return (
    <article
      className="poster-card relative flex h-[min(64vh,500px)] w-[min(76vw,330px)] md:h-[min(66vh,760px)] md:w-[min(44vh,58vw,500px)] shrink-0 flex-col overflow-hidden rounded-[32px] border border-white/10 bg-surface-2"
      data-active={active}
      style={{ boxShadow: active ? `0 30px 60px -24px ${game.accentHex}cc, 0 0 0 1px ${game.accentHex}55` : undefined }}
      aria-label={game.name}
    >
      <img src={`/posters/${game.id}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[62%]" style={{ background: `linear-gradient(to top, #07091a 30%, #07091ae6 52%, transparent)` }} />
      {active && (
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent poster-shine" />
      )}

      <div className="relative flex items-start justify-between gap-2 p-4">
        <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-md" style={{ color: game.accentHex }}>
          {KIND[game.id]}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-extrabold text-white backdrop-blur-md">
          <Users size={12} /> {game.playersLabel}
        </span>
      </div>

      <div className="relative mt-auto p-5 pt-0">
        {playing.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {playing.slice(0, 3).map((f) => (
                <Avatar key={f.id} emoji={f.avatarEmoji} size="xs" />
              ))}
            </div>
            <span className="text-[11px] font-bold text-emerald-300">{playing.length === 1 ? `${playing[0].name} is playing` : `${playing.length} friends playing`}</span>
          </div>
        )}
        <h2 className="text-[1.9rem] font-black leading-[1.02] tracking-tight text-white drop-shadow-lg">{game.name}</h2>
        <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug text-slate-300">{game.tagline}</p>
        <div className="mt-2 flex items-center gap-3 text-[11px] font-bold text-slate-400">
          <span className="flex items-center gap-1">
            <Trophy size={12} className="text-amber-300" /> {stats.wins} wins
          </span>
          <span>{stats.played} played</span>
          <span>{game.difficulty}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onPlay}
            tabIndex={active ? 0 : -1}
            className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-black uppercase tracking-wider text-white transition-transform active:scale-[0.96] ${active ? 'play-pulse' : ''}`}
            style={{ background: `linear-gradient(135deg, ${game.accentHex}, ${game.accentHex}bb)`, ['--glow' as string]: `${game.accentHex}99` }}
          >
            <Play size={20} className="fill-white" /> {partyCount > 0 ? 'Play with party' : 'Play'}
          </button>
          <button
            type="button"
            onClick={onInfo}
            tabIndex={active ? 0 : -1}
            aria-label={`About ${game.name}`}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md active:scale-90"
          >
            <Info size={20} />
          </button>
        </div>
      </div>
    </article>
  )
}

export default function GamesScreen() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const partyOthers = usePartyStore((s) => (s.active ? s.members.filter((m) => !m.isUser).length : 0))
  const launchGame = usePartyStore((s) => s.launchGame)

  const games = GAME_LIST.filter((g) => (filter === 'all' ? true : filter === 'friends' ? g.maxPlayers > 1 : g.singlePlayerCapable))

  const onScroll = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const mid = el.scrollLeft + el.clientWidth / 2
    let best = 0
    let bestD = Infinity
    Array.from(el.children).forEach((c, i) => {
      const n = c as HTMLElement
      const d = Math.abs(n.offsetLeft + n.offsetWidth / 2 - mid)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setActive(best)
  }, [])

  const goTo = useCallback((i: number) => {
    const el = trackRef.current
    const card = el?.children[i] as HTMLElement | undefined
    if (!el || !card) return
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' })
  }, [])

  // a banner under the game list (Android only); it goes away when you leave this screen
  useEffect(() => {
    void showBanner()
    return () => void removeBanner()
  }, [])

  useEffect(() => {
    setActive(0)
    trackRef.current?.scrollTo({ left: 0 })
  }, [filter])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(Math.min(games.length - 1, active + 1))
      if (e.key === 'ArrowLeft') goTo(Math.max(0, active - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, games.length, goTo])

  function play(g: GameDefinition) {
    if (partyOthers > 0) launchGame(g.id)
    navigate(`/games/${g.id}/play`)
  }

  return (
    <div className={`relative mx-auto max-w-5xl overflow-hidden pt-4 ${adsAvailable ? 'pb-20' : 'pb-6'}`}>
      <div className="px-5">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-2">Game library</p>
        <h1 className="mt-0.5 text-[1.75rem] font-black leading-tight text-white">Choose a game</h1>
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition-colors ${
              filter === f.key ? 'bg-white text-surface-0' : 'bg-white/[0.06] text-slate-300 ring-1 ring-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative mt-4">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="poster-track no-scrollbar flex gap-3 overflow-x-auto py-4"
          style={{ paddingInline: 'calc(50% - min(38vw, 165px))' }}
          data-testid="poster-track"
        >
          {games.map((g, i) => (
            <PosterCard
              key={g.id}
              game={g}
              active={i === active}
              partyCount={partyOthers}
              onPlay={() => (i === active ? play(g) : goTo(i))}
              onInfo={() => navigate(`/games/${g.id}`)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(Math.max(0, active - 1))}
          aria-label="Previous game"
          className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur md:flex"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          onClick={() => goTo(Math.min(games.length - 1, active + 1))}
          aria-label="Next game"
          className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur md:flex"
        >
          <ChevronRight />
        </button>
      </div>

      <div className="mt-1 flex justify-center gap-1.5" role="tablist" aria-label="Games">
        {games.map((g, i) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={g.name}
            onClick={() => goTo(i)}
            className="h-2 rounded-full transition-all"
            style={{ width: i === active ? 22 : 8, background: i === active ? g.accentHex : 'rgba(255,255,255,0.2)' }}
          />
        ))}
      </div>

      <div className="no-scrollbar mt-6 flex gap-2.5 overflow-x-auto px-5">
        {games.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => goTo(i)}
            className={`flex shrink-0 items-center gap-2 rounded-2xl p-1.5 pr-3 ring-1 transition-colors ${i === active ? 'bg-white/10 ring-white/25' : 'bg-white/[0.03] ring-white/[0.06]'}`}
          >
            <img src={`/posters/${g.id}.webp`} alt="" className="h-9 w-9 rounded-xl object-cover" />
            <span className="text-xs font-bold text-slate-200">{g.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
