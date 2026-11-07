import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Coins, Crown, Flag, Lock, Magnet, Pause, Play, PlayCircle, Shield, Timer, Trophy, Users, X, Zap } from 'lucide-react'
import AmazonScene3D from './AmazonScene3D'
import { ANIMALS, getAnimal, type AnimalDef } from './amazonTrackData'
import {
  REVIVE_COST,
  declineRevive,
  fastForwardBots,
  jump,
  localRunner,
  moveLane,
  packRunner,
  resetRace,
  revive,
  setupRace,
  sim,
  slide,
  step,
  useAmazonUI,
  type RaceSeat,
  type ResultRow,
} from './amazonStore'
import { useAmazonProgress } from './amazonProgress'
import { AMAZON_BOT_NAMES, amazonRoom, broadcastGo, leaveAmazonRoom, sendAmazonAction, setAmazonNetHandlers, useAmazonMatch, useAmazonRoom } from './amazonNet'
import GameModeMenu from '@/games/shared/online/GameModeMenu'
import Confetti from '@/games/shared/Confetti'
import { completeGameSession } from '@/lib/gameSession'
import { adsAvailable, watchRewardedAd } from '@/lib/ads'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { usePartyStore } from '@/social/stores/usePartyStore'

/*
 * Amazon Wild Run: pick an animal, then run alone, race the computer, or race friends online.
 * The jungle runs live behind the menu with your chosen animal.
 */

function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
}

