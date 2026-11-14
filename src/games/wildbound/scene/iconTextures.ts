import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as THREE from 'three'
import { ChevronsUp, Eye, Flame, Leaf, Magnet, Moon, Rocket, Shield, Sparkles, Sun, Zap, type LucideIcon } from 'lucide-react'
import type { PowerUpKind } from '../engine/content'

/*
 * Textures for the pickups on the trail, drawn from the same line icons as the HUD and the store (icons.tsx): a gold
 * line icon on a smoked-glass disc with a hairline gold ring. They replace the painted, glowing badges.
 */

function iconTexture(Icon: LucideIcon): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  // the disc: smoked glass, a warm light from above, a hairline gold ring
  const g = ctx.createRadialGradient(S / 2, S * 0.36, S * 0.05, S / 2, S / 2, S * 0.48)
  g.addColorStop(0, 'rgba(96, 82, 56, 0.95)')
  g.addColorStop(1, 'rgba(14, 15, 12, 0.92)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(232, 208, 156, 0.9)'
  ctx.lineWidth = S * 0.022
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.45, 0, Math.PI * 2)
  ctx.stroke()
  const icon = S * 0.52
  const svg = renderToStaticMarkup(createElement(Icon, { size: icon, color: '#f3e3bd', strokeWidth: 1.9 }))
  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, (S - icon) / 2, (S - icon) / 2, icon, icon)
    tex.needsUpdate = true
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return tex
}

const POWER_ICON: Record<PowerUpKind, LucideIcon> = { speed: Zap, magnet: Magnet, shield: Shield, superjump: ChevronsUp, megajump: Rocket, boost: Flame }

let cache: (Record<PowerUpKind, THREE.CanvasTexture> & { token: THREE.CanvasTexture }) | null = null
/** One texture per power-up and the festival token (made once, shared by every scene). */
export function pickupTextures() {
  if (!cache) {
    const out = Object.fromEntries(Object.entries(POWER_ICON).map(([k, I]) => [k, iconTexture(I)])) as Record<PowerUpKind, THREE.CanvasTexture>
    cache = { ...out, token: iconTexture(Sparkles) }
  }
  return cache
}

let symbols: THREE.CanvasTexture[] | null = null
/** The four temple door carvings (sun, moon, eye, leaf, in DOOR_SYMBOLS order), as gold-on-dark plates. */
export function symbolTextures() {
  if (!symbols) symbols = [Sun, Moon, Eye, Leaf].map((I) => iconTexture(I))
  return symbols
}
