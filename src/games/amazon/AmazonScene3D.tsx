import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import AnimalModel, { type PoseState } from './AnimalMesh'
import { focusRunner, sim, type Runner } from './amazonStore'
import { JUMP_HEIGHT, LANE_X, TRAIL_WIDTH, getAnimal, hash01, isObstacle, jumpMs, slideMs, type ItemKind } from './amazonTrackData'

/*
 * The jungle trail. Everything is placed in "focus space": the followed runner stays at z=0 and the
 * world slides past, so floating-point precision never degrades on long runs. Scenery is instanced and
 * placed deterministically per 5 m segment, so it is identical every time you pass a spot.
 */

const P = '/models/amazon/props'
const T = '/models/amazon/tex'
const SEG = 5
/** Visible window around the followed runner; the menu camera looks back down the trail, so it needs more behind. */
const view = { ahead: 115, behind: 12, menu: false }

type PropId =
  | 'tree1'
  | 'tree2'
  | 'tree3'
  | 'fern'
  | 'shrub2'
  | 'shrub3'
  | 'grass'
  | 'roots'
  | 'stump'
  | 'rock'
  | 'log'

const PROP_URL: Record<PropId, string> = {
  tree1: `${P}/island_tree_01.glb`,
  tree2: `${P}/island_tree_02.glb`,
  tree3: `${P}/island_tree_03.glb`,
  fern: `${P}/fern_02.glb`,
  shrub2: `${P}/shrub_02.glb`,
  shrub3: `${P}/shrub_03.glb`,
  grass: `${P}/grass_medium_02.glb`,
  roots: `${P}/root_cluster_01.glb`,
  stump: `${P}/tree_stump_01.glb`,
  rock: `${P}/boulder_01.glb`,
  log: `${P}/dead_tree_trunk.glb`,
}
for (const url of Object.values(PROP_URL)) useGLTF.preload(url)

interface Placement {
  prop: PropId
  x: number
  z: number
  y?: number
  rotY: number
  scale: number | [number, number, number]
  rotZ?: number
  /** far scenery: drawn without shadows */
  far?: boolean
}

/** Scenery for one 5 m segment of trail (absolute z), deterministic from the segment index. */
function segmentScenery(k: number): Placement[] {
  const out: Placement[] = []
  const z0 = k * SEG
  for (const side of [-1, 1]) {
    const s = side === 1 ? 1 : 2
    const h = (n: number) => hash01(k, s * 31 + n)
    // trail edge: low plants and grass so the path edge is soft
    for (let n = 0; n < 2; n++) {
      const pick = h(n)
      const prop: PropId = pick < 0.45 ? 'grass' : pick < 0.8 ? 'fern' : 'shrub3'
      const sc = prop === 'grass' ? 1.4 + h(n + 10) : prop === 'shrub3' ? 2 + h(n + 10) : 1.6 + h(n + 10) * 0.9
      out.push({ prop, x: side * (TRAIL_WIDTH / 2 + 0.2 + h(n + 20) * 1.4), z: z0 + h(n + 30) * SEG, rotY: h(n + 40) * 6.28, scale: sc })
    }
    // undergrowth band
    for (let n = 0; n < 2; n++) {
      const pick = h(n + 50)
      const prop: PropId = pick < 0.4 ? 'shrub2' : pick < 0.8 ? 'fern' : pick < 0.9 ? 'roots' : 'stump'
      const sc = prop === 'fern' ? 2.8 + h(n + 60) * 1.6 : prop === 'shrub2' ? 1.1 + h(n + 60) * 0.7 : 1.2 + h(n + 60) * 0.8
      out.push({ prop, x: side * (5.2 + h(n + 70) * 4.5), z: z0 + h(n + 80) * SEG, rotY: h(n + 90) * 6.28, scale: sc })
    }
    // trees: a near row and a far row
    if (h(100) < 0.34) {
      const t = h(101)
      const prop: PropId = t < 0.4 ? 'tree1' : t < 0.75 ? 'tree2' : 'tree3'
      out.push({ prop, x: side * (6.2 + h(102) * 3.5), z: z0 + h(103) * SEG, rotY: h(104) * 6.28, scale: (prop === 'tree3' ? 3.2 : 2.3) + h(105) * 0.9 })
    }
    if (h(110) < 0.2) {
      const t = h(111)
      const prop: PropId = t < 0.5 ? 'tree1' : t < 0.8 ? 'tree2' : 'tree3'
      out.push({ prop, x: side * (11 + h(112) * 9), z: z0 + h(113) * SEG, rotY: h(114) * 6.28, scale: (prop === 'tree3' ? 3.8 : 2.8) + h(115) * 1.2, far: true })
    }
  }
  return out
}

