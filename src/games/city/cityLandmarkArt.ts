// Hand-drawn (canvas) postcard illustrations of each world city for the property cards: a sky mood,
// a layered skyline, the city's signature landmark and its water or ground, so every tile reads as
// a real place at a glance.

type Ctx = CanvasRenderingContext2D
type Rand = () => number
type Scene = (ctx: Ctx, x: number, y: number, w: number, h: number, rand: Rand) => void

/* ---------------------------------------------------------------- primitives */

function grad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}

function sky(ctx: Ctx, x: number, y: number, w: number, h: number, stops: [number, string][]) {
  ctx.fillStyle = grad(ctx, 0, y, 0, y + h, stops)
  ctx.fillRect(x, y, w, h)
}

function glow(ctx: Ctx, cx: number, cy: number, r: number, color: string, core = '#ffffff') {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6)
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function stars(ctx: Ctx, x: number, y: number, w: number, h: number, n: number, rand: Rand) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (let i = 0; i < n; i++) ctx.fillRect(x + rand() * w, y + rand() * h, 1.6, 1.6)
}

/** Row of background blocks with scattered lit windows. */
function skyline(ctx: Ctx, x: number, base: number, w: number, minH: number, maxH: number, color: string, rand: Rand, lit?: string) {
  let cx = x - 4
  while (cx < x + w) {
    const bw = 12 + rand() * 22
    const bh = minH + rand() * (maxH - minH)
    ctx.fillStyle = color
    ctx.fillRect(cx, base - bh, bw, bh)
    if (lit) {
      ctx.fillStyle = lit
      for (let wy = base - bh + 5; wy < base - 5; wy += 7)
        for (let wx = cx + 3; wx < cx + bw - 3; wx += 6) if (rand() > 0.55) ctx.fillRect(wx, wy, 2.4, 3)
    }
    cx += bw + 1
  }
}

function tower(ctx: Ctx, x: number, base: number, w: number, h: number, body: [string, string], lit: string, rand: Rand) {
  ctx.fillStyle = grad(ctx, x, 0, x + w, 0, [
    [0, body[0]],
    [1, body[1]],
  ])
  ctx.fillRect(x, base - h, w, h)
  ctx.fillStyle = lit
  for (let wy = base - h + 6; wy < base - 4; wy += 8)
    for (let wx = x + 3; wx < x + w - 3; wx += 6) if (rand() > 0.35) ctx.fillRect(wx, wy, 2.6, 3.6)
}

function water(ctx: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string, shine: string, rand: Rand) {
  ctx.fillStyle = grad(ctx, 0, y, 0, y + h, [
    [0, top],
    [1, bottom],
  ])
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = shine
  for (let i = 0; i < 14; i++) ctx.fillRect(x + rand() * w, y + 3 + rand() * (h - 5), 6 + rand() * 12, 1.6)
}

function ground(ctx: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string) {
  ctx.fillStyle = grad(ctx, 0, y, 0, y + h, [
    [0, top],
    [1, bottom],
  ])
  ctx.fillRect(x, y, w, h)
}

function palm(ctx: Ctx, x: number, base: number, s: number) {
  ctx.strokeStyle = '#6b4226'
  ctx.lineWidth = s * 0.07
  ctx.beginPath()
  ctx.moveTo(x, base)
  ctx.quadraticCurveTo(x + s * 0.12, base - s * 0.5, x + s * 0.05, base - s)
  ctx.stroke()
  ctx.fillStyle = '#1f8a4c'
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.7
    ctx.beginPath()
    ctx.ellipse(x + s * 0.05 + Math.cos(a) * s * 0.22, base - s + Math.sin(a) * s * 0.12, s * 0.26, s * 0.06, a, 0, Math.PI * 2)
    ctx.fill()
  }
}

function poly(ctx: Ctx, pts: [number, number][], fill: string | CanvasGradient) {
  ctx.fillStyle = fill
  ctx.beginPath()
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  ctx.closePath()
  ctx.fill()
}

/** Lattice tower (Eiffel / Tokyo Tower): tapered legs with cross bracing. */
function latticeTower(ctx: Ctx, cx: number, base: number, h: number, w: number, color: string, alt?: string) {
  const top = base - h
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  const halfAt = (t: number) => (w / 2) * Math.pow(1 - t, 1.9) + 1.5
  ctx.lineWidth = Math.max(2, w * 0.05)
  ctx.beginPath()
  ctx.moveTo(cx - w / 2, base)
  for (let i = 1; i <= 20; i++) {
    const t = i / 20
    ctx.lineTo(cx - halfAt(t), base - h * t)
  }
  ctx.moveTo(cx + w / 2, base)
  for (let i = 1; i <= 20; i++) {
    const t = i / 20
    ctx.lineTo(cx + halfAt(t), base - h * t)
  }
  ctx.stroke()
  ctx.lineWidth = Math.max(1, w * 0.025)
  for (let i = 0; i < 12; i++) {
    const t0 = i / 12
    const t1 = (i + 1) / 12
    ctx.strokeStyle = alt && i % 2 ? alt : color
    ctx.beginPath()
    ctx.moveTo(cx - halfAt(t0), base - h * t0)
    ctx.lineTo(cx + halfAt(t1), base - h * t1)
    ctx.moveTo(cx + halfAt(t0), base - h * t0)
    ctx.lineTo(cx - halfAt(t1), base - h * t1)
    ctx.stroke()
  }
  // observation decks
  ctx.fillStyle = alt ?? color
  for (const t of [0.28, 0.58]) ctx.fillRect(cx - halfAt(t) - 3, base - h * t - 2, halfAt(t) * 2 + 6, 4)
  // arch between the legs
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, w * 0.035)
  ctx.beginPath()
  ctx.arc(cx, base, w * 0.26, Math.PI, 0)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.lineTo(cx, top - h * 0.08)
  ctx.stroke()
}

