import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Home } from 'lucide-react'
import { useCityStore } from '../cityStore'
import { CATEGORY_ICON, CATEGORY_TINT, TILE_ICON, type CityTile } from '../cityBoardData'
import { money } from '../cityFormat'
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

export default function AlphaBoard({ mapView, onTileClick }: { mapView: boolean; onTileClick?: (tileId: number) => void }) {
  const tiles = useCityStore((s) => s.tiles)
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const pendingMovePath = useCityStore((s) => s.pendingMovePath)
  const phase = useCityStore((s) => s.phase)
  const goBonus = useCityStore((s) => s.config.goBonus)
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

        {/* the 40-space ring, drawn over the ring painted on the board art */}
        {tiles.map((t) => {
          const [x0, y0, x1, y1] = TILE_RECTS[t.id] ?? [0, 0, 0, 0]
          return (
            <button
              key={`cell-${t.id}`}
              type="button"
              onClick={() => onTileClick?.(t.id)}
              aria-label={t.name}
              className="absolute p-[2px]"
              style={{ left: x0 - BOARD_ART.x, top: y0 - BOARD_ART.y, width: x1 - x0, height: y1 - y0, background: '#0b1452' }}
            >
              <BoardCell tile={t} side={t.id % 10 === 0 ? 'corner' : tileSide(t.id)} goBonus={goBonus} />
            </button>
          )
        })}

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
              {t.type === 'PROPERTY' && t.mortgaged && (
                <div className="absolute inset-[2px] flex items-center justify-center rounded-[10px] bg-[#0b1240]/70">
                  <span className="rounded-full bg-amber-300 px-1.5 py-[1px] text-[11px] font-black uppercase tracking-wide text-[#3d2200]">Mortgaged</span>
                </div>
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

/* ------------------------------------------------------------------ ring cells */

type CellSide = 'bottom' | 'right' | 'top' | 'left' | 'corner'

const SPECIAL_THEME: Record<string, { bg: string; ink: string }> = {
  CHANCE: { bg: 'linear-gradient(180deg, #f6efff, #cfb2ff)', ink: '#5b21b6' },
  COMMUNITY: { bg: 'linear-gradient(180deg, #fff3e2 0%, #ffffff 50%, #dcf5df 100%)', ink: '#1e3a8a' },
  TAX: { bg: 'linear-gradient(180deg, #f1f5f9, #cbd5e1)', ink: '#92400e' },
  CLUB: { bg: 'linear-gradient(180deg, #fff1f8, #f9c4dd)', ink: '#9d174d' },
}

const CARD_BG = 'linear-gradient(180deg, #fffaf0, #f6dfa0)'

/** One board space: cream card, colour bar on the inner edge for properties, icon, name and price. */
function BoardCell({ tile, side, goBonus }: { tile: CityTile; side: CellSide; goBonus: number }) {
  const base = 'relative flex h-full w-full overflow-hidden rounded-[10px] text-[#14204a]'
  const shell = { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.9), inset 0 -3px 0 rgba(150,100,20,0.35)' }

  if (side === 'corner') {
    const c =
      tile.type === 'GO'
        ? { icon: '🏁', title: 'START', sub: `Collect ${money(goBonus)}`, bg: 'linear-gradient(160deg, #fff7ae, #f5b52a)' }
        : tile.type === 'JAIL'
          ? { icon: '🚔', title: 'JAIL', sub: 'Just visiting', bg: 'linear-gradient(160deg, #fef9c3, #fcd34d)' }
          : tile.type === 'PARK'
            ? { icon: '🅿️', title: 'FREE', sub: 'Parking', bg: 'linear-gradient(160deg, #d1fae5, #5eead4)' }
            : { icon: '👮', title: 'GO TO', sub: 'Jail', bg: 'linear-gradient(160deg, #e0e7ff, #a5b4fc)' }
    return (
      <span className={`${base} items-center justify-center gap-1.5 px-1`} style={{ ...shell, background: c.bg }}>
        <span className="text-[34px] leading-none">{c.icon}</span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[19px] font-black tracking-tight">{c.title}</span>
          <span className="mt-0.5 text-[12px] font-extrabold uppercase text-[#7c2d12]">{c.sub}</span>
        </span>
      </span>
    )
  }

  const isProp = tile.type === 'PROPERTY'
  const special = !isProp ? SPECIAL_THEME[tile.type] : undefined
  const icon = TILE_ICON[tile.name] ?? (isProp ? CATEGORY_ICON[tile.category] : '⭐')
  const tint = isProp ? CATEGORY_TINT[tile.category] : null
  const price = isProp ? money(tile.basePrice) : tile.type === 'TAX' ? '₹50 each' : null
  const vertical = side === 'top' || side === 'bottom'
  // the colour bar faces the city
  const barEdge: 'top' | 'bottom' | 'left' | 'right' = side === 'bottom' ? 'top' : side === 'top' ? 'bottom' : side === 'left' ? 'right' : 'left'
  const BAR_STYLE: Record<typeof barEdge, CSSProperties> = {
    top: { left: 0, right: 0, top: 0, height: 12 },
    bottom: { left: 0, right: 0, bottom: 0, height: 12 },
    left: { top: 0, bottom: 0, left: 0, width: 12 },
    right: { top: 0, bottom: 0, right: 0, width: 12 },
  }
  const PAD: Record<typeof barEdge, CSSProperties> = {
    top: { paddingTop: 14 },
    bottom: { paddingBottom: 14 },
    left: { paddingLeft: 15 },
    right: { paddingRight: 15 },
  }
  const barStyle = BAR_STYLE[barEdge]
  const pad = PAD[barEdge]
  const tricolour = tile.type === 'COMMUNITY'

  return (
    <span
      className={`${base} ${vertical ? 'flex-col items-center justify-center px-[3px]' : 'flex-row items-center gap-1.5 px-1.5'}`}
      style={{ ...shell, ...pad, background: special?.bg ?? CARD_BG }}
    >
      {(tint || tricolour) && (
        <span
          className="absolute"
          style={{
            ...barStyle,
            background: tricolour
              ? barEdge === 'top' || barEdge === 'bottom'
                ? 'linear-gradient(90deg, #ff9933 33%, #ffffff 33% 66%, #138808 66%)'
                : 'linear-gradient(180deg, #ff9933 33%, #ffffff 33% 66%, #138808 66%)'
              : `linear-gradient(${barEdge === 'top' || barEdge === 'bottom' ? '180deg' : '90deg'}, ${tint}, ${tint}cc)`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
          }}
        />
      )}
      <span className={`shrink-0 leading-none ${vertical ? 'text-[22px]' : 'text-[26px]'}`}>{icon}</span>
      <span className={`flex min-w-0 flex-col leading-none ${vertical ? 'mt-0.5 items-center text-center' : 'items-start text-left'}`}>
        <span className="line-clamp-2 break-words text-[13px] font-black uppercase tracking-[-0.01em]" style={{ color: special?.ink }}>
          {tile.name}
        </span>
        {price && (
          <span className="mt-[2px] text-[13.5px] font-black" style={{ color: tint ? darkenHex(tint) : special?.ink }}>
            {price}
          </span>
        )}
      </span>
    </span>
  )
}

function darkenHex(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * 0.62)
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
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
