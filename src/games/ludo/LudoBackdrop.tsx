import { useMemo, type CSSProperties } from 'react'

interface Building {
  x: number
  w: number
  h: number
  windows: { x: number; y: number; warm: boolean; o: number }[]
  beacon: boolean
}

function makeSkyline(seed: number, count: number, maxH: number, density: number): { buildings: Building[]; width: number } {
  let s = seed
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const buildings: Building[] = []
  let x = -1
  for (let i = 0; i < count; i++) {
    const w = 2.6 + rand() * 4.2
    const h = maxH * (0.3 + Math.pow(rand(), 0.8) * 0.7)
    const windows: Building['windows'] = []
    for (let wy = 1.6; wy < h - 0.8; wy += 1.5) {
      for (let wx = 0.5; wx < w - 0.4; wx += 0.9) {
        if (rand() < density) windows.push({ x: x + wx, y: 60 - h + wy, warm: rand() > 0.3, o: 0.45 + rand() * 0.55 })
      }
    }
    buildings.push({ x, w, h, windows, beacon: rand() > 0.72 })
    x += w + 0.2 + rand() * 0.7
  }
  return { buildings, width: x + 1 }
}

function Skyline({
  seed,
  count,
  maxH,
  density,
  tint,
  className,
  style,
}: {
  seed: number
  count: number
  maxH: number
  density: number
  tint: string
  className: string
  style?: CSSProperties
}) {
  const { buildings, width } = useMemo(() => makeSkyline(seed, count, maxH, density), [seed, count, maxH, density])
  return (
    <svg className={className} style={style} viewBox={`0 0 ${width} 60`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`sky-bld-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tint} stopOpacity="0.85" />
          <stop offset="100%" stopColor={tint} />
        </linearGradient>
      </defs>
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={60 - b.h} width={b.w} height={b.h} fill={`url(#sky-bld-${seed})`} />
          {b.beacon && <circle cx={b.x + b.w / 2} cy={60 - b.h - 0.6} r={0.35} fill="#ff4d6d" />}
          {b.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={0.42} height={0.7} fill={w.warm ? '#ffcf86' : '#a8d8ff'} opacity={w.o} />
          ))}
        </g>
      ))}
    </svg>
  )
}

interface Bokeh {
  left: string
  top: string
  size: number
  color: string
  o: number
}

const BOKEH: Bokeh[] = [
  { left: '6%', top: '16%', size: 34, color: '#ffc27a', o: 0.55 },
  { left: '22%', top: '9%', size: 18, color: '#ffe0b0', o: 0.6 },
  { left: '37%', top: '21%', size: 26, color: '#ff8fc8', o: 0.45 },
  { left: '58%', top: '12%', size: 40, color: '#ffb45e', o: 0.4 },
  { left: '74%', top: '24%', size: 22, color: '#9fd0ff', o: 0.5 },
  { left: '89%', top: '14%', size: 30, color: '#ffd59a', o: 0.55 },
  { left: '12%', top: '31%', size: 16, color: '#c79bff', o: 0.5 },
  { left: '83%', top: '34%', size: 20, color: '#ff9d7a', o: 0.45 },
  { left: '48%', top: '6%', size: 14, color: '#ffffff', o: 0.5 },
  { left: '4%', top: '74%', size: 46, color: '#ff9d4d', o: 0.35 },
  { left: '90%', top: '70%', size: 52, color: '#ffb35c', o: 0.32 },
  { left: '68%', top: '88%', size: 38, color: '#c04dff', o: 0.28 },
  { left: '24%', top: '92%', size: 34, color: '#4d8bff', o: 0.26 },
]

