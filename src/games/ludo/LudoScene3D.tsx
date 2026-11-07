import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AIM_COLOR, useLudoAim } from './ludoAim'
import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { makeEmojiTexture, makeSoftGlowTexture, makeStreakTexture } from './ludoTextures'
import { makeEmblemTexture, paintBoard } from './ludoBoardTexture'
import { paintRadialBoard } from './ludoRadialTexture'
import { CELL, getBoard, radialGeometry, tokenPos, type LudoBoard, type Vec2 } from './ludoBoards'
import { makeGlowPuddleTexture } from '@/games/shared/three/glowTextures'
import SceneErrorBoundary from '@/games/shared/three/SceneErrorBoundary'
import GameCanvas from '@/games/shared/three/GameCanvas'
import LudoCharacter, { type CharacterPose } from './LudoCharacter'
import { CHARACTER_HEIGHT, preloadCharacters } from './ludoCharacters'
import { useLudoStore, type LudoToken } from './ludoStore'
import LudoPortraitStudio from './LudoPortraitStudio'
import LudoNeonCity from './LudoNeonCity'
import { ALL_COLORS, COLOR_DEEP, COLOR_GLOW, type ClassicColor, type LudoColor } from './ludoBoardLayout'

/** Pixel rectangle (relative to the canvas) that the board must fit inside. */
export interface BoardSlot {
  left: number
  top: number
  width: number
  height: number
}

const GRID = 15
const TILE_TOP = 0.1
/** How far the raised tiles stand above the grout between them. */
const TILE_RELIEF = 0.07
/** Thickness of the glass slab under the playing surface; its top sits just under the tiles. */
const SLAB_THICK = 0.64
const SLAB_BOTTOM = -0.02 - SLAB_THICK
/** The inner yard pad is carved a little lower than the track tiles. */
const YARD_TOP = TILE_TOP - 0.025
const SLAB_HALF = 5.0
/** The character model's forward axis is -Z; this turns it to face +Z (toward the camera) at yaw 0. */
const MODEL_YAW = 0
/**
 * The classic board is shown with red far-left, green far-right, yellow near-right and blue near-left,
 * as in the lounge poster. Only the view turns, not the rules.
 */
const CLASSIC_YAW = 0

function boardYaw(board: LudoBoard) {
  return board.kind === 'classic' ? CLASSIC_YAW : 0
}

/** Turns everything that lives on the board, so characters, lights and effects stay on their cells. */
function BoardSpin({ children }: { children: ReactNode }) {
  const board = useBoard()
  const viewportWidth = useThree((s) => s.size.width)
  const viewportHeight = useThree((s) => s.size.height)
  // The classic board uses nearly all the width on phones, as in a native portrait Ludo screen.
  const phoneScale = board.kind === 'classic' && viewportWidth < 600 ? 1.06 : 1
  // Portrait tablets have a proportionally shorter board slot because the controls stay on-screen;
  // enlarge the table inside that slot so it still has the same visual weight as the phone layout.
  const tabletScale = board.kind === 'classic' && viewportWidth >= 600 && viewportHeight > viewportWidth ? 1.06 : 1
  return <group rotation={[0, boardYaw(board), 0]} scale={Math.max(phoneScale, tabletScale)}>{children}</group>
}

const FX_MS = 2400

/** Brief camera shake, kicked by capture impacts. */
const cameraShake = { until: 0, strength: 0 }
const CELEBRATE_MS = 1600

// Start the character downloads as soon as this module loads.
preloadCharacters()

function useBoard(): LudoBoard {
  return getBoard(useLudoStore((s) => s.arms))
}

function hdr(hex: string, intensity: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(intensity)
}

/* ------------------------------------------------------------------ camera */

/** Points that must stay on screen: the board outline at table height, plus character height along the far edge. */
function fitPoints(board: LudoBoard): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const top = CHARACTER_HEIGHT * board.pieceScale + 0.2
  for (const [x, z] of board.outline) out.push(new THREE.Vector3(x, SLAB_BOTTOM, z), new THREE.Vector3(x, z < 0 ? top : 0.3, z))
  return out
}

/**
 * Frames the whole board inside the DOM slot between the player cards: picks a tilt from the slot's
 * aspect, binary-searches the camera distance until every board corner fits, then lens-shifts the
 * projection so the board sits centered in the slot rather than in the middle of the full-screen canvas.
 */
const HEAD_BLEED = 34
/** The near rim may slide a little under the dice row, as the table does in front of the players. */
const BOTTOM_BLEED = 24

function CameraRig({ slot }: { slot: BoardSlot | null }) {
  const board = useBoard()
  const FIT_CORNERS = useMemo(() => fitPoints(board), [board])
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const fit = useRef({ distance: 16, elevation: 0.9 })

  const left = slot?.left ?? 0
  const top = slot?.top ?? 0
  const slotW = slot?.width ?? width
  const slotH = slot?.height ?? height
  // Use the device orientation for the board camera. On a portrait tablet the UI controls can
  // make the board slot shorter than it is wide, but the Ludo board should still read as a square.
  const portraitStage = height / Math.max(width, 1) > 0.9
  const bottomBleed = portraitStage ? 0 : BOTTOM_BLEED

  useLayoutEffect(() => {
    if (width < 2 || height < 2 || slotW < 2 || slotH < 2) return
    const pad = 6
    // the whole board, frame included, stays on screen with a little air at the sides
    const padX = portraitStage ? 3 : pad
    // phones use a longer lens: the tilt still shows the frame's front face and standing warriors, but
    // the far rim stays nearly as wide as the near one, so the board reads square and fills the width
    // (a wide lens made the far half shrink into a small wedge)
    camera.fov = portraitStage ? 30 : 46
    const v = new THREE.Vector3()
    let elevation = 0
    let shiftX = 0
    let shiftY = 0

    const place = (d: number) => {
      camera.position.set(0, d * Math.sin(elevation), d * Math.cos(elevation))
      camera.lookAt(0, 0, 0)
      camera.setViewOffset(width, height, -shiftX, -shiftY, width, height)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
    }
    const bounds = () => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, headY = Infinity
      for (const c of FIT_CORNERS) {
        v.copy(c).project(camera)
        const px = ((v.x + 1) / 2) * width
        const py = ((1 - v.y) / 2) * height
        minX = Math.min(minX, px)
        maxX = Math.max(maxX, px)
        maxY = Math.max(maxY, py)
        // the far characters' heads may rise into the gap below the player cards; the board itself may not
        if (c.y > 0.5) headY = Math.min(headY, py)
        else minY = Math.min(minY, py)
      }
      return { minX, maxX, minY, maxY, headY }
    }
    /** Largest board that fits the slot at this tilt, sitting low in the slot just above the dice. */
    const fitAt = (deg: number) => {
      elevation = THREE.MathUtils.degToRad(deg)
      shiftX = left + slotW / 2 - width / 2
      shiftY = top + slotH / 2 - height / 2
      let distance = 16
      for (let pass = 0; pass < 3; pass++) {
        let lo = 3
        let hi = 120
        for (let i = 0; i < 26; i++) {
          const mid = (lo + hi) / 2
          place(mid)
          const b = bounds()
          // the far rim may tuck under the player cards, like a table seen past the players' shoulders
          const fits = b.minX >= left + padX && b.maxX <= left + slotW - padX && b.minY >= top - HEAD_BLEED && b.headY >= top - HEAD_BLEED * 2.5 && b.maxY <= top + slotH + bottomBleed
          if (fits) hi = mid
          else lo = mid
        }
        distance = hi
        place(distance)
        const b = bounds()
        shiftX += left + slotW / 2 - (b.minX + b.maxX) / 2
        // tall (phone) slots: centre the board between the player cards; wide slots: sit it low, just above the dice
        shiftY += portraitStage
          ? top + slotH / 2 - (Math.min(b.minY, b.headY) + b.maxY) / 2 - slotH * 0.013
          : top + slotH + bottomBleed - b.maxY
      }
      place(distance)
      const b = bounds()
      return { deg, distance, shiftX, shiftY, area: (b.maxX - b.minX) * (b.maxY - b.minY), tall: b.maxY - b.minY }
    }

    // Use the lower, table-facing view from the target game screen: the far edge recedes,
    // characters read as figures, and the near glass bevel gives the board visible depth.
    const tries = []
    // Portrait slots use a higher camera so the board fills more of the vertical stage; landscape
    // keeps the lower angle that gives the table more depth across the wide viewport.
    // Portrait phones previously used a near-overhead camera, which made the whole scene feel
    // like a flat board screenshot. A ~55 degree elevation keeps the square track legible while
    // bringing back the perspective and raised near edge visible in the reference.
    // Portrait screens use a three-quarter view: steep enough that the grid reads clearly and the board
    // fills the width, low enough that the frame's front face, the raised tiles and the standing warriors
    // show real depth (a near-overhead camera flattened the whole table into a 2D board).
    const [lowDeg, highDeg] = portraitStage ? [50, 60] : [36, 46]
    for (let deg = lowDeg; deg <= highDeg; deg += 2) tries.push(fitAt(deg))
    const best = tries.reduce((a, t) => (t.area > a.area * 1.03 ? t : a))
    elevation = THREE.MathUtils.degToRad(best.deg)
    shiftX = best.shiftX
    shiftY = best.shiftY
    place(best.distance)
    fit.current = { distance: best.distance, elevation }
  }, [camera, width, height, left, top, slotW, slotH, portraitStage, FIT_CORNERS])

  useFrame((state) => {
    // barely-there orbit sway so the scene breathes like a live camera
    const { distance, elevation } = fit.current
    const yaw = Math.sin(state.clock.elapsedTime * 0.22) * 0.012
    const flat = distance * Math.cos(elevation)
    camera.position.set(Math.sin(yaw) * flat, distance * Math.sin(elevation), Math.cos(yaw) * flat)
    camera.lookAt(0, 0, 0)
    const left = cameraShake.until - performance.now()
    if (left > 0) {
      const k = cameraShake.strength * (left / 420) * distance * 0.004
      const t = state.clock.elapsedTime
      camera.position.x += Math.sin(t * 71) * k
      camera.position.y += Math.cos(t * 53) * k
    }
  })

  return null
}

