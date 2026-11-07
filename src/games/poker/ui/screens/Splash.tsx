import { ChevronRight } from 'lucide-react'
import splashBg from '../art/splash_bg.webp'
import { useNav } from '../../state/nav'
import { useRpc, currentProfile } from '../../state/profileStore'

/** Screen 1: the welcome poster with the club logo, the hostess and the chip piles. */
export default function Splash() {
  const reset = useNav((s) => s.reset)
  const go = useNav((s) => s.go)
  const markSeen = useRpc((s) => s.markSplashSeen)

  const start = () => {
    markSeen()
    const p = currentProfile()
    if (!p) return go('auth', { tab: 'signup' })
    reset(p.ageConfirmedAt && p.tutorialDone ? 'home' : 'onboard')
  }

  return (
    <div className="rpc-screen flex flex-col" style={{ paddingTop: 0 }}>
      <div className="relative w-full shrink-0" style={{ containerType: 'inline-size' }}>
        <img src={splashBg} alt="" className="block w-full" draggable={false} />
        {/* the logo badge is part of the art; its lettering is live text so it stays sharp */}
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: '17%' }}>
          <h1 className="rpc-logo-type gold-text text-center" style={{ fontSize: '12.4cqw', lineHeight: 1.02, transform: 'scaleX(.84)', letterSpacing: '-0.01em' }}>
            ROYAL
            <br />
            POKER CLUB
          </h1>
          <p className="rpc-display text-[#fff1cf]" style={{ fontSize: '6.6cqw', marginTop: '2.4cqw', textShadow: '0 2px 4px #000' }}>
            Play · Win · Enjoy
          </p>
        </div>
      </div>
      <div className="relative z-10 -mt-[18%] flex flex-1 flex-col items-center justify-end gap-3 px-6 pb-[calc(18px+env(safe-area-inset-bottom))]" style={{ background: 'linear-gradient(180deg, transparent, #050403 38%)' }}>
        <button onClick={start} className="btn btn-gold rpc-shine h-[62px] w-full max-w-[330px] text-[1.65em]">
          Get Started <ChevronRight size={26} strokeWidth={3} />
        </button>
        <button onClick={() => (markSeen(), go('auth', { tab: 'login' }))} className="rpc-display py-2 text-[1.08em] text-white">
          Already have an account? <span className="text-[#ffd96a]">Login</span>
        </button>
      </div>
    </div>
  )
}
