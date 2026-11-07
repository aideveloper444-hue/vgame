import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Procedural miniature landmarks for the world in the middle of the board. Everything is built from
// primitives plus a few canvas textures (lit windows, see-through iron lattice), so no extra assets load.

type V3 = [number, number, number]

/* ---------------------------------------------------------------- shared textures */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Same seeded window pattern for the facade map and its glow map, so lit panes line up. */
function paintWindows(ctx: CanvasRenderingContext2D, glowOnly: boolean) {
  if (glowOnly) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, 64, 128)
  } else {
    const g = ctx.createLinearGradient(0, 0, 64, 0)
    g.addColorStop(0, '#dfe9fb')
    g.addColorStop(0.5, '#b7c9ea')
    g.addColorStop(1, '#8ea6d4')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 128)
  }
  let s = 7
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  // few, large panes so the facade still reads as windows when the tower is small on screen
  for (let y = 4; y < 128; y += 16)
    for (let x = 4; x < 64; x += 15) {
      const v = rand()
      const lit = v > 0.55 ? '#ffe3a1' : v > 0.42 ? '#a5e9ff' : null
      if (glowOnly && !lit) continue
      ctx.fillStyle = lit ?? '#5d77a8'
      ctx.fillRect(x, y, 9, 10)
    }
}

let facadeTex: THREE.CanvasTexture | null = null
let glowTex: THREE.CanvasTexture | null = null
/** Bright glass facade with a grid of panes. */
function facade() {
  facadeTex ??= canvasTexture(64, 128, (ctx) => paintWindows(ctx, false))
  facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping
  return facadeTex
}
/** Only the lit panes, for the emissive map. */
function windows() {
  glowTex ??= canvasTexture(64, 128, (ctx) => paintWindows(ctx, true))
  glowTex.wrapS = glowTex.wrapT = THREE.RepeatWrapping
  return glowTex
}

function useFacade(repeat: [number, number]) {
  return useMemo(() => {
    const map = facade().clone()
    const glow = windows().clone()
    for (const t of [map, glow]) {
      t.repeat.set(repeat[0], repeat[1])
      t.needsUpdate = true
    }
    return { map, glow }
  }, [repeat[0], repeat[1]]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Iron lattice for the Eiffel Tower / Tokyo Tower: X-bracing on a transparent background, open arch at the base. */
function latticeTexture(colors: string[], archFrom: number) {
  return canvasTexture(128, 512, (ctx) => {
    ctx.clearRect(0, 0, 128, 512)
    const bands = 16
    for (let i = 0; i < bands; i++) {
      const y0 = (i / bands) * 512
      const y1 = ((i + 1) / bands) * 512
      ctx.strokeStyle = colors[i % colors.length]
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(0, y0)
      ctx.lineTo(128, y1)
      ctx.moveTo(128, y0)
      ctx.lineTo(0, y1)
      ctx.moveTo(0, y0)
      ctx.lineTo(128, y0)
      ctx.stroke()
    }
    ctx.fillStyle = colors[0]
    ctx.fillRect(0, 0, 10, 512)
    ctx.fillRect(118, 0, 10, 512)
    // canvas y=0 is the top of the texture = top of the lathe (v=1 after flipY), so the arch sits at the bottom rows
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.moveTo(14, 512)
    ctx.lineTo(14, 512 - archFrom * 512 + 40)
    ctx.quadraticCurveTo(64, 512 - archFrom * 512 - 30, 114, 512 - archFrom * 512 + 40)
    ctx.lineTo(114, 512)
    ctx.fill()
  })
}

/* ---------------------------------------------------------------- building blocks */

function GlassBlock({ size, position, tint = '#b8c7e6', glow = 1.4, repeat = [1, 2] }: { size: V3; position: V3; tint?: string; glow?: number; repeat?: [number, number] }) {
  const tex = useFacade(repeat)
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={tint} map={tex.map} emissive="#ffffff" emissiveMap={tex.glow} emissiveIntensity={glow} roughness={0.2} metalness={0.25} envMapIntensity={1.4} />
    </mesh>
  )
}

function Beacon({ position, color = '#ff4d4d' }: { position: V3; color?: string }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.emissiveIntensity = Math.sin(clock.elapsedTime * 3 + position[0] * 5) > 0.3 ? 5 : 0.6
  })
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.022, 8, 8]} />
      <meshStandardMaterial ref={ref} color={color} emissive={color} emissiveIntensity={4} toneMapped={false} />
    </mesh>
  )
}