/* ------------------------------------------------------------------ board */

const STRIP_LEN = SLAB_HALF - 0.28
const EDGE_STRIPS: { color: ClassicColor; pos: [number, number, number]; along: 'x' | 'z' }[] = [
  { color: 'RED', pos: [-STRIP_LEN / 2 - 0.04, 0, -SLAB_HALF], along: 'x' },
  { color: 'GREEN', pos: [STRIP_LEN / 2 + 0.04, 0, -SLAB_HALF], along: 'x' },
  { color: 'GREEN', pos: [SLAB_HALF, 0, -STRIP_LEN / 2 - 0.04], along: 'z' },
  { color: 'YELLOW', pos: [SLAB_HALF, 0, STRIP_LEN / 2 + 0.04], along: 'z' },
  { color: 'YELLOW', pos: [STRIP_LEN / 2 + 0.04, 0, SLAB_HALF], along: 'x' },
  { color: 'BLUE', pos: [-STRIP_LEN / 2 - 0.04, 0, SLAB_HALF], along: 'x' },
  { color: 'BLUE', pos: [-SLAB_HALF, 0, STRIP_LEN / 2 + 0.04], along: 'z' },
  { color: 'RED', pos: [-SLAB_HALF, 0, -STRIP_LEN / 2 - 0.04], along: 'z' },
]

/** Beveled dark-glass board body whose rim glows in each adjacent team's color (the active team pulses). */
function BoardFrame() {
  const activeColor = useLudoStore((s) => s.players[s.currentPlayerIndex]?.color)
  const stripMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])

  useFrame((state) => {
    const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4)
    EDGE_STRIPS.forEach((s, i) => {
      const mat = stripMats.current[i]
      if (!mat) return
      const k = s.color === activeColor ? 1.65 + pulse * 0.45 : 1.05
      mat.color.set(COLOR_GLOW[s.color]).multiplyScalar(k)
    })
  })

  return (
    <group>
      <RoundedBox args={[SLAB_HALF * 2, SLAB_THICK, SLAB_HALF * 2]} radius={0.2} smoothness={6} position={[0, -0.02 - SLAB_THICK / 2, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#141a31"
          emissive="#18213f"
          emissiveIntensity={0.3}
          roughness={0.14}
          metalness={0.52}
          clearcoat={1}
          clearcoatRoughness={0.02}
          envMapIntensity={2.6}
        />
      </RoundedBox>
      {/* clear glass skin over the slab: its bright edges and reflections read as a thick glass block */}
      <RoundedBox args={[SLAB_HALF * 2 + 0.1, SLAB_THICK + 0.03, SLAB_HALF * 2 + 0.1]} radius={0.24} smoothness={6} position={[0, -0.02 - SLAB_THICK / 2 - 0.005, 0]}>
        <meshPhysicalMaterial color="#7284b1" transparent opacity={0.12} roughness={0.035} metalness={0.28} clearcoat={1} clearcoatRoughness={0} envMapIntensity={2.4} depthWrite={false} />
      </RoundedBox>
      {/* darker underplate gives the board visible, layered thickness */}
      <RoundedBox args={[SLAB_HALF * 2 - 0.3, 0.12, SLAB_HALF * 2 - 0.3]} radius={0.05} smoothness={3} position={[0, SLAB_BOTTOM + 0.04, 0]} castShadow>
        <meshStandardMaterial color="#05060f" roughness={0.4} metalness={0.6} />
      </RoundedBox>
      <RimLeds />
      {/* light caught along the top edge of the glass rim */}
      {/* colored light bands beneath each team segment make the board rim read as illuminated glass */}
      {EDGE_STRIPS.map((s, i) => (
        <group key={i} position={[s.pos[0], -0.02, s.pos[2]]}>
          <mesh position={[0, -0.012, 0]}>
            <boxGeometry args={s.along === 'x' ? [STRIP_LEN, 0.025, 0.12] : [0.12, 0.025, STRIP_LEN]} />
            <meshBasicMaterial color={hdr(COLOR_GLOW[s.color], 1.35)} transparent opacity={0.22} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh>
          <boxGeometry args={s.along === 'x' ? [STRIP_LEN, 0.045, 0.055] : [0.055, 0.045, STRIP_LEN]} />
          <meshBasicMaterial ref={(m) => { stripMats.current[i] = m }} color={hdr(COLOR_GLOW[s.color], 1.4)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* thin polished gold bezel framing the playing surface */}
      <RoundedBox args={[GRID * CELL + 0.16, 0.05, GRID * CELL + 0.16]} radius={0.02} smoothness={3} position={[0, TILE_TOP - TILE_RELIEF * 0.9 - 0.03, 0]} receiveShadow>
        <meshPhysicalMaterial color="#e9b949" roughness={0.18} metalness={1} clearcoat={0.8} clearcoatRoughness={0.1} envMapIntensity={1.8} />
      </RoundedBox>
    </group>
  )
}

/** Soft contact shadow directly beneath the board keeps the frame separated from the plain screen. */
function Table({ radius }: { radius: number }) {
  void radius
  return null
}

/**
 * The playing surface: one plane carrying the painted board (zones, tiles, lanes, converging center),
 * with a bump map for tile relief, an emissive map for the neon borders, and a clear-coat for gloss.
 */
function BoardSurface() {
  const maps = useMemo(() => (classicMaps ??= paintBoard(2048)), [])
  return (
    <group>
      <mesh position={[0, TILE_TOP - TILE_RELIEF * 0.9 - 0.03, 0]} receiveShadow>
        <boxGeometry args={[GRID * CELL, 0.05, GRID * CELL]} />
        <meshStandardMaterial color="#0c0e1f" roughness={0.5} />
      </mesh>
      {/* the tile relief is real geometry: the bump map lifts each tile into a raised, beveled block */}
      <mesh position={[0, TILE_TOP - TILE_RELIEF * 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID * CELL, GRID * CELL, 360, 360]} />
        <meshPhysicalMaterial
          map={maps.map}
          bumpMap={maps.bumpMap}
          bumpScale={2.6}
          displacementMap={maps.bumpMap}
          displacementScale={TILE_RELIEF}
          emissive="#ffffff"
          emissiveMap={maps.emissiveMap}
          color="#e0e5f1"
          emissiveIntensity={0.82}
          roughness={0.24}
          metalness={0.16}
          clearcoat={0.9}
          clearcoatRoughness={0.12}
          envMapIntensity={0.45}
        />
      </mesh>
    </group>
  )
}

/** Small gold-rimmed crown medallion set into the middle of the home, where the four lanes meet. */
/** Which team's home column meets each side of the classic centre square (board space). */
const PYRAMID_SIDES: { color: ClassicColor; base: [number, number][]; top: [number, number][] }[] = (() => {
  const h = CELL * 1.5
  const t = CELL * 0.56
  return [
    { color: 'RED', base: [[-h, h], [-h, -h]], top: [[-t, t], [-t, -t]] },
    { color: 'GREEN', base: [[-h, -h], [h, -h]], top: [[-t, -t], [t, -t]] },
    { color: 'YELLOW', base: [[h, -h], [h, h]], top: [[t, -t], [t, t]] },
    { color: 'BLUE', base: [[h, h], [-h, h]], top: [[t, t], [-t, t]] },
  ]
})()
const PYRAMID_RISE = 0.42

/** Height of the centre pyramid's surface at (x, z), so finished warriors stand on its slope. */
function pyramidLift(x: number, z: number) {
  const h = CELL * 1.5
  const t = CELL * 0.56
  const d = Math.max(Math.abs(x), Math.abs(z))
  return d >= h ? 0 : PYRAMID_RISE * Math.min(1, (h - d) / (h - t))
}

/**
 * The finish area as a physical object: a low, four-sided stepped pyramid whose faces carry the team
 * colours, rising from the board to a gold plinth that holds the crown emblem.
 */
function CenterPyramid() {
  const faces = useMemo(
    () =>
      PYRAMID_SIDES.map(({ color, base, top }) => {
        const g = new THREE.BufferGeometry()
        const [b0, b1] = base
        const [t0, t1] = top
        const y0 = TILE_TOP - 0.01
        const y1 = TILE_TOP + PYRAMID_RISE
        // two triangles per trapezoid face, wound to face outward and up
        const v = [b0[0], y0, b0[1], b1[0], y0, b1[1], t1[0], y1, t1[1], b0[0], y0, b0[1], t1[0], y1, t1[1], t0[0], y1, t0[1]]
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
        g.computeVertexNormals()
        return { color, g }
      }),
    [],
  )
  const t = CELL * 0.56
  const h = CELL * 1.5
  // gold ridges up the four corner edges make the pyramid read as raised, not as a sunken well
  const ridges = useMemo(
    () =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sz]) => {
        const a = new THREE.Vector3(sx * h, TILE_TOP, sz * h)
        const b = new THREE.Vector3(sx * t, TILE_TOP + PYRAMID_RISE, sz * t)
        const mid = a.clone().add(b).multiplyScalar(0.5)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
        return { mid, q, len: a.distanceTo(b) }
      }),
    [h, t],
  )
  return (
    <group>
      {ridges.map((r, i) => (
        <mesh key={i} position={r.mid} quaternion={r.q} castShadow>
          <cylinderGeometry args={[0.028, 0.028, r.len, 8]} />
          <meshPhysicalMaterial color="#f3c552" roughness={0.22} metalness={0.6} clearcoat={1} emissive="#7a5208" emissiveIntensity={0.4} />
        </mesh>
      ))}
      {faces.map(({ color, g }) => (
        <mesh key={color} geometry={g} castShadow receiveShadow>
          <meshPhysicalMaterial color={COLOR_DEEP[color]} emissive={COLOR_GLOW[color]} emissiveIntensity={0.18} roughness={0.28} metalness={0.25} clearcoat={1} clearcoatRoughness={0.08} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* gold plinth on top of the pyramid */}
      <mesh position={[0, TILE_TOP + PYRAMID_RISE + 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[t * 2 + 0.04, 0.05, t * 2 + 0.04]} />
        <meshPhysicalMaterial color="#e9b949" roughness={0.25} metalness={0.6} clearcoat={0.8} />
      </mesh>
    </group>
  )
}

function CenterEmblem({ radius = CELL * 0.5, raised = 0 }: { radius?: number; raised?: number }) {
  const face = useMemo(() => makeEmblemTexture(), [])
  const glowTex = useMemo(() => makeSoftGlowTexture(), [])
  const faceMat = useRef<THREE.MeshPhysicalMaterial>(null)
  const R = radius

  useFrame((state) => {
    if (faceMat.current) faceMat.current.emissiveIntensity = 0.35 + 0.15 * Math.sin(state.clock.elapsedTime * 2.2)
  })

  return (
    <group position={[0, TILE_TOP + raised, 0]}>
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R * 1.06, 0.06, 48]} />
        <meshPhysicalMaterial color="#f0c24e" metalness={0.85} roughness={0.42} clearcoat={0.2} envMapIntensity={0.7} />
      </mesh>
      <mesh position={[0, 0.061, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 0.9, 48]} />
        <meshPhysicalMaterial
          ref={faceMat}
          map={face}
          emissive="#ffffff"
          emissiveMap={face}
          emissiveIntensity={0.4}
          metalness={0.3}
          roughness={0.45}
          clearcoat={0.2}
        />
      </mesh>
      <mesh position={[0, 0.064, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R * 0.9, R * 1.02, 48]} />
        <meshBasicMaterial color={hdr('#ffd36a', 1.8)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[R * 4, R * 4]} />
        <meshBasicMaterial map={glowTex} color="#ffc84a" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ ambience */

/** Colored light pooled over each home zone (breathing slowly), plus a soft white light drifting across the gloss. */
export function BoardLights() {
  const zoneRefs = useRef<(THREE.PointLight | null)[]>([])
  const sweepRef = useRef<THREE.PointLight>(null)
  const activeColor = useLudoStore((s) => s.players[s.currentPlayerIndex]?.color)
  const board = useBoard()
  const colors = board.armColors
  const spread = board.kind === 'radial' ? 1.35 : 1
  useFrame((state) => {
    const t = state.clock.elapsedTime
    colors.forEach((c, i) => {
      const l = zoneRefs.current[i]
      if (!l) return
      const base = c === activeColor ? 0.82 : 0.28
      l.intensity = base + Math.sin(t * 1.1 + i * 1.7) * 0.15
    })
    if (sweepRef.current) sweepRef.current.position.set(Math.sin(t * 0.23) * 3.6 * spread, 2.4, Math.cos(t * 0.31) * 3.2 * spread)
  })
  return (
    <group>
      {colors.map((color, i) => {
        const [x, z] = board.yardCenter(color)
        return (
          <pointLight
            key={color}
            ref={(l) => {
              zoneRefs.current[i] = l
            }}
            position={[x, 0.95, z]}
            intensity={1.05}
            distance={3.4}
            decay={2.1}
            color={COLOR_GLOW[color]}
          />
        )
      })}
      <pointLight ref={sweepRef} intensity={0.06} distance={4.4 * spread} decay={2.2} color="#fff4e6" />
      {/* cool light from high behind the board that rims the characters; kept high and soft so its
          reflection off the board's far arm doesn't glare straight into the camera */}
      <directionalLight position={[-9, 10, -7]} intensity={0.18} color="#cfd8ff" />
    </group>
  )
}

function makePointCloud(count: number) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  return geo
}

function hash01(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

/** Slow-drifting light dust hanging in the air above the board. */
export function AmbientDust() {
  const tex = useMemo(() => makeSoftGlowTexture(), [])
  const COUNT = 120
  const seeds = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => [hash01(i) * 12 - 6, hash01(i + 99) * 2.8, hash01(i + 199) * 12 - 6, hash01(i + 299)]),
    [],
  )
  const geo = useMemo(() => makePointCloud(COUNT), [])
  const pointsRef = useRef<THREE.Points>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      const [x, y, z, p] = seeds[i]
      pos.setXYZ(i, x + Math.sin(t * 0.2 + p * 9) * 0.35, ((y + t * (0.05 + p * 0.08)) % 3) + 0.15, z + Math.cos(t * 0.17 + p * 7) * 0.35)
    }
    pos.needsUpdate = true
  })
  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial map={tex} size={0.09} color={hdr('#ffe2c2', 1.6)} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} />
    </points>
  )
}

