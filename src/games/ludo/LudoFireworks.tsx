import { useEffect, useRef } from 'react'
import { sfx } from '@/lib/sound'

const PALETTE = ['#ff3b5c', '#ffd24a', '#3dffb5', '#4f9bff', '#c084fc', '#ff8a3d', '#ffffff']
const GOLD = ['#ffd27a', '#ffc04a', '#ffe7b0']
/** The dull orange a star cools to just before it goes out. */
const EMBER: [number, number, number] = [255, 140, 50]

type Shell = 'peony' | 'chrysanthemum' | 'ring' | 'willow' | 'crackle' | 'palm' | 'crossette' | 'double'
const SHELLS: Shell[] = ['peony', 'chrysanthemum', 'ring', 'willow', 'crackle', 'palm', 'crossette', 'double']

type RGB = [number, number, number]

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

interface Rocket {
  x: number
  y: number
  vx: number
  vy: number
  targetY: number
  color: RGB
  shell: Shell
  /** 0.55–1: further shells are smaller, dimmer and quieter. */
  depth: number
  wobble: number
}

interface Star {
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  life: number
  max: number
  color: RGB
  size: number
  drag: number
  gravity: number
  /** How long the star leaves a streak: 0 none, 1 a long tail. */
  tail: number
  /** Glitter stars flash white at random as they fall. */
  glitter?: boolean
  /** Crackle stars pop into tiny white flashes when they burn out. */
  crackle?: boolean
  /** Crossette stars split into four when they burn out. */
  split?: boolean
  depth: number
}

interface Smoke {
  x: number
  y: number
  r: number
  life: number
  max: number
  alpha: number
}

/**
 * Full-screen fireworks with real-feeling physics and light: rockets rise on a wobbling spark trail and burst
 * with a white flash; stars burn white-hot, show their colour, then cool to orange embers and flicker out; shells
 * vary in distance, leave drifting smoke, and the boom arrives a beat after the flash.
 * Launches `rockets` shells over `durationMs`, ending in a finale volley.
 */
