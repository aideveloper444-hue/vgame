import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { labelCanvas } from './cityTileArt'
import { INNER_HALF } from './cityBoardLayout'
import { Bridge, Island, Ocean, ShorePalms, Towers, towersAround, type IslandSpec, type TowerSpot } from './CityIslands'
import {
  BigBen,
  BurjAlArab,
  BurjKhalifa,
  EiffelTower,
  EmpireState,
  GatewayOfIndia,
  HarbourBridge,
  LondonEye,
  MarinaBaySands,
  NeonBlock,
  OperaHouse,
  StatueOfLiberty,
  Supertree,
  TajHotel,
  TokyoTower,
  Tower,
} from './cityLandmarks3D'

// The living miniature city inside the tile ring: a central park with a fountain, ringed by a canal and
// a ring road; four avenues run out to the board's sides; landmark districts, a downtown, a harbour and
// a park fill the blocks between them. Traffic, boats, the fountain and a plane keep it moving.

const B = '/models/city/buildings/'
const CAR = '/models/city/cars/'
const BOAT = '/models/city/watercraft/'

type V3 = [number, number, number]

const glowed = new WeakSet<THREE.Material>()

// Per-model tint so the skyline reads as a colourful night city instead of plain white blocks.
const TINTS = ['#9ec9ff', '#ffd9a8', '#c9b8ff', '#a8f0e0', '#ffb8d2', '#fff1b0']
function tintFor(url: string) {
  let h = 0
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

/** Kenney models share one colormap; letting it drive emission gives the night-city "lit windows" look. */
function useModel(url: string, glow: number) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial
        if (glowed.has(std) || !std.map) continue
        const tint = new THREE.Color(tintFor(url))
        std.color = tint
        std.emissive = tint
        std.emissiveMap = std.map
        std.emissiveIntensity = glow
        std.roughness = 0.55
        glowed.add(std)
      }
    })
    return scene
  }, [scene, glow, url])
}

function Model({ url, position, rotationY = 0, scale, glow = 0.5 }: { url: string; position: V3; rotationY?: number; scale: number; glow?: number }) {
  const scene = useModel(url, glow)
  const cloned = useMemo(() => scene.clone(true), [scene])
  return <primitive object={cloned} position={position} rotation={[0, rotationY, 0]} scale={scale} />
}

/* ------------------------------------------------------------------ layout */

const GROUND_Y = 0.03
/** Top of a raised city block, where buildings and landmarks stand. */
const T = 0.11
const S = 0.3
const LANDMARK_SCALE = 1.35

const BLOCK_HALF = 0.8

const grassMat = new THREE.MeshStandardMaterial({ color: '#3aa35a', roughness: 0.85 })
const plazaMat = new THREE.MeshStandardMaterial({ color: '#4a5272', roughness: 0.55, metalness: 0.15 })
const sandMat = new THREE.MeshStandardMaterial({ color: '#e4b565', roughness: 0.9 })
const curbMat = new THREE.MeshStandardMaterial({ color: '#c9cfdf', roughness: 0.6 })

type Ground = 'grass' | 'plaza' | 'sand'
const GROUND_MAT: Record<Ground, THREE.Material> = { grass: grassMat, plaza: plazaMat, sand: sandMat }

/* ------------------------------------------------------------------ small props */

function Tree({ x, z, y = T, palm = false }: { x: number; z: number; y?: number; palm?: boolean }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.024, 0.14, 6]} />
        <meshStandardMaterial color="#6b4226" />
      </mesh>
      <mesh position={[0, palm ? 0.17 : 0.2, 0]} castShadow>
        {palm ? <coneGeometry args={[0.13, 0.1, 7]} /> : <icosahedronGeometry args={[0.1, 0]} />}
        <meshStandardMaterial color={palm ? '#2f8f4e' : '#34a853'} roughness={0.7} flatShading />
      </mesh>
    </group>
  )
}


function Label({ text, accent, position }: { text: string; accent: string; position: V3 }) {
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(labelCanvas(text, accent))
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [text, accent])
  return (
    <sprite position={position} scale={[1.05, 0.315, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  )
}

/** Raised city block with a pale curb, sitting on the asphalt. */
function seedOf(x: number, z: number) {
  return Math.abs(Math.round(x * 97 + z * 131)) + 7
}

/** Island under a district: a sand shore and grass top in the shape of a soft blob. */
function Block({ x, z, half = BLOCK_HALF }: { x: number; z: number; half?: number; ground: Ground }) {
  return <Island spec={{ x, z, r: half * 1.08, seed: seedOf(x, z) }} />
}

export function SquareBlock({ x, z, half = BLOCK_HALF, ground }: { x: number; z: number; half?: number; ground: Ground }) {
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[half * 2, T - GROUND_Y, half * 2]} radius={0.04} smoothness={2} position={[0, (T + GROUND_Y) / 2, 0]} receiveShadow castShadow material={curbMat} />
      <RoundedBox args={[half * 2 - 0.08, 0.01, half * 2 - 0.08]} radius={0.03} smoothness={2} position={[0, T + 0.002, 0]} receiveShadow material={GROUND_MAT[ground]} />
    </group>
  )
}