/** Sparkles rising gently out of the active player's home zone. */
export function ActiveTeamAura() {
  const activeColor = useLudoStore((s) => s.players[s.currentPlayerIndex]?.color)
  const phase = useLudoStore((s) => s.phase)
  const tex = useMemo(() => makeSoftGlowTexture(), [])
  const COUNT = 26
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => [hash01(i + 7) * 3.3 - 1.65, hash01(i + 77) * 3.3 - 1.65, hash01(i + 777)]), [])
  const geo = useMemo(() => makePointCloud(COUNT), [])
  const pointsRef = useRef<THREE.Points>(null)
  const board = useBoard()
  const [cx, cz] = board.yardCenter(activeColor ?? 'RED')
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      const [x, z, p] = seeds[i]
      const life = (t * 0.35 + p) % 1
      pos.setXYZ(i, cx + x + Math.sin(t + p * 6) * 0.08, TILE_TOP + life * 1.6, cz + z)
    }
    pos.needsUpdate = true
  })
  if (!activeColor || phase === 'gameOver') return null
  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial map={tex} size={0.09} color={COLOR_GLOW[activeColor]} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

/** Team-colored sparks drifting up out of every home base, so the whole board shimmers. */
export function BaseSparkles() {
  const board = useBoard()
  const tex = useMemo(() => makeSoftGlowTexture(), [])
  const PER = 14
  const colors = board.armColors
  const count = colors.length * PER
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => [hash01(i + 1301) * 3 - 1.5, hash01(i + 1401) * 3 - 1.5, hash01(i + 1501)]), [count])
  const geo = useMemo(() => {
    const g = makePointCloud(count)
    const col = new Float32Array(count * 3)
    colors.forEach((c, k) => {
      const tint = new THREE.Color(COLOR_GLOW[c]).multiplyScalar(1.8)
      for (let j = 0; j < PER; j++) col.set([tint.r, tint.g, tint.b], (k * PER + j) * 3)
    })
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [count, colors])
  const centers = useMemo(() => colors.map((c) => board.yardCenter(c)), [board, colors])
  const pointsRef = useRef<THREE.Points>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      const [cx, cz] = centers[Math.floor(i / PER)]
      const [x, z, p] = seeds[i]
      const life = (t * 0.22 + p) % 1
      pos.setXYZ(i, cx + x + Math.sin(t * 0.8 + p * 9) * 0.1, TILE_TOP + 0.1 + life * 1.8, cz + z)
    }
    pos.needsUpdate = true
  })
  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial map={tex} size={0.075} vertexColors transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} />
    </points>
  )
}

/** Gold motes drifting up from the home emblem — the prize at the center of the board. */
export function CenterMotes() {
  const tex = useMemo(() => makeSoftGlowTexture(), [])
  const COUNT = 14
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => [hash01(i + 3) * Math.PI * 2, hash01(i + 33)]), [])
  const geo = useMemo(() => makePointCloud(COUNT), [])
  const pointsRef = useRef<THREE.Points>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      const [a, p] = seeds[i]
      const life = (t * 0.28 + p) % 1
      const r = 0.12 + life * 0.35
      pos.setXYZ(i, Math.cos(a + t * 0.4) * r, TILE_TOP + 0.1 + life * 1.1, Math.sin(a + t * 0.4) * r)
    }
    pos.needsUpdate = true
  })
  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial map={tex} size={0.08} color="#ffd36a" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

