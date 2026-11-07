import { Outlet, useLocation } from 'react-router-dom'
import Header from '@/social/components/Header'
import SidebarNav from '@/social/components/SidebarNav'
import BottomNav, { isImmersiveRoute } from '@/social/components/BottomNav'
import ReactionOverlay from '@/social/components/ReactionOverlay'
import SocialToasts from '@/social/components/SocialToasts'
import Onboarding from '@/social/components/Onboarding'
import { ReportSheetHost } from '@/social/components/ReportSheet'
import { useEffect } from 'react'
import { useVoiceStore } from '@/social/stores/useVoiceStore'
import { setMusicContext } from '@/lib/sound'

export default function RootLayout() {
  const { pathname } = useLocation()
  const immersive = isImmersiveRoute(pathname)
  const inVoice = useVoiceStore((s) => s.joined)
  const inGame = /^\/games\/[^/]+\/play/.test(pathname)
  useEffect(() => setMusicContext({ inGame, inVoice }), [inGame, inVoice])
  return (
    <div className="flex h-full min-h-screen bg-surface-0">
      <SidebarNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className={`min-w-0 flex-1 overflow-x-hidden ${immersive ? '' : 'pb-28 md:pb-8'}`}>
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <ReactionOverlay />
      <SocialToasts />
      <ReportSheetHost />
      <Onboarding />
    </div>
  )
}