/* ------------------------------------------------------------------ districts */

interface District {
  name: string
  accent: string
  x: number
  z: number
  ground: Ground
  landmarks: ReactNode
  buildings?: { url: string; dx: number; dz: number; s?: number; r?: number }[]
  trees?: [number, number][]
  palms?: boolean
}

const DISTRICTS: District[] = [
  {
    name: 'London',
    accent: '#f87171',
    x: -1.25,
    z: -2.85,
    ground: 'grass',
    landmarks: (
      <>
        <BigBen position={[0.1, 0, -0.1]} />
        <LondonEye position={[0.5, 0, 0.2]} />
      </>
    ),
    buildings: [{ url: `${B}building-g.glb`, dx: -0.5, dz: 0.42, s: 0.24 }],
    trees: [
      [0.6, -0.55],
      [-0.6, -0.5],
    ],
  },
  {
    name: 'New York',
    accent: '#60a5fa',
    x: -2.85,
    z: -1.25,
    ground: 'plaza',
    landmarks: (
      <>
        <EmpireState position={[0.1, 0, -0.15]} />
        <StatueOfLiberty position={[-0.4, 0, 0.38]} />
        <Tower position={[-0.35, 0, -0.35]} h={0.9} tint="#9fb4e6" />
        <Tower position={[0.42, 0, -0.1]} h={0.72} w={0.16} tint="#c7b8ff" />
        <Tower position={[0.4, 0, 0.32]} h={0.46} tint="#a8f0e0" />
      </>
    ),
  },
  {
    name: 'Paris',
    accent: '#fbbf24',
    x: 1.25,
    z: -2.85,
    ground: 'grass',
    landmarks: <EiffelTower position={[0, 0, -0.05]} />,
    buildings: [
      { url: `${B}building-d.glb`, dx: -0.55, dz: 0.35, s: 0.22, r: 0.4 },
      { url: `${B}building-e.glb`, dx: 0.55, dz: 0.35, s: 0.22, r: -0.4 },
    ],
    trees: [
      [-0.2, 0.55],
      [0.2, 0.55],
      [-0.6, -0.4],
      [0.6, -0.4],
    ],
  },
  {
    name: 'Tokyo',
    accent: '#f472b6',
    x: 2.85,
    z: -1.25,
    ground: 'plaza',
    landmarks: (
      <>
        <TokyoTower position={[-0.2, 0, -0.05]} />
        <NeonBlock position={[0.3, 0, 0.3]} colors={['#ff2e88', '#22d3ee', '#facc15']} />
        <NeonBlock position={[0.35, 0, -0.35]} colors={['#a855f7', '#f472b6']} />
      </>
    ),
    trees: [[-0.55, 0.5]],
  },
  {
    name: 'Dubai',
    accent: '#f59e0b',
    x: 2.85,
    z: 1.25,
    ground: 'sand',
    palms: true,
    landmarks: (
      <>
        <BurjKhalifa position={[0.05, 0, -0.15]} />
        <BurjAlArab position={[0.45, 0, 0.3]} />
        <Tower position={[-0.4, 0, -0.25]} h={0.6} tint="#dbe4f3" />
        <Tower position={[-0.45, 0, 0.3]} h={0.38} w={0.16} tint="#fde6b0" />
      </>
    ),
    trees: [
      [0.55, -0.5],
      [-0.1, 0.55],
    ],
  },
  {
    name: 'Singapore',
    accent: '#a78bfa',
    x: 1.25,
    z: 2.85,
    ground: 'grass',
    palms: true,
    landmarks: (
      <>
        <MarinaBaySands position={[0.05, 0, -0.15]} />
        <Supertree position={[-0.5, 0, 0.35]} height={0.34} />
        <Supertree position={[-0.3, 0, 0.45]} height={0.26} />
        <Supertree position={[0.5, 0, 0.38]} height={0.3} />
      </>
    ),
  },
  {
    name: 'Mumbai',
    accent: '#fb923c',
    x: -1.25,
    z: 2.85,
    ground: 'grass',
    palms: true,
    landmarks: (
      <>
        <GatewayOfIndia position={[-0.1, 0, 0.1]} />
        <TajHotel position={[0.35, 0, -0.3]} />
        <Tower position={[-0.45, 0, -0.35]} h={0.5} tint="#f5d0a9" />
      </>
    ),
    trees: [
      [0.55, 0.45],
      [-0.6, 0.5],
    ],
  },
  {
    name: 'Sydney',
    accent: '#38bdf8',
    x: -2.85,
    z: 1.25,
    ground: 'grass',
    landmarks: (
      <>
        <OperaHouse position={[0.1, 0, 0.3]} />
        <HarbourBridge position={[-0.05, 0, -0.35]} />
        <Tower position={[0.45, 0, -0.05]} h={0.46} tint="#bae6fd" />
      </>
    ),
    trees: [[-0.55, 0.1]],
  },
]

