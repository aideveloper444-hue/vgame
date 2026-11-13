import { Award, Check, ChevronRight, Globe2, GraduationCap, Lock, PartyPopper, RotateCcw, Settings2, ShoppingBag, Trophy } from 'lucide-react'
import { WORLD_LEN, ZONES, ZONE_COUNT, ZONE_LEN, getAnimal, type Variant } from '../engine/content'
import { restorePurchases } from '../state/shop'
import { ACHIEVEMENTS, DAILY_REWARDS, EVENT_TIERS, LEVEL_REWARD, MISSIONS, QUALITIES, today, useSave, type MissionType } from '../state/progress'
import { ART, headArt, kitArt, missionArt } from './art'
import { Backdrop, Coin, Gem, Header, fmt, toast, useCountdown, useFestival, useNav } from './common'
import { haptic, sfx, startAmbience, stopAmbience } from './sfx'

// ---------------------------------------------------------------- missions

export function MissionsScreen({ onPlay }: { onPlay: () => void }) {
  const tiers = useSave((s) => s.missionTier)
  useSave((s) => s.missionProgress)
  useSave((s) => s.xp)
  const value = useSave((s) => s.missionValue)
  const claim = (t: MissionType) => {
    const r = useSave.getState().claimMission(t)
    if (r.ok) {
      sfx.gem()
      haptic(30)
      toast('Mission complete! Gems added', 'good')
    } else toast(r.reason, 'bad')
  }
  return (
    <div className="wb-layer">
      <Backdrop />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="MISSIONS" />
        <div className="wb-panel wb-scroll mx-auto w-full max-w-[720px] flex-1 p-2">
          <div className="flex flex-col gap-2">
            {MISSIONS.map((m) => {
              const tier = tiers[m.type]
              const target = m.target(tier)
              const v = Math.min(target, value(m.type))
              const done = v >= target
              return (
                <div key={m.type} className="wb-card flex items-center gap-3 px-2 py-2">
                  <img src={missionArt(m.icon)} alt="" className="wb-round-ic h-12 w-12" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[19px] font-bold">{m.label(target)}</div>
                    <div className="text-[15px] wb-yellow">
                      ({fmt(v)} / {fmt(target)})
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full" style={{ width: `${(v / target) * 100}%`, background: 'linear-gradient(90deg,#f3e3bd,#a9864e)' }} />
                    </div>
                  </div>
                  <div className="flex w-[64px] items-center justify-end gap-1 text-[22px] font-bold">
                    <Gem size={24} /> {m.reward(tier)}
                  </div>
                  {done ? (
                    <button className="wb-btn wb-btn-green h-10 w-[82px] text-[20px]" onClick={() => claim(m.type)}>
                      CLAIM
                    </button>
                  ) : (
                    <button className="wb-btn wb-btn-gold h-10 w-[82px] text-[22px]" onClick={() => (sfx.tap(), m.type === 'level' ? useNav.getState().go('home') : onPlay())}>
                      GO
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-center text-[14px] text-white/65">Each mission has endless tiers: claim one and a harder one takes its place.</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- worlds

/** how a zone's time of day and weather tint its card */
const VARIANT_FILTER: Record<Variant, string> = {
  day: '',
  golden: 'sepia(0.35) saturate(1.3) hue-rotate(-10deg)',
  mist: 'contrast(0.8) brightness(1.1) saturate(0.7)',
  rain: 'brightness(0.8) saturate(0.7) hue-rotate(10deg)',
  dusk: 'sepia(0.4) hue-rotate(-25deg) brightness(0.8) saturate(1.3)',
  dawn: 'sepia(0.3) hue-rotate(-30deg) brightness(1.05)',
  night: 'brightness(0.45) saturate(0.8) hue-rotate(40deg)',
  storm: 'brightness(0.6) contrast(1.15) saturate(0.6)',
  snowfall: 'brightness(1.15) saturate(0.5)',
}

export function WorldsScreen() {
  const best = useSave((s) => s.best.distance)
  const found = Math.min(ZONE_COUNT, Math.floor(best / ZONE_LEN) + 1)
  const chapters = Array.from({ length: ZONE_COUNT / 10 }, (_, c) => ZONES.slice(c * 10, c * 10 + 10))
  return (
    <div className="wb-layer">
      <Backdrop />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="WORLD MAP" />
        <div className="wb-scroll min-h-0 flex-1">
          <div className="mx-auto w-full max-w-[1000px] px-1">
            <div className="wb-panel mb-2 p-2.5 text-center">
              <div className="text-[19px] font-bold">
                {found} / {ZONE_COUNT} zones discovered
              </div>
              <div className="mx-auto mt-1.5 h-2.5 w-full max-w-[520px] overflow-hidden rounded-full bg-black/40">
                <div className="h-full rounded-full bg-[#3f7a5c]" style={{ width: `${(found / ZONE_COUNT) * 100}%` }} />
              </div>
              <div className="mt-1 text-[14px] text-white/75">
                A new place every {ZONE_LEN} m, from 0 to {fmt(WORLD_LEN)} m. Your best run: {fmt(best)} m.
              </div>
            </div>
            {chapters.map((zs, c) => (
              <section key={c} className="mb-3">
                <h3 className="wb-shadow mb-1.5 px-1 text-[17px] font-bold wb-yellow">
                  Zones {c * 10 + 1}-{c * 10 + 10} · {fmt(zs[0].from)}-{fmt(zs[zs.length - 1].to)} m
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 landscape:grid-cols-5">
                  {zs.map((z) => {
                    const reached = best >= z.from
                    return (
                      <div key={z.n} className="wb-card flex flex-col">
                        <div className="relative aspect-[16/10] w-full overflow-hidden">
                          <img src={kitArt(z.kit)} alt="" className="h-full w-full object-cover" style={{ filter: reached ? VARIANT_FILTER[z.variant] || undefined : 'brightness(0.4) saturate(0.4)' }} />
                          <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[13px] font-bold">{String(z.n).padStart(3, '0')}</div>
                          {reached ? (
                            <div className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#3f7a5c]">
                              <Check size={13} strokeWidth={4} />
                            </div>
                          ) : (
                            <div className="absolute inset-0 grid place-items-center">
                              <Lock size={26} />
                            </div>
                          )}
                        </div>
                        <div className="px-1.5 py-1 leading-tight">
                          <div className="truncate text-[15px] font-bold">{z.name}</div>
                          <div className="text-[13px] text-white/75">
                            {fmt(z.from)}-{fmt(z.to)} m
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- special events

export function EventsScreen({ onPlay }: { onPlay: () => void }) {
  const f = useFestival()
  const left = useCountdown(f.active ? f.endsAt : f.startsAt)
  const join = () => {
    useSave.getState().joinEvent()
    sfx.win()
    toast('You joined the Jungle Festival!', 'good')
  }
  const claim = (i: number) => {
    const r = useSave.getState().claimEventTier(i)
    if (r.ok) {
      sfx.gem()
      toast('Festival reward claimed', 'good')
    } else toast(r.reason, 'bad')
  }
  return (
    <div className="wb-layer">
      <Backdrop />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="SPECIAL EVENTS" />
        <div className="wb-scroll min-h-0 flex-1">
          <div className="mx-auto flex max-w-[720px] flex-col gap-3">
            <div className="wb-panel relative overflow-hidden p-4" style={{ background: 'linear-gradient(135deg, rgba(110,60,10,0.95), rgba(30,16,4,0.95))', boxShadow: 'inset 0 0 0 2px rgba(255,200,80,0.6), 0 10px 30px rgba(0,0,0,0.5)' }}>
              <div className="absolute -right-2 top-0 h-full w-[34%] overflow-hidden">
                <img src={ART.eventMask} alt="" className="h-[118%] w-full object-cover object-top" />
              </div>
              <div className="relative max-w-[62%]">
                <div className="wb-title text-[44px] leading-none wb-yellow wb-stroke">JUNGLE FESTIVAL</div>
                <div className="wb-title mt-1 text-[26px] wb-stroke">Run & Collect Special Tokens!</div>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[20px] font-bold">
                  <span className="text-white/70">{f.active ? 'Ends in' : 'Starts in'}</span> {left}
                </div>
                <div className="mt-3">
                  {f.active && !f.joined && (
                    <button className="wb-btn wb-btn-gold wb-pulse h-12 px-7 text-[28px]" onClick={join}>
                      JOIN NOW
                    </button>
                  )}
                  {f.active && f.joined && (
                    <button className="wb-btn wb-btn-green h-12 px-7 text-[26px]" onClick={() => (sfx.tap(), onPlay())}>
                      RUN FOR TOKENS
                    </button>
                  )}
                  {!f.active && <div className="text-[16px] text-white/85">Every weekend, Friday to Sunday. Festival tokens appear on the trail while it runs.</div>}
                </div>
              </div>
            </div>
            <div className="wb-panel p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="wb-title text-[24px] wb-yellow wb-stroke">Festival Rewards</div>
                <div className="flex items-center gap-1 text-[20px] font-bold">
                  <img src={ART.eventMask} alt="" className="h-8 w-6 object-cover" /> {f.tokens}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {EVENT_TIERS.map((t, i) => {
                  const got = f.claimed.includes(i)
                  const ready = f.tokens >= t.tokens
                  return (
                    <div key={i} className="wb-card flex items-center gap-3 px-3 py-2">
                      <div className="w-[110px] text-[18px] font-bold">{t.tokens} tokens</div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
                        <div className="h-full rounded-full bg-[#ff9a2e]" style={{ width: `${Math.min(1, f.tokens / t.tokens) * 100}%` }} />
                      </div>
                      <div className="flex w-[90px] items-center justify-end gap-1 text-[20px] font-bold">
                        {t.gems ? <Gem size={22} /> : <Coin size={22} />} {fmt(t.gems || t.coins)}
                      </div>
                      <button className={`wb-btn h-9 w-[86px] text-[18px] ${got ? 'wb-btn-dark' : 'wb-btn-green'}`} disabled={got || !ready || !f.joined} onClick={() => claim(i)}>
                        {got ? 'Claimed' : 'Claim'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- rewards: daily + achievements

export function RewardsScreen() {
  const daily = useSave((s) => s.daily)
  const got = useSave((s) => s.achievements)
  const state = useSave()
  const ready = daily.lastClaim !== today()
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const nextDay = ready ? (daily.lastClaim === yesterday ? (daily.streak % 7) + 1 : 1) : daily.streak
  const claimDaily = () => {
    const r = useSave.getState().claimDaily()
    if (r) {
      sfx.win()
      haptic(30)
      toast(r.gems ? `+${r.gems} gems` : `+${fmt(r.coins ?? 0)} coins`, 'good')
    }
  }
  return (
    <div className="wb-layer">
      <Backdrop />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="REWARDS" />
        <div className="wb-scroll min-h-0 flex-1">
          <div className="mx-auto flex max-w-[820px] flex-col gap-3">
            <div className="wb-panel p-3">
              <div className="wb-title mb-2 text-[24px] wb-yellow wb-stroke">Daily Rewards</div>
              <div className="grid grid-cols-7 gap-1.5">
                {DAILY_REWARDS.map((r, i) => {
                  const day = i + 1
                  const claimed = ready ? day < nextDay : day <= daily.streak
                  const today_ = ready && day === nextDay
                  return (
                    <div key={i} className="wb-card flex flex-col items-center gap-0.5 py-2" style={today_ ? { boxShadow: 'inset 0 0 0 2.5px #dcc08a, 0 0 14px rgba(255,210,70,0.7)' } : undefined}>
                      <div className="text-[13px] text-white/75">Day {day}</div>
                      {r.gems ? <Gem size={30} /> : <Coin size={30} />}
                      <div className="text-[15px] font-bold">{fmt(r.gems ?? r.coins ?? 0)}</div>
                      {claimed && <Check size={16} strokeWidth={4} className="text-[#a9d4b6]" />}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 text-center">
                <button className="wb-btn wb-btn-green h-11 w-[240px] text-[24px]" disabled={!ready} onClick={claimDaily}>
                  {ready ? 'CLAIM' : 'Come back tomorrow'}
                </button>
              </div>
            </div>
            <div className="wb-panel p-3">
              <div className="wb-title mb-2 text-[24px] wb-yellow wb-stroke">Achievements</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACHIEVEMENTS.map((a) => {
                  const done = a.done(state)
                  const claimed = !!got[a.id]
                  return (
                    <div key={a.id} className="wb-card flex items-center gap-2 px-2 py-2">
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${done ? 'bg-gradient-to-b from-[#f3e3bd] to-[#a9864e] text-[#3b1d00]' : 'bg-white/10 text-white/50'}`}>
                        <Award size={24} />
                      </div>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="text-[17px] font-bold">{a.name}</div>
                        <div className="text-[14px] text-white/75">{a.desc}</div>
                      </div>
                      <button
                        className={`wb-btn h-9 w-[78px] text-[17px] ${claimed ? 'wb-btn-dark' : 'wb-btn-green'}`}
                        disabled={!done || claimed}
                        onClick={() => {
                          const r = useSave.getState().claimAchievement(a.id)
                          if (r.ok) {
                            sfx.gem()
                            toast(`${a.name}: +${a.gems} gems`, 'good')
                          }
                        }}
                      >
                        {claimed ? <Check size={18} strokeWidth={4} /> : <><Gem size={18} />{a.gems}</>}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- more

export function MoreScreen({ onTutorial }: { onTutorial: () => void }) {
  const go = useNav((s) => s.go)
  const items = [
    { icon: <Globe2 size={24} />, label: 'Worlds & Environments', on: () => go('worlds') },
    { icon: <PartyPopper size={24} />, label: 'Special Events', on: () => go('events') },
    { icon: <Trophy size={24} />, label: 'Leaderboard', on: () => go('leaderboard') },
    { icon: <ShoppingBag size={24} />, label: 'Store', on: () => go('store') },
    { icon: <Settings2 size={24} />, label: 'Settings', on: () => go('settings') },
    { icon: <GraduationCap size={24} />, label: 'How to Play (training run)', on: onTutorial },
    {
      icon: <RotateCcw size={24} />,
      label: 'Restore Purchases',
      on: async () => {
        try {
          const n = await restorePurchases()
          toast(n ? `Restored ${n} purchase${n > 1 ? 's' : ''}` : 'Nothing to restore')
        } catch (e) {
          toast((e as Error).message, 'bad')
        }
      },
    },
  ]
  return (
    <div className="wb-layer">
      <Backdrop />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="MORE" />
        <div className="wb-scroll min-h-0 flex-1">
          <div className="wb-panel mx-auto flex max-w-[520px] flex-col gap-1.5 p-2">
            {items.map((i) => (
              <button key={i.label} className="wb-card flex h-14 items-center gap-3 px-3 text-left text-[20px] font-bold" onClick={() => (sfx.tap(), i.on())}>
                <span className="text-[#dcc08a]">{i.icon}</span>
                <span className="flex-1">{i.label}</span>
                <ChevronRight size={22} className="text-white/60" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- settings

function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button className="wb-card flex min-h-14 items-center gap-3 px-3 py-2 text-left" onClick={() => (sfx.tap(), set(!on))}>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[19px] font-bold">{label}</div>
        {hint && <div className="text-[14px] text-white/65">{hint}</div>}
      </div>
      <span className="relative h-7 w-12 rounded-full transition" style={{ background: on ? '#3f7a5c' : 'rgba(255,255,255,0.2)' }}>
        <span className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
      </span>
    </button>
  )
}

function Choice<T extends string>({ label, hint, value, options, set }: { label: string; hint?: string; value: T; options: { v: T; label: string }[]; set: (v: T) => void }) {
  return (
    <div className="wb-card px-3 py-2">
      <div className="text-[19px] font-bold">{label}</div>
      {hint && <div className="text-[14px] text-white/65">{hint}</div>}
      <div className="mt-1.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
        {options.map((o) => (
          <button key={o.v} className={`h-9 rounded-lg text-[16px] font-bold ${o.v === value ? 'bg-[#dcc08a] text-[#2a1a00]' : 'bg-black/35 text-white/80'}`} onClick={() => (sfx.tap(), set(o.v))}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsScreen() {
  const s = useSave((x) => x.settings)
  const set = useSave((x) => x.setSettings)
  return (
    <div className="wb-layer">
      <Backdrop />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="SETTINGS" wallet={false} />
        <div className="wb-scroll min-h-0 flex-1">
          <div className="wb-panel mx-auto flex max-w-[560px] flex-col gap-1.5 p-2">
            <Toggle label="Sound effects" on={s.sound} set={(v) => set({ sound: v })} />
            <Toggle
              label="Music (forest ambience)"
              on={s.music}
              set={(v) => {
                set({ music: v })
                if (!v) stopAmbience()
              }}
            />
            <Toggle label="Vibration" on={s.haptics} set={(v) => set({ haptics: v })} />
            <Choice
              label="Graphics"
              hint={{ low: 'Fastest: no shadows', medium: 'Shadows, lighter effects', high: 'Soft shadows, sharp textures', ultra: 'Bloom glow, sun shafts, anti-aliasing (fast phones and PCs)' }[s.quality]}
              value={s.quality}
              options={QUALITIES.map((q) => ({ v: q, label: q[0].toUpperCase() + q.slice(1) }))}
              set={(q) => set({ quality: q })}
            />
            <Choice label="Text size" value={String(s.textScale ?? 1)} options={[{ v: '1', label: 'Normal' }, { v: '1.15', label: 'Large' }, { v: '1.3', label: 'Huge' }]} set={(v) => set({ textScale: Number(v) })} />
            <Toggle label="Assisted controls" hint="Jumps and slides are timed for you – you steer (solo runs)" on={!!s.assist} set={(v) => set({ assist: v })} />
            <Toggle label="Left-handed controls" hint="Ability button on the left, power-ups on the right" on={s.leftHanded} set={(v) => set({ leftHanded: v })} />
            <Toggle label="Reduced motion" hint="Fewer screen effects" on={s.reducedMotion} set={(v) => set({ reducedMotion: v })} />
            <div className="wb-card px-3 py-2">
              <div className="flex items-center justify-between text-[19px] font-bold">
                Swipe sensitivity <span className="wb-yellow">{s.sensitivity <= 0.75 ? 'High' : s.sensitivity >= 1.3 ? 'Low' : 'Normal'}</span>
              </div>
              <input type="range" min={0.6} max={1.6} step={0.1} value={1.6 + 0.6 - s.sensitivity} onChange={(e) => set({ sensitivity: Math.round((2.2 - Number(e.target.value)) * 10) / 10 })} className="w-full accent-[#dcc08a]" style={{ touchAction: 'pan-x' }} />
            </div>
            <button
              className="wb-card flex h-12 items-center justify-center text-[17px] text-white/80"
              onClick={() => {
                if (s.music) startAmbience()
                sfx.win()
              }}
            >
              Test sound
            </button>
          </div>
          <p className="mx-auto mt-3 max-w-[560px] text-center text-[13px] text-white/55">Your progress is saved on this device.</p>
          {/* CC-BY 4.0 attribution for the realistic animal models (also in public/models/wildbound/CREDITS.txt) */}
          <p className="mx-auto mt-2 max-w-[560px] text-center text-[12px] leading-snug text-white/45">
            3D models: “realistic Lion 3d model” by Tarun.Teja and “Elephant animated with transition animation” by theogilat, both on Sketchfab, licensed CC BY 4.0 (adapted for this game).
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- leaderboard (records on this device)

export function LeaderboardScreen() {
  const runs = useSave((s) => s.runs)
  const byAnimal = useSave((s) => s.bestByAnimal)
  const best = useSave((s) => s.best)
  return (
    <div className="wb-layer">
      <Backdrop />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="LEADERBOARD" />
        <div className="wb-scroll min-h-0 flex-1">
          <div className="mx-auto grid max-w-[980px] gap-3 landscape:grid-cols-[1.4fr_1fr]">
            <div className="wb-panel p-3">
              <div className="wb-title mb-2 text-[24px] wb-yellow wb-stroke">Your Top Runs</div>
              {runs.length === 0 && <div className="py-6 text-center text-[17px] text-white/70">No runs yet. Hit PLAY and set your first record!</div>}
              <div className="flex flex-col gap-1.5">
                {runs.slice(0, 15).map((r, i) => (
                  <div key={r.at} className="wb-card flex items-center gap-3 px-2 py-1.5" style={i < 3 ? { boxShadow: `inset 0 0 0 2px ${['#dcc08a', '#d9e2ea', '#d58a4a'][i]}` } : undefined}>
                    <div className="wb-title w-8 text-center text-[24px] wb-stroke">{i + 1}</div>
                    <img src={headArt(r.animalId)} alt="" className="h-10 w-9 rounded-md object-cover" />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-[17px] font-bold">{getAnimal(r.animalId).name}</div>
                      <div className="text-[13px] text-white/65">{new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {fmt(r.distance)} m</div>
                    </div>
                    <div className="wb-title text-[24px] wb-yellow wb-stroke">{fmt(r.score)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="wb-panel p-3">
              <div className="wb-title mb-2 text-[24px] wb-yellow wb-stroke">Personal Bests</div>
              <div className="mb-2 grid grid-cols-2 gap-2 text-center">
                <div className="wb-card py-2">
                  <div className="text-[14px] text-white/70">Best score</div>
                  <div className="wb-title text-[28px] wb-yellow">{fmt(best.score)}</div>
                </div>
                <div className="wb-card py-2">
                  <div className="text-[14px] text-white/70">Longest run</div>
                  <div className="wb-title text-[28px] wb-yellow">{fmt(best.distance)} m</div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {Object.entries(byAnimal)
                  .sort((a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0))
                  .map(([id, v]) => (
                    <div key={id} className="flex items-center gap-2 text-[16px]">
                      <img src={headArt(id as never)} alt="" className="h-8 w-7 rounded object-cover" />
                      <span className="flex-1 font-bold">{getAnimal(id).name}</span>
                      <span className="text-white/70">{fmt(v?.distance ?? 0)} m</span>
                      <span className="w-[70px] text-right wb-yellow">{fmt(v?.score ?? 0)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <p className="mx-auto mt-3 max-w-[560px] text-center text-[13px] text-white/55">Records from runs on this device.</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- level up

export function LevelUpModal({ level, onOk }: { level: number; onOk: () => void }) {
  return (
    <div className="wb-layer wb-dim z-[85] flex items-center justify-center p-4">
      <div className="wb-in w-full max-w-[380px] text-center">
        <div className="relative mx-auto w-full">
          <img src={ART.levelup} alt="Level up!" className="w-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]" />
          <div className="wb-title absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2 text-[64px] leading-none text-[#f3e3bd]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.5)' }}>
            {level}
          </div>
        </div>
        <div className="wb-panel -mt-2 px-4 pb-4 pt-3">
          <div className="text-[20px] font-bold">Rewards:</div>
          <div className="my-2 flex items-center justify-center gap-5 text-[28px] font-bold">
            <span className="flex items-center gap-1.5">
              <Gem size={32} /> {LEVEL_REWARD.gems}
            </span>
            <span className="flex items-center gap-1.5">
              <Coin size={32} /> {LEVEL_REWARD.coins}
            </span>
          </div>
          <button className="wb-btn wb-btn-green h-12 w-[70%] text-[30px]" onClick={() => (sfx.tap(), onOk())}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