function Lattice({ profile, colors, archFrom, position, glowColor }: { profile: [number, number][]; colors: string[]; archFrom: number; position: V3; glowColor: string }) {
  const geo = useMemo(() => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 4), [profile])
  const tex = useMemo(() => latticeTexture(colors, archFrom), [colors, archFrom])
  return (
    <group position={position} rotation={[0, Math.PI / 4, 0]}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial map={tex} alphaTest={0.4} side={THREE.DoubleSide} emissive={glowColor} emissiveMap={tex} emissiveIntensity={0.9} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  )
}

/* ---------------------------------------------------------------- landmarks */

export function EmpireState({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <GlassBlock size={[0.34, 0.55, 0.3]} position={[0, 0.275, 0]} tint="#c9d3ea" repeat={[2, 3]} />
      <GlassBlock size={[0.26, 0.38, 0.23]} position={[0, 0.74, 0]} tint="#c9d3ea" repeat={[2, 2]} />
      <GlassBlock size={[0.18, 0.28, 0.16]} position={[0, 1.07, 0]} tint="#d6def0" repeat={[1, 2]} />
      <mesh position={[0, 1.28, 0]} castShadow>
        <boxGeometry args={[0.1, 0.16, 0.09]} />
        <meshStandardMaterial color="#e2e8f0" emissive="#93c5fd" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 1.52, 0]}>
        <cylinderGeometry args={[0.008, 0.025, 0.34, 8]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.8} roughness={0.2} />
      </mesh>
      <Beacon position={[0, 1.7, 0]} />
    </group>
  )
}

export function StatueOfLiberty({ position }: { position: V3 }) {
  const copper = '#5fb39a'
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <boxGeometry args={[0.16, 0.14, 0.16]} />
        <meshStandardMaterial color="#b9a782" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <coneGeometry args={[0.06, 0.34, 10]} />
        <meshStandardMaterial color={copper} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.49, 0]} castShadow>
        <sphereGeometry args={[0.032, 12, 12]} />
        <meshStandardMaterial color={copper} />
      </mesh>
      <mesh position={[0.035, 0.56, 0]} rotation={[0, 0, -0.25]}>
        <cylinderGeometry args={[0.009, 0.012, 0.16, 6]} />
        <meshStandardMaterial color={copper} />
      </mesh>
      <mesh position={[0.058, 0.65, 0]}>
        <sphereGeometry args={[0.022, 10, 10]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={4} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function BigBen({ position }: { position: V3 }) {
  const stone = '#d8b77a'
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.17, 0.9, 0.17]} />
        <meshStandardMaterial color={stone} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.21, 0.22, 0.21]} />
        <meshStandardMaterial color="#e6c98f" roughness={0.6} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2
        return (
          <mesh key={i} position={[Math.sin(a) * 0.107, 1.0, Math.cos(a) * 0.107]} rotation={[0, a, 0]}>
            <circleGeometry args={[0.075, 24]} />
            <meshStandardMaterial color="#fff8e1" emissive="#ffe8a3" emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
        )
      })}
      <mesh position={[0, 1.24, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.15, 0.28, 4]} />
        <meshStandardMaterial color="#3f4a5e" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.44, 0]}>
        <cylinderGeometry args={[0.005, 0.012, 0.14, 6]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Houses of Parliament wing */}
      <mesh position={[-0.36, 0.12, 0.02]} castShadow>
        <boxGeometry args={[0.55, 0.24, 0.16]} />
        <meshStandardMaterial color={stone} roughness={0.75} />
      </mesh>
      {[-0.58, -0.44, -0.3, -0.16].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.02]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.035, 0.12, 4]} />
          <meshStandardMaterial color="#b08d4d" />
        </mesh>
      ))}
    </group>
  )
}

export function LondonEye({ position }: { position: V3 }) {
  const wheel = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.z -= dt * 0.12
  })
  const R = 0.42
  return (
    <group position={position}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.12, R * 0.55, -0.05]} rotation={[0.12, 0, s * -0.28]}>
          <cylinderGeometry args={[0.012, 0.016, R * 1.2, 6]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      <group ref={wheel} position={[0, R + 0.08, 0]}>
        <mesh>
          <torusGeometry args={[R, 0.012, 8, 64]} />
          <meshStandardMaterial color="#f8fafc" emissive="#7dd3fc" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2
          return (
            <group key={i}>
              <mesh position={[(Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, 0]} rotation={[0, 0, a + Math.PI / 2]}>
                <cylinderGeometry args={[0.0025, 0.0025, R, 4]} />
                <meshBasicMaterial color="#cbd5e1" />
              </mesh>
              <mesh position={[Math.cos(a) * R, Math.sin(a) * R, 0]}>
                <capsuleGeometry args={[0.014, 0.02, 3, 6]} />
                <meshStandardMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={1.2} />
              </mesh>
            </group>
          )
        })}
      </group>
    </group>
  )
}

