import type { CityTile, PropertyCategory, PropertyTile, SimpleTile } from './cityBoardData'
import { CATEGORY_ICON, CATEGORY_TINT } from './cityBoardData'
import { CITY_SCENES } from './cityLandmarkArt'

export type InnerEdge = 'top' | 'bottom' | 'left' | 'right'
export type CardShape = 'portrait' | 'landscape' | 'corner'

const FONT = '"Segoe UI", "Arial Black", Arial, sans-serif'
const LONG = 474
const SHORT = 330

type Ctx = CanvasRenderingContext2D
type Rand = () => number

function mulberry32(seed: number): Rand {
  let a = seed + 0x9e3779b9
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function vGrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

// ---------------------------------------------------------------- scene primitives

function sky(ctx: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string) {
  ctx.fillStyle = vGrad(ctx, y, y + h, [
    [0, top],
    [1, bottom],
  ])
  ctx.fillRect(x, y, w, h)
}

function glowDisc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4)
  g.addColorStop(0, color)
  g.addColorStop(0.35, color)
  g.addColorStop(0.4, `${color}88`)
  g.addColorStop(1, `${color}00`)
  ctx.fillStyle = g
  ctx.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8)
}

function windowsGrid(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
  lit: string,
  dark: string,
  rand: Rand,
  litProb = 0.55,
) {
  const gx = w / cols
  const gy = h / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = rand() < litProb ? lit : dark
      ctx.fillRect(x + c * gx + gx * 0.22, y + r * gy + gy * 0.25, gx * 0.56, gy * 0.5)
    }
  }
}

function skyline(ctx: Ctx, x: number, base: number, w: number, minH: number, maxH: number, color: string, rand: Rand, lit?: string) {
  let cx = x - 4
  while (cx < x + w) {
    const bw = 10 + rand() * 22
    const bh = minH + rand() * (maxH - minH)
    ctx.fillStyle = color
    ctx.fillRect(cx, base - bh, bw, bh)
    if (rand() > 0.7) ctx.fillRect(cx + bw / 2 - 1, base - bh - 10, 2, 10)
    if (lit) windowsGrid(ctx, cx, base - bh + 4, bw, bh - 6, 2, Math.max(2, Math.floor(bh / 12)), lit, color, rand, 0.35)
    cx += bw + 2 + rand() * 4
  }
}

function tower(
  ctx: Ctx,
  x: number,
  base: number,
  w: number,
  h: number,
  body: [string, string],
  lit: string,
  rand: Rand,
  opts: { spire?: boolean; crown?: boolean; cols?: number } = {},
) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, body[0])
  g.addColorStop(1, body[1])
  ctx.fillStyle = g
  ctx.fillRect(x, base - h, w, h)
  // light edge
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(x, base - h, 2, h)
  const cols = opts.cols ?? Math.max(2, Math.round(w / 12))
  windowsGrid(ctx, x + 3, base - h + 6, w - 6, h - 10, cols, Math.max(3, Math.round(h / 14)), lit, 'rgba(10,20,45,0.35)', rand, 0.6)
  if (opts.spire) {
    ctx.fillStyle = body[1]
    ctx.beginPath()
    ctx.moveTo(x + w * 0.2, base - h)
    ctx.lineTo(x + w / 2, base - h - w * 0.9)
    ctx.lineTo(x + w * 0.8, base - h)
    ctx.fill()
    ctx.fillStyle = '#fef3c7'
    ctx.fillRect(x + w / 2 - 1, base - h - w * 1.35, 2, w * 0.5)
  }
  if (opts.crown) {
    ctx.fillStyle = body[0]
    ctx.beginPath()
    ctx.arc(x + w / 2, base - h, w / 2, Math.PI, 0)
    ctx.fill()
  }
}

function tree(ctx: Ctx, x: number, base: number, s: number, color = '#2f9e44') {
  ctx.fillStyle = '#6b4226'
  ctx.fillRect(x - s * 0.08, base - s * 0.5, s * 0.16, s * 0.5)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, base - s * 0.7, s * 0.38, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.arc(x - s * 0.12, base - s * 0.8, s * 0.16, 0, Math.PI * 2)
  ctx.fill()
}

function palm(ctx: Ctx, x: number, base: number, s: number) {
  ctx.strokeStyle = '#3b2412'
  ctx.lineWidth = s * 0.08
  ctx.beginPath()
  ctx.moveTo(x, base)
  ctx.quadraticCurveTo(x + s * 0.15, base - s * 0.6, x + s * 0.05, base - s)
  ctx.stroke()
  ctx.fillStyle = '#1f7a3a'
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    ctx.beginPath()
    ctx.ellipse(x + s * 0.05 + Math.cos(a) * s * 0.22, base - s + Math.sin(a) * s * 0.08, s * 0.26, s * 0.07, a, 0, Math.PI * 2)
    ctx.fill()
  }
}

