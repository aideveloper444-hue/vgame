import { ClipboardList, Gift, MoreHorizontal, PawPrint, Play, ShoppingCart, Users } from 'lucide-react'
import { getAnimal } from '../engine/content'
import { MISSIONS, levelOf, today, useSave } from '../state/progress'
import { ART, headArt } from './art'
import { Wallet, fmt, useFestival, useNav } from './common'
import { sfx } from './sfx'
import Logo from './Logo'

/** Home: the whole pack galloping behind the logo, PLAY, and the five menu buttons. */
export default function HomeScreen({ onPlay }: { onPlay: () => void }) {
  const go = useNav((s) => s.go)
  const selected = useSave((s) => s.selected)
  const xp = useSave((s) => s.xp)
  const best = useSave((s) => s.best)
  const daily = useSave((s) => s.daily)
  const missionTier = useSave((s) => s.missionTier)
  const missionValue = useSave((s) => s.missionValue)
  useSave((s) => s.missionProgress)
  const fest = useFestival()
  const portrait = typeof window !== 'undefined' && window.innerWidth < window.innerHeight
  const a = getAnimal(selected)
  const lv = levelOf(xp)
  const missionsReady = MISSIONS.filter((m) => missionValue(m.type) >= m.target(missionTier[m.type])).length
  const dailyReady = daily.lastClaim !== today()
  const tap = (f: () => void) => () => {
    sfx.tap()
    f()
  }

  const nav = [
    { label: 'Characters', icon: <PawPrint size={26} fill="currentColor" />, on: () => go('select'), dot: 0 },
    { label: 'Store', icon: <ShoppingCart size={26} />, on: () => go('store'), dot: 0 },
    { label: 'Missions', icon: <ClipboardList size={26} />, on: () => go('missions'), dot: missionsReady },
    { label: 'Rewards', icon: <Gift size={26} />, on: () => go('rewards'), dot: dailyReady ? 1 : 0 },
    { label: 'More', icon: <MoreHorizontal size={28} />, on: () => go('more'), dot: 0 },
  ]

  return (
    <div className="wb-layer">
      <div className="wb-layer wb-vignette" />
      <div className="wb-layer wb-safe flex flex-col">
        {/* top row: settings + leaderboard | logo | wallet */}
        <div className="flex items-start gap-2 portrait:flex-wrap">
          <div className="flex shrink-0 flex-col gap-2 portrait:order-1 portrait:flex-row">
            <button className="wb-nav-btn h-[62px] w-[66px] !text-[12px] portrait:h-[52px] portrait:w-[56px] portrait:!text-[10px]" onClick={tap(() => go('settings'))}>
              <img src={ART.settings} alt="" className="h-9 w-11 object-contain" />
              Settings
            </button>
            <button className="wb-nav-btn h-[62px] w-[66px] !text-[12px] portrait:h-[52px] portrait:w-[56px] portrait:!text-[10px]" onClick={tap(() => go('leaderboard'))}>
              <img src={ART.leaderboard} alt="" className="h-9 w-11 object-contain" />
              Leaderboard
            </button>
          </div>
          <div className="wb-home-logo flex min-w-0 flex-1 flex-col items-center portrait:order-3 portrait:basis-full landscape:items-start">
            <Logo size={0.92} className="mt-3 portrait:scale-[0.8] landscape:ml-6" />
            <div className="wb-title mt-1 text-[22px] italic wb-yellow wb-stroke landscape:ml-[64px]" style={{ transform: 'rotate(-4deg)' }}>
              Run · Explore · Survive
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 portrait:order-2 portrait:ml-auto">
            <Wallet compact={portrait} />
            <div className="wb-hud-box !h-8 !px-3 text-[15px] portrait:hidden">
              <span className="wb-yellow">LV {lv.level}</span>
              <span className="h-2 w-20 overflow-hidden rounded-full bg-black/60">
                <span className="block h-full rounded-full" style={{ width: `${(lv.xp / lv.need) * 100}%`, background: 'linear-gradient(90deg,#7dff3a,#2fb80f)' }} />
              </span>
            </div>
            <button className="wb-hud-box !h-11 !pl-1 !pr-4" onClick={tap(() => go('select'))}>
            <img src={headArt(a.id)} alt="" className="h-9 w-9 rounded-lg object-cover" />
            <span className="text-left leading-none">
              <span className="block text-[18px]">{a.name}</span>
              <span className="block text-[13px] wb-yellow" style={{ fontFamily: 'Barlow Condensed' }}>
                {a.species} · {a.ability.name}
              </span>
            </span>
          </button>
            {fest.active && (
              <button className="wb-card wb-shine flex items-center gap-2 !rounded-xl px-2 py-1" onClick={tap(() => go('events'))}>
                <img src={ART.eventMask} alt="" className="h-10 w-8 object-cover" />
                <span className="text-left text-[13px] leading-tight">
                  <span className="wb-title block text-[16px] wb-yellow">Jungle Festival</span>
                  {fest.joined ? `${fest.tokens} tokens` : 'Join now!'}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* the chosen runner and PLAY */}
        <div className="flex flex-col items-center gap-3">

          <button className="wb-btn wb-btn-gold wb-pulse h-[64px] w-[min(78vw,300px)] text-[40px]" onClick={() => (sfx.tap(), onPlay())}>
            <Play size={34} fill="currentColor" strokeWidth={0} /> PLAY
          </button>
          <button className="wb-btn wb-btn-blue h-[46px] w-[min(78vw,300px)] text-[24px]" onClick={tap(() => go('race'))}>
            <Users size={24} /> Play with Friends
          </button>
          {best.score > 0 && (
            <div className="text-[14px] text-white/85 wb-shadow">
              Best {fmt(best.score)} · {fmt(best.distance)} m
            </div>
          )}
        </div>

        <div className="mt-3 grid w-full grid-cols-5 gap-2 self-center sm:max-w-[560px]">
          {nav.map((n) => (
            <button key={n.label} className="wb-nav-btn h-[62px]" onClick={tap(n.on)}>
              {n.icon}
              <span className="wb-shadow">{n.label}</span>
              {n.dot > 0 && <span className="wb-dot">{n.dot}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
