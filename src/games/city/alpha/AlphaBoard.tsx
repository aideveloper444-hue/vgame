import { useEffect, useMemo, useState } from 'react'
import { Home } from 'lucide-react'
import { useCityStore } from '../cityStore'
import { useCityMatch } from '../cityMatch'
import { DICE_ROLL_MS, STEP_MS } from '../cityBoardLayout'
import { BOARD_ART, SEATS, TILE_RECTS, tileSide, tokenAnchor } from './alphaLayout'
import { AVATAR_ART, BOARD_IMG, TOKEN_ART } from './alphaArt'

/** Token height in design units; the active player's character stands a little taller. */
const TOKEN_H = 104

/** Drives the walk: after the dice settle, hop one tile per STEP_MS, then let the store resolve the landing. */
function useWalkStep() {
  const pendingMovePath = useCityStore((s) => s.pendingMovePath)
  const phase = useCityStore((s) => s.phase)
  const completeMove = useCityStore((s) => s.completeMove)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (phase !== 'MOVING' || !pendingMovePath) return
    setStep(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    let interval: ReturnType<typeof setInterval> | undefined
    timers.push(
      setTimeout(() => {
        let i = 0
        interval = setInterval(() => {
          i += 1
          setStep(i)
          if (i >= pendingMovePath.length) {
            clearInterval(interval)
            // guests only animate what the host sends; the host resolves the landing
            if (useCityMatch.getState().role !== 'guest') timers.push(setTimeout(() => completeMove(), STEP_MS))
          }
        }, STEP_MS)
      }, DICE_ROLL_MS),
    )
    return () => {
      timers.forEach(clearTimeout)
      if (interval) clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMovePath, phase])

  return step
}