export default function LudoFireworks({ rockets = 10, durationMs = 3200, colors, sound = true }: { rockets?: number; durationMs?: number; colors?: string[]; sound?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const pool = (colors?.length ? [...colors, ...colors, '#ffd24a', '#ffffff'] : PALETTE).map(rgb)
    const pick = (from: RGB[] = pool) => from[Math.floor(Math.random() * from.length)]
    const gold = GOLD.map(rgb)
    const live: Rocket[] = []
    const stars: Star[] = []
    const smoke: Smoke[] = []
    const flashes: { x: number; y: number; r: number; life: number }[] = []
    const count = reduced ? Math.min(3, rockets) : rockets
    const timers: number[] = []
    let skyFlash = 0
    let launchSounds = 0
    let bangSounds = 0
    // the screen is roughly 1x on phones; scale burst size with it so shells fill big screens too
    const scale = () => Math.max(0.8, Math.min(1.6, Math.min(w, h) / 520))

    const launch = (x: number) => {
      const depth = 0.55 + Math.random() * 0.45
      live.push({
        x,
        y: h + 10,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(h * 0.0155 + Math.random() * 3) * (0.85 + depth * 0.15),
        targetY: h * (0.1 + Math.random() * 0.32) + (1 - depth) * h * 0.08,
        color: pick(),
        shell: SHELLS[Math.floor(Math.random() * SHELLS.length)],
        depth,
        wobble: Math.random() * Math.PI * 2,
      })
      if (sound && launchSounds < 2) {
        launchSounds++
        sfx.fireworkLaunch()
        window.setTimeout(() => launchSounds--, 300)
      }
    }

    // main show spread over the duration, then a finale volley
    const finale = reduced ? 0 : Math.max(3, Math.round(count * 0.3))
    const main = Math.max(1, count - finale)
    const mainSpan = Math.max(0, durationMs - 1500)
    for (let i = 0; i < main; i++) {
      const at = (i / Math.max(1, main - 1)) * mainSpan + Math.random() * 180
      timers.push(window.setTimeout(() => launch(w * (0.12 + Math.random() * 0.76)), at))
    }
    for (let i = 0; i < finale; i++) {
      timers.push(window.setTimeout(() => launch(w * (0.1 + (i / Math.max(1, finale - 1)) * 0.8)), mainSpan + 250 + Math.random() * 260))
    }

    const star = (s: Omit<Star, 'px' | 'py'>) => stars.push({ ...s, px: s.x, py: s.y })

    function burst(r: Rocket) {
      const k = scale() * r.depth
      const power = (3.6 + Math.random() * 2) * k
      const second = pick()
      skyFlash = Math.min(1, skyFlash + 0.5 * r.depth)
      flashes.push({ x: r.x, y: r.y, r: 70 * k, life: 1 })
      for (let i = 0; i < 6; i++) smoke.push({ x: r.x + (Math.random() - 0.5) * 50 * k, y: r.y + (Math.random() - 0.5) * 40 * k, r: (40 + Math.random() * 50) * k, life: 0, max: 160 + Math.random() * 80, alpha: 0.012 + Math.random() * 0.012 })
      if (sound && bangSounds < 3) {
        bangSounds++
        // sound travels slower than light: further shells boom a little later
        sfx.fireworkBang(0.6 + r.depth * 0.5, r.shell === 'crackle', 0.08 + (1 - r.depth) * 0.25)
        window.setTimeout(() => bangSounds--, 260)
      }
      const base = { depth: r.depth, gravity: 0.045, drag: 0.968 }
      switch (r.shell) {
        case 'ring': {
          const n = 70
          const tilt = 0.45 + Math.random() * 0.5
          const rot = Math.random() * Math.PI
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2
            const ex = Math.cos(a) * power
            const ey = Math.sin(a) * power * tilt
            star({ ...base, x: r.x, y: r.y, vx: ex * Math.cos(rot) - ey * Math.sin(rot), vy: ex * Math.sin(rot) + ey * Math.cos(rot), life: 75, max: 75, color: i % 2 ? r.color : second, size: 2.1, tail: 0.3 })
          }
          break
        }
        case 'willow': {
          const n = 110
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = power * Math.sqrt(Math.random()) * 0.9
            const max = 140 + Math.random() * 50
            star({ ...base, x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color: pick(gold), size: 1.5, drag: 0.978, gravity: 0.03, tail: 1, glitter: true })
          }
          break
        }
        case 'crackle': {
          const n = 80
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = power * Math.sqrt(Math.random())
            const max = 50 + Math.random() * 25
            star({ ...base, x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color: pick(gold), size: 1.7, tail: 0.4, crackle: true })
          }
          break
        }
        case 'palm': {
          const n = 9
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.25
            star({ ...base, x: r.x, y: r.y, vx: Math.cos(a) * power * 1.15, vy: Math.sin(a) * power * 1.15 - 1, life: 95, max: 95, color: r.color, size: 3.6, drag: 0.972, gravity: 0.065, tail: 1, glitter: true })
          }
          break
        }
        case 'crossette': {
          const n = 14
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.2
            star({ ...base, x: r.x, y: r.y, vx: Math.cos(a) * power * 0.8, vy: Math.sin(a) * power * 0.8, life: 38, max: 38, color: r.color, size: 2.6, tail: 0.7, split: true })
          }
          break
        }
        case 'double': {
          for (const [m, col] of [[1, r.color], [0.5, second]] as const) {
            const n = 60
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2 + Math.random() * 0.08
              const sp = power * m * (0.9 + Math.random() * 0.15)
              const max = 70 + Math.random() * 20
              star({ ...base, x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color: col, size: 2, tail: 0.35 })
            }
          }
          break
        }
        case 'chrysanthemum': {
          // like a peony, but every star drags a long glittering tail
          const n = 90
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.1
            const sp = power * (0.85 + Math.random() * 0.2)
            const max = 80 + Math.random() * 25
            star({ ...base, x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color: r.color, size: 1.8, tail: 1, glitter: true })
          }
          break
        }
        default: {
          // peony: a full sphere of stars (sqrt spread fills the disc like a sphere seen from afar)
          const n = 100
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = power * (0.35 + 0.65 * Math.sqrt(Math.random()))
            const max = 65 + Math.random() * 30
            star({ ...base, x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color: i % 4 === 0 ? second : r.color, size: 1.9 + Math.random(), tail: 0.25 })
          }
        }
      }
    }

    let raf = 0
    const tick = () => {
      // fade the last frame rather than clearing it, so moving stars leave soft trails
      g.globalCompositeOperation = 'destination-out'
      g.fillStyle = 'rgba(0,0,0,0.24)'
      g.fillRect(0, 0, w, h)

      // smoke: faint grey puffs that spread and drift with the breeze
      g.globalCompositeOperation = 'source-over'
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i]
        s.life++
        if (s.life > s.max) {
          smoke.splice(i, 1)
          continue
        }
        s.x += 0.25
        s.y -= 0.08
        s.r += 0.25
        const a = s.alpha * Math.sin((s.life / s.max) * Math.PI)
        const grad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r)
        grad.addColorStop(0, `rgba(190,185,200,${a})`)
        grad.addColorStop(1, 'rgba(190,185,200,0)')
        g.fillStyle = grad
        g.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2)
      }

      g.globalCompositeOperation = 'lighter'

      // the white-hot flash at the heart of each burst
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]
        f.life -= 0.12
        if (f.life <= 0) {
          flashes.splice(i, 1)
          continue
        }
        const grad = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r)
        grad.addColorStop(0, `rgba(255,250,235,${f.life})`)
        grad.addColorStop(0.3, `rgba(255,230,180,${f.life * 0.4})`)
        grad.addColorStop(1, 'rgba(255,200,120,0)')
        g.fillStyle = grad
        g.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2)
      }

      // rockets: a bright head rising on a slightly wobbling path, shedding sparks
      for (let i = live.length - 1; i >= 0; i--) {
        const r = live[i]
        r.wobble += 0.3
        r.x += r.vx + Math.sin(r.wobble) * 0.35
        r.y += r.vy
        r.vy *= 0.982
        g.fillStyle = 'rgba(255,235,200,0.95)'
        g.beginPath()
        g.arc(r.x, r.y, 1.8 * r.depth + 0.6, 0, Math.PI * 2)
        g.fill()
        for (let k = 0; k < 2; k++) {
          star({ x: r.x, y: r.y + 3, vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 1.2, life: 16 + Math.random() * 10, max: 26, color: [255, 190, 110], size: 1, drag: 0.94, gravity: 0.03, tail: 0, depth: r.depth, glitter: true })
        }
        if (r.y <= r.targetY || r.vy > -1.1) {
          burst(r)
          live.splice(i, 1)
        }
      }

      // stars
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i]
        s.px = s.x
        s.py = s.y
        s.vx *= s.drag
        s.vy = s.vy * s.drag + s.gravity
        s.x += s.vx
        s.y += s.vy
        s.life -= 1
        if (s.life <= 0) {
          if (s.crackle) {
            for (let k = 0; k < 4; k++) star({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 7, max: 7, color: [255, 255, 255], size: 1.3, drag: 0.85, gravity: 0, tail: 0, depth: s.depth })
          }
          if (s.split) {
            const a0 = Math.random() * Math.PI
            for (let k = 0; k < 4; k++) {
              const a = a0 + (k * Math.PI) / 2
              star({ x: s.x, y: s.y, vx: Math.cos(a) * 2.6 * s.depth, vy: Math.sin(a) * 2.6 * s.depth, life: 40, max: 40, color: s.color, size: 1.7, drag: 0.962, gravity: 0.05, tail: 0.6, depth: s.depth })
            }
          }
          stars.splice(i, 1)
          continue
        }
        const t = 1 - s.life / s.max // 0 at burst → 1 when it goes out
        // white-hot at first, then its colour, then cooling to an ember
        let c: RGB = t < 0.12 ? mix([255, 255, 245], s.color, t / 0.12) : t > 0.7 ? mix(s.color, EMBER, (t - 0.7) / 0.3) : s.color
        let alpha = t > 0.75 ? (1 - t) / 0.25 : 1
        // dying stars flicker before they go out
        if (t > 0.8) alpha *= 0.4 + Math.random() * 0.6
        if (s.glitter && Math.random() < 0.08) {
          c = [255, 255, 255]
          alpha = 1
        }
        alpha *= 0.55 + s.depth * 0.45
        const col = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`
        if (s.tail > 0) {
          g.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha * 0.55})`
          g.lineWidth = s.size * s.depth
          g.beginPath()
          g.moveTo(s.x - (s.x - s.px) * (1 + s.tail * 3), s.y - (s.y - s.py) * (1 + s.tail * 3))
          g.lineTo(s.x, s.y)
          g.stroke()
        }
        g.fillStyle = col
        g.beginPath()
        g.arc(s.x, s.y, Math.max(0.5, s.size * s.depth * (1 - t * 0.4)), 0, Math.PI * 2)
        g.fill()
      }

      // the whole sky brightens for a moment with each burst
      skyFlash *= 0.86
      if (flashRef.current) flashRef.current.style.opacity = String(skyFlash * 0.3)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      window.removeEventListener('resize', resize)
    }
  }, [rockets, durationMs, colors, sound])

  return (
    <>
      <div
        ref={flashRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ opacity: 0, background: 'radial-gradient(ellipse at 50% 25%, rgba(255,240,210,0.9), rgba(255,200,130,0.22) 45%, transparent 75%)' }}
      />
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
    </>
  )
}
