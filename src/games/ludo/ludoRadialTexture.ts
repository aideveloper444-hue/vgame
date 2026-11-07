import { shade } from '@/games/shared/three/glowTextures'
import { COLOR_DEEP, COLOR_GLOW, COLOR_HEX, type LudoColor } from './ludoBoardLayout'
import { CELL, type LudoBoard, type RadialGeometry } from './ludoBoards'
import { makeCanvas, roundRect, seeded, star, toTexture, veins, type BoardMaps } from './ludoBoardTexture'

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
export function paintRadialBoard(board: LudoBoard, g: RadialGeometry, size = 2048): RadialBoardMaps {
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
  const body = ctx.createLinearGradient(0, 0, size, size)
  body.addColorStop(0, '#1d2140')
  body.addColorStop(1, '#0c0e1f')
  ctx.fillStyle = body
  ctx.fillRect(0, 0, size, size)

  /* ---------- team zone wedges and base yards ---------- */
  for (let arm = 0; arm < n; arm++) {
    const color = colorOf(arm)
    const main = COLOR_HEX[color]
    const pts: Pt[] = [
      polar(g.armAngle(arm), g.r0),
      polar(g.armAngle(arm), g.apothem),
      polar(wedgeAngle(arm), g.circumradius),
      polar(g.armAngle(arm + 1), g.apothem),
      polar(g.armAngle(arm + 1), g.r0),
    ]
    const [vx, vy] = polar(wedgeAngle(arm), g.circumradius)
    const grad = ctx.createLinearGradient(X(0), Z(0), vx, vy)
    grad.addColorStop(0, COLOR_DEEP[color])
    grad.addColorStop(0.5, main)
    grad.addColorStop(1, shade(COLOR_GLOW[color], 0.15))
    pathPoly(ctx, pts)
    ctx.fillStyle = grad
    ctx.fill()
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const bx = Math.min(...xs)
    const by = Math.min(...ys)
    ctx.save()
    pathPoly(ctx, pts)
    ctx.clip()
    veins(ctx, bx, by, Math.max(...xs) - bx, Math.max(...ys) - by, shade(main, 0.6), 0.16, 7, rand)
    veins(ctx, bx, by, Math.max(...xs) - bx, Math.max(...ys) - by, shade(main, -0.5), 0.12, 5, rand)
    const sheen = ctx.createLinearGradient(bx, by, Math.max(...xs), Math.max(...ys))
    sheen.addColorStop(0, 'rgba(255,255,255,0.28)')
    sheen.addColorStop(0.4, 'rgba(255,255,255,0.03)')
    sheen.addColorStop(1, 'rgba(0,0,0,0.2)')
    ctx.fillStyle = sheen
    ctx.fillRect(bx, by, Math.max(...xs) - bx, Math.max(...ys) - by)
    ctx.restore()
    glow.lineWidth = c * 0.08 * b
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
    ctx.save()
    ctx.translate(yx, yy)
    ctx.rotate(rot)
    roundRect(ctx, -yw / 2, -yw / 2, yw, yw, c * 0.4)
    ctx.restore()
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = c * 0.25
    const yard = ctx.createLinearGradient(yx - yw / 2, yy - yw / 2, yx + yw / 2, yy + yw / 2)
    yard.addColorStop(0, '#fbfcff')
    yard.addColorStop(0.55, shade(COLOR_GLOW[color], 0.88))
    yard.addColorStop(1, shade(COLOR_GLOW[color], 0.7))
    ctx.fillStyle = yard
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(yx, yy)
    ctx.rotate(rot)
    roundRect(ctx, -yw / 2, -yw / 2, yw, yw, c * 0.4)
    ctx.clip()
    veins(ctx, -yw / 2, -yw / 2, yw, yw, '#8e94aa', 0.22, 9, rand)
    veins(ctx, -yw / 2, -yw / 2, yw, yw, shade(main, -0.2), 0.12, 4, rand)
    ctx.restore()
    ctx.save()
    ctx.translate(yx, yy)
    ctx.rotate(rot)
    roundRect(ctx, -yw / 2, -yw / 2, yw, yw, c * 0.4)
    ctx.restore()
    ctx.lineWidth = c * 0.05
    ctx.strokeStyle = shade(COLOR_GLOW[color], 0.55)
    ctx.stroke()
    bump.save()
    bump.translate(yx * b, yy * b)
    bump.rotate(rot)
    bump.fillStyle = '#8a8a8a'
    roundRect(bump, (-yw / 2) * b, (-yw / 2) * b, yw * b, yw * b, c * 0.4 * b)
    bump.fill()
    bump.restore()

    for (let i = 0; i < 4; i++) {
      const [px, pz] = board.basePos(color, i)
      const cx = X(px)
      const cy = Z(pz)
      const pad = ctx.createRadialGradient(cx, cy - c * 0.1, c * 0.05, cx, cy, c * 0.5)
      pad.addColorStop(0, shade(COLOR_GLOW[color], 0.55))
      pad.addColorStop(1, shade(main, 0.2))
      ctx.beginPath()
      ctx.arc(cx, cy, c * 0.42, 0, Math.PI * 2)
      ctx.fillStyle = pad
      ctx.fill()
      ctx.lineWidth = c * 0.05
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.stroke()
      glow.beginPath()
      glow.arc(cx * b, cy * b, c * 0.42 * b, 0, Math.PI * 2)
      glow.lineWidth = c * 0.07 * b
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
    ctx.fillStyle = '#10132a'
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
      grad.addColorStop(0, shade(COLOR_GLOW[team], 0.12))
      grad.addColorStop(1, COLOR_HEX[team])
    } else {
      grad.addColorStop(0, '#f6f7fb')
      grad.addColorStop(1, '#d3d7e4')
    }
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = c * 0.035
    ctx.strokeStyle = team ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)'
    ctx.stroke()
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
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
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
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = c * 0.07
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
      sg.addColorStop(0, '#d7dbe6')
      sg.addColorStop(1, '#9aa1b6')
      ctx.fillStyle = sg
      ctx.fill()
      ctx.lineWidth = c * 0.025
      ctx.strokeStyle = '#7b8196'
      ctx.stroke()
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

  /* ---------- zone light spill ---------- */
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  for (let arm = 0; arm < n; arm++) {
    const color = colorOf(arm)
    const [zx, zz] = board.yardCenter(color)
    const spill = ctx.createRadialGradient(X(zx), Z(zz), c * 2.5, X(zx), Z(zz), c * 7)
    spill.addColorStop(0, shade(COLOR_GLOW[color], 0.6))
    spill.addColorStop(1, 'rgba(255,255,255,1)')
    ctx.fillStyle = spill
    ctx.fillRect(0, 0, size, size)
  }
  ctx.restore()

  /* ---------- center: every home lane converges on one triangle of the polygon ---------- */
  const cornerR = g.r0 / Math.cos(Math.PI / n)
  const corners: Pt[] = Array.from({ length: n }, (_, i) => polar(g.armAngle(i) - Math.PI / n, cornerR))
  const mid: Pt = [X(0), Z(0)]
  for (let arm = 0; arm < n; arm++) {
    const color = colorOf(arm)
    const p1 = corners[arm]
    const p2 = corners[(arm + 1) % n]
    const grad = ctx.createLinearGradient((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, mid[0], mid[1])
    grad.addColorStop(0, COLOR_HEX[color])
    grad.addColorStop(1, shade(COLOR_GLOW[color], 0.35))
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