/** Drive the race simulation from animation frames while mounted (paused stops time). */
function useRaceLoop(paused = false) {
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      if (!pausedRef.current) step(dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}

const SEAT_COLORS = ['#22c55e', '#f59e0b', '#38bdf8', '#f43f5e', '#a78bfa', '#fb923c']

function pickBotAnimals(n: number, avoid: string): string[] {
  const pool = ANIMALS.map((a) => a.id).filter((id) => id !== avoid)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    if (!pool.length) pool.push(...ANIMALS.map((a) => a.id))
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}

function newSeed() {
  return (Math.random() * 0xffffffff) >>> 0
}

export default function AmazonGame() {
  const screen = useAmazonMatch((s) => s.screen)
  const matchId = useAmazonMatch((s) => s.matchId)
  useLockBodyScroll()
  useEffect(() => {
    return () => {
      leaveAmazonRoom()
      useAmazonMatch.getState().backToMenu()
      resetRace()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0d1a10] text-white select-none">
      <AmazonScene3D className="absolute inset-0 h-full w-full" menu={screen !== 'game'} />
      {screen === 'game' ? <RaceView key={matchId} /> : <MenuView />}
    </div>
  )
}

// ================================================================ menu

function startAttract(animalId: string) {
  setupRace({ seed: newSeed(), mode: 'solo', host: true, localId: 'demo', seats: [{ id: 'demo', name: '', avatarEmoji: '', kind: 'bot', animalId }] })
  const r = sim.runners[0]
  r.botMiss = 0
  r.botLimit = Infinity
  sim.t = 0
  sim.phase = 'running'
}

function MenuView() {
  const navigate = useNavigate()
  const selected = useAmazonProgress((s) => s.selected)
  const best = useAmazonProgress((s) => s.best)
  const coins = usePlayerStore((s) => s.profile.coins)
  const hasInvite = new URLSearchParams(location.search).has('room')
  const [panel, setPanel] = useState<'home' | 'modes'>(hasInvite ? 'modes' : 'home')
  const [focusId, setFocusId] = useState(selected)
  const focusOwned = useAmazonProgress((s) => s.owned.includes(focusId))
  const phase = useAmazonUI((s) => s.phase)
  useRaceLoop()

  // the selected animal runs the trail behind the menu; restart it when it trips
  useEffect(() => {
    startAttract(focusId)
  }, [focusId])
  useEffect(() => {
    if (phase === 'over') startAttract(focusId)
  }, [phase, focusId])

  const focus = getAnimal(focusId)

  function runSolo() {
    const me = usePlayerStore.getState().profile
    useAmazonMatch.getState().begin('solo', 'solo', [{ id: 'you', name: me.name, avatarEmoji: me.avatarEmoji, kind: 'local' }], ['you'])
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,14,8,0.82)_0%,rgba(4,14,8,0.15)_32%,rgba(4,14,8,0.05)_50%,rgba(4,14,8,0.88)_74%,rgba(4,10,6,0.97)_100%)]" />

      <header className="relative flex items-center justify-between gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => (panel === 'modes' ? (leaveAmazonRoom(), setPanel('home')) : navigate('/games'))}
          aria-label="Back"
          className="hud-glass flex h-10 w-10 items-center justify-center rounded-full active:scale-90"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2">
          <span className="hud-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black text-amber-300">
            <Coins size={15} /> {coins.toLocaleString()}
          </span>
          <span className="hud-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black text-emerald-300">
            <Flag size={14} /> {best.toLocaleString()} m
          </span>
        </div>
      </header>

      {panel === 'home' ? (
        <>
          <div className="relative mt-3 px-5 text-center sm:text-left">
            <h1 className="leading-[0.9]">
              <span className="wild-outline block text-[2.1rem] font-black tracking-wide sm:text-5xl">AMAZON</span>
              <span className="wild-title block text-[3.1rem] font-black tracking-wide sm:text-7xl">WILD RUN</span>
            </h1>
            <p className="mt-2 text-[13px] font-bold text-emerald-100/85">Choose your beast. Outrun the jungle.</p>
          </div>

          <div className="flex-1" />

          <div className="relative px-3 pb-[max(14px,env(safe-area-inset-bottom))] wide:absolute wide:bottom-0 wide:right-4 wide:w-[min(32rem,44vw)] wide:px-0">
            <AnimalInfo animal={focus} onUnlocked={() => setFocusId(focus.id)} />
            <AnimalPicker focusId={focusId} onFocus={setFocusId} />
            <div className="mx-auto mt-3 grid max-w-xl grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={runSolo}
                disabled={!focusOwned}
                className="wild-cta col-span-2 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-2xl font-black tracking-wider disabled:opacity-50"
              >
                <Play size={24} fill="currentColor" /> RUN
              </button>
              <button
                type="button"
                onClick={() => setPanel('modes')}
                disabled={!focusOwned}
                className="wild-btn col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-400 to-orange-600 py-3 text-lg font-black tracking-wide disabled:opacity-50"
              >
                <Users size={20} /> RACE FRIENDS &amp; RIVALS
              </button>
            </div>
            <p className="mt-2.5 text-center text-[11px] font-semibold text-slate-300/80">Swipe ← → to change lanes · ↑ to jump logs · ↓ to slide under branches</p>
          </div>
        </>
      ) : (
        <div className="relative flex-1 overflow-y-auto px-3 pb-8 pt-3">
          <div className="mx-auto mb-3 flex max-w-[26rem] items-center gap-3 rounded-2xl bg-black/35 p-2.5 ring-1 ring-white/10">
            <img src={focus.portrait} alt="" className="h-12 w-12 rounded-xl bg-emerald-950/60 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Racing as</p>
              <p className="truncate text-base font-black">{focus.name}</p>
            </div>
            <button type="button" onClick={() => setPanel('home')} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider active:scale-95">
              Change
            </button>
          </div>
          <GameModeMenu
            counts={[2, 3, 4, 5, 6]}
            defaultCount={4}
            modes={['friendsOnline', 'online', 'computer']}
            modeText={{
              friendsOnline: { title: 'Race Friends', blurb: 'Create a room or join with a code' },
              online: { title: 'Play Online', blurb: 'Race players from anywhere' },
              computer: { title: 'vs Computer', blurb: 'Race jungle rivals' },
            }}
            seatStyle={(i) => ({ hex: SEAT_COLORS[i % 6], glow: SEAT_COLORS[i % 6], label: `lane ${i + 1}` })}
            renderAvatar={(name, i) => (
              <span className="flex h-full w-full items-center justify-center text-sm font-black" style={{ background: `radial-gradient(circle at 35% 30%, ${SEAT_COLORS[i % 6]}, #06180c 75%)` }}>
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            renderPreview={(n) => (
              <div className="flex items-center gap-3 rounded-2xl bg-black/25 p-2.5 ring-1 ring-white/5">
                <div className="flex -space-x-3">
                  {ANIMALS.slice(0, n).map((a) => (
                    <img key={a.id} src={a.portrait} alt="" className="h-11 w-11 rounded-full bg-emerald-950 object-contain ring-2 ring-[#0b1a10]" />
                  ))}
                </div>
                <p className="text-[11px] font-semibold leading-snug text-slate-300">{n} runners, one endless jungle. Whoever runs the farthest is crowned Alpha.</p>
              </div>
            )}
            botNames={AMAZON_BOT_NAMES}
            match={useAmazonMatch}
            room={amazonRoom}
            invitePath="/games/amazon/play"
          />
        </div>
      )}
    </div>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[9.5px] font-black uppercase tracking-wider text-slate-300">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${value * 10}%`, background: color }} />
      </div>
    </div>
  )
}

function AnimalInfo({ animal, onUnlocked }: { animal: AnimalDef; onUnlocked: () => void }) {
  const owned = useAmazonProgress((s) => s.owned.includes(animal.id))
  const ads = useAmazonProgress((s) => s.adsWatched[animal.id] ?? 0)
  const coins = usePlayerStore((s) => s.profile.coins)
  const [busy, setBusy] = useState(false)

  function buy() {
    if (usePlayerStore.getState().spendCoins(animal.price)) {
      useAmazonProgress.getState().unlock(animal.id)
      onUnlocked()
    }
  }
  async function watch() {
    setBusy(true)
    try {
      if (await watchRewardedAd()) useAmazonProgress.getState().addAdView(animal.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mb-2.5 flex max-w-xl items-center gap-3 rounded-2xl bg-black/45 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-md">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="truncate text-lg font-black">{animal.name}</span>
          <span className="truncate text-[11px] font-bold text-emerald-300">{animal.blurb}</span>
        </p>
        <div className="mt-1 space-y-1">
          <StatBar label="Speed" value={animal.speed} color="#f87171" />
          <StatBar label="Jump" value={animal.jump} color="#38bdf8" />
          <StatBar label="Stamina" value={animal.stamina} color="#4ade80" />
        </div>
      </div>
      {!owned && (
        <div className="flex w-[7.5rem] shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={buy}
            disabled={coins < animal.price}
            className="wild-btn flex items-center justify-center gap-1 rounded-xl bg-gradient-to-b from-amber-300 to-amber-600 py-2 text-[13px] font-black text-amber-950 disabled:opacity-45"
          >
            <Lock size={13} /> {animal.price} <Coins size={13} />
          </button>
          {animal.ads && adsAvailable && (
            <button type="button" onClick={() => void watch()} disabled={busy} className="wild-btn flex items-center justify-center gap-1 rounded-xl bg-gradient-to-b from-sky-400 to-blue-700 py-1.5 text-[11px] font-black disabled:opacity-50">
              <PlayCircle size={13} /> Ad {ads}/{animal.ads}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AnimalPicker({ focusId, onFocus }: { focusId: string; onFocus: (id: string) => void }) {
  const owned = useAmazonProgress((s) => s.owned)
  const selected = useAmazonProgress((s) => s.selected)
  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] wide:mx-0 wide:overflow-visible wide:px-0">
      <div className="mx-auto flex w-max gap-2 wide:grid wide:w-full wide:grid-cols-4">
        {ANIMALS.map((a) => {
          const isOwned = owned.includes(a.id)
          const active = a.id === focusId
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onFocus(a.id)
                if (isOwned) useAmazonProgress.getState().select(a.id)
              }}
              className={`relative flex w-[4.6rem] shrink-0 flex-col items-center overflow-hidden rounded-2xl pb-1.5 wide:w-full transition-all active:scale-95 ${
                active ? 'bg-emerald-400/25 ring-2 ring-emerald-300 shadow-[0_0_18px_rgba(74,222,128,0.45)]' : 'bg-black/45 ring-1 ring-white/10'
              }`}
            >
              <img src={a.portrait} alt="" className={`h-[4.2rem] w-full object-contain ${isOwned ? '' : 'opacity-60 grayscale-[60%]'}`} draggable={false} />
              <span className="w-full truncate px-1 text-[10.5px] font-black">{a.name.replace('Black ', '').replace('Grey ', '')}</span>
              <span className={`text-[9px] font-black uppercase ${a.id === selected ? 'text-emerald-300' : isOwned ? 'text-slate-300' : 'text-amber-300'}`}>
                {a.id === selected ? 'Selected' : isOwned ? 'Owned' : `${a.price} coins`}
              </span>
              {!isOwned && <Lock size={12} className="absolute right-1.5 top-1.5 text-amber-300" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ================================================================ race

function RaceView() {
  const role = useAmazonMatch((s) => s.role)
  const seats = useAmazonMatch((s) => s.seats)
  const localSeatIds = useAmazonMatch((s) => s.localSeatIds)
  const botLevel = useAmazonMatch((s) => s.botLevel)
  const roomStatus = useAmazonRoom((s) => s.status)
  const myAnimal = useAmazonProgress((s) => s.selected)
  const phase = useAmazonUI((s) => s.phase)
  const results = useAmazonUI((s) => s.results)
  const [paused, setPaused] = useState(false)
  const [waiting, setWaiting] = useState(role !== 'solo')
  const online = role !== 'solo'
  const localId = localSeatIds[0] ?? 'you'
  useRaceLoop(paused)

  // ---- start
  useEffect(() => {
    if (role === 'solo') {
      const botAnimals = pickBotAnimals(seats.length, myAnimal)
      const raceSeats: RaceSeat[] = seats.map((s, i) => ({ id: s.id, name: s.name, avatarEmoji: s.avatarEmoji, kind: s.kind === 'bot' ? 'bot' : 'local', animalId: s.kind === 'bot' ? botAnimals[i] : myAnimal }))
      setupRace({ seed: newSeed(), mode: seats.length > 1 ? 'bots' : 'solo', host: true, localId, seats: raceSeats, botLevel })
      return
    }
    const picks = new Map<string, string>([[localId, myAnimal]])
    let started = false
    const go = (seed: number, list: RaceSeat[]) => {
      if (started) return
      started = true
      setWaiting(false)
      const mine = list.map((s) => ({ ...s, kind: s.id === localId ? ('local' as const) : role === 'host' && s.kind === 'bot' ? ('bot' as const) : ('remote' as const) }))
      setupRace({ seed, mode: 'online', host: role === 'host', localId, seats: mine, botLevel: 'smart' })
    }
    setAmazonNetHandlers({
      onPick: (seatId, animalId) => {
        if (role === 'host' && ANIMALS.some((a) => a.id === animalId)) picks.set(seatId, animalId)
      },
      onGo: (seed, list) => {
        if (role === 'guest') go(seed, list)
      },
    })
    let timers: ReturnType<typeof setTimeout>[] = []
    if (role === 'host') {
      const remote = seats.filter((s) => s.kind === 'remote')
      const botAnimals = pickBotAnimals(seats.length, myAnimal)
      const launch = () => {
        const seed = newSeed()
        const list: RaceSeat[] = seats.map((s, i) => ({ id: s.id, name: s.name, avatarEmoji: s.avatarEmoji, kind: s.kind === 'bot' ? 'bot' : s.id === localId ? 'local' : 'remote', animalId: picks.get(s.id) ?? (s.kind === 'bot' ? botAnimals[i] : 'wolf') }))
        broadcastGo(seed, list)
        go(seed, list)
      }
      // wait for everyone's animal (max 3 s), then start
      const poll = setInterval(() => {
        if (remote.every((s) => picks.has(s.id))) {
          clearInterval(poll)
          launch()
        }
      }, 150)
      timers.push(setTimeout(() => {
        clearInterval(poll)
        launch()
      }, 3000))
      timers.push(poll as unknown as ReturnType<typeof setTimeout>)
    } else {
      const send = () => sendAmazonAction({ t: 'pick', animalId: myAnimal })
      send()
      const again = setInterval(() => {
        if (started) clearInterval(again)
        else send()
      }, 700)
      timers.push(again as unknown as ReturnType<typeof setTimeout>)
    }
    return () => {
      for (const t of timers) {
        clearTimeout(t)
        clearInterval(t as unknown as ReturnType<typeof setInterval>)
      }
      timers = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- guests report their own runner to the host
  useEffect(() => {
    if (role !== 'guest') return
    const t = setInterval(() => {
      const me = localRunner()
      if (me && (sim.phase === 'running' || sim.phase === 'over')) sendAmazonAction({ t: 'me', r: packRunner(me) })
    }, 140)
    return () => clearInterval(t)
  }, [role])

  // ---- the host left: everyone else stops where they are
  useEffect(() => {
    if (role === 'guest' && roomStatus === 'closed') for (const r of sim.runners) if (r.kind !== 'local' && r.alive) r.alive = false
  }, [role, roomStatus])

  // ---- controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return
      const k = e.key
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') moveLane(-1)
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') moveLane(1)
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') jump()
      else if (k === 'ArrowDown' || k === 's' || k === 'S') slide()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const swipe = useRef<{ x: number; y: number; done: boolean } | null>(null)
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    swipe.current = { x: e.clientX, y: e.clientY, done: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = swipe.current
    if (!s || s.done) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return
    s.done = true // act mid-swipe: no waiting for the finger to lift
    if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1)
    else if (dy < 0) jump()
    else slide()
  }

  if (phase === 'over' && results) return <Results results={results} localId={localId} online={online} />

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (swipe.current = null)}
      onPointerCancel={() => (swipe.current = null)}
    >
      <RaceHud online={online} onPause={online ? undefined : () => setPaused(true)} />
      {waiting && (
        <Overlay>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-300/30 border-t-emerald-300" />
          <p className="mt-4 text-lg font-black">Racers are picking their animals…</p>
        </Overlay>
      )}
      {paused && (
        <Overlay>
          <p className="wild-title text-5xl font-black">PAUSED</p>
          <div className="mt-6 flex w-64 flex-col gap-2.5">
            <button type="button" onClick={() => setPaused(false)} className="wild-cta rounded-2xl py-3 text-xl font-black">
              RESUME
            </button>
            <button type="button" onClick={() => useAmazonMatch.getState().backToMenu()} className="wild-btn rounded-2xl bg-white/10 py-3 text-base font-black">
              QUIT RUN
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-sm">{children}</div>
}

function RaceHud({ online, onPause }: { online: boolean; onPause?: () => void }) {
  const ui = useAmazonUI()
  const [hint, setHint] = useState(true)
  useEffect(() => {
    if (ui.phase !== 'running') return
    const t = setTimeout(() => setHint(false), 4500)
    return () => clearTimeout(t)
  }, [ui.phase])
  const multi = ui.total > 1
  const me = ui.board.find((b) => b.kind === 'local')

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))]">
        {onPause ? (
          <button type="button" onClick={onPause} aria-label="Pause" className="hud-glass pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl active:scale-90">
            <Pause size={20} />
          </button>
        ) : (
          <span className="w-11" />
        )}
        <div className="hud-glass flex items-center gap-4 rounded-2xl px-4 py-1.5">
          <div className="text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Distance</p>
            <p className="text-2xl font-black leading-tight tabular-nums">{ui.distance}<span className="text-sm text-slate-300"> m</span></p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Coins</p>
            <p className="flex items-center gap-1 text-2xl font-black leading-tight text-amber-300 tabular-nums">
              <Coins size={16} />
              {ui.coins}
            </p>
          </div>
          {multi && (
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Place</p>
              <p className="text-2xl font-black leading-tight tabular-nums">
                {ui.rank}
                <span className="text-sm text-slate-300">/{ui.total}</span>
              </p>
            </div>
          )}
        </div>
        <div className="flex w-11 shrink-0 flex-col items-end gap-1.5">
          {ui.shield && (
            <span className="hud-glass flex h-9 w-9 items-center justify-center rounded-xl text-sky-300">
              <Shield size={18} />
            </span>
          )}
          {ui.magnetLeft > 0 && (
            <span className="hud-glass flex h-9 w-9 flex-col items-center justify-center rounded-xl text-rose-300">
              <Magnet size={15} />
              <span className="text-[9px] font-black leading-none">{ui.magnetLeft}</span>
            </span>
          )}
        </div>
      </div>

      {multi && (
        <div className="pointer-events-none absolute left-2 top-[84px] flex w-[9.5rem] flex-col gap-1">
          {ui.board.slice(0, 6).map((b, i) => (
            <div key={b.id} className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-bold ${b.kind === 'local' ? 'bg-emerald-500/35 ring-1 ring-emerald-300/70' : 'bg-black/45'}`}>
              <span className="relative">
                <img src={getAnimal(b.animalId).portrait} alt="" className={`h-6 w-6 rounded-full bg-emerald-950 object-contain ${b.alive ? '' : 'opacity-40 grayscale'}`} />
                {i === 0 && <Crown size={11} className="absolute -right-1 -top-1.5 text-amber-300" fill="currentColor" />}
              </span>
              <span className={`min-w-0 flex-1 truncate ${b.alive ? '' : 'text-slate-500 line-through'}`}>{b.kind === 'local' ? 'You' : b.name}</span>
              <span className="tabular-nums text-slate-300">{b.distance}</span>
            </div>
          ))}
        </div>
      )}

      {ui.phase === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span key={ui.countdown} className="wild-title text-[7rem] font-black" style={{ animation: 'city-pop 0.5s ease-out' }}>
            {ui.countdown > 0 ? ui.countdown : 'GO!'}
          </span>
        </div>
      )}

      {ui.toast && (
        <div key={ui.toast.id} className="hud-glass pointer-events-none absolute left-1/2 top-[92px] -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-black" style={{ animation: 'city-toast 2.2s ease-out forwards' }}>
          {ui.toast.text}
        </div>
      )}

      {hint && ui.phase === 'running' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(28px,env(safe-area-inset-bottom))] flex justify-center">
          <p className="hud-glass rounded-2xl px-4 py-2 text-center text-[12px] font-bold text-slate-100">Swipe ← → change lane · ↑ jump · ↓ slide</p>
        </div>
      )}

      {ui.revive !== null && <RevivePrompt seconds={ui.revive} />}

      {ui.spectating && (
        <div className="absolute inset-x-0 bottom-[max(22px,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-6">
          <p className="hud-glass rounded-2xl px-4 py-2 text-center text-[13px] font-bold">
            You ran {me?.distance ?? 0} m · watching <span className="text-emerald-300">{ui.spectating}</span>
          </p>
          {!online && (
            <button type="button" onClick={fastForwardBots} className="wild-btn pointer-events-auto flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-amber-400 to-orange-600 px-5 py-2.5 text-sm font-black">
              <Zap size={16} /> Skip to results
            </button>
          )}
        </div>
      )}
    </>
  )
}

function RevivePrompt({ seconds }: { seconds: number }) {
  const coins = usePlayerStore((s) => s.profile.coins)
  const [busy, setBusy] = useState(false)
  async function viaAd() {
    setBusy(true)
    try {
      if (await watchRewardedAd()) revive()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Overlay>
      <p className="wild-title text-4xl font-black">OUCH!</p>
      <p className="mt-1 text-sm font-bold text-slate-200">Keep running from here?</p>
      <div className="relative mt-5 flex h-20 w-20 items-center justify-center rounded-full ring-4 ring-amber-300/80">
        <Timer size={18} className="absolute top-2 text-amber-300" />
        <span className="mt-3 text-3xl font-black tabular-nums">{seconds}</span>
      </div>
      <div className="mt-5 flex w-64 flex-col gap-2.5">
        <button
          type="button"
          disabled={coins < REVIVE_COST}
          onClick={() => {
            if (usePlayerStore.getState().spendCoins(REVIVE_COST)) revive()
          }}
          className="wild-cta flex items-center justify-center gap-2 rounded-2xl py-3 text-lg font-black disabled:opacity-45"
        >
          Revive · {REVIVE_COST} <Coins size={18} />
        </button>
        {adsAvailable && (
          <button type="button" disabled={busy} onClick={() => void viaAd()} className="wild-btn flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-sky-400 to-blue-700 py-3 text-base font-black disabled:opacity-50">
            <PlayCircle size={18} /> Watch ad to revive
          </button>
        )}
        <button type="button" onClick={declineRevive} className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/10 py-2.5 text-sm font-black">
          <X size={16} /> No thanks
        </button>
      </div>
    </Overlay>
  )
}

// ================================================================ results

function Results({ results, localId, online }: { results: ResultRow[]; localId: string; online: boolean }) {
  const navigate = useNavigate()
  const selectGame = usePartyStore((s) => s.selectGame)
  const meIndex = results.findIndex((r) => r.id === localId)
  const me = results[meIndex]
  const multi = results.length > 1
  const awarded = useRef(false)
  const [isBest, setIsBest] = useState(false)
  const won = multi ? meIndex === 0 : isBest
  const reward = useMemo(() => {
    const dist = me?.distance ?? 0
    const coins = Math.round(dist / 8) + (me?.coins ?? 0) * 2 + (multi && meIndex === 0 ? 60 : 0)
    const xp = 20 + Math.round(dist / 15) + (multi ? Math.max(0, results.length - meIndex) * 8 : 0)
    return { coins, xp }
  }, [me, meIndex, multi, results.length])

  useEffect(() => {
    if (awarded.current || !me) return
    awarded.current = true
    setIsBest(useAmazonProgress.getState().recordRun(me.distance))
    completeGameSession({ gameId: 'amazon', won: multi ? meIndex === 0 : false, coins: reward.coins, xp: reward.xp, playedWithFriend: online })
  }, [me, meIndex, multi, online, reward])

  function again() {
    const match = useAmazonMatch.getState()
    if (online) {
      leaveAmazonRoom()
      match.backToMenu()
      return
    }
    match.begin(match.mode ?? 'solo', 'solo', match.seats, match.localSeatIds, match.botLevel)
  }

  const podium = results.slice(0, 3)
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(16,64,32,0.88),rgba(3,10,6,0.96)_70%)] px-4 pb-10 pt-[max(20px,env(safe-area-inset-top))]">
      {won && <Confetti />}
      <div className="mx-auto max-w-md text-center wide:grid wide:min-h-full wide:max-w-5xl wide:grid-cols-2 wide:items-center wide:gap-10">
        <div>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-300">{multi ? 'Race over' : 'Run over'}</p>
        <h1 className="wild-title mt-1 text-[2.6rem] font-black leading-none">
          {multi ? (meIndex === 0 ? 'YOU ARE ALPHA!' : `${ordinal(meIndex + 1)} PLACE`) : `${me?.distance ?? 0} M`}
        </h1>
        <p className="mt-2 text-sm font-bold text-slate-200">
          {multi
            ? meIndex === 0
              ? `You outran the whole pack with ${me?.distance ?? 0} m.`
              : `${results[0].name} ran the farthest: ${results[0].distance} m. You ran ${me?.distance ?? 0} m.`
            : isBest
              ? 'New personal best!'
              : `Best run: ${useAmazonProgress.getState().best} m`}
        </p>

        {multi && (
          <div className="mt-6 flex items-end justify-center gap-2">
            {[1, 0, 2].map((i) => {
              const r = podium[i]
              if (!r) return <div key={i} className="w-24" />
              const h = i === 0 ? 'h-28' : i === 1 ? 'h-20' : 'h-14'
              return (
                <div key={r.id} className="flex w-24 flex-col items-center">
                  {i === 0 && <Crown size={22} className="mb-0.5 text-amber-300" fill="currentColor" />}
                  <img src={getAnimal(r.animalId).portrait} alt="" className={`h-16 w-16 rounded-full bg-emerald-950 object-contain ring-2 ${r.id === localId ? 'ring-emerald-300' : 'ring-white/20'}`} />
                  <p className="mt-1 w-full truncate text-[12px] font-black">{r.id === localId ? 'You' : r.name}</p>
                  <p className="text-[11px] font-bold text-slate-300">{r.distance} m</p>
                  <div className={`mt-1 flex w-full items-start justify-center rounded-t-xl pt-1 text-2xl font-black ${h} ${i === 0 ? 'bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950' : 'bg-white/15'}`}>{i + 1}</div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-black/35 px-4 py-3 text-sm font-black ring-1 ring-white/10">
          <span className="flex items-center gap-1 text-amber-300">
            +{reward.coins} <Coins size={15} />
          </span>
          <span className="text-sky-300">+{reward.xp} XP</span>
          <span className="flex items-center gap-1 text-slate-200">
            <Coins size={14} className="text-amber-300" /> {me?.coins ?? 0} picked up
          </span>
        </div>
        </div>

        <div>

        {multi && (
          <div className="mt-4 space-y-1.5 text-left wide:mt-0">
            {results.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${r.id === localId ? 'bg-emerald-500/20 ring-1 ring-emerald-300/50' : 'bg-white/5'}`}>
                <span className="w-5 text-center text-sm font-black text-slate-300">{i + 1}</span>
                <img src={getAnimal(r.animalId).portrait} alt="" className="h-8 w-8 rounded-full bg-emerald-950 object-contain" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {r.id === localId ? 'You' : r.name} <span className="text-[11px] font-semibold text-slate-400">· {getAnimal(r.animalId).name}</span>
                </span>
                <span className="text-sm font-black tabular-nums">{r.distance} m</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button" onClick={again} className="wild-cta flex items-center justify-center gap-2 rounded-2xl py-3.5 text-xl font-black">
            <Play size={20} fill="currentColor" /> {online ? 'BACK TO LOBBY' : 'RUN AGAIN'}
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (online) leaveAmazonRoom()
                useAmazonMatch.getState().backToMenu()
              }}
              className="wild-btn flex items-center justify-center gap-1.5 rounded-2xl bg-white/10 py-3 text-sm font-black"
            >
              <Trophy size={16} /> Change animal
            </button>
            <button
              type="button"
              onClick={() => {
                selectGame(null)
                navigate('/games')
              }}
              className="wild-btn flex items-center justify-center gap-1.5 rounded-2xl bg-white/10 py-3 text-sm font-black"
            >
              <ChevronLeft size={16} /> Other games
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

function ordinal(n: number) {
  return n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`
}
