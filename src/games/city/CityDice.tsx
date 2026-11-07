import { useEffect, useRef, useState } from 'react'
import { DICE_ROLL_MS } from './cityBoardLayout'

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// face -> [rotateX, rotateY] that brings it to the front
const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  3: [0, -90],
  4: [0, 90],
  2: [-90, 0],
  5: [90, 0],
}

const FACE_PLACE: Record<number, string> = {
  1: 'rotateY(0deg)',
  6: 'rotateY(180deg)',
  3: 'rotateY(90deg)',
  4: 'rotateY(-90deg)',
  2: 'rotateX(90deg)',
  5: 'rotateX(-90deg)',
}

function Face({ n, size }: { n: number; size: number }) {
  return (
    <div
      className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-[14%]"
      style={{
        transform: `${FACE_PLACE[n]} translateZ(${size / 2}px)`,
        borderRadius: size * 0.22,
        background: 'radial-gradient(circle at 30% 25%, #ffffff 0%, #f4f6fb 55%, #dce0ee 100%)',
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.95), inset 0 -4px 8px rgba(0,0,0,0.18)',
        backfaceVisibility: 'hidden',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[n].includes(i) && (
            <span
              className="block rounded-full"
              style={{
                width: size * 0.175,
                height: size * 0.175,
                background: n === 1 ? 'radial-gradient(circle at 35% 30%, #ff5252, #b91c1c)' : 'radial-gradient(circle at 35% 30%, #374151, #0f172a)',
                boxShadow: 'inset 0 1.5px 2px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.8)',
              }}
            />
          )}
        </span>
      ))}
    </div>
  )
}

function DieCube({ value, rollKey, size, offsetDeg }: { value: number; rollKey: number; size: number; offsetDeg: [number, number] }) {
  const turns = useRef(0)
  const [rot, setRot] = useState<[number, number]>([-18 + offsetDeg[0], 24 + offsetDeg[1]])

  useEffect(() => {
    if (rollKey === 0) return
    turns.current += 2
    const [fx, fy] = FACE_ROT[value] ?? [0, 0]
    setRot([fx - 18 + offsetDeg[0] + turns.current * 360, fy + 24 + offsetDeg[1] + turns.current * 360])
  }, [rollKey, value, offsetDeg])

  return (
    <div style={{ perspective: 500, width: size, height: size }}>
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rot[0]}deg) rotateY(${rot[1]}deg)`,
          transition: `transform ${DICE_ROLL_MS}ms cubic-bezier(.15,.75,.25,1)`,
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Face key={n} n={n} size={size} />
        ))}
      </div>
    </div>
  )
}

/**
 * Two 3D tumbling dice side-by-side on an illuminated oval neon energy ring, matching the Monopoly UI.
 */
export default function CityDice({
  value,
  rollKey,
  color = '#38bdf8',
  size = 56,
}: {
  value: number | null
  rollKey: number
  color?: string
  size?: number
}) {
  const [settled, setSettled] = useState(true)

  // Split single roll value or random roll into two dice (defaults to 2 and 3 as in the screenshot)
  const d1 = value !== null ? Math.max(1, Math.min(6, Math.floor(value / 2))) : 2
  const d2 = value !== null ? Math.max(1, Math.min(6, Math.ceil(value / 2))) : 3
  const total = d1 + d2

  useEffect(() => {
    if (rollKey === 0) return
    setSettled(false)
    const t = setTimeout(() => setSettled(true), DICE_ROLL_MS)
    return () => clearTimeout(t)
  }, [rollKey])

  const dieSize = Math.round(size * 0.72)

  return (
    <div className="relative flex items-center justify-center" style={{ width: dieSize * 2.8, height: dieSize + 22 }}>
      {/* Glowing oval neon pad underneath the two dice */}
      <div
        className="absolute bottom-[-1px] left-1/2 -translate-x-1/2 rounded-[50%]"
        style={{
          width: dieSize * 2.6,
          height: dieSize * 0.44,
          border: `2px solid ${color}`,
          boxShadow: `0 0 20px ${color}, inset 0 0 16px ${color}bb`,
          background: `radial-gradient(ellipse, ${color}66 10%, ${color}22 60%, transparent 80%)`,
        }}
      />
      <div
        className="absolute bottom-0 left-1/2 h-5 -translate-x-1/2 rounded-[50%] blur-md"
        style={{ width: dieSize * 2.2, background: `radial-gradient(ellipse, ${color}ee, transparent 70%)` }}
      />

      {/* The pair of 3D tumbling dice */}
      <div
        className="relative z-10 flex items-center justify-center gap-3.5"
        style={{
          animation: rollKey ? `city-dice-hop ${DICE_ROLL_MS}ms cubic-bezier(.3,.6,.4,1)` : undefined,
          filter: `drop-shadow(0 8px 12px rgba(0,0,0,0.65)) drop-shadow(0 0 14px ${color}88)`,
        }}
      >
        <DieCube value={d1} rollKey={rollKey} size={dieSize} offsetDeg={[-6, -10]} />
        <DieCube value={d2} rollKey={rollKey} size={dieSize} offsetDeg={[8, 14]} />
      </div>

      {settled && value !== null && rollKey > 0 && (
        <span
          key={`tot-${rollKey}`}
          className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[14px] font-black text-white ring-2 ring-white/90"
          style={{ background: color, boxShadow: `0 0 16px ${color}`, animation: 'city-pop 0.35s ease-out' }}
        >
          {total}
        </span>
      )}
    </div>
  )
}
