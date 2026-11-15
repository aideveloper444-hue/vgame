import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import '@fontsource/bangers/400.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/600-italic.css'
import './ui/wildbound.css'
import { useSave } from './state/progress'
import { ANIMALS, type AnimalId } from './engine/content'
import { loadPrices } from './state/shop'
import { onPhase, run } from './scene/runController'
import { Toasts, useNav } from './ui/common'
import HomeScreen from './ui/HomeScreen'
import CharacterSelect from './ui/CharacterSelect'
import PreviewScreen from './ui/PreviewScreen'
import RunScreen from './ui/RunScreen'
import StoreScreen from './ui/StoreScreen'
import { EventsScreen, LeaderboardScreen, LevelUpModal, MissionsScreen, MoreScreen, RewardsScreen, SettingsScreen, WorldsScreen } from './ui/MenuScreens'
import Logo from './ui/Logo'
import { startAmbience, stopAmbience } from './ui/sfx'
import RaceScreen from './ui/RaceScreen'
import { leaveRace, useRaceUI } from './state/race'

const WorldScene = lazy(() => import('./scene/WorldScene'))

/** Wildbound – Deep Forest Run. One 3D canvas serves the home lineup, the character preview and the run. */
// development only: ?wbanimal=<id> runs as that animal (screenshots of a new character before it is owned)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const id = new URLSearchParams(location.search).get('wbanimal')
  if (id && ANIMALS.some((a) => a.id === id)) useSave.setState({ selected: id as AnimalId })
}

