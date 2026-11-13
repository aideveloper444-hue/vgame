import { useEffect, useRef, useState } from 'react'
import { Crown, Flag, Home, RotateCcw, Users } from 'lucide-react'
import { completeGameSession } from '@/lib/gameSession'
import { raceReward, type Racer } from '../engine/race'
import { run } from '../scene/runController'
import { useSave } from '../state/progress'
import { headArt } from './art'
import { Coin, fmt } from './common'
import { fmtTime } from './RaceScreen'
import { sfx } from './sfx'

/*
 * Race overlays on the run HUD: the live standings with gaps, a progress bar to the finish with every runner
 * on it, the stumble countdown after a crash, and the podium at the end.
 */

interface Row {
  id: string
  name: string
  animalId: Racer['animalId']
  color: string
  d: number
  finishMs: number | null
  down: boolean
  left: boolean
  me: boolean
}

function readRows(): { rows: Row[]; length: number; t: number; stumbleLeft: number; closed: boolean } | null {
  const race = run.race
  if (!race) return null
  const rows = race.standings().map((r) => ({ id: r.id, name: r.name, animalId: r.animalId, color: r.color, d: r.d, finishMs: r.finishMs, down: race.t < r.stumbleUntil, left: r.left, me: r.id === race.localId }))
  const me = race.local
  return { rows, length: race.length, t: race.t, stumbleLeft: Math.max(0, me.stumbleUntil - race.t), closed: race.closed }
}

export function useRaceRows() {
  const [s, set] = useState(readRows)
  useEffect(() => {
    const t = setInterval(() => set(readRows()), 120)
    return () => clearInterval(t)
  }, [])
  return s
}

