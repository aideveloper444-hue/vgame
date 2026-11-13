import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three-stdlib'
import * as THREE from 'three'
import { DICE_FACE_QUATERNION } from '@/games/shared/three/diceFaceQuaternions'
import { ludoSfx } from '@/lib/sound'

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
}

// BoxGeometry material slots are [+x, -x, +y, -y, +z, -z]; matches DICE_FACE_QUATERNION's face axes.
const FACE_ORDER = [1, 6, 2, 5, 3, 4]

function makeFace(pips: number): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const bg = ctx.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size / 2, size / 2, size * 0.75)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(0.7, '#f3f4f9')
  bg.addColorStop(1, '#dfe2ec')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)
  const r = size * (pips === 1 ? 0.13 : 0.095)
  for (const [px, py] of PIPS[pips]) {
    const cx = px * size
    const cy = py * size
    ctx.beginPath()
    ctx.arc(cx, cy + r * 0.12, r * 1.12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fill()
    const g = ctx.createRadialGradient(cx + r * 0.25, cy + r * 0.3, r * 0.1, cx, cy, r)
    g.addColorStop(0, pips === 1 ? '#ff4f73' : '#3b3f4d')
    g.addColorStop(1, pips === 1 ? '#a3102f' : '#07080c')
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

const SIZE = 1
/** Share of the round the resting die's face spans: as big as fits inside the circle with its rounded corners. */
const FACE_FILL = 0.74
const SPIN_SCALE = 0.78

/** Looks straight down at the die and zooms so its top face spans FACE_FILL of the round. */
function TopDownCamera() {
  const camera = useThree((s) => s.camera)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  useLayoutEffect(() => {
    camera.up.set(0, 0, -1)
    camera.position.set(0, 10, 0)
    camera.lookAt(0, 0, 0)
    camera.zoom = (Math.min(width, height) * FACE_FILL) / SIZE
    camera.updateProjectionMatrix()
  }, [camera, width, height])
  return null
}

function Die({ value, spinning }: { value: number; spinning: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const settleStart = useRef(0)
  const geometry = useMemo(() => new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.16), [])
  const materials = useMemo(
    () =>
      FACE_ORDER.map(
        (p) => {
          // seen straight on, a glossy coat mirrored the bright surroundings across the face and greyed the pips;
          // a satin finish lit partly by its own face texture keeps the white bright and the pips solid black
          const face = makeFace(p)
          return new THREE.MeshStandardMaterial({
            map: face,
            emissiveMap: face,
            emissive: new THREE.Color('#ffffff'),
            emissiveIntensity: 0.45,
            roughness: 0.75,
            metalness: 0,
            envMapIntensity: 0.25,
          })
        },
      ),
    [],
  )
  const spinAxis = useRef(new THREE.Vector3(1, 0.6, 0.3).normalize())
  const target = useRef(new THREE.Quaternion())

  useEffect(() => {
    if (spinning) spinAxis.current.set(Math.random() - 0.5, Math.random() * 0.5 + 0.5, Math.random() - 0.5).normalize()
    else settleStart.current = performance.now()
  }, [spinning])

  useFrame((state, delta) => {
    const mesh = ref.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    if (spinning) {
      // tumble a little smaller than at rest, so the spinning cube's corners stay inside the round
      mesh.rotateOnWorldAxis(spinAxis.current, delta * 16)
      mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), delta * 5)
      mesh.scale.setScalar(SPIN_SCALE + Math.abs(Math.sin(t * 11)) * 0.06)
      return
    }
    // settle with only the rolled face toward the camera, edges square to the screen, so the number reads at a glance
    const face = DICE_FACE_QUATERNION[(value || 1) as 1 | 2 | 3 | 4 | 5 | 6]
    target.current.set(...face)
    mesh.quaternion.slerp(target.current, 1 - Math.exp(-16 * delta))
    // a quick landing pop, then a slow breathing pulse
    const since = (performance.now() - settleStart.current) / 1000
    const pop = since < 0.4 ? Math.sin((since / 0.4) * Math.PI) * 0.12 : 0
    const target_ = 1 + pop + Math.sin(t * 1.8) * 0.012
    mesh.scale.setScalar(THREE.MathUtils.damp(mesh.scale.x, target_, 14, delta))
  })

  return (
    <mesh ref={ref} geometry={geometry} castShadow position={[0, SIZE / 2, 0]} scale={SPIN_SCALE}>
      {materials.map((m, i) => (
        <primitive key={i} object={m} attach={`material-${i}`} />
      ))}
    </mesh>
  )
}

