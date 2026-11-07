import { useMemo } from 'react'

/*
 * The lounge poster's backdrop: a rooftop terrace at sunset. Deep-blue sky over an orange horizon,
 * soft clouds, blue-glass skyscrapers with lit windows, a hover-car, palms and a glass railing, all
 * slightly out of focus so the board stays the hero.
 */

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

interface Tower {
  x: number
  w: number
  h: number
  spire: boolean
  windows: { x: number; y: number; o: number; warm: boolean }[]
}

function makeTowers(seed: number, count: number, maxH: number, density: number): { towers: Tower[]; width: number } {
  const r = rng(seed)
  const towers: Tower[] = []
  let x = 0
  for (let i = 0; i < count; i++) {
    const w = 3 + r() * 5
    const tall = r() > 0.75
    const h = maxH * (tall ? 0.8 + r() * 0.2 : 0.3 + r() * 0.45)
    const windows: Tower['windows'] = []
    for (let wy = 1.2; wy < h - 0.6; wy += 1.1) {
      for (let wx = 0.4; wx < w - 0.3; wx += 0.75) if (r() < density) windows.push({ x: x + wx, y: 80 - h + wy, o: 0.35 + r() * 0.65, warm: r() > 0.55 })
    }
    towers.push({ x, w, h, spire: tall && r() > 0.4, windows })
    x += w + 0.4 + r() * 1.6
  }
  return { towers, width: x }
}

function Towers({ seed, count, maxH, density, body, edge, className, blur }: { seed: number; count: number; maxH: number; density: number; body: string; edge: string; className: string; blur: number }) {
  const { towers, width } = useMemo(() => makeTowers(seed, count, maxH, density), [seed, count, maxH, density])
  const gid = `tw-${seed}`
  return (
    <svg className={className} style={{ filter: `blur(${blur}px)` }} viewBox={`0 0 ${width} 80`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={edge} />
          <stop offset="0.45" stopColor={body} />
          <stop offset="1" stopColor={body} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {towers.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={80 - t.h} width={t.w} height={t.h} fill={`url(#${gid})`} />
          {t.spire && <rect x={t.x + t.w / 2 - 0.12} y={80 - t.h - 6} width={0.24} height={6} fill={edge} />}
          {t.spire && <circle cx={t.x + t.w / 2} cy={80 - t.h - 6} r={0.35} fill="#ff6a8a" />}
          {t.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={0.36} height={0.55} fill={w.warm ? '#ffd08a' : '#7fd8ff'} opacity={w.o} />
          ))}
        </g>
      ))}
    </svg>
  )
}

function Palm({ side }: { side: 'left' | 'right' }) {
  const flip = side === 'right' ? 'scale(-1,1)' : undefined
  return (
    <svg viewBox="0 0 120 140" className={`absolute top-[6%] h-[22%] ${side === 'left' ? '-left-6' : '-right-6'}`} style={{ transform: flip, filter: 'blur(1.5px)' }} aria-hidden>
      <path d="M58 140 C60 100 62 70 66 48" stroke="#2a1f14" strokeWidth="6" fill="none" />
      {[
        'M66 48 C40 30 18 34 4 48 C26 40 44 42 66 50 Z',
        'M66 48 C50 20 30 8 12 10 C34 18 50 30 66 50 Z',
        'M66 48 C80 18 100 10 118 16 C96 22 82 34 68 50 Z',
        'M66 48 C92 38 110 46 120 62 C100 52 84 50 68 52 Z',
        'M66 48 C64 22 70 4 82 0 C74 16 72 32 68 50 Z',
      ].map((d, i) => (
        <path key={i} d={d} fill={i % 2 ? '#0f5a3a' : '#137046'} />
      ))}
    </svg>
  )
}

