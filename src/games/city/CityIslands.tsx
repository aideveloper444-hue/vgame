import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three-stdlib'

/*
 * The miniature world's geography: a glossy night ocean filling the space inside the tile ring, organic
 * islands (sand shore, grass top) under every district, a dense glowing downtown island in the middle,
 * lit bridges tying the islands together and neon-windowed towers packed between the landmarks.
 * The towers are procedural and merged into a few draw calls so phones keep their frame rate.
 */

export const SEA_Y = 0.02
/** Height of an island's grass top, where landmarks and towers stand. */
export const ISLAND_TOP = 0.11

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export interface IslandSpec {
  x: number
  z: number
  r: number
  seed: number
  /** Stretch along x / z, for long islands. */
  sx?: number
  sz?: number
}

/** A smooth, irregular closed outline around the origin (radius r, wobbling a little). */
function blobShape(spec: IslandSpec, inset = 0) {
  const r = rng(spec.seed)
  const waves = [1 + r() * 0.5, r() * Math.PI * 2, 0.06 + r() * 0.05, r() * Math.PI * 2, 0.04 + r() * 0.04]
  const shape = new THREE.Shape()
  const N = 48
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const k = 1 + waves[2] * Math.sin(a * 3 + waves[1]) + waves[4] * Math.sin(a * 5 + waves[3])
    const rad = spec.r * k - inset
    const x = Math.cos(a) * rad * (spec.sx ?? 1)
    const y = Math.sin(a) * rad * (spec.sz ?? 1)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  return shape
}

const sandMat = new THREE.MeshStandardMaterial({ color: '#d9b26a', roughness: 0.85 })
const grassMat = new THREE.MeshStandardMaterial({ color: '#2f8a4e', roughness: 0.8 })
const cliffMat = new THREE.MeshStandardMaterial({ color: '#6b5a44', roughness: 0.9 })

/** One island: a rocky base, a sand shore ring and a raised grass top. */
export function Island({ spec }: { spec: IslandSpec }) {
  const geos = useMemo(() => {
    const ext = (shape: THREE.Shape, depth: number) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 })
      g.rotateX(-Math.PI / 2)
      return g
    }
    return {
      base: ext(blobShape(spec, -0.05), 0.04),
      sand: ext(blobShape(spec, 0), 0.05),
      grass: ext(blobShape(spec, 0.09), 0.05),
    }
  }, [spec])
  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh geometry={geos.base} position={[0, SEA_Y - 0.03, 0]} material={cliffMat} receiveShadow />
      <mesh geometry={geos.sand} position={[0, SEA_Y + 0.01, 0]} material={sandMat} receiveShadow castShadow />
      <mesh geometry={geos.grass} position={[0, ISLAND_TOP - 0.05, 0]} material={grassMat} receiveShadow castShadow />
    </group>
  )
}

/* ------------------------------------------------------------------ ocean */

function waveTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 1.6
  const r = rng(5)
  for (let i = 0; i < 40; i++) {
    const x = r() * 256
    const y = r() * 256
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + 8, y - 3, x + 18, y)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(5, 5)
  return t
}

