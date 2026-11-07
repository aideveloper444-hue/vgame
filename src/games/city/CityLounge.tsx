import { useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'

/*
 * The room the board sits in: a polished dark-marble table that mirrors the board's neon and warm
 * out-of-focus lounge lights (bokeh) around it, so the board reads as a premium object on a real
 * table, not floating in a void.
 */

const TABLE_Y = -0.62

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function bokehTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.75)')
  grad.addColorStop(0.8, 'rgba(255,255,255,0.25)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function marbleTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#1c2030'
  g.fillRect(0, 0, 512, 512)
  const r = rng(9)
  // faint veins
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = `rgba(${170 + r() * 60},${160 + r() * 50},${140 + r() * 40},${0.12 + r() * 0.16})`
    g.lineWidth = 0.6 + r() * 1.6
    g.beginPath()
    let x = r() * 512
    let y = r() * 512
    g.moveTo(x, y)
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.3) * 90
      y += (r() - 0.5) * 70
      g.lineTo(x, y)
    }
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 3)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Bokeh() {
  const tex = useMemo(() => bokehTexture(), [])
  const lights = useMemo(() => {
    const r = rng(41)
    const warm = ['#ffb347', '#ffd27a', '#ff9e5e', '#ffe0a8', '#c48cff', '#7fb8ff']
    return Array.from({ length: 46 }, () => {
      // warm lounge lights glinting on the table beyond the board's edges, where the camera can see them
      const side = r() < 0.5 ? -1 : 1
      const x = side * (9.5 + r() * 7)
      const z = -9 + r() * 15
      return { pos: [x, -0.4 + r() * 1.6, z] as [number, number, number], s: 0.5 + r() * 1.6, c: warm[Math.floor(r() * (r() < 0.75 ? 4 : warm.length))], o: 0.18 + r() * 0.35 }
    })
  }, [])
  return (
    <group>
      {lights.map((l, i) => (
        <sprite key={i} position={l.pos} scale={[l.s, l.s, 1]}>
          <spriteMaterial map={tex} color={l.c} transparent opacity={l.o} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}


export default function CityLounge() {
  const marble = useMemo(() => marbleTexture(), [])
  return (
    <group>
      {/* polished marble table: mirrors the board and its neon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLE_Y, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <MeshReflectorMaterial
          map={marble}
          resolution={512}
          mirror={0.6}
          blur={[300, 100]}
          mixBlur={1}
          mixStrength={3}
          depthScale={0.5}
          minDepthThreshold={0.5}
          maxDepthThreshold={1.3}
          roughness={0.5}
          metalness={0.5}
          color="#ffffff"
        />
      </mesh>
      <Bokeh />
    </group>
  )
}