const sceneryCache = new Map<number, Placement[]>()
function scenery(k: number): Placement[] {
  let v = sceneryCache.get(k)
  if (!v) {
    v = segmentScenery(k)
    sceneryCache.set(k, v)
    if (sceneryCache.size > 400) sceneryCache.delete(sceneryCache.keys().next().value!)
  }
  return v
}

/** Track items drawn with props (offset by lane). */
function itemPlacements(kind: ItemKind, x: number, z: number, id: number): Placement[] {
  const r = hash01(id, 7)
  if (kind === 'rock') return [{ prop: 'rock', x, z, y: -0.08, rotY: r * 6.28, scale: 1.05 + r * 0.25 }]
  if (kind === 'log') return [{ prop: 'log', x, z, y: 0.16, rotY: (r - 0.5) * 0.25, scale: [0.62, 1.5, 1.5] }]
  if (kind === 'branch') return [{ prop: 'log', x, z, y: 1.05, rotY: (r - 0.5) * 0.2, rotZ: (r - 0.5) * 0.12, scale: [0.66, 1.25, 1.25] }]
  return []
}

// ---------------------------------------------------------------- instanced props

interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

function useParts(url: string): Part[] {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const parts: Part[] = []
    scene.updateMatrixWorld(true)
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const src of mats) {
        const mat = (src as THREE.MeshStandardMaterial).clone()
        // leaves: alpha-tested cutouts instead of sorted blending (cheaper, and they cast leafy shadows)
        if (mat.transparent || mat.alphaTest > 0) {
          mat.transparent = false
          mat.alphaTest = 0.45
          mat.depthWrite = true
          mat.side = THREE.DoubleSide
          // foliage is mostly seen against the light: let it glow a little so canopies read green, not black
          mat.color.multiplyScalar(1.35)
          mat.emissive = new THREE.Color('#7fa860')
          mat.emissiveMap = mat.map
          mat.emissiveIntensity = 0.32
        }
        mat.envMapIntensity = 0.5
        parts.push({ geometry, material: mat })
      }
    })
    return parts
  }, [scene])
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()