function street(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#2b3140'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#fbbf24'
  for (let i = x + 4; i < x + w; i += 18) ctx.fillRect(i, y + h / 2 - 1, 9, 2)
  ctx.fillStyle = '#9aa5b8'
  ctx.fillRect(x, y, w, 3)
}

// ---------------------------------------------------------------- category illustrations

type SceneFn = (ctx: Ctx, x: number, y: number, w: number, h: number, rand: Rand) => void

const drawOffice: SceneFn = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, '#3d8bff', '#cdeaff')
  glowDisc(ctx, x + w * 0.8, y + h * 0.2, h * 0.07, '#fff6d5')
  const base = y + h * 0.86
  skyline(ctx, x, base, w, h * 0.2, h * 0.45, '#8fb8e6', rand)
  const n = 3 + Math.floor(rand() * 2)
  for (let i = 0; i < n; i++) {
    const bw = w * (0.16 + rand() * 0.1)
    const bx = x + (w / n) * i + rand() * 8
    const bh = h * (0.45 + rand() * 0.38)
    const tone = rand() > 0.5 ? ['#1e5fbf', '#0c2f6b'] : ['#2b7fd1', '#123e7a']
    tower(ctx, bx, base, bw, bh, tone as [string, string], '#bfe3ff', rand, { spire: i === 1 })
  }
  street(ctx, x, base, w, h - (base - y))
  tree(ctx, x + w * 0.1, base + 2, h * 0.14)
  tree(ctx, x + w * 0.9, base + 2, h * 0.12)
}

const drawRestaurant: SceneFn = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, '#ff7b54', '#ffd28a')
  glowDisc(ctx, x + w * 0.22, y + h * 0.36, h * 0.09, '#fff1b8')
  const base = y + h * 0.88
  skyline(ctx, x, base - h * 0.1, w, h * 0.15, h * 0.35, '#c75a4a', rand)
  // main building
  const bx = x + w * 0.12
  const bw = w * 0.76
  const bh = h * 0.5
  ctx.fillStyle = vGrad(ctx, base - bh, base, [
    [0, '#b4533b'],
    [1, '#7a2e1f'],
  ])
  ctx.fillRect(bx, base - bh, bw, bh)
  windowsGrid(ctx, bx + 6, base - bh + 6, bw - 12, bh * 0.35, 4, 1, '#ffe08a', '#5a2317', rand, 0.9)
  // big glowing window
  ctx.fillStyle = vGrad(ctx, base - bh * 0.45, base, [
    [0, '#ffe8a3'],
    [1, '#ffb347'],
  ])
  ctx.fillRect(bx + bw * 0.12, base - bh * 0.42, bw * 0.76, bh * 0.36)
  // striped awning
  const ay = base - bh * 0.52
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#e11d48'
    ctx.beginPath()
    ctx.moveTo(bx - 4 + (i * (bw + 8)) / 8, ay)
    ctx.lineTo(bx - 4 + ((i + 1) * (bw + 8)) / 8, ay)
    ctx.lineTo(bx - 4 + ((i + 1) * (bw + 8)) / 8, ay + bh * 0.14)
    ctx.arc(bx - 4 + ((i + 0.5) * (bw + 8)) / 8, ay + bh * 0.14, (bw + 8) / 16, 0, Math.PI)
    ctx.closePath()
    ctx.fill()
  }
  // sign
  ctx.fillStyle = '#1f2937'
  rr(ctx, bx + bw * 0.25, base - bh - h * 0.1, bw * 0.5, h * 0.1, 6)
  ctx.fill()
  ctx.fillStyle = '#fde047'
  ctx.font = `900 ${h * 0.07}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('EAT', bx + bw / 2, base - bh - h * 0.05)
  // string lights
  ctx.fillStyle = '#fff7c2'
  for (let i = 0; i < 10; i++) ctx.fillRect(bx + (bw / 10) * i + 4, ay - 6 + Math.sin(i) * 2, 3, 3)
  ctx.fillStyle = '#4b5563'
  ctx.fillRect(x, base, w, h - (base - y))
}

const drawHotel: SceneFn = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, '#3b1f78', '#ff9fb8')
  glowDisc(ctx, x + w * 0.78, y + h * 0.5, h * 0.08, '#ffd6a5')
  const base = y + h * 0.84
  skyline(ctx, x, base, w, h * 0.15, h * 0.35, '#6a3f8f', rand, '#ffd29a')
  const bw = w * 0.34
  const bx = x + w * 0.33
  tower(ctx, bx, base, bw, h * 0.66, ['#f5e6ff', '#b69ad6'], '#ffe7a8', rand, { crown: true, cols: 4 })
  // neon sign
  ctx.fillStyle = '#ff4fa3'
  ctx.shadowColor = '#ff4fa3'
  ctx.shadowBlur = 10
  ctx.font = `900 ${h * 0.075}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('HOTEL', bx + bw / 2, base - h * 0.58)
  ctx.shadowBlur = 0
  // pool
  ctx.fillStyle = '#35d0f5'
  ctx.fillRect(x, base, w, h - (base - y))
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (let i = 0; i < 5; i++) ctx.fillRect(x + rand() * w, base + 4 + rand() * (h - (base - y) - 6), 14, 2)
  palm(ctx, x + w * 0.14, base + 2, h * 0.36)
  palm(ctx, x + w * 0.88, base + 2, h * 0.3)
}

