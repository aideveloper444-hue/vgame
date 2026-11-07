import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three-stdlib'
import { MeshReflectorMaterial, RoundedBox } from '@react-three/drei'

/*
 * The reference's night-city arena, rendered live: a violet-to-magenta sky, a glossy plaza floor with a
 * neon grid, a lit platform the board stands on, a ring of skyscrapers with window lights and neon trim,
 * hologram billboards and hover-cars gliding between the towers. Everything is procedural (no textures
 * to download) and the towers are merged into a handful of draw calls so phones keep their frame rate.
 */

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const FLOOR_Y = -0.75

/* ------------------------------------------------------------------ textures */

function windowTexture(seed: number) {
  const r = rng(seed)
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')!
  // faintly self-lit glass facade with darker mullions, so each tower reads as a solid silhouette
  const face = g.createLinearGradient(0, 0, c.width, 0)
  face.addColorStop(0, '#0a1238')
  face.addColorStop(0.5, '#101c4a')
  face.addColorStop(1, '#0a1238')
  g.fillStyle = face
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#050818'
  for (let x = 0; x < c.width; x += 8) g.fillRect(x, 0, 2, c.height)
  for (let y = 0; y < c.height; y += 8) g.fillRect(0, y, c.width, 2)
  const tints = ['#7fe9ff', '#ffd59a', '#b48cff', '#ff7ad9', '#9fc4ff']
  for (let y = 4; y < c.height - 4; y += 8) {
    const rowLit = r() < 0.5
    for (let x = 4; x < c.width - 4; x += 8) {
      if (!rowLit || r() > 0.42) continue
      g.globalAlpha = 0.35 + r() * 0.65
      g.fillStyle = tints[Math.floor(r() * (r() < 0.6 ? 2 : tints.length))]
      g.fillRect(x + 1, y + 1, 4, 3)
    }
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function gridTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = '#2f7dff'
  g.lineWidth = 3
  g.strokeRect(0, 0, 256, 256)
  g.strokeStyle = '#1a3d8f'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(128, 0)
  g.lineTo(128, 256)
  g.moveTo(0, 128)
  g.lineTo(256, 128)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(60, 60)
  t.anisotropy = 8
  return t
}

function billboardTexture(lines: string[], from: string, to: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 512, 256)
  grad.addColorStop(0, from)
  grad.addColorStop(1, to)
  g.fillStyle = 'rgba(10,6,30,0.55)'
  g.fillRect(0, 0, 512, 256)
  g.strokeStyle = grad
  g.lineWidth = 10
  g.strokeRect(8, 8, 496, 240)
  g.fillStyle = grad
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = 'italic 900 112px system-ui, sans-serif'
  g.fillText(lines[0], 256, lines[1] ? 108 : 128)
  if (lines[1]) {
    g.font = '800 40px system-ui, sans-serif'
    g.fillText(lines[1], 256, 200)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ------------------------------------------------------------------ sky */

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const skyFrag = /* glsl */ `
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 top = vec3(0.012, 0.016, 0.07);
  vec3 mid = vec3(0.09, 0.04, 0.26);
  vec3 glow = vec3(0.62, 0.14, 0.62);
  vec3 low = vec3(0.03, 0.05, 0.16);
  vec3 c = mix(mid, top, smoothstep(0.08, 0.55, h));
  c = mix(c, glow, exp(-pow((h - 0.02) * 9.0, 2.0)) * 0.85);
  c = mix(low, c, smoothstep(-0.12, 0.0, h));
  gl_FragColor = vec4(c, 1.0);
}`

function Sky() {
  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[260, 32, 16]} />
      <shaderMaterial vertexShader={skyVert} fragmentShader={skyFrag} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ towers */

interface TowerSpec {
  x: number
  z: number
  w: number
  d: number
  h: number
  neon: string | null
  tex: number
  round: boolean
  spire: boolean
}

function towerSpecs(closeRow: boolean): TowerSpec[] {
  const r = rng(7)
  const out: TowerSpec[] = []
  const neon = ['#22d3ff', '#ff3fd2', '#7c5cff', '#22d3ff', '#ffb02e']
  const rings = [
    // a close row right behind the deck: with the board filling the screen, only these reach into view
    ...(closeRow ? [{ radius: 16, count: 26, hMin: 16, hMax: 34 }] : []),
    { radius: 28, count: 30, hMin: 14, hMax: 36 },
    { radius: 44, count: 40, hMin: 24, hMax: 60 },
    { radius: 70, count: 52, hMin: 30, hMax: 85 },
  ]
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + r() * 0.12
      const radius = ring.radius + (r() - 0.5) * 6
      const x = Math.sin(a) * radius
      const z = -Math.cos(a) * radius
      // keep the camera's side of the plaza open so nothing stands between the viewer and the board
      if (z > -4 && Math.abs(x) < radius * 0.8) continue
      // the close row stands only behind the deck, never beside the board where it would crowd the cards
      if (ring.radius < 20 && z > -11) continue
      const w = 4 + r() * 6
      out.push({
        x,
        z,
        w,
        d: 4 + r() * 6,
        h: ring.hMin + Math.pow(r(), 0.7) * (ring.hMax - ring.hMin),
        neon: r() < 0.55 ? neon[Math.floor(r() * neon.length)] : null,
        tex: Math.floor(r() * 3),
        round: r() < 0.28,
        spire: r() < 0.35,
      })
    }
  }
  return out
}