const EIFFEL_PROFILE: [number, number][] = [
  [0.34, 0],
  [0.24, 0.2],
  [0.17, 0.38],
  [0.12, 0.6],
  [0.085, 0.85],
  [0.05, 1.15],
  [0.025, 1.45],
  [0.006, 1.66],
]
const EIFFEL_COLORS = ['#ffcf6b', '#f2b544']

export function EiffelTower({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Lattice profile={EIFFEL_PROFILE} colors={EIFFEL_COLORS} archFrom={0.16} position={[0, 0, 0]} glowColor="#ffb13b" />
      {[0.38, 0.85].map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[0, 0, 0]}>
          <boxGeometry args={[i ? 0.2 : 0.3, 0.03, i ? 0.2 : 0.3]} />
          <meshStandardMaterial color="#ffd27a" emissive="#ffb13b" emissiveIntensity={1.4} />
        </mesh>
      ))}
      <Beacon position={[0, 1.7, 0]} color="#fff1c2" />
    </group>
  )
}

const TOKYO_PROFILE: [number, number][] = [
  [0.26, 0],
  [0.17, 0.25],
  [0.11, 0.55],
  [0.07, 0.85],
  [0.035, 1.15],
  [0.006, 1.4],
]
const TOKYO_COLORS = ['#ff3b1f', '#ff3b1f', '#f8fafc']

export function TokyoTower({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Lattice profile={TOKYO_PROFILE} colors={TOKYO_COLORS} archFrom={0.12} position={[0, 0, 0]} glowColor="#ff4d2e" />
      {[0.55, 0.9].map((y, i) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[i ? 0.08 : 0.13, i ? 0.08 : 0.13, 0.07, 8]} />
          <meshStandardMaterial color="#f8fafc" emissive="#fde68a" emissiveIntensity={1.2} />
        </mesh>
      ))}
      <Beacon position={[0, 1.42, 0]} />
    </group>
  )
}

