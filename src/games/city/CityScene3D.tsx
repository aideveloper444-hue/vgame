import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import GameCanvas from '@/games/shared/three/GameCanvas'
import LudoCharacter, { type CharacterPose } from '@/games/ludo/LudoCharacter'
import LudoPortraitStudio from '@/games/ludo/LudoPortraitStudio'
import { preloadCharacters } from '@/games/ludo/ludoCharacters'
import { cityCharacterColor } from './cityCharacters'
import { useCityMatch } from './cityMatch'
import { makeGlowPuddleTexture } from '@/games/shared/three/glowTextures'
import SceneErrorBoundary from '@/games/shared/three/SceneErrorBoundary'
import { useCityStore, type CityPlayer } from './cityStore'
import { CATEGORY_TINT, type CityTile, type PropertyTile } from './cityBoardData'
import {
  BOARD_SIZE,
  DICE_ROLL_MS,
  HALF,
  STEP_MS,
  tilePlacement,
  tokenPosition,
  type BoardSide,
  type TilePlacement,
} from './cityBoardLayout'
import { ownerBadgeCanvas, tileCanvas, type CardShape, type InnerEdge } from './cityTileArt'
import CityWorld from './CityWorld'
import CityLounge from './CityLounge'

preloadCharacters()

/** The shared human characters are 2.05 units tall; on this board they stand about 1.5. */
const CHARACTER_SCALE = 0.72

const TILE_H = 0.16
const TILE_TOP = TILE_H + 0.01
const FRAME_MARGIN = 0.45

const INNER_EDGE: Record<BoardSide, InnerEdge> = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' }

function shapeOf(p: TilePlacement): CardShape {
  if (p.corner) return 'corner'
  return p.side === 'bottom' || p.side === 'top' ? 'portrait' : 'landscape'
}

function isRow(p: TilePlacement) {
  return p.side === 'bottom' || p.side === 'top'
}

/** half-extent of the tile measured toward the board centre */
function depthOf(p: TilePlacement) {
  return isRow(p) ? p.d / 2 : p.w / 2
}

// ------------------------------------------------------------------ camera

/** Where the active character currently stands (written every frame by its token), for the follow camera. */
const liveFocus = { x: 0, z: 0 }
/** How far the camera pans toward the focus (0 = board centre) and how much it eases in while following. */
const FOLLOW_PAN = 0.45
const FOLLOW_ZOOM = 0.84
/** How long the camera lingers on the landing tile before easing back to the whole board. */
const LAND_HOLD_MS = 1500

interface CamGoal {
  theta: number
  dist: number
  shift: number
}

export interface HudInsets {
  top: number
  bottom: number
  side: number
}

/** Finds the closest camera distance that fits the board inside the part of the screen the HUD leaves free. */
function solveCamera(w: number, h: number, fov: number, mapView: boolean, insets: HudInsets): CamGoal {
  if (!w || !h || w <= 0 || h <= 0) return { theta: 1, dist: 20, shift: 0 }
  const aspect = w / h
  const band = {
    fx: Math.min(0.97, Math.max(0.42, 1 - (2 * insets.side) / w)),
    top: 1 - (2 * insets.top) / h,
    bottom: -(1 - (2 * insets.bottom) / h),
  }
  const theta = mapView ? 1.38 : aspect < 0.85 ? 1.05 : 0.9
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 400)
  const E = HALF + FRAME_MARGIN
  const pts = [
    new THREE.Vector3(-E, 0, -E),
    new THREE.Vector3(E, 0, -E),
    new THREE.Vector3(E, 0, E),
    new THREE.Vector3(-E, 0, E),
  ]
  const v = new THREE.Vector3()
  const measure = (d: number) => {
    cam.position.set(0, Math.sin(theta) * d, Math.cos(theta) * d)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    let xmax = 0
    let ymin = Infinity
    let ymax = -Infinity
    for (const p of pts) {
      v.copy(p).project(cam)
      xmax = Math.max(xmax, Math.abs(v.x))
      ymin = Math.min(ymin, v.y)
      ymax = Math.max(ymax, v.y)
    }
    return { xmax, ymin, ymax }
  }
  let lo = 4
  let hi = 120
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2
    const m = measure(mid)
    if (m.xmax <= band.fx && m.ymax - m.ymin <= band.top - band.bottom) hi = mid
    else lo = mid
  }
  const m = measure(hi)
  const shiftNdc = (band.top + band.bottom) / 2 - (m.ymax + m.ymin) / 2
  return { theta, dist: hi, shift: (shiftNdc * h) / 2 }
}