const drawCinema: SceneFn = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, '#0f0a2e', '#5b2a86')
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 18; i++) ctx.fillRect(x + rand() * w, y + rand() * h * 0.4, 2, 2)
  // spotlight beams
  ctx.fillStyle = 'rgba(180,220,255,0.18)'
  ctx.beginPath()
  ctx.moveTo(x + w * 0.2, y + h * 0.7)
  ctx.lineTo(x + w * 0.02, y)
  ctx.lineTo(x + w * 0.16, y)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + w * 0.8, y + h * 0.7)
  ctx.lineTo(x + w * 0.86, y)
  ctx.lineTo(x + w * 0.98, y)
  ctx.fill()
  const base = y + h * 0.88
  const bx = x + w * 0.08
  const bw = w * 0.84
  const bh = h * 0.55
  ctx.fillStyle = vGrad(ctx, base - bh, base, [
    [0, '#2a1e4a'],
    [1, '#120b26'],
  ])
  ctx.fillRect(bx, base - bh, bw, bh)
  // marquee
  const my = base - bh * 0.72
  ctx.fillStyle = '#ec4899'
  ctx.shadowColor = '#ec4899'
  ctx.shadowBlur = 14
  ctx.fillRect(bx - 6, my, bw + 12, bh * 0.22)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#fef08a'
  for (let i = 0; i < 16; i++) {
    ctx.beginPath()
    ctx.arc(bx - 2 + ((bw + 4) / 15) * i, my + 3, 2.2, 0, Math.PI * 2)
    ctx.arc(bx - 2 + ((bw + 4) / 15) * i, my + bh * 0.22 - 3, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 ${h * 0.085}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CINEMA', bx + bw / 2, my + bh * 0.11)
  // posters
  const colors = ['#f97316', '#22d3ee', '#a3e635']
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = colors[i]
    ctx.fillRect(bx + bw * (0.1 + i * 0.3), base - bh * 0.4, bw * 0.2, bh * 0.32)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(bx + bw * (0.1 + i * 0.3), base - bh * 0.18, bw * 0.2, bh * 0.1)
  }
  ctx.fillStyle = '#1f1535'
  ctx.fillRect(x, base, w, h - (base - y))
}

const drawMall: SceneFn = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, '#38bdf8', '#e0f7ff')
  glowDisc(ctx, x + w * 0.15, y + h * 0.18, h * 0.06, '#fffbe6')
  const base = y + h * 0.86
  skyline(ctx, x, base, w, h * 0.25, h * 0.5, '#9ccbe8', rand)
  const bx = x + w * 0.06
  const bw = w * 0.88
  const bh = h * 0.36
  ctx.fillStyle = vGrad(ctx, base - bh, base, [
    [0, '#f8fafc'],
    [1, '#cbd5e1'],
  ])
  ctx.fillRect(bx, base - bh, bw, bh)
  // glass dome
  ctx.fillStyle = vGrad(ctx, base - bh - bw * 0.25, base - bh, [
    [0, '#a5f3fc'],
    [1, '#0891b2'],
  ])
  ctx.beginPath()
  ctx.ellipse(bx + bw / 2, base - bh, bw * 0.3, bw * 0.24, 0, Math.PI, 0)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 1.5
  for (let i = 1; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(bx + bw / 2 + (i - 2.5) * bw * 0.11, base - bh)
    ctx.quadraticCurveTo(bx + bw / 2 + (i - 2.5) * bw * 0.06, base - bh - bw * 0.2, bx + bw / 2, base - bh - bw * 0.24)
    ctx.stroke()
  }
  // glass storefront band
  ctx.fillStyle = '#0e7490'
  ctx.fillRect(bx + 6, base - bh * 0.55, bw - 12, bh * 0.4)
  windowsGrid(ctx, bx + 6, base - bh * 0.55, bw - 12, bh * 0.4, 7, 1, '#cffafe', '#155e75', rand, 0.8)
  // banners
  const bc = ['#ef4444', '#f59e0b', '#8b5cf6', '#22c55e']
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = bc[i]
    ctx.fillRect(bx + bw * (0.12 + i * 0.22), base - bh * 0.95, bw * 0.08, bh * 0.3)
  }
  ctx.fillStyle = '#64748b'
  ctx.fillRect(x, base, w, h - (base - y))
  tree(ctx, x + w * 0.06, base + 2, h * 0.14)
  tree(ctx, x + w * 0.94, base + 2, h * 0.14)
}