export default function WildboundGame() {
  const screen = useNav((s) => s.screen)
  const previewId = useNav((s) => s.previewId)
  const go = useNav((s) => s.go)
  const selected = useSave((s) => s.selected)
  const quality = useSave((s) => s.settings.quality)
  const levelUps = useSave((s) => s.levelUps)
  const [phase, setPhase] = useState(run.phase)
  const [booted, setBooted] = useState(false)
  const navigate = useNavigate()
  const { active, progress } = useProgress()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (booted && !active && !ready) setReady(true)
  }, [booted, active, ready])

  useEffect(() => onPhase(setPhase), [])
  // an invite link (?room=CODE) or a party call opens Play with Friends straight away
  useEffect(() => {
    if (new URLSearchParams(location.search).has('room')) go('race')
    // dev only: open a screen straight from the URL (?wbscreen=select), for screenshots and checks
    const dev = import.meta.env.DEV ? new URLSearchParams(location.search).get('wbscreen') : null
    const devPreview = import.meta.env.DEV ? new URLSearchParams(location.search).get('wbpreview') : null
    if (dev) go(dev as Parameters<typeof go>[0], devPreview ? { previewId: devPreview as Parameters<typeof go>[1] extends infer O ? O extends { previewId?: infer P } ? P : never : never } : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // back on the home screen: any race (and its online room) is over
  useEffect(() => {
    if (screen === 'home' && useRaceUI.getState().pending) leaveRace()
  }, [screen])
  useEffect(() => {
    void loadPrices()
    const t = setTimeout(() => setBooted(true), 1400)
    // Android back button / browser back: step back inside the game first
    const onPop = (e: PopStateEvent) => {
      const nav = useNav.getState()
      if (nav.screen !== 'home') {
        e.preventDefault()
        history.pushState(null, '', location.href)
        if (nav.screen === 'run') nav.go('home')
        else nav.pop()
      }
    }
    history.pushState(null, '', location.href)
    window.addEventListener('popstate', onPop)
    return () => {
      clearTimeout(t)
      window.removeEventListener('popstate', onPop)
      stopAmbience()
    }
  }, [])

  // menus get the forest ambience after the first touch (browsers block audio before that)
  useEffect(() => {
    const first = () => {
      if (useNav.getState().screen !== 'run') startAmbience()
    }
    window.addEventListener('pointerdown', first, { once: true })
    return () => window.removeEventListener('pointerdown', first)
  }, [])

  const play = () => {
    if (useRaceUI.getState().pending) leaveRace()
    go('run')
  }
  const tutorial = () => {
    useNav.setState({ tutorial: true })
    go('run')
  }

  const mode = screen === 'run' ? 'run' : screen === 'preview' ? 'preview' : screen === 'home' ? 'lineup' : null
  const showLevel = levelUps.length > 0 && (screen !== 'run' || phase === 'over')
  const textScale = useSave((s) => s.settings.textScale ?? 1)

  return (
    <div className="wb-root" data-text={textScale > 1 ? String(textScale) : undefined} style={{ ['--wb-text' as string]: textScale }}>
      {mode && (
        <div className="wb-layer">
          <Suspense fallback={null}>
            <WorldScene key={mode === 'run' ? 'run' : 'menu'} mode={mode} animalId={mode === 'preview' ? previewId : selected} quality={quality} />
          </Suspense>
          {/* a soft lens vignette over the 3D view (free: plain CSS, no extra render pass) */}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 46%, transparent 58%, rgba(8,10,6,0.38) 100%)' }} />
        </div>
      )}

      {screen === 'home' && <HomeScreen onPlay={play} />}
      {screen === 'select' && <CharacterSelect />}
      {screen === 'preview' && <PreviewScreen />}
      {screen === 'run' && <RunScreen />}
      {screen === 'store' && <StoreScreen />}
      {screen === 'missions' && <MissionsScreen onPlay={play} />}
      {screen === 'worlds' && <WorldsScreen />}
      {screen === 'events' && <EventsScreen onPlay={play} />}
      {screen === 'rewards' && <RewardsScreen />}
      {screen === 'more' && <MoreScreen onTutorial={tutorial} />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'leaderboard' && <LeaderboardScreen />}
      {screen === 'race' && <RaceScreen />}

      {showLevel && <LevelUpModal level={levelUps[0]} onOk={() => useSave.getState().popLevelUp()} />}
      <Toasts />

      {!ready && <LoadingScreen progress={progress} />}

      {screen === 'home' && !import.meta.env.VITE_WB_STANDALONE && (
        <button className="absolute bottom-1 left-1 z-[5] rounded px-2 py-1 text-[11px] text-white/40" onClick={() => navigate('/games')}>
          Exit
        </button>
      )}
    </div>
  )
}

const TIPS = [
  'Swipe left or right to change lane',
  'Swipe up to jump, down to slide – twice down to roll',
  'Run into a plane, raft or jeep to ride it',
  'Every run starts somewhere new across 100 wild zones',
  'Collect four map fragments for a treasure',
  'Three stars: clear a challenge without a save and grab its coins',
]
/** The first load: the jungle behind a soft veil, the title centred, a slim progress line and rotating tips. */
function LoadingScreen({ progress }: { progress: number }) {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 2600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="wb-layer z-[95] overflow-hidden" style={{ background: '#070807' }}>
      {/* the forest, slowly drifting closer behind a dark veil */}
      <div className="wb-layer wb-load-bg" style={{ backgroundImage: 'url(/models/wildbound/tex/sky_2k.jpg)', backgroundSize: 'cover', backgroundPosition: '50% 45%', filter: 'blur(2px) saturate(1.15)' }} />
      <div className="wb-layer" style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(7,9,7,0.35), rgba(5,7,5,0.92) 75%)' }} />
      <div className="wb-layer flex flex-col items-center justify-center gap-4 px-4 text-center">
        <Logo size={1.25} className="wb-in" />
        <div className="text-[clamp(11px,3.2vw,14px)] font-semibold uppercase tracking-[0.42em] text-[var(--muted)]">Run · Explore · Survive</div>
        <div className="mt-3 h-[2px] w-[min(62vw,300px)] overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(8, progress)}%`, background: 'linear-gradient(90deg,#f3e3bd,#a9864e)' }} />
        </div>
        <div className="text-[12px] uppercase tracking-[0.3em] text-white/45">Loading the forest · {Math.round(Math.max(8, progress))}%</div>
      </div>
      <div key={tip} className="wb-in absolute inset-x-0 bottom-[max(28px,env(safe-area-inset-bottom))] px-6 text-center text-[clamp(13px,3.6vw,15px)] text-white/70">
        <span className="mr-2 text-[var(--gold)]">TIP</span>
        {TIPS[tip]}
      </div>
    </div>
  )
}