/* ---------------------------------------------------------------- cities */

const newYork: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#0b1a4a'],
    [0.6, '#3b3f9e'],
    [1, '#f59e9e'],
  ])
  stars(ctx, x, y, w, h * 0.4, 20, rand)
  const base = y + h * 0.8
  skyline(ctx, x, base, w, h * 0.15, h * 0.4, '#27306e', rand, '#ffd97a')
  // Empire State Building
  const ex = x + w * 0.56
  const ew = w * 0.16
  tower(ctx, ex, base, ew, h * 0.42, ['#8ea3c9', '#4b5b86'], '#fff2b0', rand)
  tower(ctx, ex + ew * 0.15, base - h * 0.42, ew * 0.7, h * 0.12, ['#9cb0d4', '#56668f'], '#fff2b0', rand)
  tower(ctx, ex + ew * 0.3, base - h * 0.54, ew * 0.4, h * 0.08, ['#a9bcdc', '#63739b'], '#fff2b0', rand)
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(ex + ew * 0.46, base - h * 0.74, ew * 0.08, h * 0.12)
  glow(ctx, ex + ew * 0.5, base - h * 0.74, 2.5, 'rgba(255,80,80,0.8)', '#ff6b6b')
  // Statue of Liberty on its island
  const sx = x + w * 0.2
  const sb = base + h * 0.05
  ctx.fillStyle = '#56736b'
  ctx.fillRect(sx - w * 0.05, sb - h * 0.1, w * 0.1, h * 0.1)
  poly(ctx, [
    [sx - w * 0.04, sb - h * 0.1],
    [sx + w * 0.04, sb - h * 0.1],
    [sx + w * 0.02, sb - h * 0.34],
    [sx - w * 0.02, sb - h * 0.34],
  ], grad(ctx, sx - 10, 0, sx + 10, 0, [
    [0, '#7fd1b9'],
    [1, '#3f8f7a'],
  ]))
  ctx.fillStyle = '#6fc2aa'
  ctx.beginPath()
  ctx.arc(sx, sb - h * 0.37, w * 0.022, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6fc2aa'
  ctx.lineWidth = w * 0.016
  ctx.beginPath()
  ctx.moveTo(sx + w * 0.015, sb - h * 0.32)
  ctx.lineTo(sx + w * 0.03, sb - h * 0.47)
  ctx.stroke()
  glow(ctx, sx + w * 0.03, sb - h * 0.5, 3, 'rgba(255,200,80,0.9)', '#ffe29a')
  water(ctx, x, base, w, h - (base - y), '#1d2f6b', '#0c1638', 'rgba(255,217,122,0.45)', rand)
  ctx.fillStyle = '#3d5a4f'
  ctx.beginPath()
  ctx.ellipse(sx, base + h * 0.05, w * 0.11, h * 0.035, 0, 0, Math.PI * 2)
  ctx.fill()
}

const london: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#5f7fb8'],
    [0.7, '#c9d7ec'],
    [1, '#f3e3c3'],
  ])
  const base = y + h * 0.8
  skyline(ctx, x, base, w, h * 0.12, h * 0.3, '#8a9bbd', rand)
  // London Eye
  const lx = x + w * 0.74
  const ly = base - h * 0.32
  const r = h * 0.28
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(lx, ly, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.lineTo(lx + Math.cos(a) * r, ly + Math.sin(a) * r)
    ctx.stroke()
    ctx.fillStyle = '#e0f2fe'
    ctx.fillRect(lx + Math.cos(a) * r - 2.5, ly + Math.sin(a) * r - 2, 5, 4)
  }
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(lx - r * 0.35, base)
  ctx.lineTo(lx, ly)
  ctx.lineTo(lx + r * 0.35, base)
  ctx.stroke()
  // Big Ben
  const bx = x + w * 0.26
  const bw = w * 0.12
  ctx.fillStyle = grad(ctx, bx, 0, bx + bw, 0, [
    [0, '#e7c98f'],
    [1, '#a8803f'],
  ])
  ctx.fillRect(bx, base - h * 0.55, bw, h * 0.55)
  ctx.fillStyle = '#8a6a33'
  for (let i = 0; i < 6; i++) ctx.fillRect(bx + 2, base - h * 0.5 + i * h * 0.075, bw - 4, 2)
  ctx.fillStyle = '#f5e7c4'
  ctx.fillRect(bx - 2, base - h * 0.68, bw + 4, h * 0.13)
  glow(ctx, bx + bw / 2, base - h * 0.615, bw * 0.3, 'rgba(255,240,190,0.7)', '#fff8e1')
  ctx.strokeStyle = '#3b2f1a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(bx + bw / 2, base - h * 0.615)
  ctx.lineTo(bx + bw / 2, base - h * 0.655)
  ctx.moveTo(bx + bw / 2, base - h * 0.615)
  ctx.lineTo(bx + bw * 0.7, base - h * 0.615)
  ctx.stroke()
  poly(ctx, [
    [bx - 2, base - h * 0.68],
    [bx + bw + 2, base - h * 0.68],
    [bx + bw / 2, base - h * 0.9],
  ], '#3f4a5e')
  // Parliament wing
  ctx.fillStyle = '#c9a766'
  ctx.fillRect(x, base - h * 0.16, bx - x, h * 0.16)
  for (let i = 0; i < 6; i++) poly(ctx, [
    [x + i * ((bx - x) / 6), base - h * 0.16],
    [x + (i + 0.5) * ((bx - x) / 6), base - h * 0.23],
    [x + (i + 1) * ((bx - x) / 6), base - h * 0.16],
  ], '#b08d4d')
  water(ctx, x, base, w, h - (base - y), '#6b8bb5', '#35507a', 'rgba(255,255,255,0.4)', rand)
  // red double-decker bus on the bridge
  ctx.fillStyle = '#475569'
  ctx.fillRect(x, base - 2, w, 4)
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(x + w * 0.44, base - h * 0.11, w * 0.14, h * 0.09)
  ctx.fillStyle = '#fde68a'
  ctx.fillRect(x + w * 0.45, base - h * 0.1, w * 0.12, h * 0.025)
  ctx.fillRect(x + w * 0.45, base - h * 0.065, w * 0.12, h * 0.025)
}

