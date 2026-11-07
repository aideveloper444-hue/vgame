import * as THREE from 'three'

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return [canvas, canvas.getContext('2d')!]
}

function finish(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

/** White center fading to black at the rim — used as an alphaMap so the table melts into the backdrop. */
export function makeRadialFadeTexture(inner = 0.3, outer = 0.5): THREE.CanvasTexture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size * outer)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#000000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return finish(canvas, false)
}

/** Soft round glow, tinted by the sprite/material color. */
export function makeSoftGlowTexture(): THREE.CanvasTexture {
  const size = 128
  const [canvas, ctx] = makeCanvas(size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return finish(canvas)
}

/** A thin blade-slash streak: bright hot core tapering to nothing at both ends, for sword-impact sprites. */
export function makeStreakTexture(): THREE.CanvasTexture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  const along = ctx.createLinearGradient(0, 0, size, 0)
  along.addColorStop(0, 'rgba(255,255,255,0)')
  along.addColorStop(0.45, 'rgba(255,255,255,1)')
  along.addColorStop(0.55, 'rgba(255,255,255,1)')
  along.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = along
  ctx.beginPath()
  ctx.moveTo(0, size / 2)
  ctx.quadraticCurveTo(size / 2, size * 0.18, size, size / 2)
  ctx.quadraticCurveTo(size / 2, size * 0.82, 0, size / 2)
  ctx.fill()
  return finish(canvas)
}

/**
 * Floor-to-ceiling penthouse windows at dusk: violet-to-orange sky, two depths of towers with lit
 * windows and red beacons, and dark mullions. `horizon` is where the city meets the floor line (0–1 from the top).
 */
export function makeSkylineWallTexture(horizon = 0.78): THREE.CanvasTexture {
  const W = 2048
  const H = 1024
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  let seed = 7
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const base = H * horizon
  const sky = ctx.createLinearGradient(0, 0, 0, base)
  sky.addColorStop(0, '#0d0826')
  sky.addColorStop(0.35, '#2a1560')
  sky.addColorStop(0.62, '#6a2c8c')
  sky.addColorStop(0.82, '#d4577e')
  sky.addColorStop(1, '#ff9a5e')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, base)
  ctx.fillStyle = '#07040f'
  ctx.fillRect(0, base, W, H - base)

  const layer = (maxH: number, tint: string, lit: number, winScale: number) => {
    let x = -10
    while (x < W) {
      const w = (26 + rand() * 60) * winScale
      const h = maxH * (0.25 + Math.pow(rand(), 0.8) * 0.75)
      ctx.fillStyle = tint
      ctx.fillRect(x, base - h, w, h)
      if (rand() > 0.75) {
        ctx.fillStyle = '#ff4d6d'
        ctx.beginPath()
        ctx.arc(x + w / 2, base - h - 4, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      for (let wy = base - h + 8; wy < base - 4; wy += 9 * winScale) {
        for (let wx = x + 4; wx < x + w - 4; wx += 7 * winScale) {
          if (rand() < lit) {
            ctx.fillStyle = rand() > 0.3 ? `rgba(255,207,134,${0.5 + rand() * 0.5})` : `rgba(168,216,255,${0.5 + rand() * 0.5})`
            ctx.fillRect(wx, wy, 3 * winScale, 4 * winScale)
          }
        }
      }
      x += w + 2 + rand() * 12
    }
  }
  layer(H * 0.42, '#3b2266', 0.32, 0.8)
  layer(H * 0.55, '#170c2c', 0.38, 1)
  // warm haze where the city meets the sunset
  const haze = ctx.createLinearGradient(0, base - H * 0.2, 0, base)
  haze.addColorStop(0, 'rgba(255,140,100,0)')
  haze.addColorStop(1, 'rgba(255,150,100,0.35)')
  ctx.fillStyle = haze
  ctx.fillRect(0, base - H * 0.2, W, H * 0.2)

  // window mullions and a transom bar
  for (let i = 0; i <= 8; i++) {
    const mx = (i / 8) * W
    const g = ctx.createLinearGradient(mx - 10, 0, mx + 10, 0)
    g.addColorStop(0, '#05030b')
    g.addColorStop(0.5, '#2a1d44')
    g.addColorStop(1, '#05030b')
    ctx.fillStyle = g
    ctx.fillRect(mx - 10, 0, 20, H)
  }
  ctx.fillStyle = '#0a0616'
  ctx.fillRect(0, H * 0.12, W, 10)
  const reflect = ctx.createLinearGradient(0, 0, W, H)
  reflect.addColorStop(0.3, 'rgba(255,255,255,0)')
  reflect.addColorStop(0.38, 'rgba(255,255,255,0.05)')
  reflect.addColorStop(0.44, 'rgba(255,255,255,0)')
  ctx.fillStyle = reflect
  ctx.fillRect(0, 0, W, H)
  // soft focus, like a camera focused on the table with the city far behind it
  const soft = document.createElement('canvas')
  soft.width = W
  soft.height = H
  const sctx = soft.getContext('2d')!
  sctx.filter = 'blur(6px)'
  sctx.drawImage(canvas, 0, 0)
  return finish(soft)
}

/** An emoji drawn onto a transparent texture, for floating 3D icons like the capture skull. */
export function makeEmojiTexture(emoji: string, ring?: string): THREE.CanvasTexture {
  const size = 128
  const [canvas, ctx] = makeCanvas(size)
  if (ring) {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2)
    ctx.fillStyle = ring
    ctx.shadowColor = ring
    ctx.shadowBlur = 16
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }
  ctx.font = `${size * 0.56}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04)
  return finish(canvas)
}