export default function AlphaBoard({ mapView }: { mapView: boolean }) {
  const tiles = useCityStore((s) => s.tiles)
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const pendingMovePath = useCityStore((s) => s.pendingMovePath)
  const phase = useCityStore((s) => s.phase)
  const step = useWalkStep()

  const walking = phase === 'MOVING' && pendingMovePath !== null && step > 0
  const tileOf = (i: number) =>
    i === currentPlayerIndex && walking ? pendingMovePath![Math.min(step, pendingMovePath!.length) - 1] : players[i].position

  // characters sharing a tile step aside so each one stays visible
  const placed = useMemo(() => {
    const alive = players.map((p, i) => ({ p, i })).filter(({ p }) => !p.bankrupt)
    return alive.map(({ p, i }) => {
      const tile = tileOf(i)
      const mates = alive.filter(({ i: j }) => tileOf(j) === tile)
      const k = mates.findIndex(({ i: j }) => j === i)
      const [ax, ay] = tokenAnchor(tile)
      // side columns fan out toward the city so nobody stands on the tile labels
      const side = tileSide(tile)
      const dx = side === 'left' ? k * 34 : side === 'right' ? -k * 34 : (k - (mates.length - 1) / 2) * 30
      return { p, i, x: ax + dx, y: ay + (k % 2) * 5 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, step, walking, currentPlayerIndex])

  const current = players[currentPlayerIndex]
  const focus = current ? tokenAnchor(tileOf(currentPlayerIndex)) : [450, 780]
  const landedTile = current && phase !== 'MOVING' && phase !== 'ROLLING' ? current.position : null

  return (
    <div
      className="absolute overflow-hidden"
      style={{ left: BOARD_ART.x, top: BOARD_ART.y, width: BOARD_ART.w, height: BOARD_ART.h, borderRadius: mapView ? 28 : 0 }}
    >
      <div
        className="absolute inset-0 transition-transform duration-700 ease-out"
        style={{
          transform: mapView ? 'scale(1.75)' : 'none',
          transformOrigin: `${focus[0] - BOARD_ART.x}px ${focus[1] - BOARD_ART.y}px`,
        }}
      >
        <img
          src={BOARD_IMG}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
          // the skyline fades into the backdrop instead of ending on a hard edge (visible on wide screens)
          style={{
            maskImage: 'linear-gradient(to right, transparent, #000 2.5%, #000 97.5%, transparent), linear-gradient(to bottom, transparent, #000 4%)',
            maskComposite: 'intersect',
            WebkitMaskComposite: 'source-in',
          }}
        />
        <CityLife />

        {/* ownership, upgrades and the landing highlight, drawn over the painted tiles */}
        {tiles.map((t) => {
          const [x0, y0, x1, y1] = TILE_RECTS[t.id] ?? [0, 0, 0, 0]
          const box = { left: x0 - BOARD_ART.x, top: y0 - BOARD_ART.y, width: x1 - x0, height: y1 - y0 }
          const ownerIdx = t.type === 'PROPERTY' && t.ownerId ? players.findIndex((p) => p.id === t.ownerId) : -1
          const seat = ownerIdx >= 0 ? SEATS[ownerIdx % 4] : null
          const landed = landedTile === t.id
          return (
            <div key={t.id} className="pointer-events-none absolute" style={box}>
              {seat && (
                <div
                  className="absolute inset-[1px] rounded-[14px]"
                  style={{ border: `3px solid ${seat.color}`, boxShadow: `0 0 14px ${seat.glow}, inset 0 0 12px ${seat.glow}88` }}
                />
              )}
              {landed && current && (
                <div
                  className="absolute -inset-[3px] rounded-[16px]"
                  style={{ border: '3px solid #fff7c2', boxShadow: `0 0 22px ${SEATS[currentPlayerIndex % 4].glow}`, animation: 'alpha-pulse 1.1s ease-in-out infinite' }}
                />
              )}
              {seat && (
                <img
                  src={AVATAR_ART[seat.key]}
                  alt=""
                  draggable={false}
                  className="absolute -right-1 -top-2 h-[30px] w-[30px] rounded-full"
                  style={{ border: `3px solid ${seat.color}`, boxShadow: `0 0 8px ${seat.glow}` }}
                />
              )}
              {t.type === 'PROPERTY' && t.level > 0 && (
                <div className="absolute -left-1 -top-2 flex gap-[1px] rounded-full bg-[#0b1240]/90 px-1 py-[2px]" style={{ border: '2px solid #34d399' }}>
                  {Array.from({ length: t.level }, (_, k) => (
                    <Home key={k} size={13} className="fill-emerald-400 text-emerald-100" strokeWidth={2.4} />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* the characters, back to front */}
        {[...placed]
          .sort((a, b) => a.y - b.y)
          .map(({ p, i, x, y }) => {
            const seat = SEATS[i % 4]
            const active = i === currentPlayerIndex
            const moving = active && walking
            const h = active ? TOKEN_H * 1.1 : TOKEN_H
            return (
              <div
                key={p.id}
                className="pointer-events-none absolute"
                style={{
                  left: x - BOARD_ART.x,
                  top: y - BOARD_ART.y,
                  transition: `left ${STEP_MS - 40}ms ease-in-out, top ${STEP_MS - 40}ms ease-in-out`,
                  zIndex: Math.round(y),
                }}
              >
                {/* glowing ring under the feet */}
                <div
                  className="absolute h-[22px] w-[76px] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
                  style={{
                    background: `radial-gradient(ellipse, ${seat.glow}aa 0%, ${seat.glow}33 55%, transparent 72%)`,
                    border: `2px solid ${seat.glow}`,
                    boxShadow: `0 0 14px ${seat.glow}`,
                    opacity: active ? 1 : 0.7,
                  }}
                />
                <div
                  className="absolute bottom-0 -translate-x-1/2"
                  style={{ animation: moving ? `alpha-hop ${STEP_MS}ms ease-in-out infinite` : active ? 'alpha-idle 1.6s ease-in-out infinite' : undefined }}
                >
                  <img
                    src={TOKEN_ART[seat.key]}
                    alt={p.name}
                    draggable={false}
                    className="block w-auto max-w-none select-none"
                    style={{
                      height: h,
                      filter: `drop-shadow(0 4px 4px rgba(0,0,0,0.55)) drop-shadow(0 0 ${active ? 8 : 0}px ${seat.glow})`,
                      animation: moving ? `alpha-walk ${STEP_MS}ms ease-in-out infinite` : undefined,
                    }}
                  />
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

/** Ambient life on the painted city: twinkling windows and a slow light sweep over the water. */
function CityLife() {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: 175 + ((i * 197) % 560),
        top: 300 + ((i * 131) % 520),
        delay: (i * 0.37) % 3,
        size: 4 + (i % 3) * 2,
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute" style={{ left: 152, top: 283, width: 598, height: 580 }}>
      <div className="absolute inset-0 overflow-hidden rounded-[22px]">
        <div
          className="absolute inset-y-0 w-[40%]"
          style={{ background: 'linear-gradient(100deg, transparent, rgba(160,220,255,0.16), transparent)', animation: 'alpha-sweep 7s linear infinite', mixBlendMode: 'screen' }}
        />
      </div>
      {sparkles.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: s.left - 152,
            top: s.top - 283,
            width: s.size,
            height: s.size,
            boxShadow: '0 0 8px 2px rgba(255,240,180,0.9)',
            animation: `alpha-twinkle 3s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