let starTexture: THREE.CanvasTexture | null = null
/** Four-point lens glint: a bright core with long thin rays, like light catching glossy glass. */
function makeStarTexture() {
  if (starTexture) return starTexture
  const S = 128
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.22)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(0.3, 'rgba(255,255,255,0.55)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = core
  g.fillRect(0, 0, S, S)
  for (const [w, h] of [
    [S, 3],
    [3, S],
  ]) {
    const ray = w > h ? g.createLinearGradient(0, 0, S, 0) : g.createLinearGradient(0, 0, 0, S)
    ray.addColorStop(0, 'rgba(255,255,255,0)')
    ray.addColorStop(0.5, 'rgba(255,255,255,1)')
    ray.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = ray
    g.fillRect((S - w) / 2, (S - h) / 2, w, h)
  }
  starTexture = new THREE.CanvasTexture(c)
  return starTexture
}

const GLINTS = Array.from({ length: 26 }, (_, i) => {
  const e = SLAB_HALF - 0.05
  const along = hash01(i + 401) * 2 * e - e
  const side = i % 4
  const onRim = i < 18
  const x = onRim ? (side === 0 ? along : side === 1 ? e : side === 2 ? along : -e) : (hash01(i + 501) * 2 - 1) * 4.2
  const z = onRim ? (side === 0 ? -e : side === 1 ? along : side === 2 ? e : along) : (hash01(i + 601) * 2 - 1) * 4.2
  return { x, z, y: onRim ? 0.02 : TILE_TOP + 0.04, size: onRim ? 0.55 + hash01(i + 701) * 0.5 : 0.35 + hash01(i + 801) * 0.3, speed: 0.7 + hash01(i + 901) * 1.1, phase: hash01(i + 1001) * 10, warm: i % 3 === 0 }
})

/** Star glints twinkling along the glass rim and across the glossy tiles. */
export function BoardGlints() {
  const tex = useMemo(() => makeStarTexture(), [])
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const board = useBoard()
  useFrame((state) => {
    const t = state.clock.elapsedTime
    GLINTS.forEach((g, i) => {
      const sp = refs.current[i]
      if (!sp) return
      const k = Math.pow(Math.max(0, Math.sin(t * g.speed + g.phase)), 6)
      sp.scale.setScalar(0.01 + g.size * k)
      sp.material.rotation = t * 0.3 + g.phase
    })
  })
  if (board.kind !== 'classic') return null
  return (
    <group>
      {GLINTS.map((g, i) => (
        <sprite key={i} ref={(s) => { refs.current[i] = s }} position={[g.x, g.y, g.z]} scale={[0.01, 0.01, 1]}>
          <spriteMaterial map={tex} color={hdr(g.warm ? '#ffe2a8' : '#dfe8ff', 2.2)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}

/** Tiny warm LEDs set along the top edge of the glass rim. */
function RimLeds() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: [number, number][] = []
    const e = SLAB_HALF - 0.1
    for (let i = 0; i <= 18; i++) {
      const t = -e + (i / 18) * e * 2
      out.push([t, -e], [t, e], [-e, t], [e, t])
    }
    return out
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([x, z], i) => ref.current?.setMatrixAt(i, m.makeTranslation(x, -0.015, z)))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]}>
      <sphereGeometry args={[0.022, 8, 8]} />
      <meshBasicMaterial color={hdr('#ffe0b0', 2.2)} toneMapped={false} />
    </instancedMesh>
  )
}