const paris: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#3a2a7a'],
    [0.55, '#c05b8d'],
    [1, '#ffc27a'],
  ])
  glow(ctx, x + w * 0.2, y + h * 0.55, h * 0.07, 'rgba(255,200,120,0.5)', '#ffe2a8')
  const base = y + h * 0.84
  skyline(ctx, x, base, w, h * 0.1, h * 0.2, '#6c3a78', rand, '#ffd29a')
  latticeTower(ctx, x + w * 0.52, base, h * 0.78, w * 0.36, '#ffcf6b')
  glow(ctx, x + w * 0.52, base - h * 0.8, 2.5, 'rgba(255,220,140,0.9)', '#fff4cc')
  ground(ctx, x, base, w, h - (base - y), '#4b2a5c', '#27163a')
  ctx.fillStyle = '#2f8a57'
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.arc(x + w * (0.05 + i * 0.15), base, h * 0.05, Math.PI, 0)
    ctx.fill()
  }
}

const tokyo: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#1b1446'],
    [0.6, '#6d3c9c'],
    [1, '#ff8fb1'],
  ])
  stars(ctx, x, y, w, h * 0.3, 14, rand)
  // Mt Fuji
  poly(ctx, [
    [x + w * 0.02, y + h * 0.78],
    [x + w * 0.3, y + h * 0.32],
    [x + w * 0.42, y + h * 0.32],
    [x + w * 0.72, y + h * 0.78],
  ], '#5d5b9e')
  poly(ctx, [
    [x + w * 0.24, y + h * 0.42],
    [x + w * 0.3, y + h * 0.32],
    [x + w * 0.42, y + h * 0.32],
    [x + w * 0.48, y + h * 0.42],
    [x + w * 0.4, y + h * 0.39],
    [x + w * 0.36, y + h * 0.43],
    [x + w * 0.31, y + h * 0.39],
  ], '#f1f5f9')
  const base = y + h * 0.84
  skyline(ctx, x, base, w, h * 0.15, h * 0.35, '#271c4f', rand, '#7df9ff')
  // neon signs
  const neon = ['#ff2e88', '#22d3ee', '#facc15']
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = neon[i % 3]
    ctx.shadowColor = neon[i % 3]
    ctx.shadowBlur = 8
    ctx.fillRect(x + w * (0.08 + i * 0.1), base - h * (0.18 + (i % 2) * 0.08), 4, h * 0.12)
  }
  ctx.shadowBlur = 0
  latticeTower(ctx, x + w * 0.72, base, h * 0.7, w * 0.24, '#ff4d2e', '#f8fafc')
  ground(ctx, x, base, w, h - (base - y), '#2a1f52', '#140e2e')
}

const dubai: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#1e3a8a'],
    [0.55, '#f59e0b'],
    [1, '#fde68a'],
  ])
  glow(ctx, x + w * 0.2, y + h * 0.62, h * 0.08, 'rgba(255,190,90,0.6)', '#fff3c4')
  const base = y + h * 0.84
  skyline(ctx, x, base, w, h * 0.15, h * 0.34, '#7a4a3a', rand, '#ffe7a3')
  // Burj Khalifa: stacked setbacks tapering into a spire
  const cx = x + w * 0.56
  const tiers = [0.2, 0.17, 0.14, 0.11, 0.085, 0.06, 0.04]
  let top = base
  tiers.forEach((tw, i) => {
    const th = h * 0.11
    ctx.fillStyle = grad(ctx, cx - w * tw * 0.5, 0, cx + w * tw * 0.5, 0, [
      [0, '#e2e8f0'],
      [0.5, '#94a3b8'],
      [1, '#475569'],
    ])
    ctx.fillRect(cx - (w * tw) / 2, top - th, w * tw, th)
    ctx.fillStyle = 'rgba(255,236,170,0.65)'
    for (let j = 0; j < 3; j++) ctx.fillRect(cx - (w * tw) / 2 + 2, top - th + 3 + j * (th / 3), w * tw - 4, 1.2)
    top -= th * (i === 0 ? 1 : 0.95)
  })
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.lineTo(cx, y + h * 0.02)
  ctx.stroke()
  glow(ctx, cx, y + h * 0.03, 2, 'rgba(255,90,90,0.8)', '#ff8a8a')
  // Burj Al Arab sail
  poly(ctx, [
    [x + w * 0.84, base],
    [x + w * 0.84, base - h * 0.42],
    [x + w * 0.95, base],
  ], grad(ctx, x + w * 0.84, 0, x + w * 0.95, 0, [
    [0, '#f8fafc'],
    [1, '#93c5fd'],
  ]))
  ground(ctx, x, base, w, h - (base - y), '#e8b86b', '#b9803c')
  palm(ctx, x + w * 0.1, base + 2, h * 0.28)
}

