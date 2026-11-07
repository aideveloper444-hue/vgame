import { useEffect, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/oswald/700.css'
import '@fontsource/cinzel/900.css'
import '@fontsource/roboto-condensed/500.css'
import './ui/rpc.css'
import { GoldDefs } from './ui/icons'
import { ToastHost, toast } from './ui/kit'
import { useNav, useRoute, type ScreenName } from './state/nav'
import { currentProfile, useProfile, useRpc } from './state/profileStore'
import { usePokerTable } from './state/tableStore'
import './state/play'
import { rooms, useRoom } from './net/rooms'
import { Logo } from './ui/kit'
import { setPresence } from '@/net/social'
import Splash from './ui/screens/Splash'
import Auth from './ui/screens/Auth'
import Onboard from './ui/screens/Onboard'
import Home from './ui/screens/Home'
import PokerTab from './ui/screens/PokerTab'
import TableScreen from './ui/screens/Table'
import Tournament from './ui/screens/Tournament'
import Shop from './ui/screens/Shop'
import Rewards from './ui/screens/Rewards'
import Profile from './ui/screens/Profile'
import Friends from './ui/screens/Friends'
import Room from './ui/screens/Room'
import { AchievementsScreen, HelpScreen, HistoryScreen, PointsScreen, SettingsScreen } from './ui/screens/ProfileExtras'

const SCREENS: Record<ScreenName, ComponentType> = {
  splash: Splash,
  auth: Auth,
  onboard: Onboard,
  home: Home,
  poker: PokerTab,
  table: TableScreen,
  tournament: Tournament,
  shop: Shop,
  rewards: Rewards,
  profile: Profile,
  friends: Friends,
  room: Room,
  history: HistoryScreen,
  points: PointsScreen,
  settings: SettingsScreen,
  achievements: AchievementsScreen,
  help: HelpScreen,
}

/** Screens that need a signed-in, onboarded player. */
const OPEN: ScreenName[] = ['splash', 'auth', 'onboard', 'help']

/** Royal Poker Club: the whole club app, mounted full-screen at /games/poker/play. */
export default function RoyalPokerApp() {
  const route = useRoute()
  const p = useProfile()
  const status = useRpc((s) => s.status)
  const invites = useRoom((s) => s.invites)
  const navigate = useNavigate()

  // sign back in from the stored session, then pick the first screen
  useEffect(() => {
    void useRpc.getState().boot()
  }, [])
  useEffect(() => {
    if (status === 'loading' || status === 'offline') return
    const params = new URLSearchParams(location.search)
    const code = params.get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
    const me = currentProfile()
    const nav = useNav.getState()
    const top = nav.stack[nav.stack.length - 1].name
    if (top !== 'splash' && nav.stack.length > 1) return
    if (me?.ageConfirmedAt && me.tutorialDone) {
      nav.reset('home')
      if (code?.length === 5) nav.go('room', { join: code })
    } else if (me) nav.reset('onboard')
    else nav.reset('splash')
  }, [status])

  // signed out (or deleted) while inside: back to the door
  useEffect(() => {
    if (status === 'loading' || status === 'offline') return
    if (!p && !OPEN.includes(route.name)) useNav.getState().reset('splash')
    else if (p && (!p.ageConfirmedAt || !p.tutorialDone) && !OPEN.includes(route.name)) useNav.getState().reset('onboard')
  }, [p, route.name, status])

  // device back button: walk back through the club, and only leave VIBO from the lobby
  useEffect(() => {
    history.pushState({ rpc: true }, '')
    const onPop = () => {
      const nav = useNav.getState()
      const top = nav.stack[nav.stack.length - 1]
      if (top.name === 'table' && usePokerTable.getState().open) {
        history.pushState({ rpc: true }, '')
        toast('Use the ☰ menu to leave the table', 'info')
        return
      }
      if (nav.back()) history.pushState({ rpc: true }, '')
      else navigate('/games')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [navigate])

  // presence for VIBO friends, if the player allows it
  const showOnline = p?.settings.showOnline ?? true
  useEffect(() => {
    setPresence(showOnline ? 'Playing Royal Poker Club' : null, showOnline ? 'poker' : null)
  }, [showOnline])

  const Screen = SCREENS[route.name] ?? Home
  return (
    <div className="rpc-root" data-theme={p?.preview.theme ?? p?.equipped.theme ?? 'theme-casino'} data-large-text={!!p?.settings.largeText} data-reduced-motion={!!p?.settings.reducedMotion}>
      <GoldDefs />
      <div className="rpc-phone">
        {status === 'loading' ? (
          <div className="rpc-screen grid place-items-center">
            <div className="flex flex-col items-center gap-5">
              <Logo size={0.8} />
              <div className="rpc-spinner" />
            </div>
          </div>
        ) : status === 'offline' ? (
          <div className="rpc-screen grid place-items-center px-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <Logo size={0.7} tagline={false} />
              <p className="text-[1.05em] text-[#e9dcc0]">Can’t reach the club right now. Check your connection and try again.</p>
              <button className="btn btn-gold h-12 px-8 text-[1.2em]" onClick={() => void useRpc.getState().boot()}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <Screen key={route.name + JSON.stringify(route.params ?? {})} />
        )}
        {invites[0] && route.name !== 'table' && (
          <div className="gold-frame rpc-pop absolute inset-x-3 top-[calc(env(safe-area-inset-top)+10px)] z-[65] flex items-center gap-3 rounded-2xl p-3">
            <p className="flex-1 text-[0.98em] text-white">
              <b className="text-[#ffd96a]">{invites[0].from}</b> invited you to their table
            </p>
            <button className="btn btn-dark h-9 px-3" onClick={() => rooms.dismissInvite(invites[0].code)}>
              Later
            </button>
            <button
              className="btn btn-gold h-9 px-4"
              onClick={() => {
                const code = invites[0].code
                rooms.dismissInvite(code)
                useNav.getState().go('room', { join: code })
              }}
            >
              Join
            </button>
          </div>
        )}
        <ToastHost />
      </div>
    </div>
  )
}