/** A stage spotlight on the active team's home zone: real light on the characters plus a soft visible beam. */
export function ActiveSpotlight() {
  const activeColor = useLudoStore((s) => s.players[s.currentPlayerIndex]?.color)
  const phase = useLudoStore((s) => s.phase)
  const lightRef = useRef<THREE.SpotLight>(null)
  const beamRef = useRef<THREE.Mesh>(null)
  const beamTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 128)
    grad.addColorStop(0, '#000000')
    grad.addColorStop(0.25, '#ffffff')
    grad.addColorStop(0.7, '#555555')
    grad.addColorStop(1, '#000000')
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  const board = useBoard()
  const [x, z] = board.yardCenter(activeColor ?? 'RED')
  useLayoutEffect(() => {
    const l = lightRef.current
    if (!l) return
    l.target.position.set(x, 0, z)
    l.target.updateMatrixWorld()
  }, [x, z])
  useFrame((state) => {
    if (beamRef.current) (beamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.03 + Math.sin(state.clock.elapsedTime * 2) * 0.008
  })
  if (!activeColor || phase === 'gameOver') return null
  const tint = new THREE.Color(COLOR_GLOW[activeColor]).lerp(new THREE.Color('#ffffff'), 0.1)
  return (
    <group>
      <spotLight ref={lightRef} position={[x * 0.6, 6, z * 0.6 + 1]} angle={0.42} penumbra={0.85} intensity={3.4} distance={10} decay={1.8} color={tint} />
      {/* the visible light cone reads as a flat triangle at the low table-side camera angle, so it stays hidden */}
      <mesh ref={beamRef} position={[x, 2.4, z]} visible={false}>
        <coneGeometry args={[2.1, 4.6, 48, 1, true]} />
        <meshBasicMaterial alphaMap={beamTex} color={tint} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ tokens */

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  const diff = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return current + diff * (1 - Math.exp(-lambda * dt))
}

interface TokenPieceProps {
  color: LudoColor
  variant: number
  target: [number, number, number]
  scale: number
  pose: CharacterPose
  selectable: boolean
  active: boolean
  puddle: THREE.Texture
  /** Facing at rest (cancels the board's turn so the character looks into the board, back to the camera). */
  restYaw: number
  /** Overrides the facing, e.g. an attacker turned toward the character it is slashing. */
  faceYaw?: number
  onSelect?: () => void
  /** Protected by a Shield power-up. */
  shielded?: boolean
  /** Highlight colour while the token is a power-up target (overrides the team glow on the pick ring). */
  aimColor?: string
}

/** A team character on a glass base; glides and hops between cells, faces into the board at rest. */
let blobTexture: THREE.Texture | null = null
function contactShadowTexture() {
  blobTexture ??= makeSoftGlowTexture()
  return blobTexture
}

const TRAIL = 16
/** Height of the glass base the characters stand on. */
const BASE_H = 0.2

function TokenPiece({ color, variant, target, scale, pose, selectable, active, puddle, restYaw, faceYaw, onSelect, shielded, aimColor }: TokenPieceProps) {
  const baseMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const shieldRef = useRef<THREE.Mesh>(null)
  const trailRefs = useRef<(THREE.Sprite | null)[]>([])
  const trailState = useRef({ next: 0, last: 0 })
  const groupRef = useRef<THREE.Group>(null)
  const facingRef = useRef<THREE.Group>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const arrowRef = useRef<THREE.Group>(null)
  const motion = useRef({ from: new THREE.Vector3(), to: new THREE.Vector3(), start: 0, dur: 1, hop: 0, heading: 0, ready: false })
  const [tx, ty, tz] = target

  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g) return
    const m = motion.current
    const to = new THREE.Vector3(tx, ty, tz)
    if (!m.ready) {
      g.position.copy(to)
      m.from.copy(to)
      m.to.copy(to)
      m.ready = true
      return
    }
    if (to.distanceTo(m.to) < 1e-4) return
    m.from.copy(g.position)
    m.to.copy(to)
    const dist = m.from.distanceTo(to)
    const long = dist > 1.3
    m.dur = long ? 560 : 200
    m.hop = long ? 1.1 : 0.16
    m.start = performance.now()
    if (dist > 0.05) m.heading = Math.atan2(to.x - m.from.x, to.z - m.from.z)
  }, [tx, ty, tz])

  useFrame((state, delta) => {
    const g = groupRef.current
    if (!g) return
    const m = motion.current
    const t = Math.min(1, (performance.now() - m.start) / m.dur)
    const eased = 1 - (1 - t) * (1 - t)
    g.position.lerpVectors(m.from, m.to, eased)
    g.position.y += Math.sin(Math.PI * t) * m.hop
    // drop a fading light mote behind the character while it travels
    const now = performance.now()
    const ts = trailState.current
    if (t < 1 && now - ts.last > 30) {
      const sp = trailRefs.current[ts.next]
      if (sp) {
        sp.position.set(g.position.x, g.position.y + 0.35, g.position.z)
        sp.userData.born = now
      }
      ts.next = (ts.next + 1) % TRAIL
      ts.last = now
    }
    for (const sp of trailRefs.current) {
      if (!sp) continue
      // a bright comet tail behind a moving character, like a streak of light across the board
      const age = (now - (sp.userData.born ?? -1e9)) / 900
      sp.material.opacity = age < 1 ? (1 - age) : 0
      sp.scale.setScalar(0.75 * (1 - Math.min(1, age) * 0.7))
    }
    // a selectable character hops lightly on its base to invite a tap
    if (selectable) g.position.y += Math.abs(Math.sin(state.clock.elapsedTime * 5)) * 0.05
    const s = THREE.MathUtils.damp(g.scale.x, scale, 12, delta)
    g.scale.setScalar(s)

    const face = facingRef.current
    // at rest a character faces into the board, away from the camera, undoing the board's own turn
    if (face) face.rotation.y = dampAngle(face.rotation.y, (faceYaw ?? (t < 1 || pose === 'walk' ? m.heading : restYaw)) + MODEL_YAW, faceYaw === undefined ? 10 : 18, delta)

    const time = state.clock.elapsedTime
    if (baseMaterialRef.current) {
      const pulse = (Math.sin(time * 3.4 + color.charCodeAt(0)) + 1) * 0.5
      baseMaterialRef.current.emissiveIntensity = selectable ? 0.48 + pulse * 0.3 : active ? 0.3 + pulse * 0.18 : 0.16 + pulse * 0.1
    }
    if (pulseRef.current) {
      const k = 1 + ((time * 1.6) % 1) * 0.9
      pulseRef.current.scale.set(k, k, k)
      ;(pulseRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - ((time * 1.6) % 1)
    }
    if (arrowRef.current) {
      arrowRef.current.position.y = CHARACTER_HEIGHT + 0.36 + Math.sin(time * 6) * 0.07
      arrowRef.current.rotation.y = time * 2.2
    }
    if (shieldRef.current) {
      shieldRef.current.rotation.y = time * 0.8
      ;(shieldRef.current.material as THREE.MeshPhysicalMaterial).opacity = 0.2 + Math.sin(time * 3) * 0.05
    }
  })

  const glow = aimColor ?? COLOR_GLOW[color]
  const baseTint = useMemo(() => new THREE.Color(COLOR_DEEP[color]).multiplyScalar(0.35), [color])
  const neonCore = useMemo(() => new THREE.Color(glow).lerp(new THREE.Color('#ffffff'), 0.15), [glow])
  const handleClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect()
      }
    : undefined

  return (
    <>
    {Array.from({ length: TRAIL }, (_, i) => (
      <sprite key={i} ref={(sp) => { trailRefs.current[i] = sp }} scale={[0.01, 0.01, 1]}>
        <spriteMaterial map={contactShadowTexture()} color={hdr(glow, 2.2)} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    ))}
    <group ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <planeGeometry args={[selectable ? 1.2 : 1.0, selectable ? 1.2 : 1.0]} />
        <meshBasicMaterial map={puddle} transparent opacity={selectable ? 1 : active ? 0.84 : 0.62} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {active && <pointLight position={[0, 0.32, 0]} color={glow} intensity={0.32} distance={1.2} decay={2.2} />}
      {/* glass base: dark tinted glass between two neon tubes, each a hot core inside a clear glass sleeve */}
      <mesh position={[0, BASE_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.3, BASE_H, 48]} />
        <meshPhysicalMaterial
          ref={baseMaterialRef}
          color={baseTint}
          emissive={glow}
          emissiveIntensity={selectable ? 0.35 : active ? 0.22 : 0.12}
          transparent
          opacity={0.72}
          roughness={0.04}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.02}
          envMapIntensity={2}
        />
      </mesh>
      {[0.03, BASE_H].map((y) => (
        <group key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.305, 0.022, 14, 64]} />
            <meshBasicMaterial color={neonCore.clone().multiplyScalar(selectable ? 3.5 : active ? 3 : 2.5)} toneMapped={false} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.305, 0.06, 18, 64]} />
            <meshPhysicalMaterial color={glow} emissive={glow} emissiveIntensity={0.5} transparent opacity={0.4} roughness={0.02} clearcoat={1} clearcoatRoughness={0} envMapIntensity={2.5} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BASE_H + 0.0015, 0]}>
        <planeGeometry args={[0.44, 0.44]} />
        <meshBasicMaterial map={contactShadowTexture()} color="#000000" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      {selectable && (
        <>
          <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
            <ringGeometry args={[0.39, 0.46, 48]} />
            <meshBasicMaterial color={hdr(glow, 3.2)} transparent toneMapped={false} depthWrite={false} />
          </mesh>
          <group ref={arrowRef} position={[0, CHARACTER_HEIGHT + 0.36, 0]}>
            <mesh rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.11, 0.22, 4]} />
              <meshBasicMaterial color={hdr(glow, 2.6)} toneMapped={false} />
            </mesh>
          </group>
          {/* generous invisible tap target — the character mesh alone is too small on a phone */}
          <mesh position={[0, CHARACTER_HEIGHT / 2, 0]} onClick={handleClick}>
            <cylinderGeometry args={[0.34, 0.34, CHARACTER_HEIGHT, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </>
      )}
      <group ref={facingRef} position={[0, BASE_H, 0]} rotation={[0, restYaw + MODEL_YAW, 0]}>
        <LudoCharacter color={color} pose={pose} variant={variant} onClick={handleClick} />
      </group>
      {shielded && (
        <mesh ref={shieldRef} position={[0, BASE_H + CHARACTER_HEIGHT * 0.42, 0]}>
          <sphereGeometry args={[0.52, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshPhysicalMaterial color="#7fdcff" emissive="#3fb8ff" emissiveIntensity={0.9} transparent opacity={0.22} roughness={0.05} clearcoat={1} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
    </>
  )
}

interface FxEntry {
  pos: Vec2
  expiresAt: number
}

const BEAM_DOTS = 5

/**
 * A glowing arc of light from a token that can move to the square it would land on: hot core, soft
 * halo, light motes streaming along it and a pulsing target ring.
 */
function MoveBeam({ from, to, color }: { from: Vec2; to: Vec2; color: string }) {
  const glowTex = useMemo(() => makeSoftGlowTexture(), [])
  const curve = useMemo(() => {
    const a = new THREE.Vector3(from[0], TILE_TOP + 0.12, from[1])
    const b = new THREE.Vector3(to[0], TILE_TOP + 0.06, to[1])
    const lift = 0.35 + a.distanceTo(b) * 0.18
    const mid = a.clone().lerp(b, 0.5).setY(TILE_TOP + lift)
    return new THREE.QuadraticBezierCurve3(a, mid, b)
  }, [from, to])
  const core = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.022, 8, false), [curve])
  const halo = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.075, 10, false), [curve])
  const haloMat = useRef<THREE.MeshBasicMaterial>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const dots = useRef<(THREE.Sprite | null)[]>([])
  useEffect(
    () => () => {
      core.dispose()
      halo.dispose()
    },
    [core, halo],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (haloMat.current) haloMat.current.opacity = 0.3 + Math.sin(t * 5) * 0.08
    dots.current.forEach((sp, i) => {
      if (!sp) return
      const u = (t * 0.7 + i / BEAM_DOTS) % 1
      sp.position.copy(curve.getPoint(u))
      sp.scale.setScalar(0.22 * Math.sin(Math.PI * u) + 0.04)
    })
    if (ringRef.current) {
      const k = 1 + ((t * 1.4) % 1) * 0.8
      ringRef.current.scale.set(k, k, k)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - ((t * 1.4) % 1)
    }
  })
  return (
    <group>
      <mesh geometry={core}>
        <meshBasicMaterial color={hdr(color, 3)} toneMapped={false} />
      </mesh>
      <mesh geometry={halo}>
        <meshBasicMaterial ref={haloMat} color={hdr(color, 1.4)} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {Array.from({ length: BEAM_DOTS }, (_, i) => (
        <sprite key={i} ref={(s) => { dots.current[i] = s }}>
          <spriteMaterial map={glowTex} color={hdr('#ffffff', 2.4)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[to[0], TILE_TOP + 0.02, to[1]]}>
        <ringGeometry args={[0.22, 0.27, 48]} />
        <meshBasicMaterial color={hdr(color, 2.6)} toneMapped={false} transparent depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[to[0], TILE_TOP + 0.015, to[1]]}>
        <ringGeometry args={[0.26, 0.3, 48]} />
        <meshBasicMaterial color={hdr(color, 2.2)} toneMapped={false} transparent depthWrite={false} />
      </mesh>
      <sprite position={[to[0], TILE_TOP + 0.1, to[1]]} scale={[0.9, 0.9, 1]}>
        <spriteMaterial map={glowTex} color={hdr(color, 1.3)} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

function PawnLayer({
  authoritative,
  localIds,
  onSelectToken,
}: {
  authoritative: boolean
  localIds: string[] | null
  onSelectToken: (tokenId: string) => void
}) {
  const players = useLudoStore((s) => s.players)
  const phase = useLudoStore((s) => s.phase)
  const currentPlayerIndex = useLudoStore((s) => s.currentPlayerIndex)
  const pendingMove = useLudoStore((s) => s.pendingMove)
  const lastEvent = useLudoStore((s) => s.lastEvent)
  const legalMoves = useLudoStore((s) => s.legalMoves)
  const completeMove = useLudoStore((s) => s.completeMove)
  const aimMode = useLudoAim((s) => s.mode)
  const aimTargets = useLudoAim((s) => s.targets)
  const aimPick = useLudoAim((s) => s.onPick)

  const rollCount = useLudoStore((s) => s.rollCount)
  const lastRoll = useLudoStore((s) => s.lastRoll)
  const winnerId = useLudoStore((s) => s.winnerId)
  const board = useBoard()
  const [cheerColor, setCheerColor] = useState<LudoColor | null>(null)

  // rolling a six makes that team wave for a moment
  useEffect(() => {
    if (!rollCount || lastRoll !== 6) return
    const color = useLudoStore.getState().eventLog.find((e) => e.kind === 'roll')?.color ?? null
    setCheerColor(color)
    if (color) {
      const id = `six-${rollCount}`
      setBursts((b) => [...b, { id, kind: 'enter', pos: getBoard(useLudoStore.getState().arms).yardCenter(color), color: '#ffd24a' }])
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1300)
    }
    const t = setTimeout(() => setCheerColor(null), 1500)
    return () => clearTimeout(t)
  }, [rollCount, lastRoll])
  const puddles = useMemo(
    () => Object.fromEntries(ALL_COLORS.map((c) => [c, makeGlowPuddleTexture(COLOR_GLOW[c])])) as Record<LudoColor, THREE.CanvasTexture>,
    [],
  )

  const [animIndex, setAnimIndex] = useState(0)
  const [victimFx, setVictimFx] = useState<Record<string, FxEntry>>({})
  const [attackerFx, setAttackerFx] = useState<Record<string, number>>({})
  const [celebrating, setCelebrating] = useState<Record<string, number>>({})
  const [bursts, setBursts] = useState<{ id: string; kind: 'capture' | 'finish' | 'enter'; pos: Vec2; color?: string }[]>([])
  const prevDistance = useRef<Record<string, number>>({})
  const lastMovedTokenId = useRef<string | null>(null)
  /** Unit direction of the last step taken, so a capture can stage attacker and victim face to face. */
  const lastMoveDir = useRef<Vec2>([0, 1])

  useEffect(() => {
    if (pendingMove) lastMovedTokenId.current = pendingMove.tokenId
  }, [pendingMove])

  useEffect(() => {
    if (phase !== 'moving' || !pendingMove) return
    setAnimIndex(0)
    let i = 0
    const interval = setInterval(() => {
      i += 1
      setAnimIndex(i)
      if (i >= pendingMove.path.length) {
        const path = pendingMove.path
        const player = useLudoStore.getState().players.find((pl) => pl.tokens.some((t) => t.id === pendingMove.tokenId))
        const token = player?.tokens.find((t) => t.id === pendingMove.tokenId)
        if (token && path.length > 0) {
          const b = getBoard(useLudoStore.getState().arms)
          const to = tokenPos(b, token.color, path[path.length - 1], token.tokenIndex)
          const from = tokenPos(b, token.color, path.length > 1 ? path[path.length - 2] : token.distance, token.tokenIndex)
          const dx = to[0] - from[0]
          const dz = to[1] - from[1]
          const len = Math.hypot(dx, dz)
          if (len > 1e-3) lastMoveDir.current = [dx / len, dz / len]
          const id = `land-${token.id}-${performance.now()}`
          setBursts((bs) => [...bs, { id, kind: 'enter', pos: to, color: COLOR_GLOW[token.color] }])
          setTimeout(() => setBursts((bs) => bs.filter((x) => x.id !== id)), 1300)
        }
        clearInterval(interval)
        // only the device running the game resolves moves; guests just animate what the host sends
        if (authoritative) completeMove()
      }
    }, 220)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMove, phase])

  useEffect(() => {
    if (!lastEvent?.effectId) return
    const now = performance.now()
    const fxId = lastEvent.effectId
    if (lastEvent.type === 'capture' && lastEvent.effectPos && lastEvent.tokenIds) {
      const pos = lastEvent.effectPos
      setBursts((prev) => [...prev, { id: fxId, kind: 'capture', pos }])
      setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== fxId)), 2800)
      setVictimFx((prev) => {
        const next = { ...prev }
        for (const id of lastEvent.tokenIds!) next[id] = { pos, expiresAt: now + FX_MS }
        return next
      })
      const attacker = lastEvent.attackerId === undefined ? lastMovedTokenId.current : lastEvent.attackerId
      if (attacker) {
        setAttackerFx((prev) => ({ ...prev, [attacker]: now + FX_MS }))
        setTimeout(() => setAttackerFx((prev) => { const n = { ...prev }; delete n[attacker]; return n }), FX_MS)
      }
      setTimeout(() => {
        setVictimFx((prev) => {
          const next = { ...prev }
          for (const id of lastEvent.tokenIds!) delete next[id]
          return next
        })
      }, FX_MS)
    }
    if (lastEvent.type === 'finish' && lastEvent.tokenIds) {
      setBursts((prev) => [...prev, { id: fxId, kind: 'finish', pos: [0, 0] }])
      setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== fxId)), 1600)
      const expiresAt = now + CELEBRATE_MS
      setCelebrating((prev) => {
        const next = { ...prev }
        for (const id of lastEvent.tokenIds!) next[id] = expiresAt
        return next
      })
      setTimeout(() => {
        setCelebrating((prev) => {
          const next = { ...prev }
          for (const id of lastEvent.tokenIds!) delete next[id]
          return next
        })
      }, CELEBRATE_MS)
    }
  }, [lastEvent])

  // a token stepping out of its base onto the start cell gets a burst in its team color
  useEffect(() => {
    const prev = prevDistance.current
    for (const p of players) {
      for (const t of p.tokens) {
        if (prev[t.id] === -1 && t.distance === 0) {
          const id = `enter-${t.id}-${performance.now()}`
          const pos = tokenPos(getBoard(useLudoStore.getState().arms), t.color, 0, t.tokenIndex)
          setBursts((b) => [...b, { id, kind: 'enter', pos, color: COLOR_GLOW[t.color] }])
          setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1300)
        }
        prev[t.id] = t.distance
      }
    }
  }, [players])

  const currentId = players[currentPlayerIndex]?.id
  const canPickHere = !!currentId && (localIds ? localIds.includes(currentId) : !players[currentPlayerIndex]?.isBot)
  const aimIds = new Set(aimMode && canPickHere ? aimTargets : [])
  const selectableIds = new Set(aimMode ? [] : phase === 'selecting' && canPickHere ? legalMoves.map((m) => m.tokenId) : [])
  const activeColor = players[currentPlayerIndex]?.color
  const winnerColor = phase === 'gameOver' ? players.find((p) => p.id === winnerId)?.color : undefined

  // Resolve each token's displayed cell first, so tokens sharing a cell can be fanned out.
  const placed = players.flatMap((player) =>
    player.tokens.map((token) => {
      const victim = victimFx[token.id]
      const isAnimatingMove = pendingMove?.tokenId === token.id && phase === 'moving'
      let distance = token.distance
      if (isAnimatingMove) distance = pendingMove!.path[Math.min(animIndex, pendingMove!.path.length) - 1] ?? token.distance
      const pos: Vec2 = victim ? victim.pos : tokenPos(board, token.color, distance, token.tokenIndex)
      return { token, victim, isAnimatingMove, distance, pos, key: `${pos[0].toFixed(2)},${pos[1].toFixed(2)}` }
    }),
  )
  const groups = new Map<string, string[]>()
  const [mdx, mdz] = lastMoveDir.current
  for (const p of placed) {
    if (p.victim) continue
    if (p.distance >= board.finish || p.distance === -1) continue
    groups.set(p.key, [...(groups.get(p.key) ?? []), p.token.id])
  }

  function targetFor(p: (typeof placed)[number]): { pos: [number, number, number]; scale: number } {
    const token: LudoToken = p.token
    const [x, z] = p.pos
    const k = board.pieceScale
    // finished characters stand small on their team's triangle of the center home
    if (p.distance >= board.finish && !p.victim) return { pos: [x, TILE_TOP + (board.kind === 'classic' ? pyramidLift(x, z) : 0), z], scale: 0.58 * k }
    if (p.distance === -1 && !p.victim) return { pos: [x, YARD_TOP, z], scale: k }
    // a captured character is knocked a step past the attacker before it vanishes home
    if (p.victim) return { pos: [x + mdx * 0.46, TILE_TOP, z + mdz * 0.46], scale: k }
    if (attackerFx[token.id]) return { pos: [x - mdx * 0.12, TILE_TOP, z - mdz * 0.12], scale: k }
    const group = groups.get(p.key) ?? []
    if (group.length > 1) {
      const i = group.indexOf(token.id)
      const a = (i / group.length) * Math.PI * 2 + Math.PI / 4
      return { pos: [x + Math.cos(a) * 0.14, TILE_TOP, z + Math.sin(a) * 0.14], scale: 0.78 * k }
    }
    return { pos: [x, TILE_TOP, z], scale: k }
  }

  return (
    <group>
      {placed.map((p) => {
        const { token } = p
        let pose: CharacterPose = 'idle'
        if (p.victim) pose = 'die'
        else if (attackerFx[token.id]) pose = 'attack'
        else if (celebrating[token.id]) pose = 'celebrate'
        else if (p.isAnimatingMove) pose = 'walk'
        else if (token.color === winnerColor || token.color === cheerColor) pose = 'celebrate'
        const aimed = aimIds.has(token.id)
        const selectable = selectableIds.has(token.id) || aimed
        const { pos, scale } = targetFor(p)
        return (
          <TokenPiece
            key={token.id}
            color={token.color}
            variant={token.tokenIndex}
            target={pos}
            scale={scale}
            pose={pose}
            selectable={selectable}
            active={token.color === activeColor}
            puddle={puddles[token.color]}
            restYaw={-boardYaw(board)}
            faceYaw={pose === 'attack' ? Math.atan2(mdx, mdz) : pose === 'die' ? Math.atan2(-mdx, -mdz) : undefined}
            onSelect={aimed ? () => aimPick?.(token.id) : selectable ? () => onSelectToken(token.id) : undefined}
            shielded={(token.shieldTurns ?? 0) > 0 && token.distance >= 0}
            aimColor={aimed && aimMode ? AIM_COLOR[aimMode] : undefined}
          />
        )
      })}
      {phase === 'selecting' &&
        !aimMode &&
        legalMoves.map((m) => {
          const token = players.flatMap((p) => p.tokens).find((t) => t.id === m.tokenId)
          if (!token) return null
          return (
            <MoveBeam
              key={`${m.tokenId}-${m.to}`}
              from={tokenPos(board, token.color, token.distance, token.tokenIndex)}
              to={tokenPos(board, token.color, m.to, token.tokenIndex)}
              color={COLOR_GLOW[token.color]}
            />
          )
        })}
      {bursts.map((b) => {
        if (b.kind === 'capture') return <CaptureBurst key={b.id} pos={b.pos} />
        if (b.kind === 'enter') return <RingBurst key={b.id} position={[b.pos[0], TILE_TOP + 0.03, b.pos[1]]} color={b.color ?? '#ffffff'} scale={0.7} />
        return <RingBurst key={b.id} position={[0, TILE_TOP + 0.05, 0]} color="#ffd24a" />
      })}
    </group>
  )
}