/** Deep blue night ocean with drifting wave glints, filling the inner square. */
export function Ocean({ size }: { size: number }) {
  const waves = useMemo(() => waveTexture(), [])
  useFrame((_, dt) => {
    waves.offset.x += dt * 0.012
    waves.offset.y += dt * 0.02
  })
  return (
    <group position={[0, SEA_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshPhysicalMaterial color="#06306b" emissive="#062a5c" emissiveIntensity={0.55} roughness={0.08} metalness={0.3} clearcoat={1} clearcoatRoughness={0.04} envMapIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0, 0.003]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={waves} color="#7fd8ff" transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ towers */

function windowTexture(seed: number) {
  const r = rng(seed)
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#26346e'
  g.fillRect(0, 0, 64, 128)
  const tints = ['#ffd27a', '#ffe8b0', '#7fe9ff', '#ffb36b', '#c4a8ff']
  for (let y = 3; y < 125; y += 6) {
    for (let x = 3; x < 61; x += 6) {
      if (r() > 0.68) continue
      g.globalAlpha = 0.45 + r() * 0.55
      g.fillStyle = tints[Math.floor(r() * (r() < 0.7 ? 2 : tints.length))]
      g.fillRect(x, y, 4, 3)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface TowerSpot {
  x: number
  z: number
  w: number
  h: number
  /** 0..2: which facade texture (and tint) to use */
  kind: number
  round?: boolean
  neon?: string
}

/** Packs towers onto an island: a ring of spots, skipping a clear middle where landmarks stand. */
export function towersAround(spec: IslandSpec, count: number, hMin: number, hMax: number, clearR: number, seed: number): TowerSpot[] {
  const r = rng(seed)
  const out: TowerSpot[] = []
  const neon = ['#22d3ee', '#ff3fd2', '#a855f7', '#fbbf24']
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.4
    const d = clearR + r() * (spec.r - 0.16 - clearR)
    out.push({
      x: spec.x + Math.cos(a) * d * (spec.sx ?? 1),
      z: spec.z + Math.sin(a) * d * (spec.sz ?? 1),
      w: 0.08 + r() * 0.07,
      h: hMin + Math.pow(r(), 1.4) * (hMax - hMin),
      kind: Math.floor(r() * 3),
      round: r() < 0.25,
      neon: r() < 0.4 ? neon[Math.floor(r() * neon.length)] : undefined,
    })
  }
  return out
}

/** Every tower in the world, merged by facade into three meshes plus one neon-trim mesh. */
export function Towers({ spots }: { spots: TowerSpot[] }) {
  const { bodies, trims, tex } = useMemo(() => {
    const groups: THREE.BufferGeometry[][] = [[], [], []]
    const trimParts: THREE.BufferGeometry[] = []
    const col = new THREE.Color()
    for (const t of spots) {
      const g = t.round ? new THREE.CylinderGeometry(t.w / 2, t.w / 2, t.h, 12) : new THREE.BoxGeometry(t.w, t.h, t.w)
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (t.round ? 2 : 1), uv.getY(i) * t.h * 2.2)
      g.translate(t.x, ISLAND_TOP + t.h / 2, t.z)
      groups[t.kind].push(g)
      if (t.neon) {
        // a glowing crown band and a thin spire on lit towers
        const band = new THREE.CylinderGeometry(t.w * 0.62, t.w * 0.62, 0.018, t.round ? 12 : 4)
        if (!t.round) band.rotateY(Math.PI / 4)
        band.translate(t.x, ISLAND_TOP + t.h - 0.01, t.z)
        const spire = new THREE.CylinderGeometry(0.004, 0.008, t.h * 0.18, 4)
        spire.translate(t.x, ISLAND_TOP + t.h + t.h * 0.09, t.z)
        for (const p of [band, spire]) {
          p.deleteAttribute('uv')
          col.set(t.neon).multiplyScalar(2.4)
          const c = new Float32Array(p.attributes.position.count * 3)
          for (let i = 0; i < c.length; i += 3) col.toArray(c, i)
          p.setAttribute('color', new THREE.BufferAttribute(c, 3))
          trimParts.push(p)
        }
      }
    }
    return {
      bodies: groups.map((g) => (g.length ? mergeBufferGeometries(g) : null)),
      trims: trimParts.length ? mergeBufferGeometries(trimParts) : null,
      tex: [windowTexture(3), windowTexture(17), windowTexture(29)],
    }
  }, [spots])
  const tints = ['#8fb4ff', '#c9b8ff', '#9ee7ff']
  return (
    <group>
      {bodies.map((g, i) =>
        g ? (
          <mesh key={i} geometry={g} castShadow receiveShadow>
            <meshStandardMaterial color={tints[i]} map={tex[i]} emissive="#ffffff" emissiveMap={tex[i]} emissiveIntensity={2.6} roughness={0.3} metalness={0.3} />
          </mesh>
        ) : null,
      )}
      {trims && (
        <mesh geometry={trims}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ bridges */

/** A lit deck from (ax, az) to (bx, bz) on low piers, with glowing rails. */
export function Bridge({ a, b, color = '#7fe9ff' }: { a: [number, number]; b: [number, number]; color?: string }) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  const piers = Math.max(1, Math.floor(len / 0.45))
  const glow = useMemo(() => new THREE.Color(color).multiplyScalar(2.2), [color])
  return (
    <group position={[(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2]} rotation={[0, yaw, 0]}>
      <mesh position={[0, ISLAND_TOP + 0.005, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 0.025, len]} />
        <meshStandardMaterial color="#3a4364" roughness={0.5} metalness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.062, ISLAND_TOP + 0.03, 0]}>
          <boxGeometry args={[0.01, 0.012, len]} />
          <meshBasicMaterial color={glow} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: piers }, (_, i) => (
        <mesh key={i} position={[0, (SEA_Y + ISLAND_TOP) / 2, -len / 2 + ((i + 1) * len) / (piers + 1)]}>
          <boxGeometry args={[0.05, ISLAND_TOP - SEA_Y, 0.05]} />
          <meshStandardMaterial color="#2a3150" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/** Palm trees scattered along an island's shore. */
export function ShorePalms({ spec, count, seed }: { spec: IslandSpec; count: number; seed: number }) {
  const palms = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: count }, () => {
      const a = r() * Math.PI * 2
      const d = spec.r - 0.12
      return { x: spec.x + Math.cos(a) * d * (spec.sx ?? 1), z: spec.z + Math.sin(a) * d * (spec.sz ?? 1), s: 0.8 + r() * 0.5, lean: (r() - 0.5) * 0.4 }
    })
  }, [spec, count, seed])
  return (
    <group>
      {palms.map((p, i) => (
        <group key={i} position={[p.x, ISLAND_TOP - 0.01, p.z]} scale={p.s} rotation={[p.lean, 0, -p.lean]}>
          <mesh position={[0, 0.08, 0]} castShadow>
            <cylinderGeometry args={[0.008, 0.013, 0.16, 5]} />
            <meshStandardMaterial color="#7a5232" />
          </mesh>
          <mesh position={[0, 0.17, 0]} castShadow>
            <coneGeometry args={[0.075, 0.05, 6]} />
            <meshStandardMaterial color="#2e9a52" roughness={0.7} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}