function PropSet({ id, capacity, source, shadows = true, far }: { id: PropId; capacity: number; source: () => Placement[]; shadows?: boolean; far?: boolean }) {
  const parts = useParts(PROP_URL[id])
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  useFrame(() => {
    const list = source().filter((p) => p.prop === id && (far === undefined || !!p.far === far))
    const n = Math.min(capacity, list.length)
    for (let i = 0; i < n; i++) {
      const p = list[i]
      tmpE.set(0, p.rotY, p.rotZ ?? 0)
      tmpQ.setFromEuler(tmpE)
      tmpP.set(p.x, p.y ?? 0, p.z)
      if (typeof p.scale === 'number') tmpS.setScalar(p.scale)
      else tmpS.set(...p.scale)
      tmpM.compose(tmpP, tmpQ, tmpS)
      for (const im of refs.current) im?.setMatrixAt(i, tmpM)
    }
    for (const im of refs.current) {
      if (!im) continue
      im.count = n
      im.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          args={[part.geometry, part.material, capacity]}
          castShadow={shadows}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------- ground

function useTiled(url: string, repeat: [number, number]) {
  const tex = useTexture(url)
  return useMemo(() => {
    const t = tex.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(...repeat)
    t.anisotropy = 4
    t.needsUpdate = true
    return t
  }, [tex, repeat])
}

const GROUND_LEN = 220
const GROUND_W = 70
const TRAIL_TILE = 6
const GROUND_TILE = 8

function makeEdgeMask() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 4
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 128, 0)
  grad.addColorStop(0, '#000')
  grad.addColorStop(0.16, '#fff')
  grad.addColorStop(0.84, '#fff')
  grad.addColorStop(1, '#000')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 4)
  const t = new THREE.CanvasTexture(c)
  return t
}

function Ground() {
  const groundRepeat = useMemo<[number, number]>(() => [GROUND_W / GROUND_TILE, GROUND_LEN / GROUND_TILE], [])
  const trailRepeat = useMemo<[number, number]>(() => [1, GROUND_LEN / TRAIL_TILE], [])
  const gMap = useTiled(`${T}/leaves_diff.jpg`, groundRepeat)
  const gNor = useTiled(`${T}/leaves_nor.jpg`, groundRepeat)
  const tMap = useTiled(`${T}/ground_diff.jpg`, trailRepeat)
  const tNor = useTiled(`${T}/ground_nor.jpg`, trailRepeat)
  const mask = useMemo(makeEdgeMask, [])
  useFrame(() => {
    const d = focusRunner()?.distance ?? 0
    gMap.offset.y = gNor.offset.y = -d / GROUND_TILE
    tMap.offset.y = tNor.offset.y = -d / TRAIL_TILE
  })
  const zMid = GROUND_LEN / 2 - 85
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, zMid]} receiveShadow>
        <planeGeometry args={[GROUND_W, GROUND_LEN]} />
        <meshStandardMaterial map={gMap} normalMap={gNor} color="#8fb45e" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, zMid]} receiveShadow>
        <planeGeometry args={[TRAIL_WIDTH + 1.4, GROUND_LEN]} />
        <meshStandardMaterial map={tMap} normalMap={tNor} alphaMap={mask} transparent depthWrite={false} color="#e2c49c" roughness={0.9} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------- jungle walls + canopy

const WALL_TILE = 20 // metres of jungle per texture repeat

/** Layered painted-jungle walls on both sides of the trail, scrolling with the run. */
function JungleWalls() {
  const base = useTexture(`${T}/jungle_wall.webp`)
  const layers = useMemo(
    () =>
      [
        { x: 10.5, h: 9, shift: 0, tint: '#b9d49c' },
        { x: 15, h: 12, shift: 0.37, tint: '#a7c690' },
        { x: 21, h: 16, shift: 0.71, tint: '#98b886' },
      ].flatMap((l) =>
        [1, -1].map((side) => {
          const t = base.clone()
          t.wrapS = THREE.RepeatWrapping
          t.wrapT = THREE.ClampToEdgeWrapping
          t.repeat.set(GROUND_LEN / WALL_TILE / (l.h / 10), 1)
          t.colorSpace = THREE.SRGBColorSpace
          t.needsUpdate = true
          return { ...l, side, tex: t, mat: new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, color: l.tint, roughness: 1, side: THREE.DoubleSide }) }
        }),
      ),
    [base],
  )
  useFrame(() => {
    const d = focusRunner()?.distance ?? 0
    for (const l of layers) l.tex.offset.x = l.shift + (l.side * d) / (WALL_TILE * (l.h / 10))
  })
  const zMid = GROUND_LEN / 2 - 85
  return (
    <group>
      {layers.map((l, i) => (
        <mesh key={i} material={l.mat} position={[l.side * l.x, l.h / 2 - 0.2, zMid]} rotation={[0, -l.side * (Math.PI / 2), 0]}>
          <planeGeometry args={[GROUND_LEN, l.h]} />
        </mesh>
      ))}
    </group>
  )
}

/** Leafy ceiling over both sides, open above the trail so the sky and light shafts come through. */
function makeClumpMask() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  // a lumpy blob: several overlapping soft discs, so each clump has an irregular leafy outline
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const r = i === 0 ? 0 : 26 + hash01(i, 9) * 14
    const cx = 64 + Math.cos(a) * r
    const cy = 64 + Math.sin(a) * r
    const rad = i === 0 ? 46 : 22 + hash01(i, 10) * 14
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.6, 'rgba(255,255,255,0.9)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(cx, cy, rad, 0, Math.PI * 2)
    g.fill()
  }
  return new THREE.CanvasTexture(c)
}

const CLUMP_CAP = 140