const singapore: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#0a1440'],
    [0.6, '#1e3a8a'],
    [1, '#7c3aed'],
  ])
  stars(ctx, x, y, w, h * 0.35, 16, rand)
  const base = y + h * 0.78
  skyline(ctx, x, base, w, h * 0.2, h * 0.42, '#1e2a5e', rand, '#a5f3fc')
  // Marina Bay Sands: three towers carrying the SkyPark
  for (let i = 0; i < 3; i++) {
    const tx = x + w * (0.3 + i * 0.14)
    poly(ctx, [
      [tx, base],
      [tx + w * 0.075, base],
      [tx + w * 0.065, base - h * 0.46],
      [tx + w * 0.01, base - h * 0.46],
    ], grad(ctx, tx, 0, tx + w * 0.075, 0, [
      [0, '#cbd5e1'],
      [1, '#64748b'],
    ]))
    ctx.fillStyle = 'rgba(165,243,252,0.8)'
    for (let j = 0; j < 8; j++) ctx.fillRect(tx + 3, base - h * 0.44 + j * h * 0.052, w * 0.06, 1.4)
  }
  poly(ctx, [
    [x + w * 0.26, base - h * 0.47],
    [x + w * 0.66, base - h * 0.49],
    [x + w * 0.7, base - h * 0.53],
    [x + w * 0.27, base - h * 0.51],
  ], '#e2e8f0')
  // Supertrees
  for (let i = 0; i < 3; i++) {
    const tx = x + w * (0.08 + i * 0.07)
    const th = h * (0.22 + (i % 2) * 0.06)
    ctx.fillStyle = '#6d28d9'
    ctx.fillRect(tx - 1.5, base - th, 3, th)
    ctx.fillStyle = '#e879f9'
    ctx.shadowColor = '#e879f9'
    ctx.shadowBlur = 10
    poly(ctx, [
      [tx - w * 0.035, base - th],
      [tx + w * 0.035, base - th],
      [tx, base - th + h * 0.05],
    ], '#e879f9')
    ctx.shadowBlur = 0
  }
  water(ctx, x, base, w, h - (base - y), '#1e3a8a', '#0b1030', 'rgba(165,243,252,0.5)', rand)
}

const mumbai: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#f97316'],
    [0.6, '#fdba74'],
    [1, '#fef3c7'],
  ])
  glow(ctx, x + w * 0.82, y + h * 0.35, h * 0.08, 'rgba(255,230,160,0.6)', '#fffbeb')
  const base = y + h * 0.8
  skyline(ctx, x, base, w, h * 0.14, h * 0.36, '#b45f3a', rand)
  // Gateway of India: central arch between two turreted wings
  const gx = x + w * 0.2
  const gw = w * 0.5
  const gh = h * 0.42
  ctx.fillStyle = grad(ctx, gx, 0, gx + gw, 0, [
    [0, '#f5d9a6'],
    [1, '#c9955a'],
  ])
  ctx.fillRect(gx, base - gh, gw, gh)
  ctx.fillStyle = '#7c4a24'
  ctx.beginPath()
  ctx.moveTo(gx + gw * 0.36, base)
  ctx.lineTo(gx + gw * 0.36, base - gh * 0.55)
  ctx.arc(gx + gw * 0.5, base - gh * 0.55, gw * 0.14, Math.PI, 0)
  ctx.lineTo(gx + gw * 0.64, base)
  ctx.fill()
  for (const side of [0.1, 0.9]) {
    ctx.beginPath()
    ctx.moveTo(gx + gw * (side - 0.05), base - gh * 0.1)
    ctx.lineTo(gx + gw * (side - 0.05), base - gh * 0.45)
    ctx.arc(gx + gw * side, base - gh * 0.45, gw * 0.05, Math.PI, 0)
    ctx.lineTo(gx + gw * (side + 0.05), base - gh * 0.1)
    ctx.fill()
  }
  ctx.fillStyle = '#e8c48c'
  for (const tx of [0.04, 0.3, 0.7, 0.96]) {
    ctx.fillRect(gx + gw * tx - 4, base - gh - h * 0.08, 8, h * 0.08)
    ctx.beginPath()
    ctx.arc(gx + gw * tx, base - gh - h * 0.08, 5, Math.PI, 0)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(gx + gw * 0.5, base - gh, gw * 0.1, Math.PI, 0)
  ctx.fill()
  // Taj hotel dome
  ctx.fillStyle = '#b91c1c'
  ctx.beginPath()
  ctx.arc(x + w * 0.84, base - h * 0.3, w * 0.07, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#f1dfc0'
  ctx.fillRect(x + w * 0.76, base - h * 0.3, w * 0.16, h * 0.3)
  water(ctx, x, base, w, h - (base - y), '#3b82c4', '#1e4b80', 'rgba(255,255,255,0.45)', rand)
}

const sydney: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#0ea5e9'],
    [0.7, '#7dd3fc'],
    [1, '#e0f2fe'],
  ])
  glow(ctx, x + w * 0.85, y + h * 0.18, h * 0.06, 'rgba(255,250,220,0.5)', '#fffbe6')
  const base = y + h * 0.76
  // Harbour Bridge
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x - 4, base - h * 0.08)
  ctx.quadraticCurveTo(x + w * 0.3, base - h * 0.62, x + w * 0.62, base - h * 0.08)
  ctx.stroke()
  ctx.lineWidth = 1
  for (let i = 1; i < 12; i++) {
    const t = i / 12
    const bx = x - 4 + t * (w * 0.62 + 4)
    const by = (1 - t) * (1 - t) * (base - h * 0.08) + 2 * (1 - t) * t * (base - h * 0.62) + t * t * (base - h * 0.08)
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx, base - h * 0.12)
    ctx.stroke()
  }
  ctx.fillStyle = '#334155'
  ctx.fillRect(x, base - h * 0.13, w * 0.66, 4)
  // Opera House sails
  const ox = x + w * 0.52
  ctx.fillStyle = '#d6c7a1'
  ctx.fillRect(ox - w * 0.02, base - h * 0.06, w * 0.46, h * 0.06)
  const sails: [number, number][] = [
    [0.02, 0.3],
    [0.12, 0.4],
    [0.22, 0.34],
    [0.32, 0.26],
  ]
  for (const [dx, sh] of sails) {
    poly(ctx, [
      [ox + w * dx, base - h * 0.06],
      [ox + w * (dx + 0.1), base - h * 0.06],
      [ox + w * (dx + 0.03), base - h * (0.06 + sh)],
    ], grad(ctx, 0, base - h * (0.06 + sh), 0, base, [
      [0, '#ffffff'],
      [1, '#cbd5e1'],
    ]))
  }
  water(ctx, x, base, w, h - (base - y), '#0284c7', '#075985', 'rgba(255,255,255,0.55)', rand)
}

