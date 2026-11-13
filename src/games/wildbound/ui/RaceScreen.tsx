import { useEffect } from 'react'
import { Flag, Timer, Trophy, Users } from 'lucide-react'
import GameModeMenu from '@/games/shared/online/GameModeMenu'
import { ROSTER, getAnimal, type AnimalId } from '../engine/content'
import { RACER_COLORS, RACE_LENGTHS, pickBotAnimals, type RaceSeat } from '../engine/race'
import { useSave } from '../state/progress'
import { WILD_BOT_NAMES, broadcastGo, sendRaceAction, setRaceNetHandlers, useRaceUI, useWildMatch, wildRoom } from '../state/race'
import { headArt } from './art'
import { Backdrop, Header, useNav } from './common'
import { sfx } from './sfx'

/*
 * Play with Friends: race friends with a room code, race players online, or race computer rivals, on the same
 * trail. Picks the race length and shows who you race as; the shared mode menu does rooms and quick match.
 */

const newSeed = () => (Math.random() * 2 ** 31) | 0
const fmtTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`
export { fmtTime }

export default function RaceScreen() {
  const go = useNav((s) => s.go)
  const selected = useSave((s) => s.selected)
  const races = useSave((s) => s.races)
  const length = useRaceUI((s) => s.length)
  const matchId = useWildMatch((s) => s.matchId)
  const screen = useWildMatch((s) => s.screen)
  const a = getAnimal(selected)

  // the table is locked: agree on the trail (seed), the length and everyone's animal, then start the run
  useEffect(() => {
    const m = useWildMatch.getState()
    if (m.screen !== 'game') return
    const myAnimal = useSave.getState().selected
    const localId = m.localSeatIds[0] ?? 'you'
    const online = m.role !== 'solo'
    const begin = (seed: number, len: number, seats: RaceSeat[]) => {
      useRaceUI.setState({ pending: { seed, length: len, seats, localId, botLevel: m.botLevel, online, role: m.role } })
      useNav.getState().go('run')
    }
    if (m.role === 'solo') {
      const bots = pickBotAnimals(m.seats.length, myAnimal)
      begin(
        newSeed(),
        useRaceUI.getState().length,
        m.seats.map((s, i) => ({ id: s.id, name: s.name, avatarEmoji: s.avatarEmoji, kind: s.kind === 'bot' ? 'bot' : 'local', animalId: s.kind === 'bot' ? bots[i] : myAnimal })),
      )
      return
    }
    const picks = new Map<string, AnimalId>([[localId, myAnimal]])
    let started = false
    const start = (seed: number, len: number, list: RaceSeat[]) => {
      if (started) return
      started = true
      // on this device: me, the host's computer rivals (host only) and everyone else as remote runners
      begin(seed, len, list.map((s) => ({ ...s, kind: s.id === localId ? 'local' : m.role === 'host' && s.kind === 'bot' ? 'bot' : 'remote' })))
    }
    setRaceNetHandlers({
      onPick: (seatId, animalId) => {
        if (m.role === 'host') picks.set(seatId, animalId as AnimalId)
      },
      onGo: (seed, len, list) => {
        if (m.role === 'guest') start(seed, len, list)
      },
    })
    const timers: number[] = []
    if (m.role === 'host') {
      const remote = m.seats.filter((s) => s.kind === 'remote')
      const bots = pickBotAnimals(m.seats.length, myAnimal)
      const launch = () => {
        const seed = newSeed()
        const len = useRaceUI.getState().length
        const list: RaceSeat[] = m.seats.map((s, i) => ({ id: s.id, name: s.name, avatarEmoji: s.avatarEmoji, kind: s.kind === 'bot' ? 'bot' : s.id === localId ? 'local' : 'remote', animalId: picks.get(s.id) ?? (s.kind === 'bot' ? bots[i] : 'sonic') }))
        broadcastGo(seed, len, list)
        start(seed, len, list)
      }
      // wait for everyone's animal (at most 3 s), then go
      const poll = window.setInterval(() => {
        if (remote.every((s) => picks.has(s.id))) {
          clearInterval(poll)
          launch()
        }
      }, 150)
      timers.push(poll, window.setTimeout(() => (clearInterval(poll), launch()), 3000))
    } else {
      const send = () => sendRaceAction({ t: 'pick', animalId: myAnimal })
      send()
      timers.push(window.setInterval(() => !started && send(), 700))
    }
    return () => {
      for (const t of timers) {
        clearInterval(t)
        clearTimeout(t)
      }
    }
  }, [matchId, screen])

  return (
    <div className="wb-layer">
      <Backdrop dim={0.5} />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="PLAY WITH FRIENDS" />
        <div className="wb-scroll min-h-0 flex-1 pb-6">
          <div className="mx-auto flex max-w-[26rem] flex-col gap-2.5">
            <div className="wb-panel flex items-center gap-3 p-2.5">
              <img src={headArt(a.id)} alt="" className="h-14 w-14 rounded-xl object-cover" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[13px] font-bold uppercase tracking-wider text-[#a9d4b6]">Racing as</div>
                <div className="wb-title text-[26px] wb-yellow wb-stroke">{a.name}</div>
                <div className="text-[14px] text-white/75">
                  {a.species} · {a.ability.name}
                </div>
              </div>
              <button className="wb-btn wb-btn-dark h-10 px-3 text-[17px]" onClick={() => (sfx.tap(), go('select'))}>
                Change
              </button>
            </div>

            <div className="wb-panel p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[15px] font-bold uppercase tracking-wider text-white/80">
                <Flag size={16} className="text-[#dcc08a]" /> Race to the finish line
              </div>
              <div className="grid grid-cols-3 gap-2">
                {RACE_LENGTHS.map((l) => (
                  <button
                    key={l}
                    className={`wb-card h-14 !rounded-xl text-center leading-none ${l === length ? 'ring-2 ring-[#dcc08a] shadow-[0_0_16px_rgba(255,216,74,0.5)]' : 'opacity-80'}`}
                    onClick={() => (sfx.tap(), useRaceUI.setState({ length: l }))}
                  >
                    <span className="wb-title block text-[26px] wb-yellow">{l / 1000} km</span>
                    <span className="text-[12px] text-white/70">{races.bestTime[l] ? `best ${fmtTime(races.bestTime[l]!)}` : `${Math.ceil(l / 400)} zones`}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[13px] leading-snug text-white/70">
                Everyone runs the same trail. A crash costs you a stumble, not the race. Store power-ups stay in the bag: only what you find on the trail counts.
              </p>
              <div className="mt-2 flex items-center justify-around rounded-xl bg-black/30 py-1.5 text-[14px]">
                <span className="flex items-center gap-1">
                  <Users size={15} className="text-[#5ab8ff]" /> {races.played} raced
                </span>
                <span className="flex items-center gap-1">
                  <Trophy size={15} className="text-[#dcc08a]" /> {races.wins} won
                </span>
                <span className="flex items-center gap-1">
                  <Timer size={15} className="text-[#a9d4b6]" /> {races.podiums} podiums
                </span>
              </div>
            </div>

            <GameModeMenu
              counts={[2, 3, 4, 5, 6]}
              defaultCount={4}
              modes={['friendsOnline', 'online', 'computer', 'solo']}
              modeText={{
                friendsOnline: { title: 'Race Friends', blurb: 'Create a room or join with a code' },
                online: { title: 'Play Online', blurb: 'Race runners from anywhere' },
                computer: { title: 'vs Computer', blurb: 'Fast, sharp wild rivals' },
                solo: { title: 'Easy Rivals', blurb: 'A relaxed race to learn the trail' },
              }}
              seatStyle={(i) => ({ hex: RACER_COLORS[i % 6], glow: RACER_COLORS[i % 6], label: `runner ${i + 1}` })}
              renderAvatar={(name, i) => (
                <span className="flex h-full w-full items-center justify-center text-sm font-black text-[#0b1a10]" style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${RACER_COLORS[i % 6]} 70%)` }}>
                  {name.slice(0, 1).toUpperCase()}
                </span>
              )}
              renderPreview={(n) => (
                <div className="flex items-center gap-3 rounded-2xl bg-black/25 p-2.5 ring-1 ring-white/5">
                  <div className="flex -space-x-3">
                    {[selected, ...ROSTER.map((x) => x.id).filter((id) => id !== selected)].slice(0, n).map((id) => (
                      <img key={id} src={headArt(id)} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-[#0b1a10]" />
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold leading-snug text-slate-300">
                    {n} runners, one trail, {length / 1000} km. First across the line is Alpha of the Pack.
                  </p>
                </div>
              )}
              botNames={WILD_BOT_NAMES}
              match={useWildMatch}
              room={wildRoom}
              invitePath="/games/wildbound/play"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
