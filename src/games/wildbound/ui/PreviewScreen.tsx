import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Lock } from 'lucide-react'
import { ANIMALS, getAnimal, type AnimalId } from '../engine/content'
import { useSave } from '../state/progress'
import { charProductId, priceOf, purchase, usePrices } from '../state/shop'
import { ART, abilityArt, headArt, traitArt } from './art'
import { Bar, Gem, toast, useNav } from './common'
import { showcase } from '../scene/runController'
import { haptic, sfx } from './sfx'
import Logo from './Logo'

/**
 * One animal up close (the Sonic reference screen): the 3D model gallops behind this overlay; the plank
 * panel, abilities, stats, the ten-portrait carousel and SELECT sit on top.
 */
export default function PreviewScreen() {
  const id = useNav((s) => s.previewId)
  const go = useNav((s) => s.go)
  const pop = useNav((s) => s.pop)
  const owned = useSave((s) => s.owned)
  const selected = useSave((s) => s.selected)
  usePrices((s) => s.prices)
  const a = getAnimal(id)
  const own = owned.includes(id)
  const strip = useRef<HTMLDivElement>(null)
  const [celebrating, setCelebrating] = useState(false)
  // leaving the screen always puts the menu animals back to their gallop
  useEffect(
    () => () => {
      showcase.victory = false
      showcase.target = 6.5
    },
    [],
  )

  useEffect(() => {
    strip.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [id])

  const show = (next: AnimalId) => {
    sfx.tap()
    useNav.setState({ previewId: next })
  }
  const select = () => {
    if (celebrating || !useSave.getState().select(id).ok) return
    sfx.win()
    haptic()
    toast(`${a.name} selected`, 'good')
    // the animal pulls up from the gallop to a stand, celebrates, then the game returns home
    setCelebrating(true)
    showcase.target = 0
    window.setTimeout(() => (showcase.victory = true), 1000)
    window.setTimeout(() => {
      showcase.victory = false
      showcase.target = 6.5
      setCelebrating(false)
      go('home')
    }, 3600)
  }
  const unlockGems = () => {
    const r = useSave.getState().unlockWithGems(id)
    if (r.ok) {
      sfx.win()
      haptic(40)
      toast(`${a.name} unlocked!`, 'good')
    } else {
      toast(r.reason, 'bad')
    }
  }
  const buy = async () => {
    try {
      await purchase(charProductId(id))
      sfx.win()
      toast(`${a.name} is yours!`, 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  const rows = [
    { art: abilityArt(id), name: a.ability.name, desc: a.ability.desc },
    { art: traitArt(a.traits[0].icon), name: a.traits[0].name, desc: a.traits[0].desc },
    { art: traitArt(a.traits[1].icon), name: a.traits[1].name, desc: a.traits[1].desc },
  ]

  return (
    <div className="wb-layer">
      <div className="wb-layer wb-vignette" />
      <div className="wb-layer wb-safe flex flex-col">
        <div className="flex min-h-0 flex-1 gap-3 portrait:flex-col">
          {/* left: logo, tagline */}
          <div className="flex min-w-0 flex-1 flex-col portrait:flex-none">
            <div className="flex items-start gap-2">
              <button className="wb-btn wb-btn-dark h-10 w-10 shrink-0 !rounded-full" onClick={() => (sfx.tap(), pop())} aria-label="Back">
                <ChevronLeft size={26} strokeWidth={3} />
              </button>
              <Logo size={0.8} className="ml-3 mt-3 portrait:scale-75" />
            </div>
            <img src={ART.tagline} alt="Run. Explore. Survive." className="mt-6 w-[150px] rounded-lg opacity-95 [mask-image:radial-gradient(ellipse_at_center,#000_55%,transparent_75%)] portrait:hidden" />
          </div>

          {/* right: plank panel, abilities, stats */}
          <div className="wb-pv-side wb-scroll flex max-h-full w-[min(100%,380px)] shrink-0 flex-col gap-1.5 portrait:w-full portrait:self-stretch">
            <div
              className="relative rounded-xl px-3 py-2"
              style={{
                background: 'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 14px, rgba(0,0,0,0.18) 14px 16px), linear-gradient(170deg, #4a3423 0%, #2c1d12 60%, #1e140c 100%)',
                boxShadow: 'inset 0 0 0 2px rgba(255,210,140,0.25), 0 10px 24px rgba(0,0,0,0.55)',
                transform: 'rotate(-1.2deg)',
              }}
            >
              <div className="flex items-center gap-2">
                <img src={ART.paw} alt="" className="h-12 w-12" />
                <div className="min-w-0 flex-1 leading-none">
                  <div className="wb-pv-name wb-title text-[40px] wb-stroke">{a.name}</div>
                  <div className="wb-pv-species wb-title text-[24px] wb-yellow wb-stroke">{a.species}</div>
                </div>
                {a.free ? (
                  <img src={ART.free} alt="Free" className="h-11 w-auto" />
                ) : own ? (
                  <span className="wb-btn wb-btn-green h-9 px-3 text-[18px]">Owned</span>
                ) : (
                  <span className="wb-pill !h-9 px-2 text-[20px]">
                    <Gem size={24} /> {a.gemPrice}
                  </span>
                )}
              </div>
              <p className="wb-pv-blurb mt-1 text-[18px] italic leading-tight text-white/95 wb-shadow">{a.blurb}</p>
            </div>

            <div className="wb-panel px-3 py-1.5">
              <div className="wb-title text-[20px] wb-yellow wb-stroke">Abilities</div>
              <div className="flex flex-col gap-1.5">
                {rows.map((r) => (
                  <div key={r.name} className="wb-pv-row flex items-center gap-2.5 rounded-lg bg-white/5 px-1.5 py-0.5">
                    <img src={r.art} alt="" className="wb-round-ic h-10 w-10 shadow-[0_0_0_2px_rgba(255,210,90,0.6)]" />
                    <div className="min-w-0 leading-tight">
                      <div className="text-[18px] font-bold wb-yellow">{r.name}</div>
                      <div className="text-[15px] text-white/90">{r.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="wb-panel px-3 py-1.5 portrait:hidden landscape:block">
              <Stats id={id} />
            </div>
          </div>
        </div>

        {/* carousel + select */}
        <div className="mt-2 flex items-end gap-3 portrait:flex-col portrait:items-stretch">
          <div ref={strip} className="wb-pv-strip wb-panel flex min-w-0 flex-1 gap-2 overflow-x-auto p-2 [scrollbar-width:none]" style={{ touchAction: 'pan-x' }}>
            {ANIMALS.map((x) => {
              const on = x.id === id
              const mine = owned.includes(x.id)
              return (
                <button
                  key={x.id}
                  data-id={x.id}
                  onClick={() => show(x.id)}
                  className="relative h-[86px] w-[68px] shrink-0 overflow-hidden rounded-lg"
                  style={{ boxShadow: on ? '0 0 0 3px #ffd84a, 0 0 16px rgba(255,200,60,0.9)' : 'inset 0 0 0 1.5px rgba(150,210,255,0.4)' }}
                >
                  <img src={headArt(x.id)} alt={x.name} className="h-full w-full object-cover" />
                  {!mine && (
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/70 py-0.5 text-[12px]">
                      <Lock size={11} strokeWidth={3} /> {x.gemPrice}
                    </span>
                  )}
                  {selected === x.id && <span className="absolute left-0.5 top-0.5 rounded bg-[#2fb80f] px-1 text-[10px] font-bold">IN USE</span>}
                </button>
              )
            })}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {own ? (
              <button className="wb-btn wb-btn-gold wb-pulse h-[64px] min-w-[220px] px-6 text-[38px]" disabled={selected === id} onClick={select}>
                <img src={ART.paw} alt="" className="h-10 w-10" /> {selected === id ? 'Selected' : 'Select'}
              </button>
            ) : (
              <>
                <button className="wb-btn wb-btn-gold h-[54px] min-w-[220px] px-5 text-[28px]" onClick={unlockGems}>
                  <Lock size={22} strokeWidth={3} /> Unlock <Gem size={28} /> {a.gemPrice}
                </button>
                <button className="wb-btn wb-btn-green h-[44px] min-w-[220px] px-5 text-[22px]" onClick={buy}>
                  Buy {priceOf(charProductId(id))}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Stats({ id }: { id: AnimalId }) {
  const a = getAnimal(id)
  const rows = [
    { art: ART.statSpeed, label: 'Speed', v: a.stats.speed, c: 'linear-gradient(180deg,#ffe76a,#f2a20c)' },
    { art: ART.statStamina, label: 'Stamina', v: a.stats.stamina, c: 'linear-gradient(180deg,#9dff6a,#24b40f)' },
    { art: ART.statDefense, label: 'Defense', v: a.stats.defense, c: 'linear-gradient(180deg,#8fd8ff,#1f74e0)' },
  ]
  return (
    <>
      <div className="wb-title text-[22px] wb-yellow wb-stroke">Stats</div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <img src={r.art} alt="" className="h-7 w-7 rounded object-contain" />
            <span className="w-[70px] text-[18px]">{r.label}</span>
            <div className="flex-1">
              <Bar value={r.v} color={r.c} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