/* ------------------------------------------------------------------ effects */

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2
  return { dx: Math.cos(a), dz: Math.sin(a), up: 1.4 + ((i * 7) % 5) * 0.25, speed: 1.2 + ((i * 3) % 4) * 0.3 }
})

/** Shockwave ring, flash, flying sparks and a rising skull where a token was captured. */
function CaptureBurst({ pos }: { pos: Vec2 }) {
  const [x, z] = pos
  const skullTex = useMemo(() => makeEmojiTexture('💀', '#e8284f'), [])
  const glowTex = useMemo(() => makeSoftGlowTexture(), [])
  const start = useRef(0)
  useLayoutEffect(() => {
    start.current = performance.now()
  }, [])
  const streakTex = useMemo(() => makeStreakTexture(), [])
  const ringRef = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const flashRef = useRef<THREE.Sprite>(null)
  const skullRef = useRef<THREE.Sprite>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const pillarRef = useRef<THREE.Mesh>(null)
  const burstRef = useRef<THREE.Sprite>(null)
  const slashRefs = useRef<(THREE.Sprite | null)[]>([])
  const sparkRefs = useRef<(THREE.Sprite | null)[]>([])
  useEffect(() => {
    // the sword lands a beat after the attacker starts swinging
    const id = setTimeout(() => {
      cameraShake.until = performance.now() + 420
      cameraShake.strength = 1
    }, 380)
    return () => clearTimeout(id)
  }, [])

  useFrame(() => {
    // effect time runs at ~half speed so the whole slash-and-burst is easy to see
    const t = Math.max(0, (performance.now() - start.current) / 1000 - 0.35) * 0.55
    if (lightRef.current) lightRef.current.intensity = t <= 0 ? 0 : Math.max(0, 22 * (1 - t * 1.6))
    if (burstRef.current) {
      const k = t <= 0 ? 0.01 : 1.2 + t * 7
      burstRef.current.scale.set(k, k, 1)
      burstRef.current.material.opacity = t <= 0 ? 0 : Math.max(0, 1 - t * 1.4)
    }
    slashRefs.current.forEach((sp, i) => {
      if (!sp) return
      const grow = Math.min(1, t * 9)
      sp.scale.set(3.6 * grow, 0.7 * (1 - Math.min(1, t * 1.2)) + 0.04, 1)
      sp.material.opacity = t <= 0 ? 0 : Math.max(0, 1 - t * 1.3)
      sp.material.rotation = (i ? -1 : 1) * 0.7
    })
    if (ring2Ref.current) {
      const k = 0.4 + t * 8
      ring2Ref.current.scale.set(k, k, k)
      ;(ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = t <= 0 ? 0 : Math.max(0, 0.9 - t * 2)
    }
    if (pillarRef.current) {
      pillarRef.current.scale.set(1 - Math.min(1, t * 1.4) * 0.7, 1, 1 - Math.min(1, t * 1.4) * 0.7)
      ;(pillarRef.current.material as THREE.MeshBasicMaterial).opacity = t <= 0 ? 0 : Math.max(0, 0.55 - t * 0.8)
    }
    if (ringRef.current) {
      ringRef.current.visible = t > 0
      const k = 0.5 + t * 5.5
      ringRef.current.scale.set(k, k, k)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.6)
    }
    if (flashRef.current) {
      flashRef.current.visible = t > 0
      const k = 2 + t * 6
      flashRef.current.scale.set(k, k, 1)
      flashRef.current.material.opacity = Math.max(0, 1 - t * 1.8)
    }
    if (skullRef.current) {
      const pop = Math.min(1, t * 5)
      const k = 1.25 * (pop < 1 ? pop * 1.25 : 1)
      skullRef.current.scale.set(k, k, 1)
      skullRef.current.position.y = 2.0 + t * 0.4
      skullRef.current.material.opacity = t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) * 2.5)
    }
    SPARKS.forEach((s, i) => {
      const sp = sparkRefs.current[i]
      if (!sp) return
      sp.position.set(s.dx * t * s.speed * 2.4, 0.5 + s.up * 2 * t - 3.2 * t * t, s.dz * t * s.speed * 2.4)
      sp.material.opacity = t <= 0 ? 0 : Math.max(0, 1 - t * 0.9)
    })
  })

  return (
    <group position={[x, TILE_TOP + 0.02, z]}>
      <pointLight ref={lightRef} position={[0, 0.8, 0]} intensity={0} distance={7} decay={1.4} color="#ff3399" />
      {/* magenta energy explosion behind the victim */}
      <sprite ref={burstRef} position={[0, 0.9, 0]} scale={[0.01, 0.01, 1]}>
        <spriteMaterial map={glowTex} color={hdr('#ff2fb0', 2.4)} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      {[0, 1].map((i) => (
        <sprite key={i} ref={(sp) => { slashRefs.current[i] = sp }} position={[0, 0.8, 0]} scale={[0.01, 0.01, 1]}>
          <spriteMaterial map={streakTex} color={hdr('#ffe1ea', 2.6)} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
        </sprite>
      ))}
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.3, 0.33, 64]} />
        <meshBasicMaterial color={hdr('#ffd166', 3)} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={pillarRef} position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.34, 0.5, 2.6, 32, 1, true]} />
        <meshBasicMaterial color="#ff2d55" transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.36, 48]} />
        <meshBasicMaterial color={hdr('#ff5a7a', 3)} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <sprite ref={flashRef} position={[0, 0.3, 0]}>
        <spriteMaterial map={glowTex} color="#ff6b6b" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      {SPARKS.map((_, i) => (
        <sprite key={i} ref={(s) => { sparkRefs.current[i] = s }} scale={[0.26, 0.26, 1]}>
          <spriteMaterial map={glowTex} color={i % 2 ? '#ffd166' : '#ff4f73'} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      ))}
      <sprite ref={skullRef} position={[0, 1.8, 0]} scale={[0.01, 0.01, 1]}>
        <spriteMaterial map={skullTex} transparent depthWrite={false} depthTest={false} />
      </sprite>
    </group>
  )
}