/** A cluster of neon-signed towers for Tokyo-style districts. */
export function NeonBlock({ position, colors }: { position: V3; colors: string[] }) {
  return (
    <group position={position}>
      {colors.map((c, i) => {
        const h = 0.35 + (i % 3) * 0.14
        const x = (i - (colors.length - 1) / 2) * 0.15
        return (
          <group key={i} position={[x, 0, (i % 2) * 0.1]}>
            <GlassBlock size={[0.12, h, 0.12]} position={[0, h / 2, 0]} tint="#8b8fc9" repeat={[1, 2]} />
            <mesh position={[0, h * 0.7, 0.062]}>
              <planeGeometry args={[0.035, h * 0.45]} />
              <meshBasicMaterial color={c} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export function BurjKhalifa({ position }: { position: V3 }) {
  const tiers: [number, number][] = [
    [0.15, 0.36],
    [0.12, 0.3],
    [0.095, 0.28],
    [0.072, 0.24],
    [0.052, 0.2],
    [0.034, 0.16],
  ]
  let y = 0
  return (
    <group position={position}>
      {tiers.map(([r, h], i) => {
        const cy = y + h / 2
        y += h * 0.97
        return <SilverTier key={i} r={r} h={h} y={cy} />
      })}
      <mesh position={[0, y + 0.22, 0]}>
        <cylinderGeometry args={[0.004, 0.016, 0.46, 6]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.15} />
      </mesh>
      <Beacon position={[0, y + 0.46, 0]} />
    </group>
  )
}

function SilverTier({ r, h, y }: { r: number; h: number; y: number }) {
  const tex = useFacade([3, 2])
  return (
    <mesh position={[0, y, 0]} castShadow>
      <cylinderGeometry args={[r * 0.92, r, h, 6]} />
      <meshStandardMaterial color="#eef3fb" map={tex.map} emissive="#ffffff" emissiveMap={tex.glow} emissiveIntensity={1.3} metalness={0.5} roughness={0.18} flatShading />
    </mesh>
  )
}

export function BurjAlArab({ position }: { position: V3 }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.quadraticCurveTo(0.26, 0.2, 0.2, 0.62)
    s.lineTo(0.02, 0.7)
    s.lineTo(0, 0)
    return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false })
  }, [])
  return (
    <mesh geometry={geo} position={position} rotation={[0, -0.6, 0]} castShadow>
      <meshStandardMaterial color="#f8fafc" emissive="#93c5fd" emissiveIntensity={0.35} roughness={0.3} />
    </mesh>
  )
}

export function MarinaBaySands({ position }: { position: V3 }) {
  return (
    <group position={position}>
      {[-0.26, 0, 0.26].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <GlassBlock size={[0.13, 0.72, 0.17]} position={[0, 0.36, 0]} tint="#cfd8e8" repeat={[1, 4]} glow={0.7} />
        </group>
      ))}
      <mesh position={[0.02, 0.76, 0]} castShadow>
        <boxGeometry args={[0.86, 0.045, 0.19]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.25} />
      </mesh>
      <mesh position={[0.46, 0.76, 0]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.14, 0.035, 0.17]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0.02, 0.787, 0]}>
        <boxGeometry args={[0.6, 0.01, 0.12]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Supertree({ position, height = 0.36 }: { position: V3; height?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.03, height, 6]} />
        <meshStandardMaterial color="#6d28d9" emissive="#7c3aed" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, height, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.1, 0.09, 10, 1, true]} />
        <meshStandardMaterial color="#e879f9" emissive="#e879f9" emissiveIntensity={2.2} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function GatewayOfIndia({ position }: { position: V3 }) {
  const body = useMemo(() => {
    const w = 0.56
    const h = 0.5
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0)
    s.lineTo(w / 2, 0)
    s.lineTo(w / 2, h)
    s.lineTo(-w / 2, h)
    s.lineTo(-w / 2, 0)
    const arch = new THREE.Path()
    arch.moveTo(-0.09, 0)
    arch.lineTo(-0.09, 0.2)
    arch.absarc(0, 0.2, 0.09, Math.PI, 0, true)
    arch.lineTo(0.09, 0)
    arch.lineTo(-0.09, 0)
    s.holes.push(arch)
    return new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 })
  }, [])
  const stone = '#e7c28a'
  return (
    <group position={position}>
      <mesh geometry={body} position={[0, 0, -0.08]} castShadow receiveShadow>
        <meshStandardMaterial color={stone} roughness={0.65} emissive="#ffb86b" emissiveIntensity={0.18} />
      </mesh>
      {[-0.25, -0.13, 0.13, 0.25].map((x) => (
        <group key={x} position={[x, 0.5, 0]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.028, 0.03, 0.1, 8]} />
            <meshStandardMaterial color={stone} />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <sphereGeometry args={[0.03, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#f3d7a7" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f3d7a7" emissive="#ffb86b" emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

export function TajHotel({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <GlassBlock size={[0.42, 0.34, 0.2]} position={[0, 0.17, 0]} tint="#f1dfc0" repeat={[3, 2]} glow={0.55} />
      <mesh position={[0, 0.34, 0]}>
        <sphereGeometry args={[0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c2552c" roughness={0.45} metalness={0.2} />
      </mesh>
    </group>
  )
}

export function OperaHouse({ position }: { position: V3 }) {
  const shells: { x: number; s: number; r: number }[] = [
    { x: -0.2, s: 0.2, r: 0.2 },
    { x: -0.05, s: 0.26, r: 0.15 },
    { x: 0.12, s: 0.22, r: 0.1 },
    { x: 0.26, s: 0.15, r: 0.05 },
  ]
  return (
    <group position={position}>
      <mesh position={[0.02, 0.03, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.66, 0.06, 0.3]} />
        <meshStandardMaterial color="#d6c7a1" roughness={0.8} />
      </mesh>
      {shells.map((sh, i) => (
        <mesh key={i} position={[sh.x, 0.06, 0]} rotation={[0, Math.PI / 2, -sh.r]} scale={[1, 1.5, 0.7]} castShadow>
          <sphereGeometry args={[sh.s, 20, 12, 0, Math.PI, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#f8fafc" emissive="#e0f2fe" emissiveIntensity={0.35} roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

export function HarbourBridge({ position, rotationY = 0 }: { position: V3; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[0.42, 0.018, 6, 40, Math.PI]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.95, 0.025, 0.1]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const x = -0.36 + i * 0.09
        const top = Math.sqrt(Math.max(0, 0.42 * 0.42 - x * x))
        return top > 0.17 ? (
          <mesh key={i} position={[x, (top + 0.16) / 2, 0]}>
            <boxGeometry args={[0.006, top - 0.16, 0.006]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
        ) : null
      })}
      {[-0.46, 0.46].map((x) => (
        <mesh key={x} position={[x, 0.1, 0]}>
          <boxGeometry args={[0.07, 0.2, 0.12]} />
          <meshStandardMaterial color="#cbb88f" />
        </mesh>
      ))}
    </group>
  )
}

/** Generic glowing glass tower used to fill out a skyline. */
export function Tower({ position, h, w = 0.14, tint = '#b8c7e6' }: { position: V3; h: number; w?: number; tint?: string }) {
  return <GlassBlock size={[w, h, w]} position={[position[0], position[1] + h / 2, position[2]]} tint={tint} repeat={[1, Math.max(1, Math.round(h * 1.6))]} />
}