const hongKong: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#0f172a'],
    [0.6, '#312e81'],
    [1, '#be185d'],
  ])
  stars(ctx, x, y, w, h * 0.3, 12, rand)
  // Victoria Peak
  ctx.fillStyle = '#1e1b4b'
  ctx.beginPath()
  ctx.moveTo(x, y + h * 0.6)
  ctx.quadraticCurveTo(x + w * 0.35, y + h * 0.18, x + w * 0.7, y + h * 0.5)
  ctx.quadraticCurveTo(x + w * 0.85, y + h * 0.4, x + w, y + h * 0.55)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.fill()
  const base = y + h * 0.78
  for (let i = 0; i < 9; i++) {
    const bw = w * (0.07 + rand() * 0.05)
    const bh = h * (0.25 + rand() * 0.35)
    tower(ctx, x + w * (i * 0.11), base, bw, bh, i % 2 ? ['#60a5fa', '#1e3a8a'] : ['#c4b5fd', '#4c1d95'], i % 3 ? '#fde68a' : '#67e8f9', rand)
  }
  // Bank of China style triangle-braced tower
  const bx = x + w * 0.46
  poly(ctx, [
    [bx, base],
    [bx + w * 0.1, base],
    [bx + w * 0.07, base - h * 0.62],
    [bx + w * 0.05, base - h * 0.7],
  ], '#94a3b8')
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const yy = base - i * h * 0.15
    ctx.beginPath()
    ctx.moveTo(bx, yy)
    ctx.lineTo(bx + w * 0.1, yy - h * 0.15)
    ctx.stroke()
  }
  water(ctx, x, base, w, h - (base - y), '#1e1b4b', '#0b0a26', 'rgba(253,230,138,0.5)', rand)
  // junk boat
  ctx.fillStyle = '#7c2d12'
  ctx.fillRect(x + w * 0.1, base + h * 0.08, w * 0.14, h * 0.03)
  poly(ctx, [
    [x + w * 0.13, base + h * 0.08],
    [x + w * 0.21, base + h * 0.08],
    [x + w * 0.16, base - h * 0.06],
  ], '#dc2626')
}

const shanghai: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#1e1b4b'],
    [0.6, '#7e22ce'],
    [1, '#fb7185'],
  ])
  const base = y + h * 0.78
  skyline(ctx, x, base, w, h * 0.18, h * 0.42, '#3b2766', rand, '#fcd34d')
  // Shanghai Tower twist
  const tx = x + w * 0.72
  poly(ctx, [
    [tx, base],
    [tx + w * 0.12, base],
    [tx + w * 0.08, base - h * 0.72],
    [tx + w * 0.04, base - h * 0.74],
  ], grad(ctx, tx, 0, tx + w * 0.12, 0, [
    [0, '#bae6fd'],
    [1, '#475569'],
  ]))
  // Oriental Pearl Tower
  const px = x + w * 0.36
  ctx.fillStyle = '#94a3b8'
  ctx.fillRect(px - 3, base - h * 0.7, 6, h * 0.7)
  ctx.fillRect(px - w * 0.06, base - h * 0.2, 3, h * 0.2)
  ctx.fillRect(px + w * 0.06 - 3, base - h * 0.2, 3, h * 0.2)
  for (const [py, r] of [
    [0.24, 0.07],
    [0.5, 0.05],
    [0.66, 0.025],
  ] as [number, number][]) {
    const g = ctx.createRadialGradient(px - 3, base - h * py - 3, 1, px, base - h * py, w * r)
    g.addColorStop(0, '#fecdd3')
    g.addColorStop(1, '#e11d48')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, base - h * py, w * r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(px - 1, base - h * 0.84, 2, h * 0.16)
  water(ctx, x, base, w, h - (base - y), '#4c1d95', '#1e1b4b', 'rgba(252,211,77,0.5)', rand)
}