const drawStore: SceneFn = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, '#7dd3fc', '#fff4d6')
  const base = y + h * 0.86
  // hills
  ctx.fillStyle = '#86efac'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.3, base, w * 0.5, h * 0.25, 0, Math.PI, 0)
  ctx.ellipse(x + w * 0.85, base, w * 0.4, h * 0.2, 0, Math.PI, 0)
  ctx.fill()
  const shops = 3
  const colors: [string, string][] = [
    ['#fde68a', '#16a34a'],
    ['#fecaca', '#dc2626'],
    ['#bfdbfe', '#2563eb'],
  ]
  for (let i = 0; i < shops; i++) {
    const sw = w / shops - 6
    const sx = x + 3 + i * (sw + 6)
    const sh = h * (0.36 + rand() * 0.14)
    ctx.fillStyle = colors[i][0]
    ctx.fillRect(sx, base - sh, sw, sh)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(sx + sw * 0.15, base - sh * 0.45, sw * 0.7, sh * 0.3)
    ctx.fillStyle = 'rgba(56,189,248,0.5)'
    ctx.fillRect(sx + sw * 0.2, base - sh * 0.42, sw * 0.6, sh * 0.24)
    for (let s = 0; s < 4; s++) {
      ctx.fillStyle = s % 2 ? '#ffffff' : colors[i][1]
      ctx.fillRect(sx - 2 + ((sw + 4) / 4) * s, base - sh * 0.62, (sw + 4) / 4, sh * 0.12)
    }
    ctx.fillStyle = colors[i][1]
    ctx.fillRect(sx + sw * 0.35, base - sh * 0.15, sw * 0.3, sh * 0.15)
  }
  ctx.fillStyle = '#d6d3d1'
  ctx.fillRect(x, base, w, h - (base - y))
  tree(ctx, x + w * 0.5, base + 2, h * 0.12, '#16a34a')
}

