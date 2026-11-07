import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import bannerWelcome from '../art/banner_welcome.webp'
import tourneyHero from '../art/tourney_hero.webp'
import gift from '../art/gift.webp'
import vipCrown from '../art/vip_crown.webp'
import chipsPurple from '../art/chips_purple.webp'
import tileSpade from '../art/tile_spade.webp'
import tileFriends from '../art/tile_friends.webp'
import tileTrophy from '../art/tile_trophy.webp'
import tileCrown from '../art/tile_crown.webp'
import modeClassic from '../art/mode_classic.webp'
import modeTourney from '../art/mode_tourney.webp'
import modePrivate from '../art/mode_private.webp'
import modePractice from '../art/mode_practice.webp'
import { Avatar, LevelBadge, PointsPill, Sheet, toast } from '../kit'
import { BellIcon, GearIcon } from '../icons'
import BottomNav from '../BottomNav'
import { useNav } from '../../state/nav'
import { levelInfo, useProfile, useRpc } from '../../state/profileStore'
import { openPractice } from '../../state/tableStore'
import { sitCash } from '../../state/play'
import { TABLE_TIERS, nextStart, tournament } from '../../data/tables'

/** Screen 3: the lobby. */
export default function Home() {
  const p = useProfile()
  const go = useNav((s) => s.go)
  const tab = useNav((s) => s.tab)
  const markNoticesRead = useRpc((s) => s.markNoticesRead)
  const [notices, setNotices] = useState(false)
  if (!p) return null
  const { level } = levelInfo(p.xp)
  const unread = p.notices.filter((n) => !n.read).length

  const playNow = () => {
    // the best classic table this player can afford
    const fit = [...TABLE_TIERS].reverse().find((t) => t.mode === 'classic' && level >= t.minLevel && p.balance >= t.buyIn) ?? TABLE_TIERS.find((t) => t.id === 'bronze')!
    if (p.balance < fit.bigBlind * 20) {
      toast('You’re low on points. Claim your free bonus first!', 'bad')
      return tab('rewards')
    }
    sitCash(fit.id)
  }

  return (
    <div className="rpc-screen rpc-with-nav">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: 'radial-gradient(90% 70% at 50% 0%, rgba(255,190,70,.14), transparent 70%)' }} />

      {/* header */}
      <header className="relative flex items-start gap-3 px-4 pt-3">
        <button onClick={() => tab('profile')} aria-label="My profile">
          <Avatar avatar={p.avatar} size={68} />
        </button>
        <div className="min-w-0 flex-1 pt-2">
          <p className="rpc-display truncate text-[1.35em] leading-tight text-white">{p.name}</p>
          <LevelBadge level={level} className="mt-0.5 text-[1.2em]" />
        </div>
        <div className="flex flex-col items-end gap-2 pt-1">
          <div className="flex gap-2.5">
            <button aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setNotices(true)} className="icon-btn relative h-11 w-11">
              <BellIcon size={24} />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#e8242f] px-1 text-[11px] font-bold text-white">{unread}</span>}
            </button>
            <button aria-label="Settings" onClick={() => go('settings')} className="icon-btn h-11 w-11">
              <GearIcon size={24} />
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <PointsPill amount={p.balance} onAdd={() => tab('rewards')} />
          </div>
        </div>
      </header>

      <Carousel
        slides={[
          { key: 'welcome', onClick: playNow, node: <BannerWelcome /> },
          { key: 'tourney', onClick: () => go('tournament'), node: <BannerTourney /> },
          { key: 'bonus', onClick: () => tab('rewards'), node: <BannerArt art={gift} title="DAILY BONUS" sub="Free points every day" tint="#8a1020" /> },
          { key: 'vip', onClick: () => go('shop', { tab: 'vip' }), node: <BannerArt art={vipCrown} title="VIP CLUB" sub="Exclusive tables & looks" tint="#5a2a00" /> },
          { key: 'friends', onClick: () => go('friends'), node: <BannerArt art={chipsPurple} title="INVITE FRIENDS" sub="Private rooms for your crew" tint="#3a1078" /> },
        ]}
      />

      {/* the four big modes */}
      <div className="mt-4 grid grid-cols-2 gap-3 px-4">
        <ModeTile art={tileSpade} title="Play Now" sub="Join Table" bg="linear-gradient(160deg,#4fe36a 0%,#1aa83a 45%,#0c6b22 100%)" onClick={playNow} />
        <ModeTile art={tileFriends} title="Play with" title2="Friends" bg="linear-gradient(160deg,#c06cff 0%,#8a2be2 45%,#4b0f95 100%)" onClick={() => go('room')} />
        <ModeTile art={tileTrophy} title="Tournament" sub="Win Big Prizes" bg="linear-gradient(160deg,#ffd76a 0%,#e5a520 45%,#9c6205 100%)" onClick={() => go('tournament')} />
        <ModeTile art={tileCrown} title="VIP" sub="Exclusive Tables" bg="linear-gradient(160deg,#ff5a66 0%,#d0182a 45%,#7d0612 100%)" onClick={() => go('poker', { filter: 'vip' })} />
      </div>

      {/* game modes row */}
      <div className="mt-5 flex items-center justify-between px-4">
        <h3 className="rpc-display text-[1.3em] text-white">Game Modes</h3>
        <button className="rpc-display flex items-center text-[1.1em] text-white" onClick={() => tab('poker')}>
          See All <ChevronRight size={20} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 px-2">
        <ModeCircle art={modeClassic} label="Classic Game" onClick={() => go('poker', { filter: 'classic' })} />
        <ModeCircle art={modeTourney} label="Tournament" onClick={() => go('tournament')} />
        <ModeCircle art={modePrivate} label="Private Room" onClick={() => go('room')} />
        <ModeCircle
          art={modePractice}
          label="Practice"
          onClick={() => {
            openPractice()
            go('table')
          }}
        />
      </div>

      <BottomNav />

      <Sheet
        open={notices}
        onClose={() => {
          setNotices(false)
          markNoticesRead()
        }}
        title="Notifications"
      >
        {p.notices.length === 0 ? (
          <p className="rpc-muted py-6 text-center">You’re all caught up.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {p.notices.slice(0, 30).map((n) => (
              <li key={n.id} className="dark-frame rounded-xl px-3 py-2.5">
                <p className="rpc-display text-white">
                  {!n.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#e8242f] align-middle" />}
                  {n.title}
                </p>
                <p className="rpc-muted text-[0.9em]">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  )
}

/* ---------------------------------------------------------------- banner carousel */

function Carousel({ slides }: { slides: { key: string; onClick: () => void; node: ReactNode }[] }) {
  const [i, setI] = useState(0)
  const startX = useRef<number | null>(null)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % slides.length), 5000)
    return () => clearInterval(t)
  }, [slides.length, i])
  return (
    <div className="mt-3 px-3">
      <div
        className="relative overflow-hidden rounded-[18px]"
        style={{ aspectRatio: '2.02', boxShadow: '0 0 0 1.5px #e9b33a, 0 0 0 3px rgba(80,50,8,.9), 0 0 22px rgba(255,190,60,.45)' }}
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current == null) return
          const dx = e.clientX - startX.current
          startX.current = null
          if (Math.abs(dx) > 40) setI((v) => (v + (dx < 0 ? 1 : slides.length - 1)) % slides.length)
          else slides[i].onClick()
        }}
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured"
      >
        <div className="flex h-full transition-transform duration-500" style={{ transform: `translateX(-${i * 100}%)` }}>
          {slides.map((s, k) => (
            <div key={s.key} className="h-full w-full shrink-0" aria-hidden={k !== i}>
              {s.node}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {slides.map((s, k) => (
          <button key={s.key} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className="h-2.5 w-2.5 rounded-full" style={{ background: k === i ? 'var(--gold-fill)' : k < i ? '#c9a24a' : '#666', boxShadow: k === i ? '0 0 8px #ffcf55' : 'none' }} />
        ))}
      </div>
    </div>
  )
}

function BannerWelcome() {
  return (
    <div className="relative h-full w-full" style={{ containerType: 'inline-size' }}>
      <img src={bannerWelcome} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute left-[4%] top-[16%] flex flex-col">
        <span className="rpc-display gold-text" style={{ fontSize: '8.6cqw', lineHeight: 1.05, fontWeight: 700 }}>
          WELCOME TO
        </span>
        <span className="rpc-display gold-text" style={{ fontSize: '9.4cqw', lineHeight: 1.05, fontWeight: 700 }}>
          ROYAL POKER CLUB
        </span>
        <span className="rpc-display text-white" style={{ fontSize: '5.6cqw', marginTop: '1.5cqw', textShadow: '0 2px 4px #000' }}>
          Play Bigger. Win Bigger.
        </span>
      </div>
    </div>
  )
}

function BannerTourney() {
  const def = tournament('daily')!
  const at = nextStart(def)
  return (
    <div className="relative h-full w-full" style={{ containerType: 'inline-size' }}>
      <img src={tourneyHero} alt="" className="absolute inset-0 h-full w-full object-cover object-top" draggable={false} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(20,6,40,.85) 0%, rgba(20,6,40,.35) 55%, transparent)' }} />
      <div className="absolute left-[5%] top-[18%] flex flex-col">
        <span className="rpc-display gold-text" style={{ fontSize: '8.8cqw', lineHeight: 1.05, fontWeight: 700 }}>
          DAILY POKER
          <br />
          TOURNAMENT
        </span>
        <span className="rpc-display text-white" style={{ fontSize: '5cqw', marginTop: '1.5cqw' }}>
          {at ? `Starts ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · free entry` : 'Free entry'}
        </span>
      </div>
    </div>
  )
}