const seoul: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#1e3a8a'],
    [0.6, '#2563eb'],
    [1, '#f0abfc'],
  ])
  stars(ctx, x, y, w, h * 0.3, 12, rand)
  // Namsan hill with N Seoul Tower
  ctx.fillStyle = '#14532d'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.4, y + h * 0.82, w * 0.36, h * 0.3, 0, Math.PI, 0)
  ctx.fill()
  const tx = x + w * 0.4
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(tx - 3, y + h * 0.22, 6, h * 0.32)
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.ellipse(tx, y + h * 0.3, w * 0.05, h * 0.04, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(tx - 1, y + h * 0.08, 2, h * 0.14)
  glow(ctx, tx, y + h * 0.3, 2, 'rgba(147,197,253,0.7)', '#dbeafe')
  const base = y + h * 0.84
  skyline(ctx, x, base, w, h * 0.12, h * 0.3, '#1e1b4b', rand, '#f0abfc')
  // hanok roof gate
  poly(ctx, [
    [x + w * 0.66, base - h * 0.2],
    [x + w * 0.98, base - h * 0.2],
    [x + w * 0.92, base - h * 0.28],
    [x + w * 0.72, base - h * 0.28],
  ], '#1f2937')
  ctx.fillStyle = '#b91c1c'
  ctx.fillRect(x + w * 0.7, base - h * 0.2, w * 0.24, h * 0.2)
  ground(ctx, x, base, w, h - (base - y), '#312e81', '#1e1b4b')
}

const bangkok: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#fb923c'],
    [0.6, '#fdba74'],
    [1, '#fef3c7'],
  ])
  const base = y + h * 0.8
  skyline(ctx, x, base, w, h * 0.12, h * 0.28, '#c2703d', rand)
  // Wat Arun prang: stacked tiers into a spire
  const cx = x + w * 0.46
  const tiers = [0.34, 0.26, 0.19, 0.13, 0.08]
  let top = base
  tiers.forEach((tw) => {
    const th = h * 0.1
    ctx.fillStyle = grad(ctx, cx - (w * tw) / 2, 0, cx + (w * tw) / 2, 0, [
      [0, '#fde68a'],
      [0.5, '#f59e0b'],
      [1, '#b45309'],
    ])
    ctx.fillRect(cx - (w * tw) / 2, top - th, w * tw, th)
    ctx.fillStyle = '#fef3c7'
    for (let j = 0; j < 5; j++) ctx.fillRect(cx - (w * tw) / 2 + (j + 0.5) * ((w * tw) / 5) - 1, top - th + 3, 2, th - 6)
    top -= th
  })
  poly(ctx, [
    [cx - w * 0.03, top],
    [cx + w * 0.03, top],
    [cx, top - h * 0.18],
  ], '#fbbf24')
  for (const side of [-1, 1]) {
    const sx = cx + side * w * 0.3
    poly(ctx, [
      [sx - w * 0.05, base],
      [sx + w * 0.05, base],
      [sx, base - h * 0.34],
    ], '#e59a2d')
  }
  water(ctx, x, base, w, h - (base - y), '#a16207', '#713f12', 'rgba(255,255,255,0.4)', rand)
  // long-tail boat
  ctx.fillStyle = '#7c2d12'
  ctx.fillRect(x + w * 0.62, base + h * 0.09, w * 0.24, h * 0.025)
}

const cairo: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#38bdf8'],
    [0.6, '#fde68a'],
    [1, '#fdba74'],
  ])
  glow(ctx, x + w * 0.2, y + h * 0.22, h * 0.07, 'rgba(255,250,210,0.6)', '#fffbeb')
  const base = y + h * 0.82
  const pyramid = (cx: number, pw: number, ph: number) => {
    poly(ctx, [
      [cx - pw / 2, base],
      [cx, base - ph],
      [cx, base],
    ], '#f2c46d')
    poly(ctx, [
      [cx, base],
      [cx, base - ph],
      [cx + pw / 2, base],
    ], '#c98b3a')
    ctx.strokeStyle = 'rgba(120,70,20,0.25)'
    ctx.lineWidth = 1
    for (let i = 1; i < 8; i++) {
      const yy = base - (ph * i) / 8
      const half = (pw / 2) * (1 - i / 8)
      ctx.beginPath()
      ctx.moveTo(cx - half, yy)
      ctx.lineTo(cx + half, yy)
      ctx.stroke()
    }
  }
  pyramid(x + w * 0.62, w * 0.62, h * 0.56)
  pyramid(x + w * 0.28, w * 0.4, h * 0.36)
  pyramid(x + w * 0.9, w * 0.26, h * 0.22)
  ground(ctx, x, base, w, h - (base - y), '#e9b666', '#b8823b')
  // camels
  ctx.fillStyle = '#6b4226'
  for (const cx of [0.12, 0.2]) {
    ctx.beginPath()
    ctx.ellipse(x + w * cx, base + h * 0.06, w * 0.03, h * 0.025, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(x + w * cx + w * 0.02, base + h * 0.02, 2.5, h * 0.05)
  }
  void rand
}