const drawFactory: SceneFn = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, '#f97316', '#fde68a')
  glowDisc(ctx, x + w * 0.7, y + h * 0.42, h * 0.1, '#fff1c1')
  const base = y + h * 0.86
  skyline(ctx, x, base, w, h * 0.12, h * 0.3, '#c2410c', rand)
  // chimneys + smoke
  for (let i = 0; i < 2; i++) {
    const cx = x + w * (0.2 + i * 0.22)
    ctx.fillStyle = '#57534e'
    ctx.fillRect(cx, base - h * 0.62, w * 0.06, h * 0.62)
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(cx, base - h * 0.58, w * 0.06, h * 0.03)
    ctx.fillStyle = 'rgba(245,245,244,0.7)'
    for (let s = 0; s < 4; s++) {
      ctx.beginPath()
      ctx.arc(cx + w * 0.03 + s * 8, base - h * 0.66 - s * 12, 7 + s * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // sawtooth hall
  const hx = x + w * 0.08
  const hw = w * 0.84
  const hh = h * 0.28
  ctx.fillStyle = '#78716c'
  ctx.fillRect(hx, base - hh, hw, hh)
  ctx.fillStyle = '#a8a29e'
  const teeth = 5
  for (let i = 0; i < teeth; i++) {
    ctx.beginPath()
    ctx.moveTo(hx + (hw / teeth) * i, base - hh)
    ctx.lineTo(hx + (hw / teeth) * i, base - hh - h * 0.1)
    ctx.lineTo(hx + (hw / teeth) * (i + 1), base - hh)
    ctx.fill()
  }
  windowsGrid(ctx, hx + 4, base - hh + 6, hw - 8, hh * 0.4, 8, 1, '#fde68a', '#44403c', rand, 0.8)
  // containers
  const cc = ['#2563eb', '#dc2626', '#16a34a']
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = cc[i]
    ctx.fillRect(x + w * (0.55 + i * 0.13), base - h * 0.08, w * 0.12, h * 0.08)
  }
  ctx.fillStyle = '#44403c'
  ctx.fillRect(x, base, w, h - (base - y))
}

const SCENES: Record<PropertyCategory, SceneFn> = {
  OFFICE: drawOffice,
  RESTAURANT: drawRestaurant,
  HOTEL: drawHotel,
  CINEMA: drawCinema,
  MALL: drawMall,
  STORE: drawStore,
  FACTORY: drawFactory,
  TRAVEL: drawHotel,
  TRANSIT: drawFactory,
  MEDIA: drawOffice,
}

// ---------------------------------------------------------------- text helpers

function fitLines(ctx: Ctx, text: string, maxW: number, maxSize: number, minSize: number, weight = 900): { lines: string[]; size: number } {
  const words = text.toUpperCase().split(' ')
  for (let size = maxSize; size >= minSize; size -= 1) {
    ctx.font = `${weight} ${size}px ${FONT}`
    if (ctx.measureText(words.join(' ')).width <= maxW) return { lines: [words.join(' ')], size }
    if (words.length > 1) {
      let best: string[] | null = null
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ')
        const b = words.slice(i).join(' ')
        if (ctx.measureText(a).width <= maxW && ctx.measureText(b).width <= maxW) {
          best = [a, b]
          break
        }
      }
      if (best && size <= maxSize * 0.86) return { lines: best, size }
    }
  }
  ctx.font = `${weight} ${minSize}px ${FONT}`
  return { lines: [text.toUpperCase()], size: minSize }
}

function drawCardBase(ctx: Ctx, W: number, H: number, top = '#ffffff', bottom = '#e6ebf5') {
  ctx.clearRect(0, 0, W, H)
  rr(ctx, 3, 3, W - 6, H - 6, 26)
  ctx.fillStyle = vGrad(ctx, 0, H, [
    [0, top],
    [1, bottom],
  ])
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.stroke()
}

function contentRect(W: number, H: number, edge: InnerEdge, strip: number) {
  const pad = 14
  let x = pad
  let y = pad
  let w = W - pad * 2
  let h = H - pad * 2
  if (edge === 'top') {
    y += strip
    h -= strip
  } else if (edge === 'bottom') {
    h -= strip
  } else if (edge === 'left') {
    x += strip
    w -= strip
  } else {
    w -= strip
  }
  return { x, y, w, h }
}

function drawStrip(ctx: Ctx, W: number, H: number, edge: InnerEdge, strip: number, color: string) {
  ctx.save()
  rr(ctx, 3, 3, W - 6, H - 6, 26)
  ctx.clip()
  let x = 0
  let y = 0
  let w = W
  let h = strip + 6
  if (edge === 'bottom') y = H - h
  if (edge === 'left' || edge === 'right') {
    w = strip + 6
    h = H
    if (edge === 'right') x = W - w
  }
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  const gloss = edge === 'top' || edge === 'bottom' ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0)
  gloss.addColorStop(0, 'rgba(255,255,255,0.45)')
  gloss.addColorStop(0.5, 'rgba(255,255,255,0.05)')
  gloss.addColorStop(1, 'rgba(0,0,0,0.18)')
  ctx.fillStyle = gloss
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

function drawNamePrice(ctx: Ctx, name: string, price: string | null, x: number, y: number, w: number, h: number, accent: string) {
  const nameBlock = price ? h * 0.6 : h
  const { lines, size } = fitLines(ctx, name, w - 8, Math.min(46, nameBlock * 0.62), 20)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0f1b3d'
  ctx.font = `900 ${size}px ${FONT}`
  const lh = size * 1.02
  const startY = y + nameBlock / 2 - ((lines.length - 1) * lh) / 2
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, startY + i * lh))
  if (price) {
    const ps = Math.min(46, h * 0.36)
    ctx.font = `900 ${ps}px ${FONT}`
    ctx.fillStyle = accent
    ctx.fillText(price, x + w / 2, y + nameBlock + (h - nameBlock) / 2)
  }
}

// ---------------------------------------------------------------- special tiles

