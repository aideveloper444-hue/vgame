import * as THREE from 'three'
import { shade } from '@/games/shared/three/glowTextures'
import {
  BASE_QUADRANT,
  BASE_SLOT_COORDS,
  CELL_META,
  COLOR_DEEP,
  COLOR_GLOW,
  COLOR_HEX,
  ENTRY_ABS,
  HOME_STRETCH_COORDS,
  LUDO_COLORS,
  RING_CELLS,
  type ClassicColor,
} from './ludoBoardLayout'

const GRID = 15

export interface BoardMaps {
  map: THREE.CanvasTexture
  bumpMap: THREE.CanvasTexture
  emissiveMap: THREE.CanvasTexture
}

export function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.closePath()
}

export function veins(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha: number, count: number, rand: () => number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    ctx.lineWidth = 0.6 + rand() * 1.6
    ctx.beginPath()
    let px = x + rand() * w
    let py = y - 10
    const drift = (rand() - 0.5) * w * 0.12
    ctx.moveTo(px, py)
    while (py < y + h + 10) {
      px += drift * 0.3 + (rand() - 0.5) * w * 0.06
      py += h * (0.04 + rand() * 0.06)
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return [canvas, canvas.getContext('2d')!]
}

export function toTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/**
 * Paints the whole 15x15 playing surface as one unified board: colored home zones with marble yards,
 * glossy beveled path tiles, team lanes with chevrons pointing home, and a center where the four lanes
 * converge as colored triangles. Also returns a matching bump map (tile relief) and emissive map (neon
 * borders and pads) so the single plane lights and glows like a physical board.
 */
export function paintBoard(size = 2048): BoardMaps {
  const c = size / GRID
  const [canvas, ctx] = makeCanvas(size)
  const [bumpCanvas, bump] = makeCanvas(size / 2)
  const [glowCanvas, glow] = makeCanvas(size / 2)
  const rand = seeded(42)
  const px = (i: number) => i * c
  const center = (i: number) => (i + 0.5) * c

  // grout / board body
  const body = ctx.createLinearGradient(0, 0, size, size)
  body.addColorStop(0, '#1d2140')
  body.addColorStop(1, '#0c0e1f')
  ctx.fillStyle = body
  ctx.fillRect(0, 0, size, size)
  bump.fillStyle = '#000'
  bump.fillRect(0, 0, size / 2, size / 2)
  glow.fillStyle = '#000'
  glow.fillRect(0, 0, size / 2, size / 2)
  const b = 0.5 // bump/glow canvases are half resolution

  /* ---------- home zones ---------- */
  for (const color of LUDO_COLORS) {
    const q = BASE_QUADRANT[color]
    const x = px(q.col) + c * 0.12
    const y = px(q.row) + c * 0.12
    const w = c * 6 - c * 0.24
    const main = COLOR_HEX[color]
    const g = ctx.createLinearGradient(x, y + w, x + w, y)
    g.addColorStop(0, COLOR_DEEP[color])
    g.addColorStop(0.6, main)
    g.addColorStop(1, main)
    roundRect(ctx, x, y, w, w, c * 0.35)
    ctx.fillStyle = g
    ctx.fill()
    veins(ctx, x, y, w, w, shade(main, 0.6), 0.16, 7, rand)
    veins(ctx, x, y, w, w, shade(main, -0.5), 0.12, 5, rand)
    const sheen = ctx.createLinearGradient(x, y, x + w, y + w)
    sheen.addColorStop(0, 'rgba(255,255,255,0.18)')
    sheen.addColorStop(0.35, 'rgba(255,255,255,0.04)')
    sheen.addColorStop(1, 'rgba(0,0,0,0.22)')
    roundRect(ctx, x, y, w, w, c * 0.35)
    ctx.fillStyle = sheen
    ctx.fill()

    // inner marble yard
    const yx = px(q.col + 1)
    const yy = px(q.row + 1)
    const yw = c * 4
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = c * 0.25
    roundRect(ctx, yx, yy, yw, yw, c * 0.4)
    // white marble yard with just a breath of the team color, framed by the saturated zone rim
    const yard = ctx.createLinearGradient(yx, yy, yx + yw, yy + yw)
    yard.addColorStop(0, '#f7f8fb')
    yard.addColorStop(0.55, '#eceef3')
    yard.addColorStop(1, '#dcdfe7')
    ctx.fillStyle = yard
    ctx.fill()
    ctx.restore()
    ctx.save()
    roundRect(ctx, yx, yy, yw, yw, c * 0.4)
    ctx.clip()
    ctx.shadowColor = shade(COLOR_DEEP[color], -0.3)
    ctx.shadowBlur = c * 0.35
    ctx.lineWidth = c * 0.3
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    roundRect(ctx, yx - c * 0.15, yy - c * 0.15, yw + c * 0.3, yw + c * 0.3, c * 0.5)
    ctx.stroke()
    const ysheen = ctx.createLinearGradient(yx, yy, yx + yw * 0.7, yy + yw)
    ysheen.addColorStop(0, 'rgba(255,255,255,0.4)')
    ysheen.addColorStop(0.3, 'rgba(255,255,255,0.05)')
    ysheen.addColorStop(0.31, 'rgba(255,255,255,0)')
    ctx.fillStyle = ysheen
    ctx.fillRect(yx, yy, yw, yw)
    ctx.restore()
    veins(ctx, yx, yy, yw, yw, '#8e94aa', 0.22, 9, rand)
    veins(ctx, yx, yy, yw, yw, shade(main, -0.2), 0.12, 4, rand)
    ctx.lineWidth = c * 0.05
    ctx.strokeStyle = shade(COLOR_GLOW[color], 0.55)
    roundRect(ctx, yx, yy, yw, yw, c * 0.4)
    ctx.stroke()

    // token pads
    for (const [r, cc] of BASE_SLOT_COORDS[color]) {
      const cx = center(cc)
      const cy = center(r)
      const pad = ctx.createRadialGradient(cx, cy - c * 0.1, c * 0.05, cx, cy, c * 0.5)
      pad.addColorStop(0, shade(COLOR_GLOW[color], 0.55))
      pad.addColorStop(1, shade(main, 0.2))
      ctx.beginPath()
      ctx.arc(cx, cy, c * 0.46, 0, Math.PI * 2)
      ctx.fillStyle = pad
      ctx.fill()
      ctx.lineWidth = c * 0.05
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.stroke()
      glow.beginPath()
      glow.arc(cx * b, cy * b, c * 0.46 * b, 0, Math.PI * 2)
      glow.lineWidth = c * 0.07 * b
      glow.strokeStyle = COLOR_GLOW[color]
      glow.stroke()
    }

    // neon edges: zone rim + yard rim
    glow.lineWidth = c * 0.08 * b
    glow.strokeStyle = COLOR_GLOW[color]
    roundRect(glow, x * b, y * b, w * b, w * b, c * 0.35 * b)
    glow.stroke()

    // zones are raised slightly above the tile grooves
    bump.fillStyle = '#b8b8b8'
    roundRect(bump, x * b, y * b, w * b, w * b, c * 0.35 * b)
    bump.fill()
    bump.fillStyle = '#8a8a8a'
    roundRect(bump, yx * b, yy * b, yw * b, yw * b, c * 0.4 * b)
    bump.fill()
  }

  /* ---------- path tiles ---------- */
  const laneColorAt = new Map<string, ClassicColor>()
  for (const color of LUDO_COLORS) for (const [r, cc] of HOME_STRETCH_COORDS[color]) laneColorAt.set(`${r},${cc}`, color)
  const entryAt = new Map<string, { color: ClassicColor; next: [number, number] }>()
  for (const color of LUDO_COLORS) {
    const i = ENTRY_ABS[color]
    const [r, cc] = RING_CELLS[i]
    entryAt.set(`${r},${cc}`, { color, next: RING_CELLS[(i + 1) % RING_CELLS.length] })
  }

  CELL_META.forEach((row, r) => {
    row.forEach((meta, cc) => {
      if (meta.kind !== 'ring' && meta.kind !== 'stretch') return
      const x = px(cc) + c * 0.06
      const y = px(r) + c * 0.06
      const w = c * 0.88
      const key = `${r},${cc}`
      const lane = laneColorAt.get(key)
      const entry = entryAt.get(key)
      const team = lane ?? entry?.color

      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = c * 0.12
      ctx.shadowOffsetY = c * 0.05
      roundRect(ctx, x, y, w, w, c * 0.14)
      const g = ctx.createLinearGradient(x, y, x, y + w)
      if (team) {
        g.addColorStop(0, COLOR_HEX[team])
        g.addColorStop(1, COLOR_DEEP[team])
      } else {
        g.addColorStop(0, '#f6f7fb')
        g.addColorStop(1, '#d3d7e4')
      }
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
      if (!team) veins(ctx, x, y, w, w, '#9ca2b6', 0.2, 3, rand)
      else veins(ctx, x, y, w, w, shade(COLOR_GLOW[team], 0.5), 0.18, 2, rand)
      // bevel: bright top lip, darker bottom lip
      ctx.lineWidth = c * 0.04
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.beginPath()
      ctx.moveTo(x + c * 0.14, y + c * 0.03)
      ctx.lineTo(x + w - c * 0.14, y + c * 0.03)
      ctx.stroke()
      ctx.strokeStyle = team ? 'rgba(0,0,0,0.22)' : 'rgba(90,96,120,0.35)'
      ctx.beginPath()
      ctx.moveTo(x + c * 0.14, y + w - c * 0.02)
      ctx.lineTo(x + w - c * 0.14, y + w - c * 0.02)
      ctx.stroke()

      const cx = center(cc)
      const cy = center(r)
      if (entry) {
        // start cell: white arrow along the direction of travel
        const [nr, nc] = entry.next
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.atan2(nr - r, nc - cc))
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.beginPath()
        ctx.moveTo(c * 0.26, 0)
        ctx.lineTo(-c * 0.16, -c * 0.22)
        ctx.lineTo(-c * 0.06, 0)
        ctx.lineTo(-c * 0.16, c * 0.22)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else if (lane) {
        // faint chevron pointing toward the center home
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.atan2(7 - r, 7 - cc))
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = c * 0.07
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(-c * 0.08, -c * 0.16)
        ctx.lineTo(c * 0.1, 0)
        ctx.lineTo(-c * 0.08, c * 0.16)
        ctx.stroke()
        ctx.restore()
        glow.fillStyle = shade(COLOR_GLOW[lane], -0.78)
        roundRect(glow, x * b, y * b, w * b, w * b, c * 0.14 * b)
        glow.fill()
      } else if (meta.kind === 'ring' && meta.safe) {
        star(ctx, cx, cy, c * 0.3, c * 0.13)
        const sg = ctx.createLinearGradient(cx, cy - c * 0.3, cx, cy + c * 0.3)
        sg.addColorStop(0, '#d7dbe6')
        sg.addColorStop(1, '#9aa1b6')
        ctx.fillStyle = sg
        ctx.fill()
        ctx.lineWidth = c * 0.025
        ctx.strokeStyle = '#7b8196'
        ctx.stroke()
      }

      bump.fillStyle = '#ffffff'
      roundRect(bump, x * b, y * b, w * b, w * b, c * 0.14 * b)
      bump.fill()
    })
  })

  /* ---------- center home: four lanes converging ---------- */
  const x0 = px(6)
  const x1 = px(9)
  const mid = px(7.5)
  const tri: Record<ClassicColor, [number, number][]> = {
    RED: [[x0, x0], [x0, x1], [mid, mid]],
    GREEN: [[x0, x0], [x1, x0], [mid, mid]],
    YELLOW: [[x1, x0], [x1, x1], [mid, mid]],
    BLUE: [[x0, x1], [x1, x1], [mid, mid]],
  }
  for (const color of LUDO_COLORS) {
    const pts = tri[color]
    const [ax, ay] = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]
    const g = ctx.createLinearGradient(ax, ay, mid, mid)
    g.addColorStop(0, COLOR_DEEP[color])
    g.addColorStop(1, COLOR_HEX[color])
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
    glow.beginPath()
    pts.forEach(([x, y], i) => (i ? glow.lineTo(x * b, y * b) : glow.moveTo(x * b, y * b)))
    glow.closePath()
    glow.fillStyle = shade(COLOR_GLOW[color], -0.82)
    glow.fill()
  }
  // crystal-like highlight across the home, as if polished glass were set over the colors
  const crystal = ctx.createLinearGradient(x0, x0, x1, x1)
  crystal.addColorStop(0, 'rgba(255,255,255,0.45)')
  crystal.addColorStop(0.38, 'rgba(255,255,255,0.08)')
  crystal.addColorStop(0.4, 'rgba(255,255,255,0.22)')
  crystal.addColorStop(0.46, 'rgba(255,255,255,0)')
  crystal.addColorStop(1, 'rgba(0,0,0,0.18)')
  ctx.fillStyle = crystal
  ctx.fillRect(x0, x0, x1 - x0, x1 - x0)
  // gold seams between the triangles and a beveled gold frame around the home square
  ctx.strokeStyle = '#f7d27a'
  ctx.lineWidth = c * 0.05
  ctx.beginPath()
  ctx.moveTo(x0, x0)
  ctx.lineTo(x1, x1)
  ctx.moveTo(x1, x0)
  ctx.lineTo(x0, x1)
  ctx.stroke()
  ctx.lineWidth = c * 0.12
  ctx.strokeStyle = '#b7801c'
  ctx.strokeRect(x0, x0, x1 - x0, x1 - x0)
  ctx.lineWidth = c * 0.05
  ctx.strokeStyle = '#ffe9a8'
  ctx.strokeRect(x0 - c * 0.02, x0 - c * 0.02, x1 - x0 + c * 0.04, x1 - x0 + c * 0.04)
  glow.strokeStyle = '#ffcf5a'
  glow.lineWidth = c * 0.05 * b
  glow.strokeRect(x0 * b, x0 * b, (x1 - x0) * b, (x1 - x0) * b)
  bump.fillStyle = '#c8c8c8'
  bump.fillRect(x0 * b, x0 * b, (x1 - x0) * b, (x1 - x0) * b)

  // soften the bump map so tile edges read as rounded bevels
  const [soft, sctx] = makeCanvas(size / 2)
  sctx.filter = `blur(${Math.max(1, c * 0.03)}px)`
  sctx.drawImage(bumpCanvas, 0, 0)

  // turn the hard glow lines into soft bloom: a wide blurred halo plus a faint core
  const [bloom, blctx] = makeCanvas(size / 2)
  blctx.filter = `blur(${c * 0.1}px)`
  blctx.drawImage(glowCanvas, 0, 0)
  blctx.drawImage(glowCanvas, 0, 0)
  blctx.filter = 'none'
  blctx.globalAlpha = 0.45
  blctx.drawImage(glowCanvas, 0, 0)

  return { map: toTexture(canvas, true), bumpMap: toTexture(soft, false), emissiveMap: toTexture(bloom, true) }
}