function CameraRig({ mapView, insets }: { mapView: boolean; insets: HudInsets }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const phase = useCityStore((s) => s.phase)
  // portrait phones use a longer lens: the tilt shows the city's height while the far rim stays nearly
  // as wide as the near one, so the square board fills the screen width instead of shrinking to a wedge
  const fov = size.width / size.height < 0.85 ? 28 : 38
  const goal = useMemo(() => solveCamera(size.width, size.height, fov, mapView, insets), [size.width, size.height, fov, mapView, insets])
  const cur = useRef<CamGoal | null>(null)
  const focus = useRef({ x: 0, z: 0, zoom: 1 })
  const holdUntil = useRef(0)

  // after a move, keep the camera on the landing tile for a moment before easing back out
  useEffect(() => {
    if (phase === 'MOVING') holdUntil.current = Infinity
    else if (holdUntil.current === Infinity) holdUntil.current = performance.now() + LAND_HOLD_MS
  }, [phase])

  useFrame((_, dt) => {
    if (!cur.current) cur.current = { ...goal }
    const k = 1 - Math.exp(-dt * 3.5)
    const c = cur.current
    c.theta += (goal.theta - c.theta) * k
    c.dist += (goal.dist - c.dist) * k
    c.shift += (goal.shift - c.shift) * k
    const following = !mapView && performance.now() < holdUntil.current
    const f = focus.current
    const kf = 1 - Math.exp(-dt * 2.2)
    f.x += ((following ? liveFocus.x * FOLLOW_PAN : 0) - f.x) * kf
    f.z += ((following ? liveFocus.z * FOLLOW_PAN : 0) - f.z) * kf
    f.zoom += ((following ? FOLLOW_ZOOM : 1) - f.zoom) * kf
    const d = c.dist * f.zoom
    camera.position.set(f.x, Math.sin(c.theta) * d, f.z + Math.cos(c.theta) * d)
    camera.lookAt(f.x, 0, f.z)
    camera.fov = fov
    if (size.width > 0 && size.height > 0) {
      camera.setViewOffset(size.width, size.height, 0, c.shift, size.width, size.height)
    }
    camera.updateProjectionMatrix()
  })
  return null
}

// ------------------------------------------------------------------ table + frame


const NEON = ['#22d3ee', '#a855f7', '#ec4899', '#3b82f6']

