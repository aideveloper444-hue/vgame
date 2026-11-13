import '@fontsource/cinzel/600.css'
import { useRef, useState } from 'react'
import { Check, Lock, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { ROSTER, getAnimal, type AnimalId } from '../engine/content'
import { useSave } from '../state/progress'
import { abilityArt } from './art'
import { Backdrop, Gem, Header, toast, useNav } from './common'
import { haptic, sfx } from './sfx'
import { Stats } from './PreviewScreen'
import { AnimalView, FeatureView, RosterCanvas, ZOOM_MAX, ZOOM_MIN, hasFace, newSpin } from '../scene/RosterViews'
import { EXPRESSIONS, type Expression } from '../scene/face'

/**
 * Character selection: a large live 3D preview of the focused animal (it turns by itself; drag to turn it, or jump to
 * its front, side or rear) with its ability and stats, beside the roster of live 3D cards. On a phone held upright the
 * preview sits on top and the roster scrolls sideways underneath.
 */
const VIEWS: { label: string; yaw: number }[] = [
  { label: 'Front', yaw: 0 },
  { label: 'Side', yaw: -Math.PI / 2 },
  { label: 'Rear', yaw: Math.PI },
]

export default function CharacterSelect() {
  const owned = useSave((s) => s.owned)
  const selected = useSave((s) => s.selected)
  const gems = useSave((s) => s.gems)
  const go = useNav((s) => s.go)
  const [focus, setFocus] = useState<AnimalId>(selected)
  const f = getAnimal(focus)
  const fOwned = owned.includes(focus)
  const spin = useRef(newSpin()).current
  const drag = useRef<{ x: number } | null>(null)
  const [expr, setExpr] = useState<Expression | null>(null)
  const pickExpr = (e: Expression | null) => {
    sfx.tap()
    spin.expr = e
    setExpr(e)
    // show the face: turn to the front and move in
    if (e) {
      spin.target = 0.45
      spin.idle = 0
      spin.zoom = 1
    }
  }
  /** live pointers on the preview, for two-finger pinch zoom */
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; z: number } | null>(null)
  const setZoom = (z: number) => {
    spin.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
    spin.idle = 0
  }
  const gap = () => {
    const [a, b] = [...pts.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const choose = (id: AnimalId) => {
    sfx.tap()
    if (id !== focus) {
      spin.yaw = 0.6
      spin.target = null
      spin.idle = 9
      spin.zoom = 1
      spin.expr = null
      setExpr(null)
    }
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
      <Backdrop dim={0.3} />
      {/* every animal on this screen is a live 3D model, drawn by this one canvas behind the layout */}
      <RosterCanvas />
      <div className="wb-layer wb-safe flex flex-col gap-2">
        <Header title="" />
        <div className="flex justify-center landscape:-mt-12 landscape:px-14">
          <div className="wb-sign">
            <span className="wb-title text-[clamp(18px,4vw,30px)] leading-none !tracking-[0.22em]">
              CHARACTER SELECTION
            </span>
          </div>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-2 landscape:flex-row">
          {/* ---- large 3D preview */}
          <div
            className="wb-feature relative min-h-0 flex-[1.4] touch-none select-none overflow-hidden rounded-2xl landscape:flex-[1.55]"
            onWheel={(e) => setZoom(spin.zoom * Math.exp(-e.deltaY * 0.0015))}
            onPointerDown={(e) => {
              pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              if (pts.current.size === 2) {
                // a second finger turns the drag into a pinch
                drag.current = null
                pinch.current = { d: gap(), z: spin.zoom }
                return
              }
              drag.current = { x: e.clientX }
              spin.dragging = true
              spin.target = null
            }}
            onPointerMove={(e) => {
              if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
              if (pinch.current && pts.current.size >= 2) {
                setZoom(pinch.current.z * (gap() / Math.max(1, pinch.current.d)))
                return
              }
              if (!drag.current) return
              spin.yaw += (e.clientX - drag.current.x) * 0.012
              spin.idle = 0
              drag.current.x = e.clientX
            }}
            onPointerUp={(e) => {
              pts.current.delete(e.pointerId)
              if (pts.current.size < 2) pinch.current = null
              drag.current = null
              spin.dragging = false
              spin.idle = 0
            }}
            onPointerCancel={(e) => {
              pts.current.delete(e.pointerId)
              pinch.current = null
              drag.current = null
              spin.dragging = false
            }}
          >
            <FeatureView id={focus} spin={spin} className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 22%, transparent 58%, rgba(0,0,0,0.78) 100%)' }} />

            {/* name plate */}
            <div className="pointer-events-none absolute left-4 top-3 leading-none">
              <div className="text-[clamp(11px,1.2vw,13px)] font-semibold uppercase tracking-[0.34em] text-[var(--gold)] wb-shadow">{f.species}</div>
              <div className="mt-1.5 text-[clamp(30px,4.2vw,50px)] wb-stroke" style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, letterSpacing: '0.08em' }}>
                {f.name}
              </div>
              <div className="mt-2 h-px w-14 bg-[var(--gold)] opacity-60" />
            </div>
            <div className="absolute right-3 top-3 flex items-center gap-1.5">
              {f.free && <span className="wb-chip">Included</span>}
              {!fOwned && (
                <span className="wb-chip">
                  <Lock size={12} strokeWidth={2} /> Locked
                </span>
              )}
            </div>

            {/* view buttons */}
            <div className="absolute left-3 top-[96px] flex gap-1.5 landscape:left-[42%] landscape:top-3">
              {VIEWS.map((v) => (
                <button
                  key={v.label}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="wb-chip wb-chip-btn min-w-[64px] justify-center" style={{ height: 32 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    sfx.tap()
                    spin.target = v.yaw
                    spin.idle = 0
                  }}
                >
                  {v.label}
                </button>
              ))}
              {[
                { label: 'Zoom out', icon: <ZoomOut size={15} strokeWidth={1.8} />, f: 1 / 1.35 },
                { label: 'Zoom in', icon: <ZoomIn size={15} strokeWidth={1.8} />, f: 1.35 },
              ].map((b) => (
                <button
                  key={b.label}
                  aria-label={b.label}
                  className="wb-chip wb-chip-btn justify-center !px-0" style={{ width: 32, height: 32 }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    sfx.tap()
                    setZoom(spin.zoom * b.f)
                  }}
                >
                  {b.icon}
                </button>
              ))}
              <span className="hidden items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[10.5px] uppercase tracking-[0.14em] text-white/45 2xl:flex">
                <RotateCw size={12} /> drag to turn · pinch or scroll to zoom
              </span>
            </div>

            {/* facial expressions (animals with a face rig) */}
            {hasFace(focus) && (
              <div className="absolute left-3 top-[138px] flex max-w-[calc(100%-24px)] flex-wrap gap-1 landscape:top-[52px] landscape:left-1/2 landscape:-translate-x-1/2 landscape:justify-center" onPointerDown={(e) => e.stopPropagation()}>
                {[null, ...EXPRESSIONS].map((e) => (
                  <button
                    key={e ?? 'auto'}
                    className={`wb-chip wb-chip-btn h-7 ${expr === e ? 'is-on' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      pickExpr(e)
                    }}
                  >
                    {e ?? 'Live'}
                  </button>
                ))}
              </div>
            )}

            {/* ability, stats and actions. Taps here must not start a turn-drag: the preview captures the pointer on
                pointer-down, which would steal the click from the Select / Unlock / Details buttons. */}
            <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 landscape:flex-row landscape:items-end" onPointerDown={(e) => e.stopPropagation()}>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <img src={abilityArt(focus)} alt="" className="wb-round-ic wb-badge h-11 w-11 shrink-0" />
                <div className="min-w-0 leading-tight">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--gold)]">Ability</div>
                  <div className="truncate text-[19px] font-semibold uppercase tracking-[0.06em] wb-shadow">{f.ability.name}</div>
                  <div className="line-clamp-2 text-[14px] font-normal text-white/70 wb-shadow">{f.ability.desc}</div>
                </div>
              </div>
              <div className="hidden w-[260px] shrink-0 sm:block">
                <Stats id={focus} />
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="wb-btn wb-btn-dark h-12 px-4 text-[20px]" onClick={() => (sfx.tap(), go('preview', { previewId: focus }))}>
                  Details
                </button>
                {fOwned ? (
                  <button className={`wb-btn h-12 px-6 text-[22px] ${selected === focus ? 'wb-btn-dark wb-btn-current' : 'wb-btn-gold'}`} disabled={selected === focus} onClick={select}>
                    {selected === focus ? (
                      <>
                        <Check size={18} strokeWidth={2.2} /> Selected
                      </>
                    ) : (
                      'Select'
                    )}
                  </button>
                ) : (
                  <button className="wb-btn wb-btn-gold h-12 px-4 text-[22px]" onClick={() => unlock(focus)}>
                    <Lock size={16} strokeWidth={2} /> Unlock · <Gem size={20} /> {f.gemPrice}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---- roster: live 3D cards (a sideways strip on a phone held upright) */}
          <div className="wb-scroll min-h-0 shrink-0 overflow-x-auto pb-1 landscape:flex-1 landscape:overflow-x-hidden landscape:pr-1">
            <div className="flex gap-2 landscape:grid landscape:grid-cols-2 xl:landscape:grid-cols-3">
              {ROSTER.map((a, index) => {
                const own = owned.includes(a.id)
                const isSel = selected === a.id
                const isFocus = focus === a.id
                return (
                  <button
                    key={a.id}
                    className={`wb-acard wb-acard-3d relative h-[150px] w-[120px] shrink-0 text-left landscape:h-[170px] landscape:w-auto ${isSel ? 'is-selected' : ''} ${own ? '' : 'is-locked'}`}
                    style={isFocus && !isSel ? { boxShadow: 'inset 0 0 0 1px rgba(245,240,230,0.7), 0 16px 36px -12px rgba(0,0,0,0.85)' } : undefined}
                    onClick={() => choose(a.id)}
                  >
                    <AnimalView id={a.id} index={index} className="wb-acard-art" />
                    <span className="sr-only">{`${a.name} the ${a.species}`}</span>
                    <div className="wb-acard-shade" />
                    <div className="absolute left-2.5 top-2.5 leading-none">
                      <div className="text-[18px] wb-stroke" style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, letterSpacing: '0.06em' }}>
                        {a.name}
                      </div>
                      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/60 wb-shadow">{a.species}</div>
                    </div>
                    <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between">
                      <img src={abilityArt(a.id)} alt="" className="wb-round-ic wb-badge h-6 w-6" />
                      {isSel ? (
                        <span className="wb-chip is-on !h-6 !text-[10px]">
                          <Check size={11} strokeWidth={2.4} /> In use
                        </span>
                      ) : own ? null : (
                        <span className="wb-chip !h-6 !text-[11px]">
                          <Lock size={10} strokeWidth={2} /> <Gem size={12} /> {a.gemPrice}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
