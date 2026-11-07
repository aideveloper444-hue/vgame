import { Lock, Star } from 'lucide-react'
import { MYSTERY_CASES, getTheme } from './mysteryCaseData'
import { useMysteryStore } from './mysteryStore'

// phones: a zig-zag trail; tablets: a grid of cases
const X_PATTERN = ['justify-start pl-8 md:pl-0', 'justify-center', 'justify-end pr-8 md:pr-0', 'justify-center']

export default function MysteryLevelMap() {
  const progress = useMysteryStore((s) => s.progress)
  const isUnlocked = useMysteryStore((s) => s.isUnlocked)
  const startCase = useMysteryStore((s) => s.startCase)
  const mode = useMysteryStore((s) => s.mode)
  const setMode = useMysteryStore((s) => s.setMode)
  const duoNames = useMysteryStore((s) => s.duoNames)
  const setDuoName = useMysteryStore((s) => s.setDuoName)

  const totalStars = Object.values(progress).reduce((sum, p) => sum + p.stars, 0)
  const maxStars = MYSTERY_CASES.length * 3

  return (
    <div className="mx-auto max-w-md px-4 py-6 md:max-w-3xl md:px-8 lg:max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Mystery Wild</h1>
          <p className="text-sm text-slate-400">Investigate. Share clues. Solve it.</p>
        </div>
        <div className="hud-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-amber-300">
          <Star size={16} fill="currentColor" /> {totalStars}/{maxStars}
        </div>
      </div>

      <div className="hud-glass mb-6 rounded-3xl p-3 md:mx-auto md:max-w-xl">
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-black/30 p-1" role="radiogroup" aria-label="Players">
          {(
            [
              ['solo', '🕵️ 1 Player'],
              ['duo', '👥 2 Players · same phone'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-xl px-2 py-2 text-xs font-black transition-colors ${mode === value ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-white/10'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'duo' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <label key={i} className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Detective {i + 1}
                <input
                  id={`mystery-duo-name-${i}`}
                  value={duoNames[i]}
                  onChange={(e) => setDuoName(i, e.target.value)}
                  maxLength={16}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold normal-case tracking-normal text-white outline-none ring-violet-400 focus:ring-2"
                />
              </label>
            ))}
            <p className="col-span-2 text-[11px] leading-snug text-slate-400">
              Take turns on this phone. Each detective keeps secret clues, and the first correct accusation wins.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-5 md:gap-x-4 md:gap-y-7 lg:grid-cols-6">
        {MYSTERY_CASES.map((c, order) => {
          const theme = getTheme(c.theme)
          const unlocked = isUnlocked(order)
          const stars = progress[c.id]?.stars ?? 0
          return (
            <div key={c.id} className={`flex ${X_PATTERN[order % X_PATTERN.length]} md:flex-col md:items-center md:justify-start`}>
              <button
                disabled={!unlocked}
                onClick={() => startCase(c.id)}
                className={`relative flex h-16 w-16 flex-col items-center justify-center rounded-full text-lg font-black transition-transform md:h-20 md:w-20 md:text-2xl ${
                  unlocked ? 'hover:scale-110 active:scale-95' : 'opacity-40'
                }`}
                style={{
                  background: unlocked ? 'radial-gradient(circle at 35% 30%, #a78bfaaa, #a78bfa44)' : '#1e293b',
                  boxShadow: unlocked ? '0 0 0 2px #a78bfa, 0 0 16px 2px #a78bfa88' : undefined,
                }}
              >
                {unlocked ? <span>{theme.icon}</span> : <Lock size={20} className="text-slate-500" />}
                {stars > 0 && (
                  <div className="absolute -bottom-2 flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <Star key={i} size={11} className={i < stars ? 'text-amber-300' : 'text-slate-600'} fill="currentColor" />
                    ))}
                  </div>
                )}
              </button>
              <span className={`mt-3 hidden text-xs font-bold md:block ${unlocked ? 'text-slate-200' : 'text-slate-500'}`}>Case {order + 1}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