/** Expanding ring plus a fountain of sparks — gold over the home when a token finishes, team-colored when one enters. */
function RingBurst({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  const glowTex = useMemo(() => makeSoftGlowTexture(), [])
  const start = useRef(0)
  useLayoutEffect(() => {
    start.current = performance.now()
  }, [])
  const ringRef = useRef<THREE.Mesh>(null)
  const sparkRefs = useRef<(THREE.Sprite | null)[]>([])

  useFrame(() => {
    const t = (performance.now() - start.current) / 1000
    if (ringRef.current) {
      const k = 0.4 + t * 2.4
      ringRef.current.scale.set(k, k, k)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.1)
    }
    SPARKS.forEach((s, i) => {
      const sp = sparkRefs.current[i]
      if (!sp) return
      sp.position.set(s.dx * t * 0.7, 0.3 + s.up * 1.3 * t - 2.2 * t * t, s.dz * t * 0.7)
      sp.material.opacity = Math.max(0, 1 - t * 0.8)
    })
  })

  return (
    <group position={position} scale={scale}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.44, 48]} />
        <meshBasicMaterial color={hdr(color, 3)} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {SPARKS.map((_, i) => (
        <sprite key={i} ref={(s) => { sparkRefs.current[i] = s }} scale={[0.14, 0.14, 1]}>
          <spriteMaterial map={glowTex} color={i % 3 ? color : '#fff4e0'} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ 5–8 player star board */

/** Faceted dark-glass polygon body for the star boards, with a glowing edge strip per team and rim LEDs. */
function RadialFrame({ board }: { board: LudoBoard }) {
  const g = useMemo(() => radialGeometry(board.arms), [board.arms])
  const n = board.arms
  const bodyR = g.circumradius + 0.45
  const apothem = bodyR * Math.cos(Math.PI / n)
  const edgeLen = 2 * bodyR * Math.sin(Math.PI / n)
  const activeColor = useLudoStore((s) => s.players[s.currentPlayerIndex]?.color)
  const stripMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const ledRef = useRef<THREE.InstancedMesh>(null)
  const leds = useMemo(() => {
    const out: Vec2[] = []
    const r = bodyR - 0.1
    for (let k = 0; k < n; k++) {
      const a0 = g.armAngle(k) - Math.PI / n
      const a1 = g.armAngle(k) + Math.PI / n
      const p0: Vec2 = [Math.cos(a0) * r, Math.sin(a0) * r]
      const p1: Vec2 = [Math.cos(a1) * r, Math.sin(a1) * r]
      for (let i = 0; i < 9; i++) {
        const t = i / 9
        out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t])
      }
    }
    return out
  }, [g, n, bodyR])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    leds.forEach(([x, z], i) => ledRef.current?.setMatrixAt(i, m.makeTranslation(x, -0.015, z)))
    if (ledRef.current) ledRef.current.instanceMatrix.needsUpdate = true
  }, [leds])

  useFrame((state) => {
    const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4)
    board.armColors.forEach((c, i) => {
      const mat = stripMats.current[i]
      if (!mat) return
      mat.color.set(COLOR_GLOW[c]).multiplyScalar(c === activeColor ? 1 + pulse * 0.45 : 0.6)
    })
  })

  return (
    <group>
      <mesh position={[0, -0.02 - SLAB_THICK / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[bodyR, bodyR, SLAB_THICK, n]} />
        <meshPhysicalMaterial
          color="#2c3a78"
          emissive="#3445a8"
          emissiveIntensity={0.55}
          roughness={0.05}
          metalness={0.25}
          clearcoat={1}
          clearcoatRoughness={0.02}
          envMapIntensity={2.6}
          flatShading
        />
      </mesh>
      <mesh position={[0, SLAB_BOTTOM + 0.04, 0]} castShadow>
        <cylinderGeometry args={[bodyR - 0.15, bodyR - 0.15, 0.12, n]} />
        <meshStandardMaterial color="#05060f" roughness={0.4} metalness={0.6} flatShading />
      </mesh>
      {/* polished gold bezel under the painted surface */}
      <mesh position={[0, TILE_TOP - 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[g.circumradius + 0.1, g.circumradius + 0.1, 0.05, n]} />
        <meshPhysicalMaterial color="#e9b949" roughness={0.18} metalness={1} clearcoat={0.8} clearcoatRoughness={0.1} envMapIntensity={1.8} flatShading />
      </mesh>
      {board.armColors.map((color, k) => {
        const a = g.armAngle(k)
        return (
          <mesh key={color} position={[Math.cos(a) * apothem, -0.02, Math.sin(a) * apothem]} rotation={[0, -a - Math.PI / 2, 0]}>
            <boxGeometry args={[edgeLen * 0.86, 0.03, 0.035]} />
            <meshBasicMaterial
              ref={(m) => {
                stripMats.current[k] = m
              }}
              color={hdr(COLOR_GLOW[color], 1.4)}
              toneMapped={false}
            />
          </mesh>
        )
      })}
      <instancedMesh ref={ledRef} args={[undefined, undefined, leds.length]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshBasicMaterial color={hdr('#ffe0b0', 2.2)} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// Painting a 2048px board is slow; keep each board's canvases for the session (textures re-upload per renderer).
let classicMaps: ReturnType<typeof paintBoard> | null = null
const radialMaps = new Map<number, ReturnType<typeof paintRadialBoard>>()

/** The painted star-board surface; the polygon outline comes from the map's alpha. */
function RadialSurface({ board }: { board: LudoBoard }) {
  const maps = useMemo(() => {
    let hit = radialMaps.get(board.arms)
    if (!hit) {
      hit = paintRadialBoard(board, radialGeometry(board.arms), 2048)
      radialMaps.set(board.arms, hit)
    }
    return hit
  }, [board])
  useEffect(
    () => () => {
      maps.map.dispose()
      maps.bumpMap.dispose()
      maps.emissiveMap.dispose()
    },
    [maps],
  )
  return (
    <mesh position={[0, TILE_TOP, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[maps.half * 2, maps.half * 2]} />
      <meshPhysicalMaterial
        map={maps.map}
        alphaTest={0.5}
        bumpMap={maps.bumpMap}
        bumpScale={2.2}
        emissive="#ffffff"
        emissiveMap={maps.emissiveMap}
        emissiveIntensity={1.15}
        roughness={0.5}
        metalness={0.05}
        clearcoat={0.35}
        clearcoatRoughness={0.3}
        envMapIntensity={0.3}
      />
    </mesh>
  )
}





/**
 * Neon rim around each home base, big lens-flare stars at the board's corners, and each team's color
 * spilling onto the table around its corner — the glow that makes the board read as lit glass.
 */
export function BoardNeon() {
  const board = useBoard()
  const activeColor = useLudoStore((s) => s.players[s.currentPlayerIndex]?.color)
  const rimMaterials = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const zoneGlow = useMemo(() => makeSoftGlowTexture(), [])
  useFrame((state) => {
    const pulse = (Math.sin(state.clock.elapsedTime * 3.2) + 1) * 0.5
    board.armColors.forEach((color, i) => {
      for (let edge = 0; edge < 4; edge++) {
        const material = rimMaterials.current[i * 4 + edge]
        if (!material) continue
        const strength = color === activeColor ? 1.6 + pulse * 0.9 : 0.9 + pulse * 0.28
        material.color.set(COLOR_GLOW[color]).multiplyScalar(strength)
      }
    })
  })
  if (board.kind !== 'classic') return null
  const half = 3 * CELL - 0.07
  return (
    <group>
      {board.armColors.map((color) => {
        const [cx, cz] = board.yardCenter(color)
        const w = 0.055
        return (
          <group key={color} position={[cx, TILE_TOP + 0.012, cz]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
              <planeGeometry args={[2.55, 2.55]} />
              <meshBasicMaterial
                map={zoneGlow}
                color={hdr(COLOR_GLOW[color], color === activeColor ? 1.5 : 1.1)}
                transparent
                opacity={color === activeColor ? 0.48 : 0.3}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {[
              [0, -half, half * 2 + w, w],
              [0, half, half * 2 + w, w],
              [-half, 0, w, half * 2 + w],
              [half, 0, w, half * 2 + w],
            ].map(([x, z, sx, sz], i) => (
              <group key={i} position={[x, 0, z]}>
                <mesh position={[0, -0.008, 0]}>
                  <boxGeometry args={[sx, 0.035, Math.max(sz, 0.14)]} />
                  <meshBasicMaterial color={hdr(COLOR_GLOW[color], 1.35)} transparent opacity={0.2} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
                </mesh>
                <mesh>
                  <boxGeometry args={[sx, 0.02, sz]} />
                  <meshBasicMaterial
                    ref={(material) => { rimMaterials.current[board.armColors.indexOf(color) * 4 + i] = material }}
                    color={COLOR_GLOW[color]}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            ))}
          </group>
        )
      })}
    </group>
  )
}


/** Table, body, painted surface and center emblem for whichever board this game uses. */
function BoardBody() {
  const board = useBoard()
  if (board.kind === 'classic') {
    return (
      <>
        <Table radius={SLAB_HALF} />
        <BoardFrame />
        <BoardSurface />
        <CenterPyramid />
        <CenterEmblem radius={CELL * 0.46} raised={PYRAMID_RISE + 0.045} />
      </>
    )
  }
  const g = radialGeometry(board.arms)
  return (
    <>
      <Table radius={g.circumradius + 0.45} />
      <RadialFrame board={board} />
      <RadialSurface board={board} />
      <CenterEmblem radius={Math.min(g.r0 * 0.42, CELL * 0.85)} />
    </>
  )
}

/* ------------------------------------------------------------------ scene */

/**
 * Mounts inside the pawns' Suspense boundary, so it only runs once every character has loaded; waits for
 * a couple of drawn frames and pre-compiles all shaders so the reveal doesn't hitch.
 */

function ReadySignal({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const frames = useRef(0)
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    frames.current += 1
    if (frames.current === 2) gl.compile(scene, camera)
    if (frames.current >= 4) {
      done.current = true
      onReady()
    }
  })
  return null
}

export default function LudoScene3D({
  className = 'h-full w-full',
  slot,
  authoritative = true,
  localIds = null,
  onSelectToken,
  showLoader = true,
  onReady,
}: {
  className?: string
  slot: BoardSlot | null
  /** False on a guest's device: moves are resolved by the host, not locally. */
  authoritative?: boolean
  /** Player ids whose tokens may be picked on this device (null: any human). */
  localIds?: string[] | null
  onSelectToken?: (tokenId: string) => void
  showLoader?: boolean
  /** Called once the characters are loaded, drawn and their shaders compiled. */
  onReady?: () => void
}) {
  const select = onSelectToken ?? ((id: string) => useLudoStore.getState().selectToken(id))
  return (
    <GameCanvas
      className={className}
      cameraPosition={[0, 13, 9]}
      fov={34}
      transparent
      environment={false}
      environmentIntensity={0}
      keyLightColor="#fff1dc"
      fillLightColor="#8a7dff"
      // Keep bloom selective so the neon rims and token pedestals glow without
      // washing the board cells or player labels out on a phone display.
      bloomIntensity={0.38}
      bloomThreshold={0.94}
      bloomRadius={0.62}
      vignetteDarkness={0}
      showLoader={showLoader}
    >
      <CameraRig slot={slot} />
      <LudoNeonCity />
      <spotLight position={[0, 12, -3]} angle={0.7} penumbra={0.8} intensity={0.42} color="#ffe2b8" />
      {/* a low key light from the front-left so the characters throw visible shadows across the tiles */}
      <directionalLight
        position={[-8, 8, 1.5]}
        intensity={0.62}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />
      <spotLight position={[-8, 6, -4]} angle={0.6} penumbra={1} intensity={0.5} color="#b36bff" />
      <BoardSpin>
        <BoardBody />
        <BoardLights />
        <AmbientDust />
        <BoardNeon />
        <ActiveSpotlight />
        <SceneErrorBoundary label="pawns">
          <Suspense fallback={null}>
            <PawnLayer authoritative={authoritative} localIds={localIds} onSelectToken={select} />
            {onReady && <ReadySignal onReady={onReady} />}
          </Suspense>
        </SceneErrorBoundary>
      </BoardSpin>
      <SceneErrorBoundary label="portraits">
        <Suspense fallback={null}>
          <LudoPortraitStudio />
        </Suspense>
      </SceneErrorBoundary>
    </GameCanvas>
  )
}
