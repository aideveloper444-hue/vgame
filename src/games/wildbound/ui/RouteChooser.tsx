import { useEffect, useState } from 'react'
import { BIOME_NAME } from '../engine/content'
import { ROUTE_BONUS_TEXT, ROUTE_RISK_TEXT, routeForLane, type Fork } from '../engine/run'
import { run } from '../scene/runController'

/*
 * The junction chooser: while a junction is coming up, one card per route (arrow, world, reward, danger) sits
 * under the top bar, and the route Sonic is lined up for is highlighted. It never pauses the run or takes
 * input: the player chooses by changing lane (swipe, arrows, A/D) exactly as in normal running.
 */

interface View {
  fork: Fork
  here: number
  dist: number
}

export default function RouteChooser() {
  const [v, setV] = useState<View | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      const sim = run.sim
      const s = sim?.state
      const f = sim && s ? sim.forks.find((x) => x.picked < 0 && x.d - s.d < 110 && x.d - s.d > -1) : null
      if (!sim || !s || !f) {
        setV((old) => (old ? null : old))
        return
      }
      const here = routeForLane(f, s.x)
      const dist = Math.max(0, Math.round(f.d - s.d))
      setV((old) => (old && old.fork === f && old.here === here && old.dist === dist ? old : { fork: f, here, dist }))
    }, 100)
    return () => window.clearInterval(id)
  }, [])
  if (!v) return null
  const { fork, here, dist } = v
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+92px)] z-20 flex flex-col items-center gap-1.5 px-3" aria-live="polite">
      <div className="rounded-full bg-black/55 px-3 py-0.5 text-[13px] font-bold tracking-wide text-[#ffe08a] shadow">
        CHOOSE YOUR PATH · {dist} m
      </div>
      <div className="flex w-full max-w-[560px] justify-center gap-1.5">
        {fork.routes.map((r, i) => {
          const on = i === here
          const arrow = r.dir > 0 ? '◀' : r.dir < 0 ? '▶' : '▲'
          const risk = r.risk === 'risky' ? 'text-[#ff7a5a]' : r.risk === 'safe' ? 'text-[#86e07e]' : 'text-[#a9d8ff]'
          return (
            <div
              key={i}
              className={`min-w-0 flex-1 rounded-xl border-2 px-2 py-1 text-center leading-tight transition-all duration-150 ${on ? 'scale-[1.04] border-[#ffd34a] bg-[#3d2611]/90 shadow-[0_0_14px_rgba(255,200,70,0.7)]' : 'border-white/20 bg-black/45 opacity-80'}`}
            >
              <div className="text-[18px] font-black text-[#ffe08a]">{arrow}</div>
              <div className="truncate text-[13px] font-bold text-white">{BIOME_NAME[r.biome]}</div>
              <div className="truncate text-[12px] font-semibold text-[#ffd34a]">{ROUTE_BONUS_TEXT[r.bonus]}</div>
              <div className={`text-[11px] font-bold ${risk}`}>
                {r.risk === 'risky' ? '⚠ ' : ''}
                {ROUTE_RISK_TEXT[r.risk]}
              </div>
            </div>
          )
        })}
      </div>
      {fork.routes.length === 2 && here < 0 ? null : null}
    </div>
  )
}