const rome: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#60a5fa'],
    [0.7, '#fcd9a8'],
    [1, '#fde7c7'],
  ])
  const base = y + h * 0.84
  skyline(ctx, x, base, w, h * 0.1, h * 0.2, '#d4a276', rand)
  // Colosseum: tiers of arches, the right side broken
  const cx = x + w * 0.5
  const cw = w * 0.84
  const ch = h * 0.5
  ctx.fillStyle = grad(ctx, 0, base - ch, 0, base, [
    [0, '#f1d3a4'],
    [1, '#c08a52'],
  ])
  ctx.beginPath()
  ctx.moveTo(cx - cw / 2, base)
  ctx.lineTo(cx - cw / 2, base - ch)
  ctx.lineTo(cx + cw * 0.18, base - ch)
  ctx.lineTo(cx + cw * 0.3, base - ch * 0.72)
  ctx.lineTo(cx + cw / 2, base - ch * 0.62)
  ctx.lineTo(cx + cw / 2, base)
  ctx.fill()
  ctx.fillStyle = '#6b3f1f'
  for (let row = 0; row < 3; row++) {
    const ry = base - ch * (0.08 + row * 0.3)
    for (let i = 0; i < 9; i++) {
      const ax = cx - cw / 2 + cw * 0.04 + i * cw * 0.106
      if (row === 2 && ax > cx + cw * 0.15) continue
      ctx.beginPath()
      ctx.moveTo(ax, ry)
      ctx.lineTo(ax, ry - ch * 0.14)
      ctx.arc(ax + cw * 0.03, ry - ch * 0.14, cw * 0.03, Math.PI, 0)
      ctx.lineTo(ax + cw * 0.06, ry)
      ctx.fill()
    }
  }
  ground(ctx, x, base, w, h - (base - y), '#a3a36b', '#6b6b3a')
  // cypress trees
  ctx.fillStyle = '#1f5130'
  for (const tx of [0.04, 0.95]) {
    ctx.beginPath()
    ctx.ellipse(x + w * tx, base - h * 0.14, w * 0.025, h * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

const sanFrancisco: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#fb7185'],
    [0.5, '#fdba74'],
    [1, '#fef3c7'],
  ])
  // fog bank
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.ellipse(x + w * (0.05 + i * 0.2), y + h * 0.62, w * 0.14, h * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const base = y + h * 0.72
  // Golden Gate: two towers and the drooping main cable
  const t1 = x + w * 0.28
  const t2 = x + w * 0.8
  const th = h * 0.6
  ctx.fillStyle = '#c2410c'
  for (const tx of [t1, t2]) {
    ctx.fillRect(tx - 4, base - th, 3, th + h * 0.12)
    ctx.fillRect(tx + 3, base - th, 3, th + h * 0.12)
    for (let i = 0; i < 4; i++) ctx.fillRect(tx - 4, base - th + i * th * 0.28, 10, 3)
  }
  ctx.strokeStyle = '#ea580c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - 4, base - h * 0.08)
  ctx.quadraticCurveTo((x + t1) / 2, base - th * 0.5, t1, base - th)
  ctx.quadraticCurveTo((t1 + t2) / 2, base - h * 0.02, t2, base - th)
  ctx.quadraticCurveTo(x + w * 0.95, base - th * 0.5, x + w + 4, base - h * 0.08)
  ctx.stroke()
  ctx.lineWidth = 0.8
  for (let i = 1; i < 14; i++) {
    const t = i / 14
    const bx = t1 + t * (t2 - t1)
    const by = (1 - t) * (1 - t) * (base - th) + 2 * (1 - t) * t * (base - h * 0.02) + t * t * (base - th)
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx, base)
    ctx.stroke()
  }
  ctx.fillStyle = '#9a3412'
  ctx.fillRect(x, base, w, 4)
  water(ctx, x, base + 4, w, h - (base - y) - 4, '#1d4ed8', '#1e3a8a', 'rgba(255,255,255,0.45)', rand)
}

const delhi: Scene = (ctx, x, y, w, h, _rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#991b1b'],
    [0.5, '#ea580c'],
    [1, '#fde68a'],
  ])
  const base = y + h * 0.82
  ground(ctx, x, base, w, h - (base - y), '#15803d', '#14532d')
  // India Gate
  const gx = x + w * 0.28
  const gw = w * 0.44
  const gh = h * 0.62
  ctx.fillStyle = '#b45309'
  ctx.fillRect(gx, base - gh, gw, gh)
  ctx.fillStyle = '#d97706'
  ctx.fillRect(gx + gw * 0.08, base - gh + 4, gw * 0.84, gh - 4)
  // Arch opening
  ctx.fillStyle = '#78350f'
  ctx.beginPath()
  ctx.arc(gx + gw / 2, base - gh * 0.42, gw * 0.22, Math.PI, 0)
  ctx.lineTo(gx + gw * 0.72, base)
  ctx.lineTo(gx + gw * 0.28, base)
  ctx.closePath()
  ctx.fill()
  // Amar Jawan Jyoti flame
  glow(ctx, gx + gw / 2, base - gh * 0.1, 5, 'rgba(251,191,36,0.95)', '#fffbeb')
  // Attic & cornice
  ctx.fillStyle = '#92400e'
  ctx.fillRect(gx - gw * 0.05, base - gh - h * 0.06, gw * 1.1, h * 0.06)
  ctx.fillRect(gx + gw * 0.15, base - gh - h * 0.11, gw * 0.7, h * 0.05)
}

const berlin: Scene = (ctx, x, y, w, h, _rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#1e293b'],
    [0.6, '#334155'],
    [1, '#fbbf24'],
  ])
  const base = y + h * 0.84
  ground(ctx, x, base, w, h - (base - y), '#475569', '#1e293b')
  // Brandenburg Gate
  const bx = x + w * 0.18
  const bw = w * 0.64
  const bh = h * 0.48
  // 6 columns
  ctx.fillStyle = '#e2e8f0'
  for (let i = 0; i < 6; i++) {
    const cx = bx + (i * bw) / 5.5
    ctx.fillRect(cx, base - bh, bw * 0.08, bh)
  }
  // Entablature
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(bx - bw * 0.04, base - bh - h * 0.08, bw * 1.08, h * 0.08)
  // Quadriga chariot on top
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(bx + bw * 0.38, base - bh - h * 0.15, bw * 0.24, h * 0.07)
  glow(ctx, bx + bw * 0.5, base - bh - h * 0.16, 4, 'rgba(251,191,36,0.8)', '#ffffff')
}

