import { useState } from 'react'
import { Bell, CheckCircle2, Crown } from 'lucide-react'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { BackButton } from '@/social/components/ui'

const BENEFITS = [
  'Exclusive cosmetics',
  'Premium profile badge',
  'Bonus daily rewards',
  'Extra customization',
  'Special seasonal items',
]

const NOTIFY_KEY = 'mw-alpha-notify'

function readNotify() {
  try {
    return localStorage.getItem(NOTIFY_KEY) === '1'
  } catch {
    return false
  }
}

/** Alpha Pass goes on sale once Google Play billing is set up; until then players can only ask to be told. */
export default function PremiumScreen() {
  const premium = usePlayerStore((s) => s.profile.premium)
  const [notify, setNotify] = useState(readNotify)

  function askToNotify() {
    setNotify(true)
    try {
      localStorage.setItem(NOTIFY_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 text-center md:px-6">
      <BackButton className="mb-2" />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white">
        <Crown size={28} />
      </div>
      <h1 className="mt-4 text-2xl font-black">Alpha Pass</h1>
      <p className="mt-1 inline-block rounded-full bg-amber-400/15 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-300">Coming soon</p>

      <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface-1 p-5 text-left">
        {BENEFITS.map((b) => (
          <p key={b} className="flex items-center gap-2 text-sm text-slate-200">
            <CheckCircle2 size={16} className="text-amber-400" /> {b}
          </p>
        ))}
      </div>

      {premium ? (
        <div className="mt-6 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-400">You're an Alpha Pass member 👑</div>
      ) : (
        <>
          <button
            type="button"
            onClick={askToNotify}
            disabled={notify}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:from-white/10 disabled:to-white/10 disabled:text-slate-300"
          >
            <Bell size={16} /> {notify ? "We'll tell you when it's ready" : 'Tell me when it launches'}
          </button>
          <p className="mt-3 text-xs text-slate-400">Alpha Pass isn't on sale yet. Everything else in the app is free.</p>
        </>
      )}
    </div>
  )
}