export default function LudoRooftop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#040a1e]" aria-hidden>
      {/* sky: deep blue overhead to a hot orange horizon */}
      <div
        className="absolute inset-x-0 top-0 h-[42%]"
        style={{ background: 'linear-gradient(180deg, #0b1d4f 0%, #1b3f8f 26%, #3a63b8 44%, #8a6fb0 60%, #e78a6a 76%, #ffb05a 88%, #ffd08a 100%)' }}
      />
      {/* clouds */}
      {[
        { l: '-6%', t: '4%', w: '58%', h: '9%', c: 'rgba(214,226,255,0.55)' },
        { l: '40%', t: '2%', w: '70%', h: '11%', c: 'rgba(196,212,255,0.5)' },
        { l: '10%', t: '15%', w: '45%', h: '6%', c: 'rgba(255,198,170,0.55)' },
        { l: '55%', t: '17%', w: '52%', h: '7%', c: 'rgba(255,186,150,0.5)' },
      ].map((c, i) => (
        <div key={i} className="absolute rounded-[50%] blur-xl" style={{ left: c.l, top: c.t, width: c.w, height: c.h, background: c.c }} />
      ))}
      <div className="absolute inset-x-0 top-[30%] h-[12%]" style={{ background: 'radial-gradient(ellipse 60% 100% at 50% 100%, rgba(255,200,120,0.75), transparent 70%)' }} />

      {/* city: hazy far towers, then glassy near towers */}
      <Towers seed={7} count={34} maxH={62} density={0.28} body="#3d5b9a" edge="#6f8fd0" className="absolute inset-x-0 top-[12%] h-[30%] w-full opacity-80" blur={2} />
      <Towers seed={31} count={18} maxH={78} density={0.32} body="#14244d" edge="#3d7fd6" className="absolute inset-x-0 top-[4%] h-[38%] w-full" blur={1} />

      {/* hover-car */}
      <div className="ludo-hover absolute left-[44%] top-[8%] h-3 w-12 rounded-full" style={{ background: 'linear-gradient(180deg, #9fb4d8, #34466e)', boxShadow: '0 4px 10px rgba(80,180,255,0.6)', filter: 'blur(0.6px)' }} />

      <Palm side="left" />
      <Palm side="right" />

      {/* rooftop: glass railing with blue neon, then a reflective tiled deck */}
      <div className="absolute inset-x-0 top-[38%] h-[5%]" style={{ background: 'linear-gradient(180deg, rgba(120,190,255,0.18), rgba(40,90,180,0.28))', borderTop: '2px solid rgba(140,210,255,0.8)', boxShadow: '0 -2px 18px rgba(80,170,255,0.7)' }} />
      {[6, 22, 38, 62, 78, 94].map((x) => (
        <span key={x} className="absolute top-[38%] h-[5%] w-[3px]" style={{ left: `${x}%`, background: 'linear-gradient(180deg, #bfe4ff, #3a6fb8)' }} />
      ))}
      <div className="absolute inset-x-0 bottom-0 top-[43%]" style={{ background: 'linear-gradient(180deg, #13306b 0%, #0b1c45 35%, #071233 70%, #040a1e 100%)' }} />
      {/* deck tile lines in perspective */}
      <svg className="absolute inset-x-0 bottom-0 top-[43%] h-[57%] w-full opacity-40" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`v${i}`} x1={50 + (i - 6) * 4} y1="0" x2={50 + (i - 6) * 22} y2="100" stroke="#5aa0ff" strokeWidth="0.25" />
        ))}
        {[4, 10, 18, 28, 41, 58, 80].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#5aa0ff" strokeWidth="0.25" />
        ))}
      </svg>
      {/* warm sunset reflections and blue neon pools on the deck */}
      <div className="absolute inset-x-[20%] top-[43%] h-[10%] rounded-[50%] blur-2xl" style={{ background: 'rgba(255,170,90,0.35)' }} />
      <div className="absolute -left-10 bottom-[6%] h-40 w-40 rounded-full blur-3xl" style={{ background: 'rgba(60,150,255,0.35)' }} />
      <div className="absolute -right-10 bottom-[10%] h-40 w-40 rounded-full blur-3xl" style={{ background: 'rgba(255,190,80,0.3)' }} />
      {/* edge vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 100% 85% at 50% 50%, transparent 60%, rgba(2,6,20,0.6) 100%)' }} />
    </div>
  )
}