const bali: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#047857'],
    [0.6, '#10b981'],
    [1, '#fde047'],
  ])
  const base = y + h * 0.8
  water(ctx, x, base, w, h - (base - y), '#065f46', '#022c22', 'rgba(254,240,138,0.5)', rand)
  // Candi Bentar split gate
  const cx = x + w * 0.5
  const gw = w * 0.14
  const gh = h * 0.58
  ctx.fillStyle = '#374151'
  for (const side of [-1, 1]) {
    const sx = cx + side * gw * 0.7
    ctx.fillRect(sx - gw / 2, base - gh, gw, gh)
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(sx - gw / 2 - side * (5 - i) * 2, base - gh + i * (gh / 5), gw + (5 - i) * 3, gh / 7)
    }
  }
  palm(ctx, x + w * 0.12, base, h * 0.4)
  palm(ctx, x + w * 0.88, base, h * 0.36)
}

const chicago: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#0f172a'],
    [0.6, '#1e3a8a'],
    [1, '#60a5fa'],
  ])
  const base = y + h * 0.82
  skyline(ctx, x, base, w, h * 0.2, h * 0.45, '#1e293b', rand, '#fde047')
  // Willis / Sears Tower
  const wx = x + w * 0.42
  const ww = w * 0.2
  ctx.fillStyle = '#090d16'
  ctx.fillRect(wx, base - h * 0.62, ww, h * 0.62)
  ctx.fillRect(wx + ww * 0.15, base - h * 0.72, ww * 0.7, h * 0.1)
  // Radio spires with blinking red lights
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(wx + ww * 0.28, base - h * 0.84, 2, h * 0.12)
  ctx.fillRect(wx + ww * 0.68, base - h * 0.84, 2, h * 0.12)
  glow(ctx, wx + ww * 0.28, base - h * 0.84, 2, 'rgba(239,68,68,0.9)', '#f87171')
  glow(ctx, wx + ww * 0.68, base - h * 0.84, 2, 'rgba(239,68,68,0.9)', '#f87171')
  water(ctx, x, base, w, h - (base - y), '#0369a1', '#082f49', 'rgba(253,224,71,0.5)', rand)
}

const losAngeles: Scene = (ctx, x, y, w, h, _rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#db2777'],
    [0.5, '#ea580c'],
    [1, '#fde047'],
  ])
  const base = y + h * 0.82
  // Hills
  ctx.fillStyle = '#4d7c0f'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.5, base, w * 0.65, h * 0.38, 0, Math.PI, 0)
  ctx.fill()
  // Hollywood sign
  ctx.font = `900 ${h * 0.08}px Arial Black, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 4
  ctx.fillText('HOLLYWOOD', x + w * 0.5, base - h * 0.2)
  ctx.shadowBlur = 0
  palm(ctx, x + w * 0.12, base, h * 0.36)
  palm(ctx, x + w * 0.86, base, h * 0.34)
}

const lasVegas: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#3b0764'],
    [0.7, '#701a75'],
    [1, '#ec4899'],
  ])
  stars(ctx, x, y, w, h * 0.4, 25, rand)
  const base = y + h * 0.82
  skyline(ctx, x, base, w, h * 0.15, h * 0.4, '#18022e', rand, '#06b6d4')
  // Welcome to Vegas sign
  const sx = x + w * 0.5
  const sy = base - h * 0.38
  ctx.fillStyle = '#0284c7'
  ctx.beginPath()
  ctx.moveTo(sx, sy - h * 0.16)
  ctx.lineTo(sx + w * 0.32, sy)
  ctx.lineTo(sx, sy + h * 0.16)
  ctx.lineTo(sx - w * 0.32, sy)
  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#facc15'
  ctx.stroke()
  ctx.fillStyle = '#fef08a'
  ctx.font = `900 ${h * 0.065}px Arial Black, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('LAS VEGAS', sx, sy)
  glow(ctx, sx, sy - h * 0.18, 5, 'rgba(239,68,68,0.9)', '#f87171')
}

const miami: Scene = (ctx, x, y, w, h, rand) => {
  sky(ctx, x, y, w, h, [
    [0, '#0284c7'],
    [0.6, '#38bdf8'],
    [1, '#f472b6'],
  ])
  const base = y + h * 0.8
  // Art deco pastel hotel
  const bx = x + w * 0.25
  const bw = w * 0.5
  ctx.fillStyle = '#fdf2f8'
  ctx.fillRect(bx, base - h * 0.45, bw, h * 0.45)
  ctx.fillStyle = '#ec4899'
  ctx.fillRect(bx + bw * 0.1, base - h * 0.45, bw * 0.8, 4)
  ctx.fillStyle = '#06b6d4'
  ctx.fillRect(bx + bw * 0.2, base - h * 0.35, bw * 0.6, 3)
  water(ctx, x, base, w, h - (base - y), '#06b6d4', '#0891b2', 'rgba(255,255,255,0.7)', rand)
  palm(ctx, x + w * 0.12, base, h * 0.38)
  palm(ctx, x + w * 0.86, base, h * 0.35)
}

export const CITY_SCENES: Record<string, Scene> = {
  'New York': newYork,
  London: london,
  Paris: paris,
  Tokyo: tokyo,
  Dubai: dubai,
  Singapore: singapore,
  Mumbai: mumbai,
  Delhi: delhi,
  Sydney: sydney,
  'Hong Kong': hongKong,
  Shanghai: shanghai,
  Seoul: seoul,
  Bangkok: bangkok,
  Cairo: cairo,
  Rome: rome,
  Berlin: berlin,
  Bali: bali,
  Chicago: chicago,
  'Los Angeles': losAngeles,
  'Las Vegas': lasVegas,
  Miami: miami,
  'San Francisco': sanFrancisco,
}