function scaleUv(geo: THREE.BufferGeometry, su: number, sv: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
}

function Towers({ closeRow }: { closeRow: boolean }) {
  const { bodies, neon, textures } = useMemo(() => {
    const specs = towerSpecs(closeRow)
    const groups: THREE.BufferGeometry[][] = [[], [], []]
    const neonParts: THREE.BufferGeometry[] = []
    const col = new THREE.Color()
    const strip = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, k = 1) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.translate(x, y, z)
      g.deleteAttribute('uv')
      col.set(color).multiplyScalar(k)
      const c = new Float32Array(g.attributes.position.count * 3)
      for (let i = 0; i < c.length; i += 3) col.toArray(c, i)
      g.setAttribute('color', new THREE.BufferAttribute(c, 3))
      neonParts.push(g)
    }
    for (const t of specs) {
      const yaw = Math.atan2(t.x, -t.z)
      const body = t.round ? new THREE.CylinderGeometry(t.w / 2, t.w / 2, t.h, 20, 1) : new THREE.BoxGeometry(t.w, t.h, t.d)
      scaleUv(body, t.round ? (t.w * Math.PI) / 3 : t.w / 3, t.h / 5)
      body.rotateY(-yaw)
      body.translate(t.x, FLOOR_Y + t.h / 2, t.z)
      groups[t.tex].push(body)
      // a stepped crown on some towers breaks up the flat roofline
      if (t.h > 35 && !t.round) {
        const crown = new THREE.BoxGeometry(t.w * 0.6, t.h * 0.12, t.d * 0.6)
        scaleUv(crown, t.w / 5, t.h / 40)
        crown.rotateY(-yaw)
        crown.translate(t.x, FLOOR_Y + t.h + t.h * 0.06, t.z)
        groups[t.tex].push(crown)
      }
      // antenna spire with a red aircraft beacon on the tallest towers
      if (t.spire && t.h > 30) {
        const top = FLOOR_Y + t.h + (t.h > 35 && !t.round ? t.h * 0.12 : 0)
        const mast = new THREE.CylinderGeometry(0.12, 0.35, t.h * 0.22, 6)
        scaleUv(mast, 0.01, 0.01)
        mast.translate(t.x, top + t.h * 0.11, t.z)
        groups[t.tex].push(mast)
        strip(0.6, 0.6, 0.6, t.x, top + t.h * 0.22 + 0.2, t.z, '#ff3b3b', 3)
      }
      if (t.round && t.neon) {
        // round towers get glowing rings instead of corner bars
        for (const fy of [0.35, 0.7, 1]) {
          const ring = new THREE.TorusGeometry(t.w / 2 + 0.12, 0.13, 6, 28)
          ring.rotateX(Math.PI / 2)
          ring.translate(t.x, FLOOR_Y + t.h * fy, t.z)
          ring.deleteAttribute('uv')
          col.set(t.neon).multiplyScalar(2.2)
          const cc = new Float32Array(ring.attributes.position.count * 3)
          for (let i = 0; i < cc.length; i += 3) col.toArray(cc, i)
          ring.setAttribute('color', new THREE.BufferAttribute(cc, 3))
          neonParts.push(ring)
        }
      } else if (t.neon) {
        const c = Math.cos(-yaw)
        const s = Math.sin(-yaw)
        const at = (lx: number, lz: number): [number, number] => [t.x + lx * c + lz * s, t.z - lx * s + lz * c]
        // vertical light bars on the front corners, plus rings at the roof and partway up
        for (const sx of [-1, 1]) {
          const [x, z] = at((sx * t.w) / 2, t.d / 2)
          strip(0.22, t.h, 0.22, x, FLOOR_Y + t.h / 2, z, t.neon, 2.2)
        }
        for (const fy of [1, 0.62]) {
          const y = FLOOR_Y + t.h * fy
          const band = new THREE.BoxGeometry(t.w + 0.3, 0.28, t.d + 0.3)
          const inner = new THREE.BoxGeometry(t.w + 0.31, 0.28, t.d + 0.31)
          void inner
          band.rotateY(-yaw)
          band.translate(t.x, y, t.z)
          band.deleteAttribute('uv')
          col.set(t.neon).multiplyScalar(fy === 1 ? 2.4 : 1.4)
          const cc = new Float32Array(band.attributes.position.count * 3)
          for (let i = 0; i < cc.length; i += 3) col.toArray(cc, i)
          band.setAttribute('color', new THREE.BufferAttribute(cc, 3))
          neonParts.push(band)
        }
      }
    }
    return {
      bodies: groups.map((g) => (g.length ? mergeBufferGeometries(g) : null)),
      neon: neonParts.length ? mergeBufferGeometries(neonParts) : null,
      textures: [windowTexture(11), windowTexture(23), windowTexture(37)],
    }
  }, [closeRow])

  return (
    <group>
      {bodies.map((geo, i) =>
        geo ? (
          <mesh key={i} geometry={geo}>
            <meshStandardMaterial
              color="#26305f"
              roughness={0.3}
              metalness={0.6}
              emissive="#ffffff"
              emissiveMap={textures[i]}
              emissiveIntensity={2.4}
            />
          </mesh>
        ) : null,
      )}
      {neon && (
        <mesh geometry={neon}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ deck, frame and pylons */

/** Half-width of the board slab (matches LudoScene3D's SLAB_HALF). */
const SLAB_HALF = 5.0
const RIM_W = 0.62
const RIM_TOP = 0.16
const DECK_HALF = 9.5

/** City floor far below the deck: dark, with a faint blue street grid. */
function CityFloor() {
  const grid = useMemo(() => gridTexture(), [])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y - 0.6, 0]}>
      <planeGeometry args={[420, 420]} />
      <meshStandardMaterial color="#05071a" roughness={0.6} metalness={0.4} emissive="#ffffff" emissiveMap={grid} emissiveIntensity={0.22} />
    </mesh>
  )
}

