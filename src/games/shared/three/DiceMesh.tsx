import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DICE_FACE_QUATERNION } from './diceFaceQuaternions'

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.25, 0.25],
    [0.75, 0.75],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  5: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  6: [
    [0.25, 0.2],
    [0.75, 0.2],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.25, 0.8],
    [0.75, 0.8],
  ],
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function makeFaceTexture(pips: number, accent: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const face = ctx.createLinearGradient(0, 0, size, size)
  face.addColorStop(0, '#ffffff')
  face.addColorStop(0.55, '#f4f4f8')
  face.addColorStop(1, '#e4e6ee')
  ctx.fillStyle = face
  roundRect(ctx, 6, 6, size - 12, size - 12, 44)
  ctx.fill()
  ctx.strokeStyle = 'rgba(180,185,200,0.7)'
  ctx.lineWidth = 3
  ctx.stroke()

  // soft inner vignette for a subtly domed, glossy plastic look
  const vg = ctx.createRadialGradient(size * 0.4, size * 0.32, size * 0.1, size / 2, size / 2, size * 0.7)
  vg.addColorStop(0, 'rgba(255,255,255,0.5)')
  vg.addColorStop(0.5, 'rgba(255,255,255,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.06)')
  ctx.fillStyle = vg
  roundRect(ctx, 6, 6, size - 12, size - 12, 44)
  ctx.fill()

  const r = size * 0.088
  for (const [px, py] of PIP_LAYOUTS[pips]) {
    const cx = px * size
    const cy = py * size
    // pip well shadow
    ctx.beginPath()
    ctx.arc(cx, cy + r * 0.18, r * 1.08, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fill()
    // glossy black pip with a small specular highlight, tinted faintly by the accent
    const pip = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r)
    pip.addColorStop(0, '#3a3f4d')
    pip.addColorStop(0.55, '#15171f')
    pip.addColorStop(1, '#050608')
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = pip
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = `${accent}55`
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx - r * 0.32, cy - r * 0.32, r * 0.26, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// BoxGeometry material slot order is [+x, -x, +y, -y, +z, -z]; assign so opposite faces sum to 7.
const FACE_ORDER = [1, 6, 2, 5, 3, 4]

const SPIN_MS = 380
const SETTLE_MS = 220

export default function DiceMesh({
  value,
  rollId,
  size = 0.62,
  accent = '#ef4444',
}: {
  value: number
  rollId: number
  size?: number
  accent?: string
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const rollingRef = useRef(false)
  const startRef = useRef(0)

  const materials = useMemo(
    () =>
      FACE_ORDER.map(
        (pips) =>
          new THREE.MeshPhysicalMaterial({
            map: makeFaceTexture(pips, accent),
            roughness: 0.18,
            metalness: 0.05,
            clearcoat: 0.9,
            clearcoatRoughness: 0.12,
            envMapIntensity: 1.2,
          }),
      ),
    [accent],
  )

  useEffect(() => {
    rollingRef.current = true
    startRef.current = performance.now()
  }, [rollId])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const target = new THREE.Quaternion(...DICE_FACE_QUATERNION[value as 1 | 2 | 3 | 4 | 5 | 6])

    if (rollingRef.current) {
      const elapsed = performance.now() - startRef.current
      if (elapsed < SPIN_MS) {
        mesh.rotateX(delta * 14)
        mesh.rotateY(delta * 11)
        mesh.rotateZ(delta * 9)
      } else if (elapsed < SPIN_MS + SETTLE_MS) {
        mesh.quaternion.slerp(target, 0.35)
      } else {
        mesh.quaternion.copy(target)
        rollingRef.current = false
      }
    } else {
      mesh.quaternion.slerp(target, 0.2)
    }
  })

  return (
    <mesh ref={meshRef} castShadow receiveShadow position={[0, size / 2, 0]}>
      <boxGeometry args={[size, size, size]} />
      {materials.map((m, i) => (
        <primitive key={i} object={m} attach={`material-${i}`} />
      ))}
    </mesh>
  )
}
