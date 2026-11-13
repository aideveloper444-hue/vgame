import { shade } from '@/games/shared/three/glowTextures'
import { COLOR_DEEP, COLOR_GLOW, COLOR_HEX, type LudoColor } from './ludoBoardLayout'
import { CELL, type LudoBoard, type RadialGeometry } from './ludoBoards'
import { makeCanvas, roundRect, seeded, star, toTexture, veins, type BoardMaps } from './ludoBoardTexture'
import { BOARD_THEMES, type BoardTheme } from './ludoThemes'

export interface RadialBoardMaps extends BoardMaps {
  /** World half-size of the square the maps cover. */
  half: number
}

type Pt = [number, number]

/**
 * Paints an n-arm star board in the same material language as the classic board: a marble zone
 * wedge and base yard for each team between the arms, glossy beveled path tiles along every arm,
 * colored home lanes with chevrons, start arrows, safe-cell stars and a jeweled center polygon where
 * all the home lanes meet. Everything outside the board polygon is left transparent.
 */
export function paintRadialBoard(board: LudoBoard, g: RadialGeometry, size = 2048, theme: BoardTheme = BOARD_THEMES.obsidian): RadialBoardMaps {
  const half = g.circumradius + 0.04
  const k = size / (2 * half)
  const c = CELL * k
  const X = (x: number) => (x + half) * k
  const Z = (z: number) => (z + half) * k
  const [canvas, ctx] = makeCanvas(size)
  const [bumpCanvas, bump] = makeCanvas(size / 2)
  const [glowCanvas, glow] = makeCanvas(size / 2)
  const b = 0.5
  const rand = seeded(7 + g.n)
  const n = g.n
  const colorOf = (arm: number) => board.armColors[((arm % n) + n) % n]
  const polar = (a: number, r: number): Pt => [X(Math.cos(a) * r), Z(Math.sin(a) * r)]
  const wedgeAngle = (arm: number) => g.armAngle(arm) + Math.PI / n
  const pathPoly = (target: CanvasRenderingContext2D, pts: Pt[], scale = 1) => {
    target.beginPath()
    pts.forEach(([x, y], i) => (i ? target.lineTo(x * scale, y * scale) : target.moveTo(x * scale, y * scale)))
    target.closePath()
  }

  // board polygon: vertices on the wedge bisectors, arm tips meet the edge midpoints
  const poly: Pt[] = Array.from({ length: n }, (_, i) => polar(wedgeAngle(i), g.circumradius))

  bump.fillStyle = '#000'
  bump.fillRect(0, 0, size / 2, size / 2)
  glow.fillStyle = '#000'
  glow.fillRect(0, 0, size / 2, size / 2)

  ctx.save()
  pathPoly(ctx, poly)
  ctx.clip()
  // premium palette, matching the classic board: near-black stone, jewel-toned team colours, gold inlay
  const [GOLD_HI, GOLD, GOLD_LO] = theme.inlay
  const body = ctx.createLinearGradient(0, 0, size, size)
  body.addColorStop(0, theme.body[0])
  body.addColorStop(1, theme.body[1])
  ctx.fillStyle = body
  ctx.fillRect(0, 0, size, size)

  /* ---------- team zone wedges and base yards ---------- */
  for (let arm = 0; arm < n; arm++) {
    const color = colorOf(arm)
    const pts: Pt[] = [
      polar(g.armAngle(arm), g.r0),
      polar(g.armAngle(arm), g.apothem),
      polar(wedgeAngle(arm), g.circumradius),
      polar(g.armAngle(arm + 1), g.apothem),
      polar(g.armAngle(arm + 1), g.r0),
    ]
    const [vx, vy] = polar(wedgeAngle(arm), g.circumradius)
    // the wedge is the theme's base stone with only a faint team tint, as around the 4-player homes;
    // the team colour lives on the home plate under the yard
    const grad = ctx.createLinearGradient(X(0), Z(0), vx, vy)
    grad.addColorStop(0, theme.body[0])
    grad.addColorStop(1, theme.body[1])
    pathPoly(ctx, pts)
    ctx.fillStyle = grad
    ctx.fill()
    pathPoly(ctx, pts)
    ctx.fillStyle = `${COLOR_DEEP[color]}2a`
    ctx.fill()
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const bx = Math.min(...xs)
    const by = Math.min(...ys)
    ctx.save()
    pathPoly(ctx, pts)
    ctx.clip()
    veins(ctx, bx, by, Math.max(...xs) - bx, Math.max(...ys) - by, theme.yardVein, 0.05, 6, rand)
    const sheen = ctx.createLinearGradient(bx, by, Math.max(...xs), Math.max(...ys))
    sheen.addColorStop(0, 'rgba(255,255,255,0.1)')
    sheen.addColorStop(0.4, 'rgba(255,255,255,0.02)')
    sheen.addColorStop(1, 'rgba(0,0,0,0.2)')
    ctx.fillStyle = sheen
    ctx.fillRect(bx, by, Math.max(...xs) - bx, Math.max(...ys) - by)
    ctx.restore()
    // gold edge around the wedge
    pathPoly(ctx, pts)
    ctx.lineWidth = c * 0.04
    ctx.strokeStyle = GOLD_LO
    ctx.stroke()
    glow.lineWidth = c * 0.05 * b
    glow.strokeStyle = COLOR_GLOW[color]
    pathPoly(glow, pts, b)
    glow.stroke()
    bump.fillStyle = '#b8b8b8'
    pathPoly(bump, pts, b)
    bump.fill()

    // base yard: a marble square turned to face the center
    const [ycx, ycz] = board.yardCenter(color)
    const yx = X(ycx)
    const yy = Z(ycz)
    const yw = g.yardHalf * 2 * k
    const rot = wedgeAngle(arm)
    // jewel home plate with a metal bevel and a glowing team inlay, framing the yard
    const pw = yw * 1.24
    ctx.save()
    ctx.translate(yx, yy)
    ctx.rotate(rot)
    const plate = ctx.createLinearGradient(-pw / 2, -pw / 2, pw / 2, pw / 2)
    plate.addColorStop(0, shade(COLOR_DEEP[color], theme.plate[0]))
    plate.addColorStop(0.55, shade(COLOR_DEEP[color], theme.plate[1]))
    plate.addColorStop(1, shade(COLOR_DEEP[color], theme.plate[2]))
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = c * 0.35
    roundRect(ctx, -pw / 2, -pw / 2, pw, pw, c * 0.25)
    ctx.fillStyle = plate
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = c * 0.06
    ctx.strokeStyle = GOLD
    ctx.stroke()
    ctx.lineWidth = c * 0.035
    ctx.strokeStyle = COLOR_GLOW[color]
    roundRect(ctx, -pw / 2 + c * 0.13, -pw / 2 + c * 0.13, pw - c * 0.26, pw - c * 0.26, c * 0.2)
    ctx.stroke()
    ctx.restore()
    glow.save()
    glow.translate(yx * b, yy * b)
    glow.rotate(rot)
    glow.lineWidth = c * 0.06 * b
    glow.strokeStyle = COLOR_GLOW[color]
    roundRect(glow, (-pw / 2 + c * 0.13) * b, (-pw / 2 + c * 0.13) * b, (pw - c * 0.26) * b, (pw - c * 0.26) * b, c * 0.2 * b)
    glow.stroke()
    glow.restore()
    ctx.save()
    ctx.translate(yx, yy)
    ctx.rotate(rot)
    roundRect(ctx, -yw / 2, -yw / 2, yw, yw, c * 0.4)
    ctx.restore()
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = c * 0.25
    const yard = ctx.createLinearGradient(yx - yw / 2, yy - yw / 2, yx + yw / 2, yy + yw / 2)
    yard.addColorStop(0, theme.yard[0])
    yard.addColorStop(0.6, theme.yard[1])
    yard.addColorStop(1, theme.yard[2])
    ctx.fillStyle = yard
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(yx, yy)
    ctx.rotate(rot)
    roundRect(ctx, -yw / 2, -yw / 2, yw, yw, c * 0.4)
    ctx.clip()
    veins(ctx, -yw / 2, -yw / 2, yw, yw, theme.yardVein, 0.1, 8, rand)
    veins(ctx, -yw / 2, -yw / 2, yw, yw, shade(COLOR_GLOW[color], -0.1), 0.06, 3, rand)
    ctx.restore()
    ctx.save()
    ctx.translate(yx, yy)
    ctx.rotate(rot)
    roundRect(ctx, -yw / 2, -yw / 2, yw, yw, c * 0.4)
    ctx.restore()
    ctx.lineWidth = c * 0.05
    ctx.strokeStyle = GOLD
    ctx.stroke()
    bump.save()
    bump.translate(yx * b, yy * b)
    bump.rotate(rot)
    bump.fillStyle = '#8a8a8a'
    roundRect(bump, (-yw / 2) * b, (-yw / 2) * b, yw * b, yw * b, c * 0.4 * b)
    bump.fill()
    bump.restore()

    // a waiting spot for each warrior, always visible (a waiting warrior's glowing base covers it)
    for (let i = 0; i < 4; i++) {
      const [px, pz] = board.basePos(color, i)
      const cx = X(px)
      const cy = Z(pz)
      const R = c * 0.5
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
      ctx.arc(cx, cy, R - c * 0.08, 0, Math.PI * 2)
      ctx.lineWidth = c * 0.035
      ctx.strokeStyle = COLOR_GLOW[color]
      ctx.stroke()
      glow.beginPath()
      glow.arc(cx * b, cy * b, (R - c * 0.08) * b, 0, Math.PI * 2)
      glow.lineWidth = c * 0.05 * b
      glow.strokeStyle = COLOR_GLOW[color]
      glow.stroke()
    }
  }

  /* ---------- arms: dark grout strip under each arm's three lanes ---------- */
  for (let arm = 0; arm < n; arm++) {
    const a = g.armAngle(arm)
    const [mx, my] = polar(a, g.r0 + 3 * CELL)
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(a)
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = c * 0.3
    roundRect(ctx, -3 * c - c * 0.08, -1.5 * c - c * 0.08, 6 * c + c * 0.16, 3 * c + c * 0.16, c * 0.2)
    ctx.fillStyle = shade(theme.body[1], -0.3)
    ctx.fill()
    ctx.restore()
  }

  /* ---------- tiles ---------- */
  const tile = (x: number, z: number, angle: number, team: LudoColor | null, mark: 'arrow' | 'chevron' | 'star' | null, markTo?: Pt) => {
    const cx = X(x)
    const cy = Z(z)
    const w = c * 0.88
    // the path is built rotated, but filled with an unrotated gradient so every tile is lit from the same side
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    roundRect(ctx, -w / 2, -w / 2, w, w, c * 0.14)
    ctx.restore()
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = c * 0.12
    ctx.shadowOffsetY = c * 0.05
    const grad = ctx.createLinearGradient(cx, cy - w / 2, cx, cy + w / 2)
    if (team) {
      // deep jewel glass
      grad.addColorStop(0, shade(COLOR_HEX[team], -0.05))
      grad.addColorStop(1, shade(COLOR_DEEP[team], -0.35))
    } else {
      grad.addColorStop(0, theme.tile[0])
      grad.addColorStop(1, theme.tile[2])
    }
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = c * 0.035
    ctx.strokeStyle = team ? 'rgba(255,255,255,0.3)' : theme.neonGrid ? theme.engrave : theme.bevel
    ctx.stroke()
    if (theme.neonGrid && !team) {
      glow.save()
      glow.translate(cx * b, cy * b)
      glow.rotate(angle)
      glow.lineWidth = c * 0.03 * b
      glow.strokeStyle = theme.inlay[1]
      roundRect(glow, (-w / 2) * b, (-w / 2) * b, w * b, w * b, c * 0.14 * b)
      glow.stroke()
      glow.restore()
    }
    bump.save()
    bump.translate(cx * b, cy * b)
    bump.rotate(angle)
    bump.fillStyle = '#ffffff'
    roundRect(bump, (-w / 2) * b, (-w / 2) * b, w * b, w * b, c * 0.14 * b)
    bump.fill()
    bump.restore()

    if (mark === 'arrow' && markTo) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.atan2(Z(markTo[1]) - cy, X(markTo[0]) - cx))
      ctx.fillStyle = GOLD_HI
      ctx.beginPath()
      ctx.moveTo(c * 0.26, 0)
      ctx.lineTo(-c * 0.16, -c * 0.22)
      ctx.lineTo(-c * 0.06, 0)
      ctx.lineTo(-c * 0.16, c * 0.22)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    } else if (mark === 'chevron') {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.atan2(Z(0) - cy, X(0) - cx))
      ctx.strokeStyle = 'rgba(255,240,205,0.5)'
      ctx.lineWidth = c * 0.05
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(-c * 0.08, -c * 0.16)
      ctx.lineTo(c * 0.1, 0)
      ctx.lineTo(-c * 0.08, c * 0.16)
      ctx.stroke()
      ctx.restore()
      if (team) {
        glow.save()
        glow.translate(cx * b, cy * b)
        glow.rotate(angle)
        glow.fillStyle = shade(COLOR_GLOW[team], -0.78)
        roundRect(glow, (-w / 2) * b, (-w / 2) * b, w * b, w * b, c * 0.14 * b)
        glow.fill()
        glow.restore()
      }
    } else if (mark === 'star') {
      star(ctx, cx, cy, c * 0.3, c * 0.13)
      const sg = ctx.createLinearGradient(cx, cy - c * 0.3, cx, cy + c * 0.3)
      sg.addColorStop(0, GOLD_HI)
      sg.addColorStop(0.55, GOLD)
      sg.addColorStop(1, GOLD_LO)
      ctx.fillStyle = sg
      ctx.fill()
    }
  }

  const entryTeam = new Map<number, LudoColor>()
  for (const color of board.armColors) entryTeam.set(board.entryAbs(color), color)
  for (let abs = 0; abs < board.ringSize; abs++) {
    const arm = Math.floor(abs / 13)
    const [x, z] = board.ringPos(abs)
    const team = entryTeam.get(abs) ?? null
    tile(x, z, g.armAngle(arm), team, team ? 'arrow' : board.isSafe(abs) ? 'star' : null, board.ringNext(abs))
  }
  for (let arm = 0; arm < n; arm++) {
    const color = colorOf(arm)
    for (let step = 0; step < 5; step++) {
      const [x, z] = board.homePos(color, step)
      tile(x, z, g.armAngle(arm), color, 'chevron')
    }
  }

  /* ---------- center: every home lane converges on one triangle of the polygon ---------- */
  const cornerR = g.r0 / Math.cos(Math.PI / n)
  const corners: Pt[] = Array.from({ length: n }, (_, i) => polar(g.armAngle(i) - Math.PI / n, cornerR))
  const mid: Pt = [X(0), Z(0)]
  for (let arm = 0; arm < n; arm++) {
    const color = colorOf(arm)
    const p1 = corners[arm]
    const p2 = corners[(arm + 1) % n]
    const grad = ctx.createLinearGradient((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, mid[0], mid[1])
    grad.addColorStop(0, shade(COLOR_DEEP[color], -0.45))
    grad.addColorStop(1, shade(COLOR_HEX[color], -0.1))
    pathPoly(ctx, [p1, p2, mid])
    ctx.fillStyle = grad
    ctx.fill()
    pathPoly(glow, [p1, p2, mid], b)
    glow.fillStyle = shade(COLOR_GLOW[color], -0.82)
    glow.fill()
  }
  ctx.strokeStyle = '#f7d27a'
  ctx.lineWidth = c * 0.05
  ctx.beginPath()
  for (const [x, y] of corners) {
    ctx.moveTo(mid[0], mid[1])
    ctx.lineTo(x, y)
  }
  ctx.stroke()
  const opp: Pt = [mid[0] * 2 - corners[0][0], mid[1] * 2 - corners[0][1]]
  const crystal = ctx.createLinearGradient(corners[0][0], corners[0][1], opp[0], opp[1])
  crystal.addColorStop(0, 'rgba(255,255,255,0.4)')
  crystal.addColorStop(0.4, 'rgba(255,255,255,0.06)')
  crystal.addColorStop(0.42, 'rgba(255,255,255,0.2)')
  crystal.addColorStop(0.48, 'rgba(255,255,255,0)')
  crystal.addColorStop(1, 'rgba(0,0,0,0.18)')
  pathPoly(ctx, corners)
  ctx.fillStyle = crystal
  ctx.fill()
  ctx.lineWidth = c * 0.12
  ctx.strokeStyle = '#b7801c'
  ctx.stroke()
  ctx.lineWidth = c * 0.05
  ctx.strokeStyle = '#ffe9a8'
  ctx.stroke()
  pathPoly(glow, corners, b)
  glow.strokeStyle = '#ffcf5a'
  glow.lineWidth = c * 0.05 * b
  glow.stroke()
  pathPoly(bump, corners, b)
  bump.fillStyle = '#c8c8c8'
  bump.fill()
  ctx.restore()

  const [soft, sctx] = makeCanvas(size / 2)
  sctx.filter = `blur(${Math.max(1, c * 0.03)}px)`
  sctx.drawImage(bumpCanvas, 0, 0)
  const [bloom, blctx] = makeCanvas(size / 2)
  blctx.filter = `blur(${c * 0.1}px)`
  blctx.drawImage(glowCanvas, 0, 0)
  blctx.drawImage(glowCanvas, 0, 0)
  blctx.filter = 'none'
  blctx.globalAlpha = 0.45
  blctx.drawImage(glowCanvas, 0, 0)

  return { map: toTexture(canvas, true), bumpMap: toTexture(soft, false), emissiveMap: toTexture(bloom, true), half }
}
