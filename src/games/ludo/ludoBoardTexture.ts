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
import { CLASSIC_HOME_STEP, CLASSIC_TOTAL, HOME_INSET, classicEdge } from './ludoBoards'
import { BOARD_THEMES, type BoardTheme } from './ludoThemes'


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
  t.anisotropy = 16 // the board is seen at a slant: strong filtering keeps far tiles sharp (the GPU caps it)
  t.needsUpdate = true
  return t
}

/**
 * Paints the whole 15x15 playing surface as one unified board: colored home zones with marble yards,
 * glossy beveled path tiles, team lanes with chevrons pointing home, and a center where the four lanes
 * converge as colored triangles. Also returns a matching bump map (tile relief) and emissive map (neon
 * borders and pads) so the single plane lights and glows like a physical board.
 */
export function paintBoard(size = 2048, theme: BoardTheme = BOARD_THEMES.obsidian): BoardMaps {
  // the grid is uneven (wide walkway lanes, smaller home cells): map grid lines through classicEdge.
  // `c` is the home cell step in pixels, the reference size for strokes, radii and icons.
  const k = size / CLASSIC_TOTAL
  const c = CLASSIC_HOME_STEP * k
  const [canvas, ctx] = makeCanvas(size)
  const [bumpCanvas, bump] = makeCanvas(size / 2)
  const [glowCanvas, glow] = makeCanvas(size / 2)
  const rand = seeded(42)
  const px = (i: number) => classicEdge(i) * k
  const center = (i: number) => (px(i) + px(i + 1)) / 2

  // Premium look: graphite stone, deep jewel-tone glass for the team colours and thin gold inlay, instead
  // of bright primaries on white (which read as a toy). Team colours stay instantly readable as accents.
  // the theme's metal inlay (gold, platinum, neon or copper)
  const [GOLD_HI, GOLD, GOLD_LO] = theme.inlay
  /** A team colour pulled toward black: the base of its jewel tone. */
  const jewel = (color: ClassicColor, k: number) => shade(COLOR_DEEP[color], k)

  // grout / board body: near-black with a faint cool sheen
  const body = ctx.createLinearGradient(0, 0, size, size)
  body.addColorStop(0, theme.body[0])
  body.addColorStop(1, theme.body[1])
  ctx.fillStyle = body
  ctx.fillRect(0, 0, size, size)
  bump.fillStyle = '#000'
  bump.fillRect(0, 0, size / 2, size / 2)
  glow.fillStyle = '#000'
  glow.fillRect(0, 0, size / 2, size / 2)
  const b = 0.5 // bump/glow canvases are half resolution

  const neon = !!theme.neon
  /** A lit neon tube: a white-hot core over a coloured line on the board, and a strong line in the glow map. */
  const tube = (path: (g: CanvasRenderingContext2D, s: number) => void, color: string, width: number, glowGain = 1) => {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = width * 3
    ctx.strokeStyle = color
    ctx.lineWidth = width
    path(ctx, 1)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = width * 0.35
    path(ctx, 1)
    ctx.stroke()
    ctx.restore()
    glow.save()
    glow.lineCap = 'round'
    glow.lineJoin = 'round'
    glow.strokeStyle = color
    glow.globalAlpha = Math.min(1, glowGain)
    glow.lineWidth = width * 1.6 * b
    path(glow, b)
    glow.stroke()
    glow.restore()
  }
  const diamond = (g: CanvasRenderingContext2D, s: number, cx: number, cy: number, r: number) => {
    g.beginPath()
    g.moveTo(cx * s, (cy - r) * s)
    g.lineTo((cx + r) * s, cy * s)
    g.lineTo(cx * s, (cy + r) * s)
    g.lineTo((cx - r) * s, cy * s)
    g.closePath()
  }

  /** Fine grain over a stone surface, so flat fills read as a real material. */
  const grain = (x: number, y: number, w: number, h: number, alpha: number) => {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    const n = Math.round((w * h) / (c * c) * 60)
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.6})`
      ctx.fillRect(x + rand() * w, y + rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5)
    }
    ctx.restore()
  }

  /* ---------- home zones: inset dark-stone plates with a team inlay and a gold bevel ---------- */
  for (const color of LUDO_COLORS) {
    const q = BASE_QUADRANT[color]
    // a compact home: the plate is 4 of the quadrant's 6 cells wide, leaving open stone around it
    const inset = c * HOME_INSET
    const x = px(q.col) + inset
    const y = px(q.row) + inset
    const w = px(q.col + 6) - px(q.col) - inset * 2
    const r = c * 0.22
    // a fine engraved gold frame around the open stone, so the margin reads as deliberate
    ctx.lineWidth = c * 0.025
    ctx.strokeStyle = neon ? 'rgba(255,255,255,0.06)' : GOLD_LO
    roundRect(ctx, px(q.col) + c * 0.45, px(q.row) + c * 0.45, px(q.col + 6) - px(q.col) - c * 0.9, px(q.col + 6) - px(q.col) - c * 0.9, c * 0.3)
    ctx.stroke()
    grain(px(q.col), px(q.row), px(q.col + 6) - px(q.col), px(q.col + 6) - px(q.col), 0.02)
    const g = ctx.createLinearGradient(x, y, x + w, y + w)
    g.addColorStop(0, jewel(color, theme.plate[0]))
    g.addColorStop(0.55, jewel(color, theme.plate[1]))
    g.addColorStop(1, jewel(color, theme.plate[2]))
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = c * 0.4
    ctx.shadowOffsetY = c * 0.08
    roundRect(ctx, x, y, w, w, r)
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
    grain(x, y, w, w, 0.035)
    veins(ctx, x, y, w, w, shade(COLOR_HEX[color], 0.2), 0.07, 5, rand)
    // brushed sheen across the plate
    const sheen = ctx.createLinearGradient(x, y, x + w * 0.8, y + w)
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)')
    sheen.addColorStop(0.4, 'rgba(255,255,255,0.02)')
    sheen.addColorStop(1, 'rgba(0,0,0,0.25)')
    roundRect(ctx, x, y, w, w, r)
    ctx.fillStyle = sheen
    ctx.fill()
    if (neon) {
      // Neon Noir: the plate is framed by a double neon tube in the team colour, no metal
      tube((g, s) => roundRect(g, x * s, y * s, w * s, w * s, r * s), COLOR_GLOW[color], c * 0.07)
      tube((g, s) => roundRect(g, (x + c * 0.2) * s, (y + c * 0.2) * s, (w - c * 0.4) * s, (w - c * 0.4) * s, r * 0.7 * s), COLOR_GLOW[color], c * 0.025, 0.55)
    }
    // gold bevel (outer) and a thin team-colour inlay just inside it
    if (!neon) {
    ctx.lineWidth = c * 0.06
    ctx.strokeStyle = GOLD
    roundRect(ctx, x, y, w, w, r)
    ctx.stroke()
    ctx.lineWidth = c * 0.02
    ctx.strokeStyle = GOLD_HI
    roundRect(ctx, x + c * 0.02, y + c * 0.02, w - c * 0.04, w - c * 0.04, r)
    ctx.stroke()
    ctx.lineWidth = c * 0.035
    ctx.strokeStyle = COLOR_GLOW[color]
    roundRect(ctx, x + c * 0.14, y + c * 0.14, w - c * 0.28, w - c * 0.28, r * 0.8)
    ctx.stroke()
    }

    // recessed black-marble yard where waiting warriors stand
    const yx = px(q.col + 1.45)
    const yy = px(q.row + 1.45)
    const yw = px(q.col + 4.55) - px(q.col + 1.45)
    const yr = c * 0.3
    const yard = ctx.createLinearGradient(yx, yy, yx + yw, yy + yw)
    yard.addColorStop(0, theme.yard[0])
    yard.addColorStop(0.6, theme.yard[1])
    yard.addColorStop(1, theme.yard[2])
    roundRect(ctx, yx, yy, yw, yw, yr)
    ctx.fillStyle = yard
    ctx.fill()
    veins(ctx, yx, yy, yw, yw, theme.yardVein, 0.1, 8, rand)
    veins(ctx, yx, yy, yw, yw, shade(COLOR_GLOW[color], -0.1), 0.06, 3, rand)
    grain(yx, yy, yw, yw, 0.03)
    // inner shadow makes the yard sit below the plate
    ctx.save()
    roundRect(ctx, yx, yy, yw, yw, yr)
    ctx.clip()
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = c * 0.35
    ctx.lineWidth = c * 0.3
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    roundRect(ctx, yx - c * 0.15, yy - c * 0.15, yw + c * 0.3, yw + c * 0.3, yr * 1.4)
    ctx.stroke()
    const ysheen = ctx.createLinearGradient(yx, yy, yx + yw * 0.6, yy + yw)
    ysheen.addColorStop(0, 'rgba(255,255,255,0.1)')
    ysheen.addColorStop(0.35, 'rgba(255,255,255,0)')
    ctx.fillStyle = ysheen
    ctx.fillRect(yx, yy, yw, yw)
    ctx.restore()
    ctx.lineWidth = c * 0.03
    ctx.strokeStyle = shade(GOLD, -0.2)
    roundRect(ctx, yx, yy, yw, yw, yr)
    ctx.stroke()

    // a waiting spot for each warrior, always visible: a recessed socket ringed in gold and team light.
    // A waiting warrior's glowing base covers it; when the warrior leaves, the empty socket remains.
    for (const [sr, sc] of BASE_SLOT_COORDS[color]) {
      const cx = px(sc + 0.5)
      const cy = px(sr + 0.5)
      const R = c * 0.6
      const well = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R)
      well.addColorStop(0, shade(theme.yard[2], -0.55))
      well.addColorStop(0.75, theme.yard[2])
      well.addColorStop(1, shade(COLOR_DEEP[color], -0.4))
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = well
      ctx.fill()
      ctx.lineWidth = c * 0.05
      ctx.strokeStyle = GOLD
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, R - c * 0.09, 0, Math.PI * 2)
      ctx.lineWidth = c * 0.035
      ctx.strokeStyle = COLOR_GLOW[color]
      ctx.stroke()
      glow.beginPath()
      glow.arc(cx * b, cy * b, (R - c * 0.09) * b, 0, Math.PI * 2)
      glow.lineWidth = c * 0.05 * b
      glow.strokeStyle = COLOR_GLOW[color]
      glow.stroke()
      bump.fillStyle = '#5a5a5a'
      bump.beginPath()
      bump.arc(cx * b, cy * b, R * b, 0, Math.PI * 2)
      bump.fill()
    }

    // glow: the team inlay line and a faint yard rim
    if (!neon) {
    glow.lineWidth = c * 0.06 * b
    glow.strokeStyle = COLOR_GLOW[color]
    roundRect(glow, (x + c * 0.14) * b, (y + c * 0.14) * b, (w - c * 0.28) * b, (w - c * 0.28) * b, r * 0.8 * b)
    glow.stroke()
    glow.lineWidth = c * 0.03 * b
    glow.strokeStyle = shade(COLOR_GLOW[color], -0.5)
    roundRect(glow, yx * b, yy * b, yw * b, yw * b, yr * b)
    glow.stroke()
    }

    // the plate stands proud of the grout; the yard is carved into it
    bump.fillStyle = '#b8b8b8'
    roundRect(bump, x * b, y * b, w * b, w * b, r * b)
    bump.fill()
    bump.fillStyle = '#7a7a7a'
    roundRect(bump, yx * b, yy * b, yw * b, yw * b, yr * b)
    bump.fill()
  }

  /* ---------- walkway tiles: big polished graphite stones, jewel glass for team cells ---------- */
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
      // thin grout: the stones fill almost the whole space, so the walkway reads big and solid
      const gap = c * 0.035
      const x = px(cc) + gap
      const y = px(r) + gap
      const w = px(cc + 1) - px(cc) - gap * 2
      const h = px(r + 1) - px(r) - gap * 2
      const rr = c * (neon ? 0.05 : 0.09)
      const key = `${r},${cc}`
      const lane = laneColorAt.get(key)
      const entry = entryAt.get(key)
      const team = lane ?? entry?.color

      const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h)
      if (team && neon) {
        // lit coloured glass: a runway of team light leading home
        g.addColorStop(0, jewel(team, -0.25))
        g.addColorStop(0.5, jewel(team, -0.5))
        g.addColorStop(1, jewel(team, -0.72))
      } else if (team) {
        // deep jewel glass, lit from the top-left
        g.addColorStop(0, shade(COLOR_HEX[team], -0.05))
        g.addColorStop(0.5, jewel(team, -0.15))
        g.addColorStop(1, jewel(team, -0.5))
      } else {
        g.addColorStop(0, theme.tile[0])
        g.addColorStop(0.5, theme.tile[1])
        g.addColorStop(1, theme.tile[2])
      }
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.65)'
      ctx.shadowBlur = c * 0.1
      ctx.shadowOffsetY = c * 0.04
      roundRect(ctx, x, y, w, h, rr)
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
      if (!team) {
        grain(x, y, w, h, theme.grain)
        veins(ctx, x, y, w, h, theme.vein, 0.08, 2, rand)
      } else {
        // a soft inner glow so the glass looks lit from within
        const ig = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) * 0.7)
        ig.addColorStop(0, shade(COLOR_GLOW[team], -0.1).replace('rgb(', 'rgba(').replace(')', ', 0.33)'))
        ig.addColorStop(1, 'rgba(0,0,0,0)')
        roundRect(ctx, x, y, w, h, rr)
        ctx.fillStyle = ig
        ctx.fill()
      }
      // polished bevel: bright top-left lip, dark bottom-right lip
      ctx.lineWidth = c * 0.025
      ctx.strokeStyle = team ? 'rgba(255,255,255,0.45)' : theme.bevel
      ctx.beginPath()
      ctx.moveTo(x + rr, y + c * 0.02)
      ctx.lineTo(x + w - rr, y + c * 0.02)
      ctx.moveTo(x + c * 0.02, y + rr)
      ctx.lineTo(x + c * 0.02, y + h - rr)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.beginPath()
      ctx.moveTo(x + rr, y + h - c * 0.015)
      ctx.lineTo(x + w - rr, y + h - c * 0.015)
      ctx.stroke()
      if (neon && team) {
        // the glass glows from inside in the glow map, brightest at the centre of each cell
        const gx = (x + w / 2) * b
        const gy = (y + h / 2) * b
        const gg = glow.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.7 * b)
        gg.addColorStop(0, shade(COLOR_GLOW[team], -0.45))
        gg.addColorStop(1, shade(COLOR_GLOW[team], -0.85))
        glow.fillStyle = gg
        roundRect(glow, x * b, y * b, w * b, h * b, rr * b)
        glow.fill()
      } else if (neon) {
        // a hairline of light on the top edge of each black stone so the grid reads in the dark
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'
        ctx.lineWidth = c * 0.012
        roundRect(ctx, x + c * 0.01, y + c * 0.01, w - c * 0.02, h - c * 0.02, rr)
        ctx.stroke()
      }
      // engraved inner line
      ctx.lineWidth = c * (theme.neonGrid ? 0.02 : 0.012)
      ctx.strokeStyle = team ? 'rgba(255,255,255,0.18)' : theme.engrave
      roundRect(ctx, x + c * 0.09, y + c * 0.09, w - c * 0.18, h - c * 0.18, rr * 0.6)
      ctx.stroke()
      // Synthwave: the walkway's grid lines glow
      if (theme.neonGrid && !team) {
        glow.lineWidth = c * 0.03 * b
        glow.strokeStyle = theme.inlay[1]
        roundRect(glow, (x + c * 0.09) * b, (y + c * 0.09) * b, (w - c * 0.18) * b, (h - c * 0.18) * b, rr * 0.6 * b)
        glow.stroke()
      }

      const cx = center(cc)
      const cy = center(r)
      if (entry && neon) {
        // start cell: an open neon arrow along the direction of travel
        const [nr, nc] = entry.next
        const a = Math.atan2(nr - r, nc - cc)
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const P = (u: number, v: number): [number, number] => [cx + u * ca - v * sa, cy + u * sa + v * ca]
        tube((g2, s2) => {
          const pts = [P(-c * 0.24, 0), P(c * 0.2, 0)]
          const head = [P(c * 0.04, -c * 0.16), P(c * 0.22, 0), P(c * 0.04, c * 0.16)]
          g2.beginPath()
          g2.moveTo(pts[0][0] * s2, pts[0][1] * s2)
          g2.lineTo(pts[1][0] * s2, pts[1][1] * s2)
          g2.moveTo(head[0][0] * s2, head[0][1] * s2)
          g2.lineTo(head[1][0] * s2, head[1][1] * s2)
          g2.lineTo(head[2][0] * s2, head[2][1] * s2)
        }, COLOR_GLOW[entry.color], c * 0.05)
      } else if (lane && neon) {
        // thin light-line chevron toward home
        const a = Math.atan2(7 - r, 7 - cc)
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const P = (u: number, v: number): [number, number] => [cx + u * ca - v * sa, cy + u * sa + v * ca]
        const pts = [P(-c * 0.07, -c * 0.13), P(c * 0.08, 0), P(-c * 0.07, c * 0.13)]
        tube((g2, s2) => {
          g2.beginPath()
          pts.forEach(([X, Y], i) => (i ? g2.lineTo(X * s2, Y * s2) : g2.moveTo(X * s2, Y * s2)))
        }, '#ffffff', c * 0.03, 0.6)
      } else if (meta.kind === 'ring' && meta.safe && neon) {
        // safe square: a hollow white neon diamond with a dot at its heart
        tube((g2, s2) => diamond(g2, s2, cx, cy, c * 0.24), '#e8ecff', c * 0.035, 0.7)
        ctx.beginPath()
        ctx.arc(cx, cy, c * 0.04, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
      } else if (entry) {
        // start cell: gold arrow along the direction of travel
        const [nr, nc] = entry.next
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.atan2(nr - r, nc - cc))
        const ag = ctx.createLinearGradient(0, -c * 0.22, 0, c * 0.22)
        ag.addColorStop(0, GOLD_HI)
        ag.addColorStop(1, GOLD)
        ctx.fillStyle = ag
        ctx.shadowColor = 'rgba(0,0,0,0.6)'
        ctx.shadowBlur = c * 0.06
        ctx.beginPath()
        ctx.moveTo(c * 0.26, 0)
        ctx.lineTo(-c * 0.16, -c * 0.22)
        ctx.lineTo(-c * 0.06, 0)
        ctx.lineTo(-c * 0.16, c * 0.22)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        glow.fillStyle = shade(COLOR_GLOW[entry.color], -0.7)
        roundRect(glow, x * b, y * b, w * b, h * b, rr * b)
        glow.fill()
      } else if (lane) {
        // fine chevron pointing toward the center home
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.atan2(7 - r, 7 - cc))
        ctx.strokeStyle = 'rgba(255,240,205,0.5)'
        ctx.lineWidth = c * 0.045
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(-c * 0.08, -c * 0.15)
        ctx.lineTo(c * 0.09, 0)
        ctx.lineTo(-c * 0.08, c * 0.15)
        ctx.stroke()
        ctx.restore()
        glow.fillStyle = shade(COLOR_GLOW[lane], -0.72)
        roundRect(glow, x * b, y * b, w * b, h * b, rr * b)
        glow.fill()
      } else if (meta.kind === 'ring' && meta.safe) {
        // safe square: an engraved gold star
        star(ctx, cx, cy, c * 0.3, c * 0.13)
        const sg = ctx.createLinearGradient(cx, cy - c * 0.3, cx, cy + c * 0.3)
        sg.addColorStop(0, GOLD_HI)
        sg.addColorStop(0.55, GOLD)
        sg.addColorStop(1, GOLD_LO)
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.7)'
        ctx.shadowBlur = c * 0.05
        ctx.shadowOffsetY = c * 0.02
        ctx.fillStyle = sg
        ctx.fill()
        ctx.restore()
        glow.save()
        star(glow, cx * b, cy * b, c * 0.3 * b, c * 0.13 * b)
        glow.fillStyle = shade(GOLD_LO, -0.6)
        glow.fill()
        glow.restore()
      }

      bump.fillStyle = '#ffffff'
      roundRect(bump, x * b, y * b, w * b, h * b, rr * b)
      bump.fill()
    })
  })

  /* ---------- center home: four jewel facets converging under polished glass ---------- */
  const x0 = px(6)
  const x1 = px(9)
  const mid = (x0 + x1) / 2
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
    g.addColorStop(0, jewel(color, -0.45))
    g.addColorStop(1, shade(COLOR_HEX[color], -0.1))
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
    glow.beginPath()
    pts.forEach(([x, y], i) => (i ? glow.lineTo(x * b, y * b) : glow.moveTo(x * b, y * b)))
    glow.closePath()
    glow.fillStyle = shade(COLOR_GLOW[color], -0.85)
    glow.fill()
  }
  const crystal = ctx.createLinearGradient(x0, x0, x1, x1)
  crystal.addColorStop(0, 'rgba(255,255,255,0.28)')
  crystal.addColorStop(0.38, 'rgba(255,255,255,0.05)')
  crystal.addColorStop(0.4, 'rgba(255,255,255,0.14)')
  crystal.addColorStop(0.46, 'rgba(255,255,255,0)')
  crystal.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = crystal
  ctx.fillRect(x0, x0, x1 - x0, x1 - x0)
  ctx.strokeStyle = GOLD_HI
  ctx.lineWidth = c * 0.035
  ctx.beginPath()
  ctx.moveTo(x0, x0)
  ctx.lineTo(x1, x1)
  ctx.moveTo(x1, x0)
  ctx.lineTo(x0, x1)
  ctx.stroke()
  ctx.lineWidth = c * 0.1
  ctx.strokeStyle = GOLD_LO
  ctx.strokeRect(x0, x0, x1 - x0, x1 - x0)
  ctx.lineWidth = c * 0.04
  ctx.strokeStyle = GOLD_HI
  ctx.strokeRect(x0 - c * 0.02, x0 - c * 0.02, x1 - x0 + c * 0.04, x1 - x0 + c * 0.04)
  glow.strokeStyle = GOLD
  glow.lineWidth = c * 0.04 * b
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
