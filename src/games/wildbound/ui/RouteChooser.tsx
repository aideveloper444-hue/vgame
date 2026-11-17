import { useEffect, useState } from 'react'
import { BIOME_NAME } from '../engine/content'
import { ROUTE_BONUS_TEXT, routeForLane, type Fork } from '../engine/run'
import { run } from '../scene/runController'

/*
 * The junction chooser: while a junction is coming up, a slim strip under the top bar shows one small chip per
 * route (arrow, world; the lit one adds its reward, risky ones a warning), and the route Sonic is lined up for is highlighted. It never pauses the run or takes
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
  // a slim strip under the top bar: one small chip per path; the path you're lined up for is lit and names its reward
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+60px)] z-20 flex justify-center px-3 portrait:top-[calc(env(safe-area-inset-top)+96px)]" aria-live="polite">
      <div className="flex max-w-full items-center gap-1 rounded-full bg-black/45 p-1 pl-2.5 backdrop-blur-md ring-1 ring-white/10">
        <span className="shrink-0 pr-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 tabular-nums">{dist} m</span>
        {fork.routes.map((r, i) => {
          const on = i === here
          const arrow = r.dir > 0 ? '‹' : r.dir < 0 ? '›' : '↑'
          return (
            <span
              key={i}
              className={`flex h-7 min-w-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold transition-colors duration-150 ${on ? 'bg-[#e8d3a4] text-[#1b1206]' : 'text-white/75'}`}
            >
              <span className="text-[14px] font-bold leading-none">{arrow}</span>
              <span className="truncate">{BIOME_NAME[r.biome]}</span>
              {on && <span className="truncate font-bold">· {ROUTE_BONUS_TEXT[r.bonus]}</span>}
              {r.risk === 'risky' && <span className={on ? 'text-[#9a2a12]' : 'text-[#ff8a6a]'}>⚠</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