function DistrictView({ d }: { d: District }) {
  return (
    <group>
      <Block x={d.x} z={d.z} ground={d.ground} />
      <group position={[d.x, 0, d.z]}>
        {/* landmarks are modelled small; scale them up around the block centre, feet on the block */}
        <group scale={LANDMARK_SCALE} position={[0, T, 0]}>
          {d.landmarks}
        </group>
        {d.buildings?.map((b, i) => <Model key={i} url={b.url} position={[b.dx, T, b.dz]} scale={b.s ?? S} rotationY={b.r ?? 0} />)}
        {d.trees?.map(([tx, tz], i) => <Tree key={i} x={tx} z={tz} palm={d.palms} />)}
        <Label text={d.name} accent={d.accent} position={[0, 0.55, BLOCK_HALF * 0.95]} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ corner blocks */

const CORNER = 2.85
const CORNER_HALF = 0.72

function Downtown() {
  const x = -CORNER
  const z = -CORNER
  const towers: { url: string; dx: number; dz: number; s: number; r?: number }[] = [
    { url: `${B}building-skyscraper-a.glb`, dx: -0.3, dz: -0.3, s: 0.27 },
    { url: `${B}building-skyscraper-c.glb`, dx: 0.28, dz: -0.28, s: 0.27 },
    { url: `${B}building-skyscraper-d.glb`, dx: -0.28, dz: 0.28, s: 0.25 },
    { url: `${B}building-skyscraper-e.glb`, dx: 0.3, dz: 0.3, s: 0.24 },
  ]
  return (
    <group>
      <Block x={x} z={z} half={CORNER_HALF} ground="plaza" />
      {towers.map((t, i) => (
        <Model key={i} url={t.url} position={[x + t.dx, T, z + t.dz]} scale={t.s} rotationY={t.r ?? 0} />
      ))}
    </group>
  )
}

function Uptown() {
  const x = CORNER
  const z = -CORNER
  const blocks: { url: string; dx: number; dz: number; s: number; r?: number }[] = [
    { url: `${B}building-skyscraper-b.glb`, dx: 0.28, dz: -0.3, s: 0.26 },
    { url: `${B}building-l.glb`, dx: -0.3, dz: -0.28, s: 0.24, r: 0.3 },
    { url: `${B}building-m.glb`, dx: 0.3, dz: 0.3, s: 0.24 },
    { url: `${B}building-i.glb`, dx: -0.28, dz: 0.3, s: 0.24, r: -0.4 },
  ]
  return (
    <group>
      <Block x={x} z={z} half={CORNER_HALF} ground="plaza" />
      {blocks.map((t, i) => (
        <Model key={i} url={t.url} position={[x + t.dx, T, z + t.dz]} scale={t.s} rotationY={t.r ?? 0} />
      ))}
    </group>
  )
}

/** Tree-lined park with a small fountain pool in the near-right corner. */
function CornerPark() {
  const x = CORNER
  const z = CORNER
  const ring = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i / 8) * Math.PI * 2)
  return (
    <group>
      <Block x={x} z={z} half={CORNER_HALF} ground="grass" />
      <group position={[x, 0, z]}>
        {ring.map((a, i) => (
          <Tree key={i} x={Math.cos(a) * 0.5} z={Math.sin(a) * 0.5} palm={i % 2 === 0} />
        ))}
        <mesh position={[0, T + 0.02, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.04, 28]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
        <mesh position={[0, T + 0.043, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.17, 32]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}


/* ------------------------------------------------------------------ water */






/* ------------------------------------------------------------------ central park + fountain */



/* ------------------------------------------------------------------ roads + traffic */







/* ------------------------------------------------------------------ boats */

interface BoatPath {
  url: string
  scale: number
  a?: [number, number]
  b?: [number, number]
  orbit?: { r: number }
  speed: number
  offset: number
  y?: number
}

function Boat({ path }: { path: BoatPath }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const t = clock.elapsedTime * path.speed + path.offset
    g.position.y = (path.y ?? GROUND_Y + 0.01) + Math.sin(clock.elapsedTime * 2 + path.offset * 5) * 0.006
    if (path.orbit) {
      const a = t * Math.PI * 2
      g.position.x = Math.cos(a) * path.orbit.r
      g.position.z = Math.sin(a) * path.orbit.r
      g.rotation.y = -a
      return
    }
    const [ax, az] = path.a!
    const [bx, bz] = path.b!
    const phase = t % 2
    const forward = phase < 1
    const k = forward ? phase : 2 - phase
    const e = k * k * (3 - 2 * k)
    g.position.x = ax + (bx - ax) * e
    g.position.z = az + (bz - az) * e
    const heading = Math.atan2(bx - ax, bz - az)
    g.rotation.y = forward ? heading : heading + Math.PI
  })
  return (
    <group ref={ref}>
      <Model url={path.url} position={[0, 0, 0]} scale={path.scale} glow={0.18} />
    </group>
  )
}


/* ------------------------------------------------------------------ sky */

function Airplane() {
  const ref = useRef<THREE.Group>(null)
  const blink = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const a = clock.elapsedTime * 0.09
    g.position.set(Math.cos(a) * 3.1, 2.7 + Math.sin(a * 2) * 0.12, Math.sin(a) * 2.3 - 0.2)
    g.rotation.y = -a
    g.rotation.z = 0.18
    if (blink.current) blink.current.emissiveIntensity = Math.sin(clock.elapsedTime * 6) > 0.6 ? 4 : 0.2
  })
  return (
    <group ref={ref} scale={1.6}>
      <group>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.045, 0.34, 4, 8]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.3} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.02]} castShadow>
          <boxGeometry args={[0.46, 0.012, 0.09]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[0, 0.05, -0.18]}>
          <boxGeometry args={[0.012, 0.09, 0.07]} />
          <meshStandardMaterial color="#2563eb" />
        </mesh>
        <mesh position={[0, 0.01, -0.18]}>
          <boxGeometry args={[0.16, 0.01, 0.05]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[0.23, 0, 0.02]}>
          <sphereGeometry args={[0.012, 6, 6]} />
          <meshStandardMaterial ref={blink} color="#ff4d4d" emissive="#ff2a2a" emissiveIntensity={2} />
        </mesh>
      </group>
      <mesh position={[0, 0, -0.62]}>
        <boxGeometry args={[0.012, 0.012, 0.9]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ------------------------------------------------------------------ emblem

/** Slow light dust drifting over the whole miniature world. */
function WorldMotes() {
  const ref = useRef<THREE.Points>(null)
  const COUNT = 90
  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const h = (n: number) => {
          const v = Math.sin(n * 127.1) * 43758.5453
          return v - Math.floor(v)
        }
        return [h(i) * 8 - 4, h(i + 50) * 2.2, h(i + 99) * 8 - 4, h(i + 7)]
      }),
    [],
  )
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
    return g
  }, [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pos = ref.current?.geometry.attributes.position as THREE.BufferAttribute | undefined
    if (!pos) return
    for (let i = 0; i < COUNT; i++) {
      const [x, y, z, p] = seeds[i]
      pos.setXYZ(i, x + Math.sin(t * 0.2 + p * 9) * 0.2, 0.4 + ((y + t * (0.05 + p * 0.06)) % 2.2), z + Math.cos(t * 0.17 + p * 7) * 0.2)
    }
    pos.needsUpdate = true
  })
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.04} color="#ffe2b0" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