const MOTES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 61.7) % 100}%`,
  size: 1.5 + (i % 3),
  delay: `${(i % 8) * 1.1}s`,
  duration: `${13 + (i % 5) * 2.5}s`,
}))

function FloorLamp({ side }: { side: 'left' | 'right' }) {
  const pos = side === 'left' ? { left: '3%' } : { right: '4%' }
  return (
    <div className="absolute top-[24%] h-[20%] w-16" style={pos}>
      <div className="ludo-lamp absolute -left-16 -top-14 h-48 w-48 rounded-full bg-[#ffb35c]/40 blur-3xl" />
      <div
        className="absolute left-1/2 top-0 h-9 w-12 -translate-x-1/2"
        style={{
          clipPath: 'polygon(18% 0, 82% 0, 100% 100%, 0 100%)',
          background: 'linear-gradient(180deg, #ffe7c2, #ffb866 70%, #e0843a)',
          boxShadow: '0 0 30px 10px rgba(255,180,90,0.5)',
        }}
      />
      <div className="absolute left-1/2 top-9 h-full w-[3px] -translate-x-1/2 bg-gradient-to-b from-[#6b4a2e] to-[#1c120c]" />
      <div className="absolute left-1/2 top-9 h-40 w-24 -translate-x-1/2 bg-gradient-to-b from-[#ffb866]/25 to-transparent [clip-path:polygon(35%_0,65%_0,100%_100%,0_100%)]" />
    </div>
  )
}

/**
 * Cinematic lounge environment behind the board: a sunset skyline through floor-to-ceiling glass,
 * warm lamps, sofas and a plant thrown far out of focus, a reflective floor and drifting bokeh — dark
 * and blurred at the center so the board stays the hero.
 */
export default function LudoBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#07040f]" aria-hidden>
      {/* sunset sky */}
      <div
        className="absolute inset-x-0 top-0 h-[41%]"
        style={{
          background:
            'linear-gradient(180deg, #120a33 0%, #2c1560 22%, #5a2780 42%, #9a3d8c 60%, #e0677a 78%, #ff9a62 92%, #ffb870 100%)',
        }}
      />
      <div className="absolute left-[8%] top-[10%] h-24 w-72 rounded-full bg-[#ff9fd0]/25 blur-2xl" />
      <div className="absolute right-[2%] top-[18%] h-20 w-64 rounded-full bg-[#b27dff]/25 blur-2xl" />
      <div className="absolute left-[15%] top-[28%] h-20 w-[75%] rounded-full bg-[#ffb870]/35 blur-3xl" />

      {/* skyline in two depth-of-field layers */}
      <Skyline
        seed={19}
        count={30}
        maxH={40}
        density={0.4}
        tint="#4a2a78"
        className="absolute inset-x-0 top-[12%] h-[29%] w-full opacity-90"
        style={{ filter: 'blur(2.5px)' }}
      />
      <Skyline
        seed={53}
        count={20}
        maxH={50}
        density={0.34}
        tint="#1f1038"
        className="absolute inset-x-0 top-[10%] h-[31%] w-full"
        style={{ filter: 'blur(1.4px)' }}
      />
      <div className="absolute inset-x-0 top-[26%] h-[16%]" style={{ background: 'linear-gradient(180deg, transparent, rgba(255,140,100,0.45) 60%, rgba(255,190,120,0.25) 85%, transparent)' }} />

      {/* window glass: mullions, transom and a faint diagonal reflection */}
      <div className="absolute inset-x-0 top-0 h-[41%]" style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 38%, transparent 44%, transparent 70%, rgba(255,255,255,0.04) 76%, transparent 80%)' }} />
      {[0, 24, 50, 76, 100].map((x) => (
        <span
          key={x}
          className="absolute top-0 h-[41%] w-[9px] -translate-x-1/2"
          style={{ left: `${x}%`, background: 'linear-gradient(90deg, #06030d, #2a1d44 45%, #06030d)', boxShadow: '0 0 14px rgba(0,0,0,0.9)' }}
        />
      ))}
      <span className="absolute inset-x-0 top-[9%] h-[5px]" style={{ background: 'linear-gradient(180deg, #06030d, #2a1d44, #06030d)' }} />

      {/* ceiling with warm downlights */}
      <div className="absolute inset-x-0 top-0 h-[8%]" style={{ background: 'linear-gradient(180deg, #040209 45%, rgba(4,2,9,0))' }} />
      {[12, 31, 50, 69, 88].map((x) => (
        <span key={x} className="absolute top-[3%] h-1.5 w-7 -translate-x-1/2 rounded-full bg-amber-100/90 shadow-[0_0_22px_8px_rgba(255,200,120,0.4)]" style={{ left: `${x}%` }} />
      ))}

      {/* interior, far out of focus */}
      <div className="absolute inset-x-0 bottom-0 h-[60%]" style={{ background: 'linear-gradient(180deg, #1f0f2e 0%, #0e0718 45%, #060309 100%)' }} />
      <div className="absolute inset-x-0 top-[40%] h-[3px] bg-gradient-to-r from-transparent via-[#ffb870]/50 to-transparent" />
      <div className="absolute inset-0" style={{ filter: 'blur(7px)' }}>
        {/* sofas with warm rim light */}
        <div className="absolute -left-10 top-[35%] h-20 w-48 rounded-[2.5rem] bg-[#3a1f4a]" style={{ boxShadow: 'inset 0 10px 14px rgba(255,170,110,0.6), 0 0 30px rgba(255,150,90,0.25)' }} />
        <div className="absolute -left-6 top-[32%] h-12 w-40 rounded-[2rem] bg-[#45244f]" style={{ boxShadow: 'inset 0 8px 12px rgba(255,170,110,0.55)' }} />
        <div className="absolute -right-12 top-[34%] h-24 w-52 rounded-[2.5rem] bg-[#36204e]" style={{ boxShadow: 'inset 0 10px 14px rgba(200,140,255,0.55), 0 0 30px rgba(170,110,255,0.25)' }} />
        {/* potted plant */}
        <div className="absolute right-[26%] top-[28%] h-24 w-20">
          <div className="absolute bottom-0 left-1/2 h-8 w-10 -translate-x-1/2 rounded-b-xl bg-[#2b1a1a]" />
          <div className="absolute bottom-6 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-[#0f2a1e]" />
          <div className="absolute bottom-12 left-2 h-12 w-10 rounded-full bg-[#133626]" />
        </div>
        {/* reflective floor streaks under the lamps */}
        <div className="absolute bottom-0 left-[6%] h-[30%] w-10 bg-gradient-to-t from-transparent via-[#ffb35c]/25 to-transparent" />
        <div className="absolute bottom-0 right-[7%] h-[30%] w-10 bg-gradient-to-t from-transparent via-[#ffb35c]/25 to-transparent" />
        <div className="absolute bottom-0 left-[45%] h-[24%] w-16 bg-gradient-to-t from-transparent via-[#b27dff]/15 to-transparent" />
        <div className="absolute bottom-[4%] left-[10%] h-24 w-[80%] rounded-full bg-[#ff9d5c]/12" />
      </div>
      <div className="absolute inset-0" style={{ filter: 'blur(3px)' }}>
        <FloorLamp side="left" />
        <FloorLamp side="right" />
      </div>

      {/* bokeh discs: soft body with a slightly brighter rim, like out-of-focus lights */}
      {BOKEH.map((b, i) => (
        <span
          key={i}
          className="ludo-twinkle absolute rounded-full"
          style={{
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            opacity: b.o,
            background: `radial-gradient(circle, ${b.color}55 0%, ${b.color}66 60%, ${b.color}aa 72%, ${b.color}00 76%)`,
            filter: 'blur(1px)',
            animationDelay: `${i * 0.6}s`,
          }}
        />
      ))}

      {MOTES.map((m, i) => (
        <span
          key={i}
          className="ludo-mote absolute top-full rounded-full bg-amber-100"
          style={{ left: m.left, width: m.size, height: m.size, animationDelay: m.delay, animationDuration: m.duration }}
        />
      ))}

      {/* darker pool behind the board so the environment never competes with it, plus edge vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 22% at 50% 62%, rgba(5,3,12,0.45) 0%, rgba(5,3,12,0.15) 60%, transparent 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 100% 80% at 50% 50%, transparent 55%, rgba(3,2,8,0.55) 100%)' }} />
    </div>
  )
}