/** Gold crown on a dark enamel disc, for the top face of the small center emblem. */
export function makeEmblemTexture(): THREE.CanvasTexture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  const s = size / 2
  const bg = ctx.createRadialGradient(s, s * 0.8, 10, s, s, s)
  bg.addColorStop(0, '#2a2560')
  bg.addColorStop(1, '#0a0a22')
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.arc(s, s, s, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 14
  ctx.strokeStyle = '#f5c64a'
  ctx.beginPath()
  ctx.arc(s, s, s - 9, 0, Math.PI * 2)
  ctx.stroke()
  const gold = ctx.createLinearGradient(0, 70, 0, 180)
  gold.addColorStop(0, '#fff3b0')
  gold.addColorStop(0.5, '#ffcf4d')
  gold.addColorStop(1, '#b8760a')
  ctx.fillStyle = gold
  ctx.beginPath()
  ctx.moveTo(70, 168)
  ctx.lineTo(60, 92)
  ctx.lineTo(96, 124)
  ctx.lineTo(128, 70)
  ctx.lineTo(160, 124)
  ctx.lineTo(196, 92)
  ctx.lineTo(186, 168)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(70, 172, 116, 16)
  for (const [x, y] of [[60, 88], [128, 64], [196, 88]]) {
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ff3b6b'
  ctx.beginPath()
  ctx.arc(128, 140, 10, 0, Math.PI * 2)
  ctx.fill()
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
