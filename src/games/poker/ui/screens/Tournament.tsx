import { useCallback, useEffect, useState, type ReactNode } from 'react'
import hero from '../art/tourney_hero.webp'
import { Countdown, Empty, ScreenHeader, Sheet, Tabs, fmt, fmtShort, toast } from '../kit'
import { TrophyIcon } from '../icons'
import { TOURNAMENTS, nextStart, payouts, tournament, type TournamentDef } from '../../data/tables'
import { useProfile, useRpc } from '../../state/profileStore'
import { registerTourney, unregisterTourney } from '../../state/play'
import { api } from '../../net/api'
import { onLive } from '../../net/live'

type Tab = 'ongoing' | 'upcoming' | 'completed'

interface Listing {
  id: string
  startsAt: number | null
  registered: number
  isRegistered: boolean
  live: { key: string; remaining: number; field: number; level: number } | null
  playing: string | null
}

/** Screen 5: tournaments on the club server. Free to enter; prizes are points. */
export default function Tournament() {
  const p = useProfile()
  const loadTourneys = useRpc((s) => s.loadTourneys)
  const [tab, setTab] = useState<Tab>('ongoing')
  const [info, setInfo] = useState<TournamentDef | null>(null)
  const [list, setList] = useState<Listing[]>([])
  const [queue, setQueue] = useState<number | null>(null)

  const load = useCallback(() => {
    api<Listing[]>('/tournaments')
      .then(setList)
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    void loadTourneys()
    const t = setInterval(load, 5000)
    const off = onLive((m) => {
      if (m.type === 'SNG_QUEUE') setQueue(Number(m.waiting))
      if (m.type === 'ME_CHANGED') load()
    })
    return () => {
      clearInterval(t)
      off()
    }
  }, [load, loadTourneys])
  if (!p) return null

  const daily = tournament('daily')!
  const L = (id: string) => list.find((x) => x.id === id)
  const dl = L('daily')
  const start = dl?.startsAt ?? nextStart(daily)!
  const registered = !!dl?.isRegistered

  const toggle = (def: TournamentDef, on: boolean) => {
    if (on) unregisterTourney(def.id)
    else registerTourney(def.id)
    toast(on ? `Unregistered from ${def.name}` : `Registered for ${def.name}. You’ll be seated automatically when it starts.`, on ? 'info' : 'good')
    setTimeout(load, 400)
  }
  const sitAndGo = (def: TournamentDef) => {
    registerTourney(def.id)
    setQueue(1)
    toast('Finding players… the game starts when six are ready or after 45 seconds', 'info')
  }

  return (
    <div className="rpc-screen pb-8">
      <ScreenHeader title="Tournament" icon={<TrophyIcon size={30} />} />

      <div className="relative mx-0 -mt-1 overflow-hidden" style={{ containerType: 'inline-size' }}>
        <img src={hero} alt="" className="block w-full" draggable={false} />
        <div className="absolute inset-x-0 flex flex-col items-center text-center" style={{ top: '38%' }}>
          <h2 className="rpc-display gold-text" style={{ fontSize: '9.4cqw', lineHeight: 1.0, fontWeight: 700 }}>
            DAILY POKER
            <br />
            TOURNAMENT
          </h2>
          <p className="rpc-display text-white" style={{ fontSize: '5.8cqw', marginTop: '0.5cqw', textShadow: '0 2px 4px #000' }}>
            Win Big Rewards!
          </p>
        </div>
      </div>

      <div className="relative -mt-[3%] flex flex-col items-center px-4">
        <div className="gold-frame flex items-center gap-3 rounded-2xl px-6 py-2">
          <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden>
            <path fill="url(#rpcGold)" d="M9 1h6v2h-2v1.1A9 9 0 1 1 6 6.2L4.6 4.8 6 3.4l1.5 1.5A9 9 0 0 1 11 4.1V3H9V1Zm3 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-1 2h2v5.4l3.2 1.9-1 1.7L11 14.6V8Z" />
          </svg>
          <div className="flex flex-col items-center">
            <span className="rpc-display text-[1.1em] text-white">{dl?.live ? 'Running now' : 'Starts in:'}</span>
            {dl?.live ? <span className="rpc-display gold-text text-[1.6em] leading-none">{fmt(dl.live.remaining)} left</span> : <Countdown to={start} className="rpc-display gold-text text-[2em] leading-none" />}
          </div>
        </div>
      </div>

      <div className="dark-frame mx-4 mt-3 grid grid-cols-2 rounded-2xl py-2.5 text-center">
        <div className="border-r border-[#e9b33a]/30">
          <p className="rpc-display text-[1.1em] text-white">Prize Pool</p>
          <p className="rpc-display gold-text text-[1.75em] leading-tight">{fmt(daily.prizePool)}</p>
          <p className="rpc-muted -mt-0.5 text-[0.78em]">points</p>
        </div>
        <div>
          <p className="rpc-display text-[1.1em] text-white">Players</p>
          <p className="rpc-display text-[1.75em] leading-tight text-white">
            {fmt(dl?.live ? dl.live.field : (dl?.registered ?? 0))} / {fmt(daily.field)}
          </p>
          <button onClick={() => setInfo(daily)} className="rpc-muted -mt-0.5 text-[0.78em] underline">
            prizes & rules
          </button>
        </div>
      </div>

      <div className="mx-4 mt-3">
        <button className={`btn ${registered ? 'btn-dark' : 'btn-gold rpc-shine'} h-[58px] w-full text-[1.5em]`} onClick={() => toggle(daily, registered)}>
          {registered ? 'Registered ✓ (tap to cancel)' : 'Register Now'}
        </button>
      </div>

      <Tabs<Tab>
        className="mx-4 mt-4"
        value={tab}
        onChange={(t) => {
          setTab(t)
          if (t === 'completed') void loadTourneys()
        }}
        options={[
          { id: 'ongoing', label: 'Ongoing' },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'completed', label: 'Completed' },
        ]}
      />

      <div className="mx-4 mt-3 flex flex-col">
        {tab === 'ongoing' && (
          <>
            {TOURNAMENTS.filter((t) => t.schedule.kind === 'now').map((t) => (
              <Row
                key={t.id}
                t={t}
                onInfo={() => setInfo(t)}
                sub={`${fmtShort(t.prizePool)} pts · 6 players · starts when full`}
                right={
                  L(t.id)?.isRegistered || queue ? (
                    <button className="btn btn-dark h-10 px-3 text-[0.95em]" onClick={() => (unregisterTourney(t.id), setQueue(null), setTimeout(load, 300))}>
                      Waiting {queue ?? L(t.id)?.registered ?? 1}/6 ✕
                    </button>
                  ) : (
                    <button className="btn btn-green h-10 px-4 text-[1.05em]" onClick={() => sitAndGo(t)}>
                      Play
                    </button>
                  )
                }
              />
            ))}
            {list
              .filter((x) => x.live && x.id !== 'turbo')
              .map((x) => {
                const t = tournament(x.id)!
                return <Row key={x.id} t={t} onInfo={() => setInfo(t)} sub={`Live · ${fmt(x.live!.remaining)} of ${fmt(x.live!.field)} left · level ${x.live!.level + 1}`} right={<span className="rpc-display text-[0.95em] text-green-400">{x.playing ? 'You’re in' : 'Running'}</span>} />
              })}
          </>
        )}
        {tab === 'upcoming' &&
          TOURNAMENTS.filter((t) => t.schedule.kind !== 'now' && t.id !== 'daily').map((t) => {
            const x = L(t.id)
            const at = x?.startsAt ?? nextStart(t)!
            const on = !!x?.isRegistered
            return (
              <Row
                key={t.id}
                t={t}
                onInfo={() => setInfo(t)}
                sub={`${fmtShort(t.prizePool)} pts · ${fmt(x?.registered ?? 0)} registered`}
                right={
                  <button onClick={() => toggle(t, on)} className="flex flex-col items-end text-right">
                    <span className={`rpc-display text-[0.95em] ${on ? 'text-green-400' : 'text-[#ffd96a]'}`}>{on ? 'Registered ✓' : 'Register'}</span>
                    <span className="rpc-display text-[1.35em] leading-tight text-[#ffd96a]">{humanIn(at)}</span>
                  </button>
                }
              />
            )
          })}
        {tab === 'completed' &&
          (p.tourneyResults.length === 0 ? (
            <Empty title="No finished tournaments yet" body="Your results land here. The Turbo Sit & Go starts as soon as six players are ready." action={<button className="btn btn-gold mt-2 h-10 px-5" onClick={() => setTab('ongoing')}>Find one</button>} />
          ) : (
            p.tourneyResults.slice(0, 30).map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-[#e9b33a]/20 py-2.5">
                <TrophyBadge />
                <div className="min-w-0 flex-1">
                  <p className="rpc-display truncate text-[1.15em] text-white">{r.name}</p>
                  <p className="rpc-muted text-[0.9em]">
                    {new Date(r.at).toLocaleDateString()} · {fmt(r.field)} players
                  </p>
                </div>
                <div className="text-right">
                  <p className="rpc-display text-[1.1em] text-white">#{fmt(r.place)}</p>
                  <p className={`rpc-display text-[0.95em] ${r.prize ? 'text-green-400' : 'text-white/50'}`}>{r.prize ? `+${fmtShort(r.prize)}` : '—'}</p>
                </div>
              </div>
            ))
          ))}
      </div>

      <Sheet open={!!info} onClose={() => setInfo(null)} title={info?.name}>
        {info && (
          <div className="flex flex-col gap-3 text-[0.98em] text-[#e9dcc0]">
            <p>Free to enter. Everyone starts with {fmt(info.startingStack)} chips and blinds rise on a clock. Players are seated at tables of six and moved to keep tables even until the final table. When you bust, your place is set; the last player standing wins. If fewer than six people register, computer players fill the field.</p>
            <div className="dark-frame rounded-xl p-3">
              <p className="rpc-display mb-1 text-[#ffd96a]">Prizes at a full field (points)</p>
              {payouts(info)
                .slice(0, 5)
                .map((amt, i) => (
                  <p key={i} className="flex justify-between">
                    <span>#{i + 1}</span>
                    <span className="rpc-display text-white">{fmt(amt)}</span>
                  </p>
                ))}
              <p className="rpc-muted mt-1 text-[0.85em]">Smaller fields pay fewer places from a smaller pool.</p>
            </div>
            <p className="rpc-muted text-[0.85em]">Points are free, cannot be bought, sent or cashed out, and have no money value.</p>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function humanIn(at: number) {
  const h = (at - Date.now()) / 3600000
  return h >= 24 ? `${Math.round(h / 24)}d` : h >= 1 ? `${Math.round(h)}h` : `${Math.max(1, Math.round(h * 60))}m`
}

function TrophyBadge() {
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl" style={{ background: 'radial-gradient(circle at 50% 30%, #4a2a6a, #1a0d24)', boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.45)' }}>
      <TrophyIcon size={36} />
    </span>
  )
}

function Row({ t, sub, right, onInfo }: { t: TournamentDef; sub: string; right: ReactNode; onInfo: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#e9b33a]/20 py-2.5">
      <button onClick={onInfo} aria-label={`${t.name} details`}>
        <TrophyBadge />
      </button>
      <button onClick={onInfo} className="min-w-0 flex-1 text-left">
        <p className="rpc-display truncate text-[1.2em] text-white">{t.name}</p>
        <p className="rpc-display text-[0.98em] text-[#ffd96a]">{sub}</p>
      </button>
      {right}
    </div>
  )
}
