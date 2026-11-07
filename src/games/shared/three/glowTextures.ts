import * as THREE from 'three'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour, returned as an rgb() string. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))))
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}

/** Soft radial glow "puddle" decal used under player tokens, like a spotlight pool. */
export function makeGlowPuddleTexture(hex: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.18, shade(hex, 0.6))
  grad.addColorStop(0.4, hex)
  grad.addColorStop(0.72, `${hex}66`)
  grad.addColorStop(1, `${hex}00`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}
