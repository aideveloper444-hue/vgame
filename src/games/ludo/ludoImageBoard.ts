import * as THREE from 'three'
import { CLASSIC_LANE } from './ludoBoards'

/**
 * Where a board photo's features sit, in source pixels. Illustrated boards are never perfectly regular
 * (lanes a little wider than arm cells, yard gems not quite centred), so the photo is warped piecewise
 * onto the game's exact 15x15 grid: every grid line lands on a real cell edge and every yard gem lands
 * under a warrior's waiting slot, without stretching the gems themselves. The photo's own frame and
 * corner ornaments are kept, in a margin around the grid.
 */
export interface BoardImageCalibration {
  url: string
  /** Source image width and height. */
  size: [number, number]
  /** Source x of grid lines 0, 6, 9 and 15 (left edge, vertical walkway, right edge). */
  xs: [number, number, number, number]
  /** Source y of grid lines 0, 6, 9 and 15. */
  ys: [number, number, number, number]
  /** Source centres of the two gem columns / rows in each yard, keyed by quadrant. */
  gems: { tl: Gem; tr: Gem; bl: Gem; br: Gem }
  /** Half-width of a gem plus its gold rim, in cells; that band is copied without any scaling. */
  gemHalf: number
}

interface Gem {
  x: [number, number]
  y: [number, number]
}

/** Width of the photo's frame around the 15x15 grid, in cells, on every side. */
export const PHOTO_MARGIN = 0.75
/** Half the photo's width in world units (grid plus frame). */
export const PHOTO_HALF = (15 / 2 + PHOTO_MARGIN) * CLASSIC_LANE

/** Gem centres within a quadrant, in cells from the quadrant's corner: they match BASE_SLOT_COORDS. */
const SLOT_CENTERS: [number, number] = [2, 4]

/** Source → target knots along one axis of one band (target in grid cells). */
function bandKnots(s0: number, s1: number, t0: number, t1: number, gems: [number, number] | null, half: number): [number[], number[]] {
  if (!gems) return [[s0, s1], [t0, t1]]
  const cell = (s1 - s0) / (t1 - t0)
  const src = [s0]
  const dst = [t0]
  for (let i = 0; i < 2; i++) {
    src.push(gems[i] - half * cell, gems[i] + half * cell)
    dst.push(t0 + SLOT_CENTERS[i] - half, t0 + SLOT_CENTERS[i] + half)
  }
  src.push(s1)
  dst.push(t1)
  return [src, dst]
}

/** Draws the calibrated photo onto `ctx` (size x size): grid cells -MARGIN..15+MARGIN fill the canvas. */
function drawWarped(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cal: BoardImageCalibration, size: number) {
  const M = PHOTO_MARGIN
  const toPx = (cell: number) => ((cell + M) / (15 + 2 * M)) * size
  // five bands per axis: frame, home, walkway, home, frame
  const sx = [0, ...cal.xs, cal.size[0]]
  const sy = [0, ...cal.ys, cal.size[1]]
  const t = [-M, 0, 6, 9, 15, 15 + M]
  const gemFor = (rb: number, cb: number): Gem | null => {
    if ((rb !== 1 && rb !== 3) || (cb !== 1 && cb !== 3)) return null
    return cal.gems[`${rb === 1 ? 't' : 'b'}${cb === 1 ? 'l' : 'r'}` as const]
  }
  ctx.imageSmoothingQuality = 'high'
  for (let rb = 0; rb < 5; rb++) {
    for (let cb = 0; cb < 5; cb++) {
      const gem = gemFor(rb, cb)
      const [kx, tx] = bandKnots(sx[cb], sx[cb + 1], t[cb], t[cb + 1], gem?.x ?? null, cal.gemHalf)
      const [ky, ty] = bandKnots(sy[rb], sy[rb + 1], t[rb], t[rb + 1], gem?.y ?? null, cal.gemHalf)
      for (let i = 0; i < kx.length - 1; i++) {
        for (let j = 0; j < ky.length - 1; j++) {
          const dx = toPx(tx[i])
          const dy = toPx(ty[j])
          // half a pixel of overlap hides seams between the pieces
          ctx.drawImage(img, kx[i], ky[j], kx[i + 1] - kx[i], ky[j + 1] - ky[j], dx - 0.5, dy - 0.5, toPx(tx[i + 1]) - dx + 1, toPx(ty[j + 1]) - dy + 1)
        }
      }
    }
  }
}

const cache = new Map<string, THREE.CanvasTexture>()

/** The photo, warped onto the grid, as a texture (blank until the image has loaded). */
export function photoBoardTexture(cal: BoardImageCalibration, size = 4096): THREE.CanvasTexture {
  const hit = cache.get(cal.url)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    drawWarped(canvas.getContext('2d')!, img, cal, size)
    tex.needsUpdate = true
  }
  img.src = cal.url
  cache.set(cal.url, tex)
  return tex
}