const CENTER_ISLAND: IslandSpec = { x: 0, z: 0, r: 1.3, seed: 11 }
const CORNER_SPECS: IslandSpec[] = [
  { x: -CORNER, z: -CORNER, r: CORNER_HALF * 1.08, seed: seedOf(-CORNER, -CORNER) },
  { x: CORNER, z: -CORNER, r: CORNER_HALF * 1.08, seed: seedOf(CORNER, -CORNER) },
  { x: CORNER, z: CORNER, r: CORNER_HALF * 1.08, seed: seedOf(CORNER, CORNER) },
]

/** Packed, glowing towers: a dense downtown on the centre island, and a few behind each landmark. */
function useTowerSpots(): TowerSpot[] {
  return useMemo(() => {
    const out: TowerSpot[] = []
    // centre island: three rings rising toward a tall core, like a miniature downtown
    out.push(...towersAround({ ...CENTER_ISLAND, r: 0.55 }, 8, 1.2, 2.3, 0.05, 1))
    out.push(...towersAround({ ...CENTER_ISLAND, r: 0.95 }, 14, 0.6, 1.4, 0.48, 2))
    out.push(...towersAround({ ...CENTER_ISLAND, r: 1.3 }, 18, 0.22, 0.7, 0.9, 3))
    // a short row behind each district's landmarks (the side away from the board centre)
    DISTRICTS.forEach((d, i) => {
      const spec = { x: d.x, z: d.z, r: BLOCK_HALF }
      const away = Math.atan2(d.z, d.x)
      for (let k = 0; k < 5; k++) {
        const a = away + (k - 2) * 0.42
        out.push({ x: spec.x + Math.cos(a) * 0.62, z: spec.z + Math.sin(a) * 0.62, w: 0.1 + ((k * 37 + i * 11) % 7) * 0.012, h: 0.18 + ((k * 53 + i * 29) % 9) * 0.04, kind: (k + i) % 3, neon: k === 2 ? '#22d3ee' : undefined })
      }
    })
    return out
  }, [])
}