function BannerArt({ art, title, sub, tint }: { art: string; title: string; sub: string; tint: string }) {
  return (
    <div className="relative flex h-full w-full items-center" style={{ containerType: 'inline-size', background: `radial-gradient(90% 120% at 80% 50%, ${tint}, #0a0604 75%)` }}>
      <div className="z-10 flex flex-col pl-[5%]">
        <span className="rpc-display gold-text" style={{ fontSize: '10cqw', fontWeight: 700, lineHeight: 1.05 }}>
          {title}
        </span>
        <span className="rpc-display text-white" style={{ fontSize: '5.4cqw', marginTop: '1cqw' }}>
          {sub}
        </span>
      </div>
      <img src={art} alt="" className="rpc-float absolute right-[4%] h-[82%] w-auto object-contain" style={{ maskImage: 'radial-gradient(closest-side, #000 72%, transparent)' }} draggable={false} />
    </div>
  )
}

/* ---------------------------------------------------------------- tiles */

function ModeTile({ art, title, title2, sub, bg, onClick }: { art: string; title: string; title2?: string; sub?: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rpc-shine relative flex h-[96px] items-center overflow-hidden rounded-[16px] text-left active:scale-[.98]" style={{ background: bg, boxShadow: '0 0 0 1.5px #f2c45a, 0 0 0 3px rgba(60,35,5,.9), 0 6px 16px rgba(0,0,0,.6), inset 0 2px 0 rgba(255,255,255,.35)' }}>
      <img src={art} alt="" className="ml-0.5 h-[64px] w-[64px] shrink-0 object-contain" style={{ maskImage: 'radial-gradient(closest-side, #000 70%, transparent)', mixBlendMode: 'screen' }} draggable={false} />
      <span className="flex flex-col pr-2">
        <span className="rpc-display text-[1.18em] leading-tight text-white" style={{ textShadow: '0 2px 3px rgba(0,0,0,.45)' }}>
          {title}
          {title2 && (
            <>
              <br />
              {title2}
            </>
          )}
        </span>
        {sub && (
          <span className="rpc-display flex items-center whitespace-nowrap text-[0.78em] text-white/95" style={{ textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>
            {sub} <ChevronRight size={16} strokeWidth={3} />
          </span>
        )}
      </span>
    </button>
  )
}

function ModeCircle({ art, label, onClick }: { art: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 active:scale-95">
      <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full" style={{ background: 'radial-gradient(circle at 50% 35%, #2e2213, #0a0705)', boxShadow: '0 0 0 2px #d9a335, 0 0 14px rgba(255,190,60,.35)' }}>
        <img src={art} alt="" className="h-[86%] w-[86%] object-contain" style={{ maskImage: 'radial-gradient(closest-side, #000 74%, transparent)' }} draggable={false} />
      </span>
      <span className="rpc-display whitespace-nowrap text-[0.82em] text-white">{label}</span>
    </button>
  )
}
