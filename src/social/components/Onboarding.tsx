import { useLocation } from 'react-router-dom'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { ProfileEditor } from '@/social/screens/ProfileScreen'
import { isImmersiveRoute } from './BottomNav'

/** First launch: pick a name and avatar so friends know who you are. */
export default function Onboarding() {
  const onboarded = usePlayerStore((s) => s.onboarded)
  const complete = usePlayerStore((s) => s.completeOnboarding)
  const { pathname, search } = useLocation()
  // a game invite link or direct game route opens straight into the game; ask later
  if (onboarded || isImmersiveRoute(pathname) || /[?&]room=/.test(search)) return null

  return (
    <div className="fixed inset-0 z-[85] overflow-y-auto bg-surface-0">
      <div className="app-aurora pointer-events-none absolute inset-x-0 top-0 h-[60vh]" />
      <div className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
        <p className="text-center text-[11px] font-black uppercase tracking-[0.28em] text-brand-2">Welcome to</p>
        <h1 className="mt-1 text-center text-4xl font-black tracking-tight text-white">VIBO</h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-sm text-slate-400">Four games, one party. Chat and talk with friends while you play.</p>
        <div className="mt-6 rounded-[28px] border border-white/10 bg-surface-1/90 p-5 backdrop-blur-xl">
          <ProfileEditor onDone={complete} submitLabel="Let's play" />
        </div>
      </div>
    </div>
  )
}