function BoardFrame() {
  const outer = BOARD_SIZE + FRAME_MARGIN * 2
  const trimLen = outer - 0.3
  const trimOffset = outer / 2 - 0.1
  return (
    <group>
      <RoundedBox args={[outer, 0.5, outer]} radius={0.22} smoothness={4} position={[0, -0.25, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#10183a" roughness={0.3} metalness={0.7} clearcoat={0.9} clearcoatRoughness={0.15} envMapIntensity={1.2} />
      </RoundedBox>
      {/* darker underplate for visible, layered thickness */}
      <RoundedBox args={[outer - 0.35, 0.16, outer - 0.35]} radius={0.08} smoothness={3} position={[0, -0.56, 0]} castShadow>
        <meshStandardMaterial color="#05060f" roughness={0.4} metalness={0.6} />
      </RoundedBox>
      {/* polished gold bezel just outside the tile ring (edge strips only, so nothing sits under the water) */}
      {[0, 1, 2, 3].map((i) => {
        const horizontal = i % 2 === 0
        const off = (i < 2 ? 1 : -1) * (HALF + 0.07)
        const len = BOARD_SIZE + 0.2
        return (
          <mesh key={i} position={horizontal ? [0, 0.02, off] : [off, 0.02, 0]} receiveShadow>
            <boxGeometry args={horizontal ? [len, 0.05, 0.08] : [0.08, 0.05, len]} />
            <meshPhysicalMaterial color="#e9b949" roughness={0.18} metalness={1} clearcoat={0.8} clearcoatRoughness={0.1} envMapIntensity={1.8} />
          </mesh>
        )
      })}
      <RimLeds half={outer / 2 - 0.24} />
      {/* neon trim running around the top edge of the frame */}
      {[0, 1, 2, 3].map((i) => {
        const horizontal = i % 2 === 0
        const sign = i < 2 ? 1 : -1
        const pos: [number, number, number] = horizontal ? [0, 0.015, sign * trimOffset] : [sign * trimOffset, 0.015, 0]
        return (
          <mesh key={i} position={pos}>
            <boxGeometry args={horizontal ? [trimLen, 0.03, 0.05] : [0.05, 0.03, trimLen]} />
            <meshStandardMaterial color={NEON[i]} emissive={NEON[i]} emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Warm LEDs studded along the top edge of the frame. */
function RimLeds({ half }: { half: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: [number, number][] = []
    const n = 28
    for (let i = 0; i <= n; i++) {
      const t = -half + (i / n) * half * 2
      out.push([t, -half], [t, half], [-half, t], [half, t])
    }
    return out
  }, [half])
  useEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([x, z], i) => ref.current?.setMatrixAt(i, m.makeTranslation(x, 0.02, z)))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshBasicMaterial color={new THREE.Color('#ffe0b0').multiplyScalar(2.2)} toneMapped={false} />
    </instancedMesh>
  )
}

// ------------------------------------------------------------------ tiles

function BoardTile({ tile, goBonus }: { tile: CityTile; goBonus: number }) {
  const p = tilePlacement(tile.id)
  const aniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(tileCanvas(tile, shapeOf(p), INNER_EDGE[p.side], goBonus))
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = aniso
    return t
    // tile art is static per id; ownership is drawn with separate meshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.id, aniso, goBonus])
  const w = p.w - 0.09
  const d = p.d - 0.09

  return (
    <group position={[p.x, 0, p.z]}>
      <RoundedBox args={[w, TILE_H, d]} radius={0.05} smoothness={3} position={[0, TILE_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#dfe6f3" roughness={0.45} metalness={0.05} />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TILE_H + 0.006, 0]} receiveShadow>
        <planeGeometry args={[w - 0.02, d - 0.02]} />
        <meshPhysicalMaterial map={tex} alphaTest={0.5} roughness={0.36} clearcoat={0.55} clearcoatRoughness={0.25} envMapIntensity={0.7} />
      </mesh>
      {tile.type === 'PROPERTY' && <GroupBar p={p} color={CATEGORY_TINT[tile.category]} />}
    </group>
  )
}

/** Glowing colour-group strip along the tile's inner edge, like the neon property bands on the reference board. */
function GroupBar({ p, color }: { p: TilePlacement; color: string }) {
  const off = depthOf(p) + 0.08
  const len = (isRow(p) ? p.w : p.d) - 0.28
  return (
    <mesh position={[p.inward[0] * off, 0.06, p.inward[1] * off]}>
      <boxGeometry args={isRow(p) ? [len, 0.05, 0.07] : [0.07, 0.05, len]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
    </mesh>
  )
}

function OwnedOverlay({ tile, owner }: { tile: PropertyTile; owner: CityPlayer }) {
  const p = tilePlacement(tile.id)
  const w = p.w - 0.09
  const d = p.d - 0.09
  const badge = useMemo(() => {
    const t = new THREE.CanvasTexture(ownerBadgeCanvas(owner.color, owner.avatarEmoji))
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [owner.color, owner.avatarEmoji])
  const along: [number, number] = isRow(p) ? [1, 0] : [0, 1]
  const houseBase = depthOf(p) - 0.2
  const houses = tile.level >= 4 ? 1 : tile.level
  const badgeOff = depthOf(p) + 0.34

  return (
    <group position={[p.x, 0, p.z]}>
      {[
        { pos: [0, TILE_TOP, d / 2 - 0.02] as const, size: [w, 0.03, 0.05] as const },
        { pos: [0, TILE_TOP, -d / 2 + 0.02] as const, size: [w, 0.03, 0.05] as const },
        { pos: [w / 2 - 0.02, TILE_TOP, 0] as const, size: [0.05, 0.03, d] as const },
        { pos: [-w / 2 + 0.02, TILE_TOP, 0] as const, size: [0.05, 0.03, d] as const },
      ].map((b, i) => (
        <mesh key={i} position={[...b.pos]}>
          <boxGeometry args={[...b.size]} />
          <meshStandardMaterial color={owner.color} emissive={owner.color} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: houses }, (_, i) => {
        const spread = (i - (houses - 1) / 2) * 0.24
        const x = p.inward[0] * houseBase + along[0] * spread
        const z = p.inward[1] * houseBase + along[1] * spread
        return tile.level >= 4 ? <Hotel key={i} x={x} z={z} color={owner.color} horizontal={isRow(p)} /> : <House key={i} x={x} z={z} color={owner.color} />
      })}
      <sprite position={[p.inward[0] * badgeOff, 0.5, p.inward[1] * badgeOff]} scale={[0.36, 0.36, 1]}>
        <spriteMaterial map={badge} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

function House({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, TILE_TOP, z]}>
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.12, 0.09, 4]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
    </group>
  )
}

function Hotel({ x, z, color, horizontal }: { x: number; z: number; color: string; horizontal: boolean }) {
  return (
    <group position={[x, TILE_TOP, z]} rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.42, 0.2, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.35} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0.235, 0]} castShadow>
        <boxGeometry args={[0.46, 0.05, 0.2]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.25} />
      </mesh>
    </group>
  )
}

function LandingHighlight({ tileIndex, color }: { tileIndex: number; color: string }) {
  const p = tilePlacement(tileIndex)
  const mats = useRef<THREE.MeshStandardMaterial[]>([])
  const beam = useRef<THREE.MeshBasicMaterial>(null)
  const beamTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 128
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,0.85)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)
    for (const m of mats.current) if (m) m.emissiveIntensity = 1.6 + pulse * 2
    if (beam.current) beam.current.opacity = 0.18 + pulse * 0.14
  })
  const w = p.w + 0.02
  const d = p.d + 0.02
  const bars = [
    { pos: [0, 0.2, d / 2], size: [w, 0.05, 0.06] },
    { pos: [0, 0.2, -d / 2], size: [w, 0.05, 0.06] },
    { pos: [w / 2, 0.2, 0], size: [0.06, 0.05, d] },
    { pos: [-w / 2, 0.2, 0], size: [0.06, 0.05, d] },
  ] as const
  return (
    <group position={[p.x, 0, p.z]}>
      {bars.map((b, i) => (
        <mesh key={i} position={[...b.pos]}>
          <boxGeometry args={[...b.size]} />
          <meshStandardMaterial
            ref={(m) => {
              if (m) mats.current[i] = m
            }}
            color={color}
            emissive={color}
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[w * 0.92, 1.6, d * 0.92]} />
        <meshBasicMaterial ref={beam} map={beamTex} color={color} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

// ------------------------------------------------------------------ landing burst

/** Expanding ring and a fountain of sparkles in the player's colour where they land. */
function LandingBurst({ tileIndex, color, onDone }: { tileIndex: number; color: string; onDone: () => void }) {
  const p = tilePlacement(tileIndex)
  const ring = useRef<THREE.Mesh>(null)
  const sparks = useRef<THREE.Points>(null)
  const start = useRef(performance.now())
  const COUNT = 28
  const dirs = useMemo(() => Array.from({ length: COUNT }, (_, i) => [(i / COUNT) * Math.PI * 2, 0.6 + ((i * 7) % 5) * 0.18]), [])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
    return g
  }, [])
  useFrame(() => {
    const t = (performance.now() - start.current) / 1000
    if (t > 1.2) {
      onDone()
      return
    }
    if (ring.current) {
      const k = 0.4 + t * 2.6
      ring.current.scale.set(k, k, k)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.1)
    }
    const pos = sparks.current?.geometry.attributes.position as THREE.BufferAttribute | undefined
    if (pos) {
      dirs.forEach(([a, up], i) => pos.setXYZ(i, Math.cos(a) * t * 0.5, 0.1 + up * t * 1.6 - t * t * 1.4, Math.sin(a) * t * 0.5))
      pos.needsUpdate = true
      ;(sparks.current!.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t)
    }
  })
  return (
    <group position={[p.x, TILE_TOP + 0.02, p.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.44, 48]} />
        <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(3)} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <points ref={sparks} geometry={geo}>
        <pointsMaterial size={0.07} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </group>
  )
}

// ------------------------------------------------------------------ purchase burst

interface Coin {
  pos: THREE.Vector3
  vel: THREE.Vector3
  spin: number
}

function CoinBurst({ tileIndex, onDone }: { tileIndex: number; onDone: () => void }) {
  const p = tilePlacement(tileIndex)
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const start = useRef(performance.now())
  const coins = useMemo<Coin[]>(
    () =>
      Array.from({ length: 18 }, () => ({
        pos: new THREE.Vector3(0, 0.3, 0),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.2, 2.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2),
        spin: 6 + Math.random() * 8,
      })),
    [],
  )
  useFrame((_, dt) => {
    const age = (performance.now() - start.current) / 1000
    if (age > 1.5) {
      onDone()
      return
    }
    coins.forEach((c, i) => {
      c.vel.y -= 7 * dt
      c.pos.addScaledVector(c.vel, dt)
      const m = refs.current[i]
      if (!m) return
      m.position.copy(c.pos)
      m.rotation.x += c.spin * dt
      m.scale.setScalar(Math.max(0.01, 1 - Math.max(0, age - 1) * 2))
    })
  })
  return (
    <group position={[p.x, TILE_TOP, p.z]}>
      {coins.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
        >
          <cylinderGeometry args={[0.07, 0.07, 0.02, 16]} />
          <meshStandardMaterial color="#fcd34d" emissive="#f59e0b" emissiveIntensity={1.2} metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

// ------------------------------------------------------------------ tokens

function damageBadgeTexture(amount: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 160
  c.height = 80
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(80, 40, 4, 80, 40, 50)
  g.addColorStop(0, 'rgba(239, 68, 68, 0.95)')
  g.addColorStop(0.5, 'rgba(225, 29, 72, 0.6)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 160, 80)
  ctx.font = '900 48px "Segoe UI", Arial Black, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 6
  ctx.strokeStyle = '#ffffff'
  ctx.strokeText(`-${amount}`, 80, 40)
  ctx.fillStyle = '#ef4444'
  ctx.fillText(`-${amount}`, 80, 40)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function DamageBadge({ slot }: { slot: number }) {
  // Matches screenshot showing -80 on Arjun (slot 3), -50 on Rohan (slot 0), -60 on Diya (slot 1)
  const amount = slot === 3 ? 80 : slot === 0 ? 50 : slot === 1 ? 60 : null
  const tex = useMemo(() => (amount ? damageBadgeTexture(amount) : null), [amount])
  const spriteRef = useRef<THREE.Sprite>(null)

  useFrame(({ clock }) => {
    if (!spriteRef.current) return
    spriteRef.current.position.y = 1.65 + Math.sin(clock.elapsedTime * 3 + slot) * 0.08
  })

  if (!tex) return null
  return (
    <sprite ref={spriteRef} position={[0, 1.65, 0]} scale={[0.7, 0.35, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

function Token({
  player,
  slot,
  tileIndex,
  moving,
  isCurrent,
  celebrating,
  puddle,
}: {
  player: CityPlayer
  slot: number
  tileIndex: number
  moving: boolean
  isCurrent: boolean
  celebrating: boolean
  puddle: THREE.Texture
}) {
  const [x, z] = tokenPosition(tileIndex, slot)
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.MeshStandardMaterial>(null)
  const initial = useRef<[number, number, number]>([x, TILE_TOP, z])
  const from = useRef(new THREE.Vector3(x, TILE_TOP, z))
  const to = useRef(new THREE.Vector3(x, TILE_TOP, z))
  const start = useRef(0)
  const [heading, setHeading] = useState(0)

  useEffect(() => {
    const g = group.current
    if (!g) return
    from.current.set(g.position.x, TILE_TOP, g.position.z)
    to.current.set(x, TILE_TOP, z)
    start.current = performance.now()
    const dx = x - g.position.x
    const dz = z - g.position.z
    if (Math.hypot(dx, dz) > 0.05) setHeading(Math.atan2(dx, dz))
  }, [x, z])

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = Math.min(1, (performance.now() - start.current) / (STEP_MS * 0.92))
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    g.position.lerpVectors(from.current, to.current, e)
    const dist = from.current.distanceTo(to.current)
    if (dist > 0.05) g.position.y = TILE_TOP + Math.sin(Math.PI * t) * Math.min(0.55, 0.28 + dist * 0.1)
    if (ring.current) ring.current.emissiveIntensity = isCurrent ? 2.2 + Math.sin(clock.elapsedTime * 5) * 1.2 : 1.3
    if (isCurrent) {
      liveFocus.x = g.position.x
      liveFocus.z = g.position.z
    }
  })

  let pose: CharacterPose = 'idle'
  if (moving) pose = 'walk'
  else if (celebrating) pose = 'celebrate'
  const size = isCurrent ? 0.95 : 0.72

  return (
    <group ref={group} position={initial.current}>
      <sprite position={[0, 0.01, 0]} scale={[size, size, 1]}>
        <spriteMaterial map={puddle} transparent opacity={isCurrent ? 1 : 0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.17, 0.215, 40]} />
        <meshStandardMaterial ref={ring} color={player.color} emissive={player.color} emissiveIntensity={1.4} side={THREE.DoubleSide} transparent opacity={0.95} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <ringGeometry args={[0.15, 0.165, 40]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.4} side={THREE.DoubleSide} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {isCurrent && <pointLight position={[0, 0.3, 0]} intensity={1.1} distance={1.4} color={player.color} />}
      {/* glossy pedestal in the player's colour */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.17, 0.06, 32]} />
        <meshPhysicalMaterial color={player.color} emissive={player.color} emissiveIntensity={isCurrent ? 0.8 : 0.35} metalness={0.3} roughness={0.2} clearcoat={1} />
      </mesh>
      <group position={[0, 0.06, 0]} rotation={[0, moving ? heading : 0, 0]} scale={CHARACTER_SCALE}>
        <LudoCharacter color={cityCharacterColor(player.color)} pose={pose} variant={slot} />
      </group>
      <DamageBadge slot={slot} />
    </group>
  )
}

function PlayerTokens({ celebrating }: { celebrating: Record<string, boolean> }) {
  const players = useCityStore((s) => s.players)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const pendingMovePath = useCityStore((s) => s.pendingMovePath)
  const phase = useCityStore((s) => s.phase)
  const completeMove = useCityStore((s) => s.completeMove)
  const [step, setStep] = useState(0)
  const puddles = useMemo(() => players.map((p) => makeGlowPuddleTexture(p.color)), [players.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'MOVING' || !pendingMovePath) return
    setStep(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    let interval: ReturnType<typeof setInterval> | undefined
    // let the dice finish tumbling on screen before the token starts walking
    timers.push(
      setTimeout(() => {
        let i = 0
        interval = setInterval(() => {
          i += 1
          setStep(i)
          if (i >= pendingMovePath.length) {
            clearInterval(interval)
            // guests only animate what the host sends; the host resolves the landing
            if (useCityMatch.getState().role !== 'guest') timers.push(setTimeout(() => completeMove(), STEP_MS))
          }
        }, STEP_MS)
      }, DICE_ROLL_MS),
    )
    return () => {
      timers.forEach(clearTimeout)
      if (interval) clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMovePath, phase])

  return (
    <group>
      {players.map((player, i) => {
        if (player.bankrupt) return null
        const animating = i === currentPlayerIndex && phase === 'MOVING' && pendingMovePath
        const tileIndex = animating && step > 0 ? pendingMovePath![Math.min(step, pendingMovePath!.length) - 1] : player.position
        return (
          <Token
            key={player.id}
            player={player}
            slot={i}
            tileIndex={tileIndex}
            moving={Boolean(animating && step > 0)}
            isCurrent={i === currentPlayerIndex}
            celebrating={Boolean(celebrating[player.id])}
            puddle={puddles[i]}
          />
        )
      })}
    </group>
  )
}

// ------------------------------------------------------------------ board contents

function BoardContents() {
  const tiles = useCityStore((s) => s.tiles)
  const players = useCityStore((s) => s.players)
  const phase = useCityStore((s) => s.phase)
  const currentPlayerIndex = useCityStore((s) => s.currentPlayerIndex)
  const lastEvent = useCityStore((s) => s.lastEvent)
  const goBonus = useCityStore((s) => s.config.goBonus)
  const [bursts, setBursts] = useState<{ id: number; tile: number }[]>([])
  const [landings, setLandings] = useState<{ id: number; tile: number; color: string }[]>([])
  const [celebrating, setCelebrating] = useState<Record<string, boolean>>({})
  const prevPhase = useRef(phase)
  const prevCash = useRef<Record<string, number>>({})

  // a character arriving on a tile lights it up
  useEffect(() => {
    if (prevPhase.current === 'MOVING' && phase !== 'MOVING') {
      const p = useCityStore.getState().players[useCityStore.getState().currentPlayerIndex]
      if (p) setLandings((l) => [...l, { id: performance.now(), tile: p.position, color: p.color }])
    }
    prevPhase.current = phase
  }, [phase])

  // anyone whose cash goes up (Go bonus, rent, cards) gets coins bursting from where they stand and a little wave
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const p of players) {
      const before = prevCash.current[p.id]
      if (before !== undefined && p.cash > before) {
        setBursts((b) => [...b, { id: performance.now() + Math.random(), tile: p.position }])
        setCelebrating((c) => ({ ...c, [p.id]: true }))
        timers.push(setTimeout(() => setCelebrating((c) => ({ ...c, [p.id]: false })), 1400))
      }
      prevCash.current[p.id] = p.cash
    }
    return () => timers.forEach(clearTimeout)
  }, [players])

  useEffect(() => {
    if (lastEvent?.type !== 'buy') return
    const buyer = useCityStore.getState().players[useCityStore.getState().currentPlayerIndex]
    if (!buyer) return
    const id = performance.now()
    setBursts((b) => [...b, { id, tile: buyer.position }])
    setCelebrating((c) => ({ ...c, [buyer.id]: true }))
    const t = setTimeout(() => setCelebrating((c) => ({ ...c, [buyer.id]: false })), 1600)
    return () => clearTimeout(t)
  }, [lastEvent])

  const current = players[currentPlayerIndex]

  return (
    <group>
      {tiles.map((t) => (
        <BoardTile key={t.id} tile={t} goBonus={goBonus} />
      ))}
      {tiles.map((t) => {
        if (t.type !== 'PROPERTY' || !t.ownerId) return null
        const owner = players.find((p) => p.id === t.ownerId)
        return owner ? <OwnedOverlay key={`own-${t.id}`} tile={t} owner={owner} /> : null
      })}
      {current && !current.bankrupt && phase !== 'MOVING' && phase !== 'GAME_OVER' && (
        <LandingHighlight tileIndex={current.position} color={current.color} />
      )}
      {bursts.map((b) => (
        <CoinBurst key={b.id} tileIndex={b.tile} onDone={() => setBursts((all) => all.filter((x) => x.id !== b.id))} />
      ))}
      {landings.map((l) => (
        <LandingBurst key={l.id} tileIndex={l.tile} color={l.color} onDone={() => setLandings((all) => all.filter((x) => x.id !== l.id))} />
      ))}
      <SceneErrorBoundary label="player tokens">
        <Suspense fallback={null}>
          <PlayerTokens celebrating={celebrating} />
        </Suspense>
      </SceneErrorBoundary>
    </group>
  )
}

export default function CityScene3D({
  className = 'h-full w-full',
  mapView = false,
  insets,
}: {
  className?: string
  mapView?: boolean
  insets: HudInsets
}) {
  return (
    <GameCanvas
      className={className}
      cameraPosition={[0, 16, 12]}
      fov={38}
      transparent
      environment
      environmentIntensity={0.5}
      keyLightColor="#fff4e0"
      fillLightColor="#7fa8ff"
      bloomIntensity={0.6}
      vignetteDarkness={0.35}
    >
      <CameraRig mapView={mapView} insets={insets} />
      <fog attach="fog" args={['#0b0a14', 55, 120]} />
      <spotLight position={[0, 14, 6]} angle={0.7} penumbra={0.8} intensity={1.6} color="#fff1dc" castShadow={false} />
      <pointLight position={[-9, 3, -6]} intensity={1.2} distance={20} color="#a855f7" />
      <pointLight position={[9, 3, -6]} intensity={1.2} distance={20} color="#22d3ee" />
      <SceneErrorBoundary label="city lounge">
        <Suspense fallback={null}>
          <CityLounge />
        </Suspense>
      </SceneErrorBoundary>
      <BoardFrame />
      <BoardContents />
      <SceneErrorBoundary label="city world">
        <Suspense fallback={null}>
          <CityWorld />
        </Suspense>
      </SceneErrorBoundary>
      <SceneErrorBoundary label="portraits">
        <Suspense fallback={null}>
          <LudoPortraitStudio />
        </Suspense>
      </SceneErrorBoundary>
      <ContactShadows position={[0, -0.5, 0]} opacity={0.6} scale={28} blur={2.6} far={4} color="#000000" />
    </GameCanvas>
  )
}