function questionMark(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.font = `900 ${s}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = s * 0.08
  ctx.strokeStyle = '#ffffff'
  ctx.shadowColor = 'rgba(124,58,237,0.6)'
  ctx.shadowBlur = s * 0.15
  ctx.strokeText('?', cx, cy)
  ctx.shadowBlur = 0
  const g = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2)
  g.addColorStop(0, '#c084fc')
  g.addColorStop(1, '#6d28d9')
  ctx.fillStyle = g
  ctx.fillText('?', cx, cy)
}

function chest(ctx: Ctx, cx: number, cy: number, s: number) {
  const w = s
  const h = s * 0.62
  const x = cx - w / 2
  const y = cy - h / 2 + s * 0.1
  ctx.fillStyle = '#1d4ed8'
  rr(ctx, x, y, w, h, s * 0.06)
  ctx.fill()
  ctx.fillStyle = '#3b82f6'
  ctx.beginPath()
  ctx.ellipse(cx, y, w / 2, h * 0.42, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(x, y - 2, w, s * 0.07)
  ctx.fillRect(x + w * 0.15, y - h * 0.4, w * 0.08, h * 1.4)
  ctx.fillRect(x + w * 0.77, y - h * 0.4, w * 0.08, h * 1.4)
  rr(ctx, cx - s * 0.1, y - s * 0.02, s * 0.2, s * 0.22, 4)
  ctx.fill()
  ctx.fillStyle = '#fef3c7'
  ctx.beginPath()
  ctx.arc(cx, y - h * 0.18, s * 0.05, 0, Math.PI * 2)
  ctx.fill()
}

function coinStack(ctx: Ctx, cx: number, cy: number, s: number) {
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#b45309'
    ctx.beginPath()
    ctx.ellipse(cx, cy - i * s * 0.14 + s * 0.05, s * 0.36, s * 0.13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.ellipse(cx, cy - i * s * 0.14, s * 0.36, s * 0.13, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#92400e'
  ctx.font = `900 ${s * 0.22}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('₹', cx, cy - s * 0.42)
}