const DEFAULT_SIZE =
  'h-[5.6rem] w-[5.6rem] sm:h-[6.4rem] sm:w-[6.4rem] [@media(min-height:780px)]:h-[6.6rem] [@media(min-height:780px)]:w-[6.6rem] @min-[56rem]:[@media(min-height:900px)]:h-[8.4rem]! @min-[56rem]:[@media(min-height:900px)]:w-[8.4rem]!'

/**
 * The roll control: a glossy 3D die resting on a glowing platform in the current player's color.
 * `spinning` tumbles and hops the die; when it flips to false the die settles on `value`.
 */
export default function LudoDice({
  value,
  spinning,
  accent,
  canRoll,
  onRoll,
  sizeClassName = DEFAULT_SIZE,
  countdown,
}: {
  value: number
  spinning: boolean
  accent: string
  canRoll: boolean
  onRoll: () => void
  /** Width/height classes for the round platform. */
  sizeClassName?: string
  /** Time left to roll: a ring around the die that empties over `ms`; `key` restarts it for each new turn. */
  countdown?: { key: number; ms: number } | null
}) {
  // The portrait tablet layout is CSS-zoomed; the canvas is sized before the zoom, so render it at
  // proportionally more pixels or the zoom would stretch (and blur) the die.
  const stageRef = useRef<HTMLSpanElement>(null)
  const [dpr, setDpr] = useState(() => Math.min(3, typeof window === 'undefined' ? 2 : window.devicePixelRatio || 1))
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || !el.offsetWidth) return
    const zoom = el.getBoundingClientRect().width / el.offsetWidth
    setDpr(Math.min(4, (window.devicePixelRatio || 1) * Math.max(1, zoom)))
  }, [sizeClassName])

  // when the die lands, flash an impact ring and throw a few sparks off the platform
  const [impact, setImpact] = useState(0)
  const wasSpinning = useRef(false)
  useEffect(() => {
    if (!wasSpinning.current && spinning) ludoSfx.diceRoll()
    if (wasSpinning.current && !spinning) {
      setImpact((n) => n + 1)
      ludoSfx.diceLand()
      if (value === 6) ludoSfx.six()
    }
    wasSpinning.current = spinning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning])
  useEffect(() => {
    if (!impact) return
    const t = setTimeout(() => setImpact(0), 800)
    return () => clearTimeout(t)
  }, [impact])

  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={!canRoll}
      aria-label="Roll dice"
      className={`group relative block shrink-0 touch-manipulation rounded-full outline-none transition-transform duration-150 enabled:active:scale-90 disabled:cursor-default ${sizeClassName}`}
      style={{ ['--glow' as string]: `${accent}aa` }}
    >
      <span
        className="absolute -inset-[5%] rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 38%, rgba(70,58,150,0.5), rgba(12,10,34,0.78) 68%)',
          boxShadow: `0 0 0 2px #7aa8ffd0, 0 0 26px 4px #6d7bff77, 0 0 46px 6px ${accent}33, inset 0 0 24px -4px #9b7dff88, inset 0 2px 0 rgba(255,255,255,0.22)`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      />
      <span
        className={`absolute -inset-[8%] rounded-full ${canRoll ? 'ludo-spin' : 'opacity-80'}`}
        style={{
          background: 'conic-gradient(from 0deg, #3ec8ff, #6d6bff 25%, #c056ff 45%, #ff4fd8 60%, #8b5cf6 78%, #3ec8ff)',
          filter: 'drop-shadow(0 0 6px #7c7cff) drop-shadow(0 0 14px #c056ff)',
          maskImage: 'radial-gradient(circle, transparent 62%, black 64%, black 69%, transparent 71%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 62%, black 64%, black 69%, transparent 71%)',
        }}
      />
      {countdown && (
        <svg key={countdown.key} viewBox="0 0 100 100" className="pointer-events-none absolute -inset-[13%] z-10 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="5" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            className="ludo-roll-timer"
            style={{ animationDuration: `${countdown.ms}ms`, ['--timer-color' as string]: accent, filter: `drop-shadow(0 0 4px ${accent})` }}
          />
        </svg>
      )}
      {/* platform: glowing disc with a neon rim and a pulsing halo while it's your roll */}
      <span className="absolute inset-x-0 bottom-[-6%] h-[40%] rounded-[50%] opacity-70 blur-md" style={{ background: `radial-gradient(ellipse, ${accent}88, transparent 70%)` }} />
      <span
        className={`absolute inset-x-1 bottom-0.5 h-[46%] rounded-[50%] ${canRoll ? 'ludo-dice-halo' : ''}`}
        style={{
          background: `radial-gradient(ellipse at 50% 35%, ${accent}55 0%, rgba(30,26,70,0.9) 48%, rgba(6,6,18,0.96) 75%)`,
          boxShadow: `0 0 0 1px ${accent}99, 0 0 18px 2px ${accent}55, inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -8px 16px rgba(0,0,0,0.7)`,
        }}
      />
      <span className="absolute inset-x-[18%] bottom-[30%] h-[3px] rounded-full bg-white/30 blur-[1px]" />
      {spinning && (
        <span
          className="ludo-dice-trail absolute inset-[-6%] rounded-full"
          style={{ background: `conic-gradient(from 0deg, transparent 0 55%, ${accent}00 55%, ${accent}aa 88%, #ffffffcc 97%, transparent 100%)`, maskImage: 'radial-gradient(circle, transparent 52%, black 56%, black 64%, transparent 68%)', WebkitMaskImage: 'radial-gradient(circle, transparent 52%, black 56%, black 64%, transparent 68%)' }}
        />
      )}
      <span
        className="absolute inset-x-3 bottom-[18%] h-[14%] rounded-[50%] opacity-80"
        style={{ background: `radial-gradient(ellipse, ${accent}, transparent 70%)`, filter: 'blur(4px)' }}
      />
      {impact > 0 && (
        <span key={impact} className="pointer-events-none absolute inset-x-0 bottom-[8%] h-[40%]">
          <span className="ludo-impact absolute inset-0 rounded-[50%]" style={{ boxShadow: `0 0 0 2px ${accent}, 0 0 24px 6px ${accent}` }} />
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="ludo-burst-spark" style={{ ['--a' as string]: `${i * 45 + 20}deg`, background: '#fff', boxShadow: `0 0 6px 2px ${accent}` }} />
          ))}
        </span>
      )}
      <span ref={stageRef} className={`pointer-events-none absolute inset-0 transition-[filter] duration-150 ${canRoll && !spinning ? 'ludo-dice-bob' : ''}`} style={{ filter: spinning ? 'blur(0.6px) brightness(1.08)' : undefined }}>
        {/* offsetSize: the portrait tablet layout is CSS-zoomed, and measuring with getBoundingClientRect would
            size the canvas by the zoomed box, doubling it so the die slid off-centre and out of the round */}
        <Canvas resize={{ offsetSize: true }} dpr={dpr} gl={{ alpha: true, antialias: true }} orthographic camera={{ position: [0, 10, 0], near: 0.1, far: 50 }} shadows="percentage" style={{ background: 'transparent' }}>
          <TopDownCamera />
          <ambientLight intensity={0.6} />
          {/* angled light: from straight above, its highlight bounced into the camera and washed the pips grey */}
          <directionalLight position={[3, 5, 2.5]} intensity={1.3} castShadow />
          <pointLight position={[0, 0.4, 1.8]} intensity={2} distance={4} color={accent} />
          <Environment resolution={64}>
            {/* off to one side: straight overhead, its reflection would cover the face the camera looks down at and grey out the pips */}
            <Lightformer form="rect" intensity={2.2} position={[3.5, 4, -2.5]} rotation-x={Math.PI / 2} scale={[4, 4, 1]} />
            <Lightformer form="rect" intensity={1.2} color="#ffd9a8" position={[-4, 1, 2]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
            <Lightformer form="rect" intensity={1.2} color="#9ab8ff" position={[4, 1, -2]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
          </Environment>
          <group position={[0, -SIZE / 2, 0]}>
            <Die value={value} spinning={spinning} />
            <ContactShadows position={[0, 0.001, 0]} opacity={0.65} scale={3} blur={2.2} far={1.6} />
          </group>
        </Canvas>
      </span>
    </button>
  )
}
