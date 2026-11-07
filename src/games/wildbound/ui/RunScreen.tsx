import { useCallback, useEffect, useRef, useState } from 'react'
import { Home, Music, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { GRIP, POWERUPS, POWER_KINDS, SECTION_TEXT, biomeAt, getAnimal, type PowerUpKind } from '../engine/content'
import { RaceHud, RaceResults } from './RaceHud'
import { leaveRace, makeSession, sendRaceAction, useRaceUI, useWildRoom } from '../state/race'
import { DOUBLE_MS, ROUTE_BONUS_TEXT, raceStartZone, randomStartZone, reviveCost, tutorialStepText, type Command } from '../engine/run'
import RouteChooser from './RouteChooser'
import { useSave } from '../state/progress'
import { endRun, onPhase, onSimEvent, run, setPhase, startRun, type RunPhase } from '../scene/runController'
import { ART, abilityArt, headArt, hudPowerArt } from './art'
import { Coin, Gem, fmt, toast, useFestival, useNav } from './common'
import { ambienceScene, haptic, sfx, startAmbience, stopAmbience } from './sfx'

/** press-and-hold time that fires the animal's power (ms) */
const HOLD_MS = 420

/*
 * The run: HUD over the 3D scene (which steps the simulation). Swipes anywhere, the ROLL / JUMP / SLIDE
 * buttons, the ability button, power-up buttons on the left, and the keyboard all drive the same commands.
 */

interface Hud {
  d: number
  score: number
  coins: number
  gems: number
  tokens: number
  powers: Record<PowerUpKind, number>
  abilityLeft: number
  abilityOn: boolean
  tut: string
  tutWaiting: boolean
}
const readHud = (): Hud | null => {
  const sim = run.sim
  if (!sim) return null
  const s = sim.state
  return {
    d: Math.floor(sim.runD()),
    score: Math.floor(s.score),
    coins: s.coins,
    gems: s.gems,
    tokens: s.tokens,
    powers: Object.fromEntries(POWER_KINDS.map((k) => [k, sim.powerLeft(k)])) as Record<PowerUpKind, number>,
    abilityLeft: sim.abilityCooldownLeft(),
    abilityOn: sim.abilityOn(),
    tut: s.tutStep ? tutorialStepText(s.tutStep) : '',
    tutWaiting: s.tutWaiting,
  }
}

interface Outcome {
  coins: number
  gems: number
  xp: number
  newBest: boolean
  score: number
  distance: number
  tokens: number
  tutorial: boolean
}

export default function RunScreen() {
  const animalId = useSave((s) => s.selected)
  const settings = useSave((s) => s.settings)
  const inventory = useSave((s) => s.inventory)
  const best = useSave((s) => s.best)
  const gems = useSave((s) => s.gems)
  const fest = useFestival()
  const go = useNav((s) => s.go)
  const [hud, setHud] = useState<Hud | null>(null)
  const [phase, setPh] = useState<RunPhase>(run.phase)
  const gripSeen = useRef(new Set<string>())
  const [banner, setBanner] = useState<{ id: number; big: string; small?: string } | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [runKey, setRunKey] = useState(0)
  const [reviveLeft, setReviveLeft] = useState(0)
  const [count, setCount] = useState<string | null>(null)
  const tutorialRun = useRef(false)
  const a = getAnimal(animalId)
  // a race (Play with Friends / vs Computer) instead of a solo run
  const pending = useRaceUI((s) => s.pending)
  const racing = !!pending
  const online = !!pending?.online
  const [quitAsk, setQuitAsk] = useState(false)
  const roomStatus = useWildRoom((s) => s.status)

  // ---------------------------------------------------------------- lifecycle

  useEffect(() => {
    const s = useSave.getState()
    const nav = useNav.getState()
    const race = useRaceUI.getState().pending
    if (race) {
      // races: the agreed trail, no store power-up upgrades (fair for everyone), never the tutorial
      tutorialRun.current = false
      useNav.setState({ tutorial: false })
      startRun({ seed: race.seed, animalId: s.selected, upgrades: {}, rampMs: 1500, startZone: raceStartZone(race.seed) }, 2400, makeSession(race))
      setOutcome(null)
      startAmbience()
      return () => {
        endRun()
        stopAmbience()
      }
    }
    gripSeen.current.clear()
    // the guided tutorial only runs when picked from the More menu, never automatically
    tutorialRun.current = nav.tutorial
    useNav.setState({ tutorial: false })
    startRun(
      {
        seed: (Math.random() * 2 ** 31) | 0,
        animalId: s.selected,
        eventActive: fest.active && fest.joined,
        upgrades: s.upgrades,
        tutorial: tutorialRun.current,
        rampMs: 1500,
        // every run starts in a new place on the 40 km world
        startZone: (import.meta.env.DEV ? (window as unknown as { __wbZone?: number }).__wbZone : undefined) ?? randomStartZone(),
      },
      2400,
    )
    setOutcome(null)
    startAmbience()
    return () => {
      endRun()
      stopAmbience()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey])

  useEffect(() => onPhase((p) => setPh(p)), [])
  useEffect(() => {
    run.assist = settings.assist
  }, [settings.assist])

  // online races: a guest reports its own runner to the host; if the host leaves, the others stop where they are
  useEffect(() => {
    if (!online || pending?.role !== 'guest') return
    const t = setInterval(() => {
      const race = run.race
      if (race && run.phase !== 'countdown') sendRaceAction({ t: 'me', r: race.pack(race.local) })
    }, 140)
    return () => clearInterval(t)
  }, [online, pending, runKey])
  useEffect(() => {
    if (online && pending?.role === 'guest' && roomStatus === 'closed') {
      for (const r of run.race?.racers ?? []) if (r.kind === 'remote' && r.finishMs === null) r.left = true
      toast('The host left the race', 'bad')
    }
  }, [online, pending, roomStatus])

  // HUD refresh (~15 fps) and countdown numbers
  useEffect(() => {
    let raf = 0
    let last = 0
    let lastCount = ''
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (run.phase === 'countdown') {
        const c = run.countdown > 1600 ? '3' : run.countdown > 800 ? '2' : run.countdown > 0 ? '1' : 'GO!'
        if (c !== lastCount) {
          lastCount = c
          setCount(c)
          sfx.count()
        }
      } else if (lastCount && lastCount !== 'GO!' && run.phase === 'running') {
        lastCount = 'GO!'
        setCount('GO!')
        sfx.count(true)
        setTimeout(() => setCount(null), 700)
      }
      if (t - last > 66) {
        last = t
        setHud(readHud())
        // the ambient sound follows the zone (or the route's world, or a cave)
        const sim = run.sim
        if (sim) ambienceScene(sim.biomeIdAt(sim.state.d), biomeAt(sim.state.d).variant, sim.sectionAt(sim.state.d + 4)?.kind === 'cave')
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [runKey])

  // simulation events -> sound, haptics, banners
  useEffect(
    () =>
      onSimEvent((e) => {
        switch (e.type) {
          case 'coin':
            sfx.coin()
            break
          case 'gem':
            sfx.gem()
            break
          case 'token':
            sfx.token()
            break
          case 'pickup':
          case 'power':
            sfx.power()
            setBanner({ id: Date.now(), big: POWERUPS.find((p) => p.kind === e.kind)!.name, small: POWERUPS.find((p) => p.kind === e.kind)!.desc })
            break
          case 'ability':
            if (e.kind === 'roar') sfx.roar()
            else sfx.ability()
            haptic(30)
            setBanner({ id: Date.now(), big: a.ability.name, small: a.ability.desc })
            break
          case 'break':
            sfx.smash()
            break
          case 'saved':
            sfx.saved()
            haptic(60)
            if (e.by === 'loyal') setBanner({ id: Date.now(), big: 'Loyal Companion!', small: 'Sonic never gives up – extra life used' })
            else if (e.by === 'shield') setBanner({ id: Date.now(), big: 'Shield saved you!' })
            break
          case 'crash':
            sfx.crash()
            haptic(160)
            break
          case 'biome':
            setBanner({ id: Date.now(), big: e.name, small: `Zone ${String(e.zone).padStart(3, '0')} · ${e.from.toLocaleString('en-IN')} m` })
            break
          case 'fork':
            // the route cards (RouteChooser) carry the details; the banner only announces the junction
            setBanner({ id: Date.now(), big: e.fork.routes.length === 3 ? 'Three paths ahead!' : 'The path splits!', small: 'Change lane to choose' })
            sfx.tap()
            break
          case 'section':
            setBanner({ id: Date.now(), big: SECTION_TEXT[e.section.kind].big, small: SECTION_TEXT[e.section.kind].small })
            sfx.tap()
            break
          case 'ride':
            if (e.on) {
              setBanner({ id: Date.now(), big: 'All aboard!', small: 'Change lane to hop off' })
              sfx.power()
              haptic(40)
            }
            break
          case 'rockfall':
            run.shake = Math.max(run.shake, 0.6)
            haptic(30)
            break
          case 'route':
            setBanner({ id: Date.now(), big: e.name, small: ROUTE_BONUS_TEXT[e.bonus] })
            break
          case 'milestone':
            sfx.milestone()
            break
          case 'nearmiss':
            // a close call just pays out (a light buzz); a banner every time crowded the screen
            haptic(15)
            break
          case 'surface':
            // tell the player about a slippery surface once per run, not every time it comes round again
            if (GRIP[e.grip].label && !gripSeen.current.has(e.grip) && gripSeen.current.add(e.grip)) setBanner({ id: Date.now(), big: e.grip === 'ice' ? 'Ice!' : e.grip === 'snow' ? 'Deep snow' : 'Mud!', small: GRIP[e.grip].label })
            break
          case 'swing':
            if (e.on) {
              setBanner({ id: Date.now(), big: 'Swing!', small: '+100' })
              sfx.jump()
              haptic(30)
            } else sfx.slide()
            break
          case 'tutorial':
            sfx.tap()
            break
        }
      }),
    [a],
  )

  // ---------------------------------------------------------------- game over flow

  const finish = useCallback(() => {
    const sim = run.sim
    if (!sim || outcome) return
    const sum = sim.summary()
    const tutorial = tutorialRun.current
    const r = useSave.getState().finishRun({ animalId: sim.animal.id, ...sum, tutorial })
    if (tutorial && sim.state.crashKind === null) useSave.getState().completeTutorial()
    setOutcome({ ...r, score: sum.score, distance: sum.distance, tokens: sum.tokens, tutorial })
    if (r.newBest && !tutorial) sfx.win()
    setReviveLeft(0)
  }, [outcome])

  useEffect(() => {
    if (phase !== 'over' || outcome) return
    const sim = run.sim
    // a race: record the run (coins, missions, records) at the line; the podium screen takes over
    if (run.race) {
      finish()
      return
    }
    // a clean tutorial finish, or no gems for a revive: straight to results
    if (!sim || sim.state.crashKind === null) {
      finish()
      return
    }
    setReviveLeft(6)
    const t = setInterval(() => setReviveLeft((v) => v - 1), 1000)
    return () => clearInterval(t)
  }, [phase, outcome, finish])

  useEffect(() => {
    if (phase === 'over' && !outcome && reviveLeft < 0) finish()
  }, [reviveLeft, phase, outcome, finish])

  const revive = () => {
    const sim = run.sim
    if (!sim) return
    const cost = reviveCost(sim.state.revives)
    if (!useSave.getState().spendGems(cost)) {
      toast(`You need ${cost} gems to revive`, 'bad')
      return
    }
    sim.revive()
    sfx.saved()
    setReviveLeft(0)
    setPhase('running')
  }

  const retry = () => {
    sfx.tap()
    if (!outcome) finish()
    if (racing && pending) {
      // rematch vs the computer: a new trail, the same rivals
      useRaceUI.setState({ pending: { ...pending, seed: (Math.random() * 2 ** 31) | 0 } })
    }
    setRunKey((k) => k + 1)
  }
  const home = () => {
    sfx.tap()
    if (!outcome && run.sim) finish()
    if (racing) leaveRace()
    go('home')
  }
  const lobby = () => {
    sfx.tap()
    if (!outcome && run.sim) finish()
    leaveRace()
    go('race', { replace: true })
  }

  // ---------------------------------------------------------------- input

  const cmd = useCallback((c: Command) => {
    const sim = run.sim
    if (!sim || run.phase !== 'running') return
    sim.input(c)
    if (c === 'jump') sfx.jump()
    else if (c === 'slide' || c === 'roll') sfx.slide()
    else if (c === 'left' || c === 'right') sfx.lane()
  }, [])

  const firePower = useCallback((k: PowerUpKind) => {
    const sim = run.sim
    if (!sim || run.phase !== 'running') return
    if (!useSave.getState().usePowerUp(k)) {
      toast(`No ${POWERUPS.find((p) => p.kind === k)!.name} left – get more in the Store`, 'bad')
      return
    }
    sim.activatePower(k)
  }, [])

  const pause = useCallback(() => {
    // an online race cannot be paused (the others keep running): offer to leave instead
    if (useRaceUI.getState().pending?.online) {
      if (run.phase === 'running' || run.phase === 'countdown') setQuitAsk(true)
      return
    }
    if (run.phase === 'running' || run.phase === 'countdown') {
      sfx.tap()
      setPhase('paused')
    }
  }, [])
  const resume = () => {
    sfx.tap()
    run.countdown = 1500
    setPhase('countdown')
  }

  // slide twice in quick succession (double-tap S / Down, or two swipes down) = roll
  const lastSlide = useRef(-1e9)
  const lowCmd = useCallback(() => {
    const now = performance.now()
    if (now - lastSlide.current < DOUBLE_MS) {
      lastSlide.current = -1e9
      cmd('roll')
    } else {
      lastSlide.current = now
      cmd('slide')
    }
  }, [cmd])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key.toLowerCase()
      const map: Record<string, Command> = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'jump', w: 'jump', ' ': 'jump', shift: 'ability', r: 'roll', e: 'ability', q: 'ability' }
      if (k === 's' || k === 'arrowdown') {
        e.preventDefault()
        lowCmd()
      } else if (map[k]) {
        e.preventDefault()
        cmd(map[k])
      } else if (k === '1') firePower('speed')
      else if (k === '2') firePower('magnet')
      else if (k === '3') firePower('shield')
      else if (k === '4') firePower('superjump')
      else if (k === '5') firePower('megajump')
      else if (k === '6') firePower('boost')
      else if (k === 'escape' || k === 'p') {
        if (run.phase === 'paused') resume()
        else pause()
      }
    }
    window.addEventListener('keydown', down)
    const hide = () => document.hidden && pause()
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('keydown', down)
      document.removeEventListener('visibilitychange', hide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd, firePower, pause, lowCmd])

  // swipes; press and hold (without swiping) fires the animal's power
  const touch = useRef<{ x: number; y: number; id: number; done: boolean; hold: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    const t = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false, hold: 0 }
    t.hold = window.setTimeout(() => {
      if (touch.current === t && !t.done) {
        t.done = true
        cmd('ability')
        haptic(30)
      }
    }, HOLD_MS)
    touch.current = t
  }
  const onMove = (e: React.PointerEvent) => {
    const t = touch.current
    if (!t || t.done || t.id !== e.pointerId) return
    const dx = e.clientX - t.x
    const dy = e.clientY - t.y
    const th = 26 * settings.sensitivity
    if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return
    t.done = true
    clearTimeout(t.hold)
    if (Math.abs(dx) > Math.abs(dy)) cmd(dx < 0 ? 'left' : 'right')
    else if (dy < 0) cmd('jump')
    else lowCmd()
  }
  const onUp = () => {
    if (touch.current) clearTimeout(touch.current.hold)
    touch.current = null
  }

  // ---------------------------------------------------------------- view

  const h = hud
  const abilityCd = h ? h.abilityLeft / a.ability.cooldownMs : 1
  const left = settings.leftHanded
  const powerList: PowerUpKind[] = ['speed', 'magnet', 'shield', 'superjump', 'megajump', 'boost']
  const sim = run.sim
  const cost = sim ? reviveCost(sim.state.revives) : 50

  return (
    <div className="wb-layer">
      {/* gesture layer */}
      <div className="wb-layer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      <RouteChooser />
      {racing && <RaceHud />}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 wb-safe flex items-start justify-between">
        <div className="pointer-events-auto flex items-center gap-2">
          <button className="h-[46px] w-[46px]" onClick={pause} aria-label="Pause">
            <img src={ART.pause} alt="" className="h-full w-full rounded-full" />
          </button>
          <div className="wb-hud-box !h-[44px] !px-4 text-[28px]">
            {fmt(h?.d ?? 0)}
            <span className="-ml-1 font-[Barlow_Condensed] text-[24px] font-bold">m</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="wb-hud-box min-w-[112px] justify-between text-[26px]">
            <Coin size={32} /> {fmt(h?.coins ?? 0)}
          </div>
          <div className="wb-hud-box min-w-[112px] justify-between text-[24px]">
            <Gem size={30} /> {fmt(h?.gems ?? 0)}
          </div>
          {fest.active && fest.joined && (
            <div className="wb-hud-box min-w-[112px] justify-between text-[22px]">
              <img src={ART.eventMask} alt="" className="h-8 w-6 object-cover" /> {h?.tokens ?? 0}
            </div>
          )}
          <div className="text-[15px] font-bold text-white/90 wb-shadow">SCORE {fmt(h?.score ?? 0)}</div>
        </div>
      </div>

      {/* power-ups (left side); in a race store power-ups stay in the bag, only trail pickups count */}
      <div className={`absolute top-[54%] flex -translate-y-1/2 flex-col gap-[min(9px,1.4vh)] ${left ? 'right-3' : 'left-3'}`} style={{ display: racing ? 'none' : undefined, paddingLeft: left ? 0 : 'env(safe-area-inset-left)' }}>
        {powerList.map((k) => {
          const active = (h?.powers[k] ?? 0) > 0
          const n = inventory[k] ?? 0
          const dur = POWERUPS.find((p) => p.kind === k)!.durationMs
          const frac = active ? Math.min(1, (h?.powers[k] ?? 0) / dur) : 0
          return (
            <button key={k} className={`wb-ctl h-[min(54px,9vh)] w-[min(54px,9vh)] min-h-[40px] min-w-[40px] ${n <= 0 && !active ? 'opacity-55 grayscale' : ''}`} onClick={() => firePower(k)} aria-label={k}>
              <img src={hudPowerArt(k)} alt="" />
              {active && <span className="wb-cooldown" style={{ background: `conic-gradient(rgba(120,255,120,0.55) ${frac * 360}deg, transparent 0)`, boxShadow: '0 0 14px rgba(120,255,120,0.9)' }} />}
              <span className="absolute -bottom-1 -right-1 grid h-6 min-w-6 place-items-center rounded-full bg-[#0b1a2e] px-1 text-[14px] font-bold ring-2 ring-[#ffd84a]">{active ? Math.ceil((h?.powers[k] ?? 0) / 1000) + 's' : n}</span>
            </button>
          )
        })}
      </div>

      <div className={`absolute bottom-[calc(env(safe-area-inset-bottom)+18px)] portrait:bottom-[calc(env(safe-area-inset-bottom)+112px)] ${left ? 'left-3' : 'right-3'} flex flex-col items-center gap-1`}>
        <button className={`wb-ctl h-[min(72px,17vh)] w-[min(72px,17vh)] min-h-[56px] min-w-[56px] ${abilityCd <= 0 && !h?.abilityOn ? 'wb-pulse' : ''}`} onPointerDown={(e) => (e.stopPropagation(), cmd('ability'))} aria-label={a.ability.name} style={{ boxShadow: abilityCd <= 0 ? '0 0 0 3px #ffd84a, 0 0 20px rgba(255,210,70,0.9)' : '0 0 0 3px rgba(255,255,255,0.3)' }}>
          <img src={abilityArt(a.id)} alt="" />
          {abilityCd > 0 && <span className="wb-cooldown" style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${abilityCd * 360}deg, transparent 0)` }} />}
          {abilityCd > 0 && <span className="absolute text-[20px] font-bold wb-shadow">{Math.ceil((h?.abilityLeft ?? 0) / 1000)}</span>}
        </button>
        <span className="text-[13px] font-bold wb-shadow">{a.ability.name}</span>
      </div>

      {/* banners, tutorial, countdown */}
      {banner && !count && (
        <div key={banner.id} className="wb-toast top-[22%] text-center">
          <div className="wb-title text-[34px] wb-yellow wb-stroke">{banner.big}</div>
          {banner.small && <div className="text-[17px] font-bold wb-shadow">{banner.small}</div>}
        </div>
      )}
      {h?.tut && phase === 'running' && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] flex justify-center px-6">
          <div className={`wb-panel px-5 py-3 text-center ${h.tutWaiting ? 'wb-pulse' : ''}`}>
            <div className="wb-title text-[30px] wb-yellow wb-stroke">{h.tut}</div>
          </div>
        </div>
      )}
      {count && (
        <div key={count} className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="wb-count wb-title text-[110px] wb-yellow wb-stroke">{count}</div>
        </div>
      )}

      {quitAsk && (
        <div className="wb-layer z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="wb-panel wb-in w-full max-w-[360px] p-5 text-center">
            <div className="wb-title text-[34px] wb-yellow wb-stroke">Leave the race?</div>
            <p className="mb-4 text-[16px] text-white/80">The others keep running â€“ an online race can't be paused.</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="wb-btn wb-btn-green h-12 text-[22px]" onClick={() => setQuitAsk(false)}>
                Keep racing
              </button>
              <button className="wb-btn wb-btn-gold h-12 text-[22px]" onClick={lobby}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* pause */}
      {phase === 'paused' && (
        <div className="wb-layer wb-dim z-[70] flex items-center justify-center p-4">
          <div className="wb-panel wb-in w-full max-w-[380px] p-5 text-center">
            <div className="wb-title text-[44px] wb-yellow wb-stroke">PAUSED</div>
            <div className="mb-4 text-[18px]">
              {fmt(h?.d ?? 0)} m · Score {fmt(h?.score ?? 0)}
            </div>
            <div className="flex flex-col gap-3">
              <button className="wb-btn wb-btn-green h-14 text-[28px]" onClick={resume}>
                <Play size={24} fill="currentColor" /> Resume
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button className="wb-btn wb-btn-gold h-12 text-[24px]" onClick={home}>
                  <Home size={22} /> Home
                </button>
                <button className="wb-btn wb-btn-blue h-12 text-[24px]" onClick={retry}>
                  <RotateCcw size={22} /> Restart
                </button>
              </div>
              <div className="flex justify-center gap-3">
                <button className="wb-btn wb-btn-dark h-11 px-4 text-[18px]" onClick={() => useSave.getState().setSettings({ sound: !settings.sound })}>
                  {settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} />} Sound
                </button>
                <button
                  className="wb-btn wb-btn-dark h-11 px-4 text-[18px]"
                  onClick={() => {
                    useSave.getState().setSettings({ music: !settings.music })
                    if (settings.music) stopAmbience()
                    else setTimeout(startAmbience, 0)
                  }}
                >
                  <Music size={20} /> {settings.music ? 'Music on' : 'Music off'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* game over / results */}
      {phase === 'over' && racing && <RaceResults online={online} onAgain={online ? lobby : retry} onHome={home} />}
      {phase === 'over' && !racing && (
        <div className="wb-layer wb-dim z-[70] flex items-center justify-center p-4">
          <div className="wb-panel wb-in w-full max-w-[460px] overflow-hidden p-0 text-center">
            {outcome?.tutorial && !run.sim?.state.crashKind ? (
              <div className="p-5">
                <div className="wb-title text-[40px] wb-yellow wb-stroke">TRAINING COMPLETE!</div>
                <p className="mt-1 text-[18px]">You know every move. The real forest is waiting.</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button className="wb-btn wb-btn-gold h-12 text-[24px]" onClick={home}>
                    Home
                  </button>
                  <button className="wb-btn wb-btn-green h-12 text-[24px]" onClick={retry}>
                    Run!
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3 pt-4">
                  <img src={ART.pawRed} alt="" className="h-9 w-9" />
                  <div className="wb-title text-[46px] leading-none text-[#ff4b3e]" style={{ textShadow: '0 3px 0 #4a0a05, 0 0 2px #000, 0 6px 12px rgba(0,0,0,0.6)' }}>
                    GAME OVER
                  </div>
                  <img src={ART.pawRed} alt="" className="h-9 w-9" />
                </div>
                <div className="relative flex items-center gap-2 px-4 pb-2">
                  <div className="flex-1 text-center">
                    <div className="text-[20px] font-bold">Your Score</div>
                    <div className="wb-title text-[42px] leading-none wb-yellow wb-stroke">{fmt(outcome?.score ?? h?.score ?? 0)}</div>
                    <div className="mt-1 text-[20px] font-bold">Best Score</div>
                    <div className="wb-title text-[36px] leading-none wb-yellow wb-stroke">{fmt(Math.max(best.score, outcome?.score ?? h?.score ?? 0))}</div>
                    {outcome?.newBest && <div className="wb-title mt-1 inline-block rounded-full bg-[#2fb80f] px-3 text-[18px]">NEW BEST!</div>}
                  </div>
                  <img src={a.id === 'sonic' ? ART.gameover : headArt(a.id)} alt="" className={a.id === 'sonic' ? 'w-[46%] rounded-xl' : 'h-[150px] w-[120px] rounded-xl object-cover'} />
                </div>
                <div className="mx-4 mb-3 flex items-center justify-center gap-4 rounded-xl bg-black/30 py-2 text-[20px]">
                  <span>{fmt(outcome?.distance ?? h?.d ?? 0)} m</span>
                  <span className="flex items-center gap-1">
                    <Coin size={22} /> +{fmt(outcome?.coins ?? h?.coins ?? 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Gem size={22} /> +{outcome?.gems ?? h?.gems ?? 0}
                  </span>
                  {outcome && <span className="text-[#9dff6a]">+{fmt(outcome.xp)} XP</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                  <button className="wb-btn wb-btn-blue h-12 text-[22px]" disabled={!!outcome || reviveLeft <= 0} onClick={revive}>
                    Revive <Gem size={22} />
                    {cost}
                    {!outcome && reviveLeft > 0 && <span className="absolute -right-1 -top-2 grid h-6 w-6 place-items-center rounded-full bg-[#ff4b3e] text-[14px]">{reviveLeft}</span>}
                  </button>
                  <button className="wb-btn wb-btn-gold h-12 text-[24px]" onClick={home}>
                    Home
                  </button>
                  <button className="wb-btn wb-btn-green h-12 text-[24px]" onClick={retry}>
                    Retry
                  </button>
                </div>
                {!outcome && reviveLeft > 0 && gems < cost && <div className="-mt-2 pb-3 text-[14px] text-white/70">You have {gems} gems</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