/** Overhead leaf clumps on both sides, leaving a ragged opening above the trail for sky and light shafts. */
function Canopy() {
  const base = useTexture(`${T}/jungle_canopy.webp`)
  const ref = useRef<THREE.InstancedMesh>(null)
  const { geo, mat } = useMemo(() => {
    const t = base.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(0.55, 0.55)
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(Math.PI / 2)
    const mat = new THREE.MeshStandardMaterial({ map: t, alphaMap: makeClumpMask(), alphaTest: 0.42, color: '#86a36a', emissive: '#344f20', emissiveMap: t, emissiveIntensity: 0.85, roughness: 1, side: THREE.DoubleSide })
    return { geo, mat }
  }, [base])
  useFrame(() => {
    const im = ref.current
    if (!im) return
    const d = focusRunner()?.distance ?? 0
    const k0 = Math.floor((d - view.behind) / SEG)
    const k1 = Math.floor((d + view.ahead) / SEG)
    let n = 0
    for (let k = k0; k <= k1 && n < CLUMP_CAP; k++) {
      for (const side of [1, -1]) {
        for (let j = 0; j < 2 && n < CLUMP_CAP; j++) {
          const h = (q: number) => hash01(k, side * 101 + j * 7 + q)
          const size = 7 + h(1) * 7
          // tilted clumps droop toward the trail, so they never read as flat plates edge-on
          tmpQ.setFromEuler(tmpE.set((h(6) - 0.5) * 1.1, h(2) * 6.28, side * (0.35 + h(7) * 0.5)))
          tmpP.set(side * (3 + size * 0.35 + h(3) * 12), 8.6 + h(4) * 3.5, k * SEG + h(5) * SEG - d)
          tmpM.compose(tmpP, tmpQ, tmpS.set(size, 1, size))
          im.setMatrixAt(n++, tmpM)
        }
      }
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, CLUMP_CAP]} frustumCulled={false} />
}

// ---------------------------------------------------------------- sky, light shafts

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color('#6ea6c4') }, mid: { value: new THREE.Color('#cfe2c2') }, bottom: { value: new THREE.Color('#6d8a5c') } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bottom, smoothstep(0.0, 0.2, -h)); gl_FragColor = vec4(c, 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[130, 24, 12]} />
    </mesh>
  )
}

function makeShaftTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const g = c.getContext('2d')!
  const v = g.createLinearGradient(0, 0, 0, 256)
  v.addColorStop(0, 'rgba(255,244,214,0.9)')
  v.addColorStop(0.7, 'rgba(255,244,214,0.25)')
  v.addColorStop(1, 'rgba(255,244,214,0)')
  g.fillStyle = v
  g.fillRect(0, 0, 64, 256)
  const h = g.createLinearGradient(0, 0, 64, 0)
  h.addColorStop(0, 'rgba(0,0,0,1)')
  h.addColorStop(0.5, 'rgba(0,0,0,0)')
  h.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = h
  g.fillRect(0, 0, 64, 256)
  return new THREE.CanvasTexture(c)
}

/** Soft god-rays slanting down through the canopy; they drift past with the trail. */
function LightShafts() {
  const tex = useMemo(makeShaftTexture, [])
  const group = useRef<THREE.Group>(null)
  const shafts = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ k: i, x: (hash01(i, 3) - 0.5) * 16, w: 1.5 + hash01(i, 4) * 2.5, o: 0.1 + hash01(i, 5) * 0.12 })), [])
  useFrame(() => {
    const d = focusRunner()?.distance ?? 0
    const g = group.current
    if (!g) return
    const span = 120
    g.children.forEach((c, i) => {
      const base = i * (span / shafts.length)
      c.position.z = ((((base - d * 0.9) % span) + span) % span) - 10
    })
  })
  return (
    <group ref={group}>
      {shafts.map((s) => (
        <mesh key={s.k} position={[s.x, 6, 0]} rotation={[0, 0, 0.42]}>
          <planeGeometry args={[s.w, 16]} />
          <meshBasicMaterial map={tex} transparent opacity={s.o} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------- track items

const COIN_CAP = 80

function Coins() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 24)
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffcf3a', emissive: '#a86b00', emissiveIntensity: 0.55, metalness: 0.9, roughness: 0.25 }), [])
  useFrame(() => {
    const im = ref.current
    const f = focusRunner()
    if (!im || !f) return
    const spin = performance.now() / 260
    let n = 0
    for (const it of sim.track.items) {
      if (it.kind !== 'coin' || f.got.has(it.id)) continue
      const z = it.d - f.distance
      if (z < -view.behind || z > view.ahead || (view.menu && z > -1)) continue
      tmpQ.setFromEuler(tmpE.set(0, spin + it.id, 0))
      tmpP.set(LANE_X[it.lane], 0.75 + Math.sin(spin * 1.3 + it.id) * 0.08, z)
      tmpM.compose(tmpP, tmpQ, tmpS.setScalar(1))
      im.setMatrixAt(n++, tmpM)
      if (n >= COIN_CAP) break
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, COIN_CAP]} castShadow frustumCulled={false} />
}

function PowerUps() {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((v) => v + 1), 400)
    return () => clearInterval(t)
  }, [])
  const f = focusRunner()
  const items = f && !view.menu ? sim.track.items.filter((i) => (i.kind === 'magnet' || i.kind === 'shield') && !f.got.has(i.id) && i.d - f.distance > -view.behind && i.d - f.distance < view.ahead) : []
  return (
    <group>
      {items.map((it) => (
        <PowerUp key={it.id} id={it.id} kind={it.kind as 'magnet' | 'shield'} d={it.d} lane={it.lane} />
      ))}
    </group>
  )
}