/** Lit bridges from the centre island out to every district, and around the outer ring of islands. */
function Bridges() {
  const spans = useMemo(() => {
    const out: { a: [number, number]; b: [number, number]; c: string }[] = []
    for (const d of DISTRICTS) {
      const len = Math.hypot(d.x, d.z)
      const ux = d.x / len
      const uz = d.z / len
      out.push({ a: [ux * (CENTER_ISLAND.r - 0.1), uz * (CENTER_ISLAND.r - 0.1)], b: [d.x - ux * (BLOCK_HALF - 0.05), d.z - uz * (BLOCK_HALF - 0.05)], c: d.accent })
    }
    return out
  }, [])
  return (
    <group>
      {spans.map((s, i) => (
        <Bridge key={i} a={s.a} b={s.b} color={s.c} />
      ))}
    </group>
  )
}

const SEA_BOATS: BoatPath[] = [
  { url: `${BOAT}boat-speed-a.glb`, scale: 0.05, orbit: { r: 1.62 }, speed: 0.05, offset: 0, y: 0.03 },
  { url: `${BOAT}boat-sail-a.glb`, scale: 0.04, orbit: { r: 1.75 }, speed: -0.035, offset: 0.4, y: 0.03 },
  { url: `${BOAT}boat-speed-a.glb`, scale: 0.05, orbit: { r: 1.68 }, speed: 0.042, offset: 0.65, y: 0.03 },
  { url: `${BOAT}ship-ocean-liner.glb`, scale: 0.075, a: [-3.5, 2.2], b: [-2.2, 3.5], speed: 0.03, offset: 0.1, y: 0.03 },
  { url: `${BOAT}boat-fishing-small.glb`, scale: 0.05, a: [-3.3, 3.3], b: [-2.0, 2.6], speed: 0.05, offset: 0.6, y: 0.03 },
  { url: `${BOAT}ship-cargo-a.glb`, scale: 0.05, a: [2.2, 0.1], b: [2.2, -0.1], speed: 0.02, offset: 0.3, y: 0.03 },
]

export default function CityWorld() {
  const spots = useTowerSpots()
  return (
    <group>
      <Ocean size={INNER_HALF * 2 + 0.1} />
      <Island spec={CENTER_ISLAND} />
      <ShorePalms spec={CENTER_ISLAND} count={14} seed={5} />
      {CORNER_SPECS.map((c, i) => (
        <ShorePalms key={i} spec={c} count={5} seed={20 + i} />
      ))}
      <Towers spots={spots} />
      <Bridges />
      {DISTRICTS.map((d) => (
        <DistrictView key={d.name} d={d} />
      ))}
      <Downtown />
      <Uptown />
      <CornerPark />
      {SEA_BOATS.map((b, i) => (
        <Boat key={i} path={b} />
      ))}
      <Airplane />
      <WorldMotes />
    </group>
  )
}

const PRELOAD = [
  ...new Set([
    ...DISTRICTS.flatMap((d) => (d.buildings ?? []).map((b) => b.url)),
    ...['taxi', 'sedan', 'police', 'delivery', 'suv'].map((c) => `${CAR}${c}.glb`),
    ...['boat-speed-a', 'boat-sail-a', 'boat-fishing-small', 'ship-ocean-liner', 'ship-cargo-a'].map((b) => `${BOAT}${b}.glb`),
    ...['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e', 'building-l', 'building-m', 'building-i'].map((b) => `${B}${b}.glb`),
  ]),
]
PRELOAD.forEach((url) => useGLTF.preload(url))