function emojiArt(ctx: Ctx, emoji: string, cx: number, cy: number, s: number) {
  ctx.font = `${s}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, cx, cy)
}

function drawSimpleSide(ctx: Ctx, W: number, H: number, tile: SimpleTile, edge: InnerEdge) {
  const strip = Math.min(W, H) * 0.07
  const palette: Record<string, [string, string, string]> = {
    CHANCE: ['#f5edff', '#dccbff', '#7c3aed'],
    COMMUNITY: ['#fff8e6', '#ffe3a3', '#1d4ed8'],
    TAX: ['#eef2f7', '#cfd8e6', '#b45309'],
    CLUB: ['#fdf2f8', '#fbcfe8', '#be185d'],
  }
  const [top, bottom, accent] = palette[tile.type] ?? ['#ffffff', '#e5e7eb', '#334155']
  drawCardBase(ctx, W, H, top, bottom)
  drawStrip(ctx, W, H, edge, strip, accent)
  const r = contentRect(W, H, edge, strip)
  const artH = r.h * 0.64
  const cx = r.x + r.w / 2
  const cy = r.y + artH / 2
  if (tile.type === 'CHANCE') questionMark(ctx, cx, cy + 4, artH * 0.95)
  else if (tile.type === 'COMMUNITY') chest(ctx, cx, cy, Math.min(r.w * 0.7, artH * 0.9))
  else if (tile.type === 'CLUB') emojiArt(ctx, tile.name === 'Milk Bar' ? '🥛' : '🎩', cx, cy, Math.min(r.w * 0.6, artH * 0.8))
  else coinStack(ctx, cx, cy + artH * 0.18, Math.min(r.w * 0.7, artH))
  drawNamePrice(ctx, tile.name, tile.type === 'TAX' ? '₹50 each' : null, r.x, r.y + artH, r.w, r.h - artH, accent)
}

function drawCorner(ctx: Ctx, S: number, tile: SimpleTile, goBonus: number) {
  const themes: Record<string, [string, string]> = {
    GO: ['#fef08a', '#eab308'],
    JAIL: ['#fef9c3', '#fde047'],
    PARK: ['#d1fae5', '#6ee7b7'],
    EVENT: ['#f0abfc', '#7c3aed'],
    GO_TO_JAIL: ['#e0e7ff', '#c7d2fe'],
  }
  const [a, b] = themes[tile.type] ?? ['#ffffff', '#cbd5e1']
  ctx.clearRect(0, 0, S, S)
  rr(ctx, 3, 3, S - 6, S - 6, 34)
  const g = ctx.createLinearGradient(0, 0, S, S)
  g.addColorStop(0, a)
  g.addColorStop(1, b)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (tile.type === 'GO') {
    // sweeping arrow
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = S * 0.06
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(S * 0.5, S * 0.62, S * 0.34, Math.PI * 1.05, Math.PI * 1.62)
    ctx.stroke()
    ctx.fillStyle = '#dc2626'
    ctx.beginPath()
    ctx.moveTo(S * 0.66, S * 0.2)
    ctx.lineTo(S * 0.8, S * 0.33)
    ctx.lineTo(S * 0.6, S * 0.37)
    ctx.fill()
    ctx.font = `italic 900 ${S * 0.36}px ${FONT}`
    ctx.lineWidth = S * 0.03
    ctx.strokeStyle = '#ffffff'
    ctx.strokeText('GO', S * 0.54, S * 0.5)
    ctx.fillStyle = '#b91c1c'
    ctx.fillText('GO', S * 0.54, S * 0.5)
    ctx.font = `900 ${S * 0.085}px ${FONT}`
    ctx.fillStyle = '#7c2d12'
    ctx.fillText('COLLECT', S * 0.5, S * 0.74)
    ctx.font = `900 ${S * 0.11}px ${FONT}`
    ctx.fillText(`₹${goBonus}`, S * 0.5, S * 0.86)
    return
  }
  if (tile.type === 'JAIL') {
    ctx.fillStyle = '#1f2937'
    rr(ctx, S * 0.26, S * 0.14, S * 0.48, S * 0.44, 10)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    rr(ctx, S * 0.3, S * 0.18, S * 0.4, S * 0.36, 6)
    ctx.fill()
    ctx.fillStyle = '#374151'
    for (let i = 0; i < 6; i++) ctx.fillRect(S * (0.32 + i * 0.065), S * 0.18, S * 0.024, S * 0.36)
    ctx.font = `900 ${S * 0.12}px ${FONT}`
    ctx.fillStyle = '#1f2937'
    ctx.fillText('JUST VISITING', S * 0.5, S * 0.76)
    return
  }
  if (tile.type === 'PARK') {
    // car
    const cy = S * 0.36
    ctx.fillStyle = '#ef4444'
    rr(ctx, S * 0.22, cy, S * 0.56, S * 0.14, 12)
    ctx.fill()
    rr(ctx, S * 0.32, cy - S * 0.1, S * 0.34, S * 0.14, 12)
    ctx.fill()
    ctx.fillStyle = '#bae6fd'
    rr(ctx, S * 0.36, cy - S * 0.07, S * 0.12, S * 0.08, 4)
    ctx.fill()
    rr(ctx, S * 0.5, cy - S * 0.07, S * 0.12, S * 0.08, 4)
    ctx.fill()
    ctx.fillStyle = '#111827'
    ctx.beginPath()
    ctx.arc(S * 0.33, cy + S * 0.15, S * 0.055, 0, Math.PI * 2)
    ctx.arc(S * 0.67, cy + S * 0.15, S * 0.055, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `900 ${S * 0.11}px ${FONT}`
    ctx.fillStyle = '#065f46'
    ctx.fillText('FREE PARKING', S * 0.5, S * 0.76)
    return
  }
  if (tile.type === 'GO_TO_JAIL') {
    // Police Officer
    const cx = S * 0.5
    const cy = S * 0.34
    // police cap
    ctx.fillStyle = '#1e3a8a'
    ctx.beginPath()
    ctx.ellipse(cx, cy - S * 0.1, S * 0.18, S * 0.09, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.ellipse(cx, cy - S * 0.06, S * 0.2, S * 0.04, 0, 0, Math.PI * 2)
    ctx.fill()
    // gold badge on cap
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.arc(cx, cy - S * 0.1, S * 0.035, 0, Math.PI * 2)
    ctx.fill()
    // face
    ctx.fillStyle = '#fcd34d'
    ctx.beginPath()
    ctx.arc(cx, cy + S * 0.02, S * 0.11, 0, Math.PI * 2)
    ctx.fill()
    // eyes
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(cx - S * 0.05, cy, S * 0.022, S * 0.022)
    ctx.fillRect(cx + S * 0.03, cy, S * 0.022, S * 0.022)
    // uniform collar
    ctx.fillStyle = '#1e3a8a'
    ctx.beginPath()
    ctx.moveTo(cx - S * 0.16, cy + S * 0.16)
    ctx.lineTo(cx + S * 0.16, cy + S * 0.16)
    ctx.lineTo(cx, cy + S * 0.07)
    ctx.closePath()
    ctx.fill()
    ctx.font = `900 ${S * 0.115}px ${FONT}`
    ctx.fillStyle = '#1e3a8a'
    ctx.fillText('GO TO JAIL', cx, S * 0.76)
    return
  }
  // EVENT
  ctx.fillStyle = '#fef9c3'
  ctx.shadowColor = '#fde047'
  ctx.shadowBlur = 18
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2
    ctx.save()
    ctx.translate(S * 0.5, S * 0.34)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.moveTo(0, -S * 0.2)
    ctx.lineTo(S * 0.035, 0)
    ctx.lineTo(-S * 0.035, 0)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(S * 0.5, S * 0.34, S * 0.07, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.font = `900 ${S * 0.12}px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText('CITY', S * 0.5, S * 0.66)
  ctx.fillText('EVENT', S * 0.5, S * 0.79)
}