function PowerUp({ id, kind, d, lane }: { id: number; kind: 'magnet' | 'shield'; d: number; lane: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const f = focusRunner()
    if (!g.current || !f) return
    g.current.position.set(LANE_X[lane], 1 + Math.sin(performance.now() / 300) * 0.12, d - f.distance)
    g.current.rotation.y = performance.now() / 500
    g.current.visible = !f.got.has(id)
  })
  const color = kind === 'magnet' ? '#ff4d6d' : '#38bdf8'
  return (
    <group ref={g}>
      <pointLight color={color} intensity={6} distance={4} />
      {kind === 'magnet' ? (
        <group rotation={[0, 0, Math.PI]}>
          <mesh>
            <torusGeometry args={[0.28, 0.09, 12, 24, Math.PI]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} metalness={0.4} roughness={0.3} />
          </mesh>
          {[-0.28, 0.28].map((x) => (
            <mesh key={x} position={[x, -0.12, 0]}>
              <cylinderGeometry args={[0.09, 0.09, 0.24, 12]} />
              <meshStandardMaterial color="#e5e7eb" metalness={0.8} roughness={0.25} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh>
          <icosahedronGeometry args={[0.36, 2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.75} roughness={0.1} />
        </mesh>
      )}
    </group>
  )
}

/** Hanging lianas that hold up each slide-under branch. */
function Lianas() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.CylinderGeometry(0.022, 0.03, 1, 5), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4026', roughness: 0.95 }), [])
  useFrame(() => {
    const im = ref.current
    const f = focusRunner()
    if (!im || !f) return
    let n = 0
    for (const it of sim.track.items) {
      if (it.kind !== 'branch') continue
      const z = it.d - f.distance
      if (z < -view.behind || z > view.ahead || (view.menu && z > -1)) continue
      const x = LANE_X[it.lane]
      // two ropes up into the canopy plus short dangling strands
      const ropes: [number, number, number][] = [
        [x - 0.75, 1.05 + 4.7, 9.4],
        [x + 0.75, 1.05 + 4.7, 9.4],
        [x - 0.3, 0.9, 0.35],
        [x + 0.15, 0.86, 0.45],
        [x + 0.5, 0.92, 0.3],
      ]
      for (const [rx, cy, len] of ropes) {
        if (n >= 200) break
        tmpM.compose(tmpP.set(rx, cy, z), tmpQ.identity(), tmpS.set(1, len, 1))
        im.setMatrixAt(n++, tmpM)
      }
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, 200]} castShadow frustumCulled={false} />
}

// ---------------------------------------------------------------- runners

function runnerPose(r: Runner): PoseState {
  const a = getAnimal(r.animalId)
  if (!r.alive) return { pose: 'dead', speed: 0, progress: 1 }
  if (sim.phase === 'countdown' || sim.phase === 'idle') return { pose: 'idle', speed: 0, progress: 0 }
  const ghost = sim.t < r.invulnUntil
  if (r.action === 'jump') {
    const p = (sim.t - r.actionAt) / jumpMs(a)
    if (p < 1) return { pose: 'jump', speed: r.speed, progress: p, ghost }
  }
  if (r.action === 'slide') {
    const p = (sim.t - r.actionAt) / slideMs(a)
    if (p < 1) return { pose: 'slide', speed: r.speed, progress: p, ghost }
  }
  return { pose: 'run', speed: r.speed, progress: 0, ghost }
}

function RunnerView({ id, showTag }: { id: string; showTag: boolean }) {
  const g = useRef<THREE.Group>(null)
  const x = useRef<number | null>(null)
  const runner = sim.runners.find((r) => r.id === id)
  const poseOf = useMemo(() => () => {
    const r = sim.runners.find((q) => q.id === id)
    return r ? runnerPose(r) : { pose: 'idle' as const, speed: 0, progress: 0 }
  }, [id])
  useFrame((_, dt) => {
    const r = sim.runners.find((q) => q.id === id)
    const f = focusRunner()
    if (!g.current || !r || !f) return
    // rivals sharing a lane with someone just ahead/behind step aside a little so nobody hides inside another
    const crowd = r.id !== f.id && sim.runners.some((o) => o !== r && o.lane === r.lane && Math.abs(o.distance - r.distance) < 2.2 && (o.id === f.id || o.id < r.id))
    const tx = LANE_X[r.lane] + (crowd ? (r.lane === 2 ? 0.55 : -0.55) : 0)
    x.current = x.current === null ? tx : x.current + (tx - x.current) * Math.min(1, dt * 14)
    const pose = runnerPose(r)
    const y = pose.pose === 'jump' ? Math.sin(Math.PI * pose.progress) * JUMP_HEIGHT * (0.85 + getAnimal(r.animalId).jump * 0.03) : 0
    const z = r.distance - f.distance
    g.current.position.set(x.current, y, z)
    // lean into lane changes
    g.current.rotation.y = (tx - x.current) * -0.12
    g.current.visible = z > -view.behind && z < view.ahead
  })
  if (!runner) return null
  return (
    <group ref={g}>
      <AnimalModel animalId={runner.animalId} poseOf={poseOf} />
      <BlobShadow />
      {showTag && (
        <Html position={[0, 1.75, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-black text-white ring-1 ring-white/20 backdrop-blur-sm">
            {runner.avatarEmoji} {runner.name}
          </div>
        </Html>
      )}
    </group>
  )
}

let blobTex: THREE.Texture | null = null
function BlobShadow() {
  if (!blobTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(0,0,0,0.55)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
    blobTex = new THREE.CanvasTexture(c)
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0.1]} scale={[1.1, 2.2, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={blobTex} transparent depthWrite={false} />
    </mesh>
  )
}

function Runners() {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    const sync = () => {
      const next = sim.runners.map((r) => `${r.id}|${r.animalId}`)
      setIds((prev) => (prev.join() === next.join() ? prev : next))
    }
    sync()
    const t = setInterval(sync, 200)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      {ids.map((key) => {
        const id = key.split('|')[0]
        return (
          <Suspense key={key} fallback={null}>
            <RunnerView id={id} showTag={id !== sim.localId && sim.runners.length > 1} />
          </Suspense>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------- camera + sun

function CameraRig({ menu }: { menu: boolean }) {
  const { camera, size } = useThree()
  const look = useRef(new THREE.Vector3(0, 1, 8))
  const portrait = size.width / size.height < 0.9
  useLayoutEffect(() => {
    view.behind = menu ? 75 : 12
    view.ahead = menu ? 30 : 115
    view.menu = menu
  }, [menu])
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = portrait ? 66 : 54
    cam.near = 0.1
    cam.far = 140
    cam.updateProjectionMatrix()
  }, [camera, portrait])
  useFrame((_, dt) => {
    const f = focusRunner()
    const k = Math.min(1, dt * (menu ? 2.5 : 5))
    if (menu) {
      // three-quarter front view: the animal gallops toward you, framed above the menu panel
      const sway = Math.sin(performance.now() / 4000) * 0.5
      const fx = f ? LANE_X[f.lane] : 0
      camera.position.lerp(tmpP.set(fx + 2.3 + sway, portrait ? 1.5 : 1.3, portrait ? 5.6 : 4.4), k)
      look.current.lerp(tmpS.set(fx + (portrait ? 0.15 : -0.2), portrait ? -0.35 : 0.45, 0), k)
      camera.lookAt(look.current)
      return
    }
    const tx = f ? LANE_X[f.lane] * 0.55 : 0
    const back = portrait ? -5.6 : -4.8
    const up = portrait ? 3.1 : 2.6
    camera.position.x += (tx - camera.position.x) * k
    camera.position.y += (up - camera.position.y) * k
    camera.position.z += (back - camera.position.z) * k
    look.current.lerp(tmpS.set(tx * 0.9, 1.1, 9), k)
    camera.lookAt(look.current)
  })
  return null
}

function Sun() {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    if (!light.current) return
    target.position.set(0, 0, 9)
    light.current.position.set(-9, 18, 16)
    target.updateMatrixWorld()
  })
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color="#ffe6b8"
        intensity={2.9}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={22}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
    </>
  )
}

// ---------------------------------------------------------------- world

function World() {
  const scenerySource = useMemo(() => {
    let cachedAt = -1
    let cached: Placement[] = []
    return () => {
      const f = focusRunner()
      const d = f?.distance ?? 0
      const frame = Math.round(d * 1000)
      if (frame === cachedAt) return cached
      cachedAt = frame
      const out: Placement[] = []
      const k0 = Math.floor((d - view.behind) / SEG)
      const k1 = Math.floor((d + view.ahead) / SEG)
      for (let k = k0; k <= k1; k++)
        for (const p of scenery(k)) {
          const z = p.z - d
          // small plants vanish into the fog early; only trees are worth drawing far out
          if (z > (p.prop.startsWith('tree') ? 88 : 62) && !view.menu) continue
          out.push({ ...p, z })
        }
      for (const it of sim.track.items) {
        if (!isObstacle(it.kind)) continue
        const z = it.d - d
        if (z < -view.behind || z > view.ahead || (view.menu && z > -1)) continue
        out.push(...itemPlacements(it.kind, LANE_X[it.lane], z, it.id))
      }
      cached = out
      return out
    }
  }, [])
  return (
    <>
      <Ground />
      <JungleWalls />
      <Canopy />
      <PropSet id="tree1" capacity={24} source={scenerySource} far={false} />
      <PropSet id="tree2" capacity={24} source={scenerySource} far={false} />
      <PropSet id="tree3" capacity={20} source={scenerySource} far={false} />
      <PropSet id="tree1" capacity={24} source={scenerySource} far shadows={false} />
      <PropSet id="tree2" capacity={20} source={scenerySource} far shadows={false} />
      <PropSet id="tree3" capacity={16} source={scenerySource} far shadows={false} />
      <PropSet id="fern" capacity={140} source={scenerySource} shadows={false} />
      <PropSet id="grass" capacity={90} source={scenerySource} shadows={false} />
      <PropSet id="shrub2" capacity={70} source={scenerySource} shadows={false} />
      <PropSet id="shrub3" capacity={60} source={scenerySource} shadows={false} />
      <PropSet id="roots" capacity={20} source={scenerySource} />
      <PropSet id="stump" capacity={20} source={scenerySource} />
      <PropSet id="rock" capacity={30} source={scenerySource} />
      <PropSet id="log" capacity={40} source={scenerySource} />
      <Lianas />
      <Coins />
      <PowerUps />
    </>
  )
}

export default function AmazonScene3D({ className = 'h-full w-full', menu = false }: { className?: string; menu?: boolean }) {
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 3, -5.5], fov: 60 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.25
        }}
      >
        <color attach="background" args={['#a9c4a0']} />
        <fog attach="fog" args={['#97b78f', 24, 105]} />
        <hemisphereLight args={['#e4f2dc', '#4a5a34', 1.45]} />
        <ambientLight intensity={0.35} />
        <Sun />
        <CameraRig menu={menu} />
        <Suspense fallback={null}>
          <SkyDome />
          <World />
          <LightShafts />
          <Runners />
        </Suspense>
      </Canvas>
    </div>
  )
}