/** Standings at the side plus the finish bar along the top. */
export function RaceHud() {
  const s = useRaceRows()
  if (!s) return null
  const me = s.rows.find((r) => r.me)
  return (
    <>
      {/* progress to the finish line, every runner a dot */}
      <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+8px)] w-[min(46vw,360px)] -translate-x-1/2 portrait:top-[calc(env(safe-area-inset-top)+58px)] portrait:w-[78vw]">
        <div className="relative h-3 rounded-full bg-black/55 ring-1 ring-white/25">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((me?.d ?? 0) / s.length) * 100)}%`, background: 'linear-gradient(90deg,#a9d4b6,#dcc08a)' }} />
          {s.rows.map((r) => (
            <span
              key={r.id}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/60"
              style={{ left: `${Math.min(100, (r.d / s.length) * 100)}%`, background: r.color, zIndex: r.me ? 2 : 1, transform: `translate(-50%,-50%) scale(${r.me ? 1.25 : 1})` }}
            />
          ))}
          <Flag size={18} className="absolute -right-3 -top-2 text-white drop-shadow" />
        </div>
        <div className="mt-0.5 text-center text-[13px] font-bold wb-shadow">{fmt(Math.max(0, s.length - (me?.d ?? 0)))} m to the finish</div>
      </div>

      {/* standings */}
      <div className="pointer-events-none absolute left-2 top-[calc(env(safe-area-inset-top)+58px)] flex w-[168px] flex-col gap-1 portrait:top-[calc(env(safe-area-inset-top)+104px)]">
        {s.rows.map((r, i) => {
          const gap = me && !r.me ? Math.round(r.d - me.d) : 0
          return (
            <div key={r.id} className={`flex h-8 items-center gap-1.5 rounded-lg pl-1 pr-2 text-[14px] ${r.me ? 'bg-[#dcc08a]/25 ring-1 ring-[#dcc08a]' : 'bg-black/50'} ${r.left ? 'opacity-45' : ''}`}>
              <span className="wb-title w-4 text-center text-[17px]" style={{ color: r.color }}>
                {i + 1}
              </span>
              <img src={headArt(r.animalId)} alt="" className="h-6 w-6 rounded-md object-cover" style={{ boxShadow: `0 0 0 2px ${r.color}` }} />
              <span className="min-w-0 flex-1 truncate font-bold">{r.me ? 'You' : r.name}</span>
              <span className="text-[12px] font-bold text-white/85">
                {r.finishMs !== null ? <Flag size={13} className="inline text-[#a9d4b6]" /> : r.left ? 'left' : r.down ? '💫' : r.me ? '' : `${gap > 0 ? '+' : ''}${gap} m`}
              </span>
            </div>
          )
        })}
      </div>

      {s.stumbleLeft > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
          <div className="wb-panel px-5 py-2 text-center">
            <div className="wb-title text-[34px] text-[#ff6a4a] wb-stroke">Stumble!</div>
            <div className="text-[16px] font-bold">Back up in {(s.stumbleLeft / 1000).toFixed(1)} s</div>
          </div>
        </div>
      )}
    </>
  )
}

/** The finish: places, times and rewards. Waits for the others (they keep running) until the race closes. */
export function RaceResults({ online, onAgain, onHome }: { online: boolean; onAgain: () => void; onHome: () => void }) {
  const s = useRaceRows()
  const done = useRef(false)
  const [reward, setReward] = useState<{ coins: number; xp: number; place: number } | null>(null)
  const race = run.race

  // the reward is paid once, when this runner's place is settled (finished, or the race closed)
  useEffect(() => {
    if (!s || !race || done.current) return
    const me = s.rows.find((r) => r.me)
    if (!me) return
    // your place is settled once you cross the line (anyone finishing later ranks behind you) or the race closes
    if (!s.closed && me.finishMs === null) return
    const place = s.rows.indexOf(me) + 1
    const field = s.rows.length
    done.current = true
    const r = raceReward(place, field, s.length)
    useSave.getState().recordRace({ place, field, length: s.length, timeMs: me.finishMs, coins: r.coins, xp: r.xp })
    completeGameSession({ gameId: 'wildbound', won: place === 1 && field > 1, coins: 0, xp: 0, playedWithFriend: online })
    setReward({ ...r, place })
    if (place === 1) sfx.win()
    else sfx.milestone()
  }, [s, race, online])

  if (!s) return null
  const podium = s.rows.slice(0, 3)
  const waiting = !s.closed && s.rows.some((r) => r.finishMs === null && !r.left)
  const label = (p: number) => (p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`)
  return (
    <div className="wb-layer wb-dim z-[70] flex items-center justify-center p-4">
      <div className="wb-panel wb-in w-full max-w-[480px] overflow-hidden p-0 text-center">
        <div className="pt-3">
          <div className="wb-title text-[42px] leading-none wb-yellow wb-stroke">{reward ? (reward.place === 1 ? 'YOU WIN!' : `${label(reward.place)} PLACE`) : 'FINISH!'}</div>
          <div className="text-[15px] text-white/75">{waiting ? 'Waiting for the others to cross the line…' : `${s.length / 1000} km race · ${s.rows.length} runners`}</div>
        </div>
        {/* podium */}
        <div className="mx-auto mt-2 flex h-[150px] max-w-[330px] items-end justify-center gap-2 px-3">
          {[1, 0, 2].map((i) => {
            const r = podium[i]
            if (!r) return <div key={i} className="flex-1" />
            const h = i === 0 ? 92 : i === 1 ? 70 : 52
            return (
              <div key={r.id} className="flex flex-1 flex-col items-center">
                {i === 0 && <Crown size={22} className="text-[#dcc08a]" fill="currentColor" />}
                <img src={headArt(r.animalId)} alt="" className="h-12 w-12 rounded-xl object-cover" style={{ boxShadow: `0 0 0 3px ${r.color}` }} />
                <div className="mt-0.5 max-w-full truncate text-[14px] font-bold">{r.me ? 'You' : r.name}</div>
                <div className="flex w-full items-start justify-center rounded-t-lg pt-1" style={{ height: h, background: `linear-gradient(180deg, ${r.color}, ${r.color}55)` }}>
                  <span className="wb-title text-[28px] text-[#1b1206]">{i + 1}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mx-3 mt-0 flex flex-col gap-1 rounded-xl bg-black/35 p-2 text-[15px]">
          {s.rows.map((r, i) => (
            <div key={r.id} className={`flex items-center gap-2 rounded-lg px-2 py-0.5 ${r.me ? 'bg-[#dcc08a]/20' : ''}`}>
              <span className="w-8 text-left font-bold" style={{ color: r.color }}>
                {label(i + 1)}
              </span>
              <span className="min-w-0 flex-1 truncate text-left font-bold">{r.me ? 'You' : r.name}</span>
              <span className="text-white/85">{r.finishMs !== null ? fmtTime(r.finishMs) : r.left ? 'left' : `${fmt(r.d)} m`}</span>
            </div>
          ))}
        </div>
        {reward && (
          <div className="mx-3 mt-2 flex items-center justify-center gap-4 rounded-xl bg-black/30 py-1.5 text-[19px]">
            <span className="flex items-center gap-1">
              <Coin size={20} /> +{fmt(reward.coins)} race bonus
            </span>
            <span className="text-[#a9d4b6]">+{fmt(reward.xp)} XP</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 p-3">
          <button className="wb-btn wb-btn-gold h-12 text-[22px]" onClick={onHome}>
            <Home size={20} /> Home
          </button>
          <button className="wb-btn wb-btn-green h-12 text-[22px]" onClick={onAgain}>
            {online ? <Users size={20} /> : <RotateCcw size={20} />} {online ? 'Lobby' : 'Rematch'}
          </button>
        </div>
      </div>
    </div>
  )
}