// ---------------------------------------------------------------- public API

const cache = new Map<string, HTMLCanvasElement>()

export function tileCanvas(tile: CityTile, shape: CardShape, edge: InnerEdge, goBonus = 200): HTMLCanvasElement {
  const key = `${tile.id}-${shape}-${edge}-${goBonus}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = shape === 'portrait' ? SHORT : LONG
  const H = shape === 'landscape' ? SHORT : LONG
  const [canvas, ctx] = makeCanvas(W, H)

  if (shape === 'corner' && tile.type !== 'PROPERTY') {
    drawCorner(ctx, W, tile, goBonus)
  } else if (tile.type === 'PROPERTY') {
    drawPropertyCard(ctx, W, H, tile, edge)
  } else {
    drawSimpleSide(ctx, W, H, tile, edge)
  }
  cache.set(key, canvas)
  return canvas
}

function drawPropertyCard(ctx: Ctx, W: number, H: number, tile: PropertyTile, edge: InnerEdge) {
  const accent = CATEGORY_TINT[tile.category]
  const strip = Math.min(W, H) * 0.08
  drawCardBase(ctx, W, H)
  drawStrip(ctx, W, H, edge, strip, accent)
  const r = contentRect(W, H, edge, strip)
  const artH = r.h * 0.63
  ctx.save()
  rr(ctx, r.x, r.y, r.w, artH, 16)
  ctx.clip()
  ;(CITY_SCENES[tile.name] ?? SCENES[tile.category])(ctx, r.x, r.y, r.w, artH, mulberry32(tile.id * 97 + 13))
  // glossy top sheen on the illustration
  const sheen = ctx.createLinearGradient(0, r.y, 0, r.y + artH)
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)')
  sheen.addColorStop(0.35, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(r.x, r.y, r.w, artH)
  ctx.restore()
  rr(ctx, r.x, r.y, r.w, artH, 16)
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(15,27,61,0.25)'
  ctx.stroke()
  // category badge, so events like "hotels earn +50%" still map onto the city cards
  const chip = Math.min(r.w, artH) * 0.2
  rr(ctx, r.x + 8, r.y + 8, chip, chip, chip * 0.3)
  ctx.fillStyle = 'rgba(8,14,40,0.72)'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = accent
  ctx.stroke()
  ctx.font = `${chip * 0.62}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(CATEGORY_ICON[tile.category], r.x + 8 + chip / 2, r.y + 8 + chip / 2 + 1)
  drawNamePrice(ctx, tile.name, `₹${tile.basePrice}`, r.x, r.y + artH + 4, r.w, r.h - artH - 4, darken(accent))
}

function darken(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * 0.72)
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

const urlCache = new Map<number, string>()

/** Portrait card art as a data URL, for HTML panels (buy card, build list, toasts). */
export function tileArtUrl(tile: CityTile): string {
  const hit = urlCache.get(tile.id)
  if (hit) return hit
  const url = tileCanvas(tile, 'portrait', 'top').toDataURL('image/png')
  urlCache.set(tile.id, url)
  return url
}

/** Small floating district name tag, like a map label. */
export function labelCanvas(text: string, accent: string): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(320, 96)
  rr(ctx, 6, 10, 308, 76, 22)
  ctx.fillStyle = 'rgba(8,14,40,0.88)'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = accent
  ctx.stroke()
  ctx.font = `800 40px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, 160, 50)
  return canvas
}

/** Round owner marker floating above an owned property: player colour ring + avatar. */
export function ownerBadgeCanvas(color: string, emoji: string): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(160, 160)
  const g = ctx.createRadialGradient(80, 64, 10, 80, 80, 74)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.55, color)
  g.addColorStop(1, color)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(80, 80, 70, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.font = `76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 80, 86)
  return canvas
}