/**
 * The square rooftop deck the board stands on: a polished, mirror-like floor that reflects the board,
 * the warriors and the neon, edged by a metal kerb with a cyan light line.
 */
function MirrorDeck() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 0]}>
        <planeGeometry args={[DECK_HALF * 2, DECK_HALF * 2]} />
        <MeshReflectorMaterial
          resolution={512}
          mirror={0.55}
          blur={[220, 80]}
          mixBlur={0.9}
          mixStrength={2.2}
          depthScale={0.6}
          minDepthThreshold={0.6}
          maxDepthThreshold={1.2}
          roughness={0.55}
          metalness={0.6}
          color="#0b1233"
        />
      </mesh>
      {/* metal kerb with a light line around the deck */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation-y={(i * Math.PI) / 2}>
          <mesh position={[0, FLOOR_Y - 0.25, DECK_HALF + 0.25]}>
            <boxGeometry args={[DECK_HALF * 2 + 1, 0.6, 0.5]} />
            <meshStandardMaterial color="#1a2348" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[0, FLOOR_Y + 0.07, DECK_HALF + 0.02]}>
            <boxGeometry args={[DECK_HALF * 2, 0.05, 0.08]} />
            <meshBasicMaterial color={new THREE.Color(0.3, 1.5, 2.8)} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Team colours at the board's corners: red far-left, green far-right, yellow near-right, blue near-left. */
