import { useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { ANIMALS, getAnimal, type AnimalId } from '../engine/content'
import { useSave } from '../state/progress'
import { ART, abilityArt, cardArt } from './art'
import { Backdrop, Gem, Header, toast, useNav } from './common'
import { haptic, sfx } from './sfx'

/** The 2 x 5 roster with the wooden sign, as on the reference sheet. */
export default function CharacterSelect() {
  const owned = useSave((s) => s.owned)
  const selected = useSave((s) => s.selected)
  const gems = useSave((s) => s.gems)
  const go = useNav((s) => s.go)
  const [focus, setFocus] = useState<AnimalId>(selected)
  const f = getAnimal(focus)
  const fOwned = owned.includes(focus)

  const choose = (id: AnimalId) => {
    sfx.tap()
    if (focus === id) go('preview', { previewId: id })
    setFocus(id)
  }
  const select = () => {
    const r = useSave.getState().select(focus)
    if (r.ok) {
      sfx.win()
      haptic()
      toast(`${f.name} is ready to run!`, 'good')
    }
  }
  const unlock = (id: AnimalId) => {
    const a = getAnimal(id)
    const r = useSave.getState().unlockWithGems(id)
    if (r.ok) {
      sfx.win()
      haptic(40)
      toast(`${a.name} unlocked!`, 'good')
      setFocus(id)
    } else {
      toast(r.reason, 'bad')
      if (gems < a.gemPrice) go('store', { storeTab: 'coins' })
    }
  }

  return (
    <div className="wb-layer">
      <Backdrop dim={0.25} />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="" />
        <div className="flex justify-center landscape:-mt-12 landscape:px-14">
          <div className="wb-sign">
            <img src={ART.paw} alt="" className="h-7 w-7" />
            <span className="wb-title text-[clamp(20px,4.6vw,38px)] leading-none" style={{ textShadow: '0 2px 0 #3d1c05, 0 0 2px #000' }}>
              CHARACTER SELECTION
            </span>
            <img src={ART.paw} alt="" className="h-7 w-7" />
          </div>
        </div>

        <div className="wb-scroll -mx-1 min-h-0 flex-1 px-1 pb-2 pt-1">
          <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5 landscape:grid-cols-5 landscape:gap-2">
            {ANIMALS.map((a) => {
              const own = owned.includes(a.id)
              const isSel = selected === a.id
              return (
                <button
                  key={a.id}
                  className={`wb-acard aspect-[3/4] text-left landscape:aspect-auto landscape:h-[max(205px,calc((100vh-150px)/2))] ${isSel ? 'is-selected' : ''} ${own ? '' : 'is-locked'}`}
                  style={focus === a.id && !isSel ? { boxShadow: 'inset 0 0 0 3px #ffd84a, 0 0 18px rgba(255,200,60,0.7)' } : undefined}
                  onClick={() => choose(a.id)}
                >
                  <img className="wb-acard-art" src={cardArt(a.id)} alt={`${a.name} the ${a.species}`} />
                  <div className="wb-acard-shade" />
                  {a.free && <img src={ART.free} alt="Free" className="absolute right-1 top-1 h-7 w-auto" />}
                  <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                    <img src={ART.paw} alt="" className="h-7 w-7 drop-shadow" />
                    <div className="leading-none">
                      <div className="wb-title text-[22px] wb-stroke">{a.name}</div>
                      <div className="text-[14px] font-bold italic wb-yellow wb-shadow">{a.species}</div>
                    </div>
                  </div>
                  <div className="absolute inset-x-1.5 bottom-1.5 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <img src={abilityArt(a.id)} alt="" className="wb-round-ic h-9 w-9" />
                      <div className="min-w-0 leading-[1.05]">
                        <div className="truncate text-[15px] font-bold wb-shadow">{a.ability.name}</div>
                        <div className="truncate text-[12.5px] wb-yellow wb-shadow">{a.ability.short}</div>
                      </div>
                    </div>
                    {isSel ? (
                      <span className="wb-btn wb-btn-green h-9 w-full text-[20px]">
                        <Check size={20} strokeWidth={4} /> Selected
                      </span>
                    ) : own ? (
                      <span
                        className="wb-btn wb-btn-blue h-9 w-full text-[20px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          setFocus(a.id)
                          useSave.getState().select(a.id)
                          sfx.win()
                        }}
                      >
                        Select
                      </span>
                    ) : (
                      <span
                        className="wb-btn wb-btn-gold h-9 w-full text-[22px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          unlock(a.id)
                        }}
                      >
                        <Gem size={22} /> {a.gemPrice}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* focused animal: ability line + Select / Details */}
        <div className="wb-panel mx-auto flex w-full max-w-[760px] items-center gap-3 px-3 py-2">
          <img src={ART.paw} alt="" className="h-10 w-10" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[18px] font-bold">
              {f.name} – {f.ability.name}
            </div>
            <div className="truncate text-[15px] text-[var(--muted)]">{f.ability.desc}</div>
          </div>
          <button className="wb-btn wb-btn-dark h-11 px-4 text-[20px]" onClick={() => (sfx.tap(), go('preview', { previewId: focus }))}>
            Details
          </button>
          {fOwned ? (
            <button className="wb-btn wb-btn-gold h-11 px-6 text-[24px]" disabled={selected === focus} onClick={select}>
              {selected === focus ? 'Selected' : 'Select'}
            </button>
          ) : (
            <button className="wb-btn wb-btn-gold h-11 px-4 text-[22px]" onClick={() => unlock(focus)}>
              <Lock size={18} strokeWidth={3} /> <Gem size={22} /> {f.gemPrice}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