const RIM_COLORS = ['#ff2d55', '#22e06b', '#ffc21a', '#2f7dff']

/**
 * A thick, layered gunmetal frame around the board: beveled bars on all four sides, a neon strip along
 * the top in each adjacent team's colour, a glowing channel on the outer face, and armoured corner
 * blocks with light pylons, like the reference's raised arena table.
 */
function BoardRim() {
  const half = SLAB_HALF + RIM_W / 2
  const h = RIM_TOP - FLOOR_Y
  const pulse = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  useFrame((st) => {
    const k = 1.8 + Math.sin(st.clock.elapsedTime * 2.2) * 0.4
    for (const m of pulse.current) m?.color.setRGB(0.3 * k, 1.1 * k, 2 * k)
  })
  // far (-z), right (+x), near (+z), left (-x); each side is split between its two corner teams
  const sides = [
    { rot: 0, colors: [RIM_COLORS[0], RIM_COLORS[1]] },
    { rot: -Math.PI / 2, colors: [RIM_COLORS[1], RIM_COLORS[2]] },
    { rot: Math.PI, colors: [RIM_COLORS[2], RIM_COLORS[3]] },
    { rot: Math.PI / 2, colors: [RIM_COLORS[3], RIM_COLORS[0]] },
  ]
  const len = SLAB_HALF * 2
  return (
    <group>
      {sides.map((sd, i) => (
        <group key={i} rotation-y={sd.rot}>
          <RoundedBox args={[len + RIM_W * 2, h, RIM_W]} radius={0.08} smoothness={3} position={[0, FLOOR_Y + h / 2, -half]} castShadow receiveShadow>
            <meshPhysicalMaterial color="#1c2546" metalness={0.92} roughness={0.24} clearcoat={0.7} clearcoatRoughness={0.15} />
          </RoundedBox>
          {/* polished stepped inner lip */}
          <mesh position={[0, RIM_TOP - 0.05, -half + RIM_W / 2 - 0.08]}>
            <boxGeometry args={[len, 0.12, 0.14]} />
            <meshStandardMaterial color="#9aa6c8" metalness={1} roughness={0.2} />
          </mesh>
          {/* team-colour neon strips along the top, one per half */}
          {sd.colors.map((c, k) => (
            <mesh key={k} position={[(k ? 1 : -1) * (len / 4 + 0.05), RIM_TOP + 0.01, -half - 0.05]}>
              <boxGeometry args={[len / 2 - 0.3, 0.04, 0.1]} />
              <meshBasicMaterial color={new THREE.Color(c).multiplyScalar(2.3)} toneMapped={false} />
            </mesh>
          ))}
          {/* glowing channel on the outer face */}
          <mesh position={[0, FLOOR_Y + h * 0.45, -half - RIM_W / 2 - 0.005]}>
            <boxGeometry args={[len + RIM_W, 0.07, 0.02]} />
            <meshBasicMaterial
              ref={(m) => {
                pulse.current[i] = m
              }}
              color={new THREE.Color(0.5, 1.8, 3)}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {/* armoured corner blocks with a light pylon on each */}
      {[
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sz], i) => (
        <group key={i} position={[sx * half, 0, sz * half]}>
          <RoundedBox args={[RIM_W * 1.6, h + 0.12, RIM_W * 1.6]} radius={0.1} smoothness={3} position={[0, FLOOR_Y + (h + 0.12) / 2, 0]} castShadow>
            <meshPhysicalMaterial color="#232d55" metalness={0.95} roughness={0.2} clearcoat={0.8} />
          </RoundedBox>
          <mesh position={[0, RIM_TOP + 0.38, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.2, 0.62, 12]} />
            <meshStandardMaterial color="#2b3766" metalness={0.9} roughness={0.25} />
          </mesh>
          <mesh position={[0, RIM_TOP + 0.75, 0]}>
            <sphereGeometry args={[0.16, 16, 12]} />
            <meshBasicMaterial color={new THREE.Color(RIM_COLORS[i]).multiplyScalar(2.6)} toneMapped={false} />
          </mesh>
          <pointLight position={[0, RIM_TOP + 0.8, 0]} color={RIM_COLORS[i]} intensity={2.2} distance={4.5} decay={1.6} />
        </group>
      ))}
    </group>
  )
}

/** Light posts at the deck's far corners and along its far and side edges. */
function DeckLamps() {
  const lamps = useMemo(() => {
    const out: { x: number; z: number; color: string }[] = []
    const e = DECK_HALF - 0.6
    for (const x of [-e, -e / 2, 0, e / 2, e]) out.push({ x, z: -e, color: Math.abs(x) === e ? '#ffd27a' : '#7fe9ff' })
    for (const z of [-e / 3, e / 3]) for (const x of [-e, e]) out.push({ x, z, color: '#7fe9ff' })
    return out
  }, [])
  return (
    <group>
      {lamps.map((l, i) => (
        <group key={i} position={[l.x, FLOOR_Y, l.z]}>
          <mesh position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.07, 0.11, 2.4, 8]} />
            <meshStandardMaterial color="#1a2140" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <boxGeometry args={[0.5, 0.12, 0.22]} />
            <meshBasicMaterial color={new THREE.Color(l.color).multiplyScalar(2.4)} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ billboards + traffic */

function Billboards() {
  const boards = useMemo(
    () => [
      { tex: billboardTexture(['LUDO', 'PLAY · CHAT · WIN'], '#4fe3ff', '#b46bff'), pos: [-20, 13, -26] as const, yaw: 0.6, w: 10 },
      { tex: billboardTexture(['VIBO', 'ARENA'], '#ff4fd8', '#ffb02e'), pos: [21, 16, -28] as const, yaw: -0.55, w: 11 },
      { tex: billboardTexture(['WIN!'], '#ffd23f', '#ff6a3d'), pos: [2, 24, -56] as const, yaw: 0, w: 13 },
    ],
    [],
  )
  return (
    <group>
      {boards.map((b, i) => (
        <mesh key={i} position={[b.pos[0], b.pos[1], b.pos[2]]} rotation-y={b.yaw}>
          <planeGeometry args={[b.w, b.w / 2]} />
          <meshBasicMaterial map={b.tex} transparent toneMapped={false} color={new THREE.Color(1.5, 1.5, 1.5)} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

const CARS = 14

function Traffic() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const lanes = useMemo(() => {
    const r = rng(99)
    return Array.from({ length: CARS }, () => ({
      radius: 24 + r() * 26,
      y: 9 + r() * 22,
      speed: (0.05 + r() * 0.08) * (r() < 0.5 ? -1 : 1),
      phase: r() * Math.PI * 2,
    }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame((s) => {
    const m = ref.current
    if (!m) return
    lanes.forEach((l, i) => {
      const a = l.phase + s.clock.elapsedTime * l.speed
      dummy.position.set(Math.sin(a) * l.radius, l.y, -Math.cos(a) * l.radius)
      dummy.rotation.set(0, -a + (l.speed > 0 ? 0 : Math.PI), 0)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, CARS]} frustumCulled={false}>
      <boxGeometry args={[1.6, 0.35, 0.7]} />
      <meshBasicMaterial color={new THREE.Color(2.2, 1.6, 2.6)} toneMapped={false} />
    </instancedMesh>
  )
}

export default function LudoNeonCity() {
  // a portrait phone's steep camera only sees towers standing right behind the deck; wider screens see
  // the distant skyline, where that close row would loom as a wall
  const closeRow = useThree((st) => st.size.height > st.size.width * 1.2)
  return (
    <group>
      <fog attach="fog" args={['#2a1350', 60, 210]} />
      <Sky />
      <CityFloor />
      <MirrorDeck />
      <BoardRim />
      <DeckLamps />
      <Towers closeRow={closeRow} />
      <Billboards />
      <Traffic />
      {/* cool city bounce from above and a magenta wash from the skyline */}
      <hemisphereLight args={['#5a6bff', '#12051f', 0.35]} />
      <pointLight position={[0, 14, -26]} intensity={60} distance={60} color="#ff4fd8" />
    </group>
  )
}
