import { Suspense, useRef, type CSSProperties } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, View } from '@react-three/drei'
import * as THREE from 'three'
import WildAnimal, { MODELS, type WildPoseState } from './WildAnimal'
import type { AnimalId } from '../engine/content'
import { gradeToneMapping, installGrade } from './grade'
import type { Expression } from './face'

/*
 * Live 3D animals for the character selection: one WebGL canvas behind the roster, and a drei <View> per card that
 * draws its own little scene (camera, studio light, a soft ground shadow, the animal standing, breathing and slowly
 * turning) into exactly that card's rectangle, scroll included. One canvas for all cards keeps it light: a canvas per
 * card would hit the browser's limit of live WebGL contexts.
 */

installGrade()

const STAND: WildPoseState = { pose: 'idle', speed: 0, t: 0 }
const standPose = () => STAND

let shadowTex: THREE.Texture | null = null
function groundShadow() {
  if (shadowTex) return shadowTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  shadowTex = new THREE.CanvasTexture(c)
  return shadowTex
}

const tmpBox = new THREE.Box3()
const tmpEye = new THREE.Vector3()
const tmpAim = new THREE.Vector3()
const tmpHead = new THREE.Vector3()
const tmpHead2 = new THREE.Vector3()
const VIEW_DIR = new THREE.Vector3(Math.sin(0.62), 0.32, Math.cos(0.62)).normalize()

function CardScene({ id, phase }: { id: AnimalId; phase: number }) {
  const turn = useRef<THREE.Group>(null)
  const cam = useRef<THREE.PerspectiveCamera>(null)
  /** the animal's size and centre, measured once facing front */
  const box = useRef<{ size: THREE.Vector3; center: THREE.Vector3 } | null>(null)
  const settle = useRef(0)
  const def = MODELS[id]
  const h = def.height * (def.view ?? 1)
  useFrame((st) => {
    const g = turn.current
    const c = cam.current
    if (!g || !c) return
    // measure the animal once it has loaded and been fitted (a few frames in), facing front: long tails, big
    // ears and low bodies all frame differently
    if (!box.current) {
      g.rotation.y = 0
      g.updateMatrixWorld(true)
      tmpBox.setFromObject(g, true)
      if (tmpBox.isEmpty() || ++settle.current < 4) return
      box.current = { size: tmpBox.getSize(new THREE.Vector3()), center: tmpBox.getCenter(new THREE.Vector3()) }
    }
    // fit it to this card's current shape every frame (the view's aspect is only known once laid out)
    const { size, center } = box.current
    const t = Math.tan(THREE.MathUtils.degToRad(c.fov / 2))
    const tall = size.y * 1.25
    const wide = Math.max(size.x, size.z) * 0.9
    const dist = Math.max(tall / (2 * t), wide / (2 * t * Math.max(0.3, c.aspect)))
    c.position.copy(center).addScaledVector(VIEW_DIR, dist)
    c.lookAt(center.x, center.y * 0.9, center.z)
    // a slow sway between the two three-quarter sides, each card a little out of step with the others
    g.rotation.y = 0.55 * Math.sin(st.clock.elapsedTime * 0.35 + phase)
  })
  const dist = 3.7 * h
  return (
    <>
      <color attach="background" args={['#1a1c1a']} />
      <fog attach="fog" args={['#1a1c1a', dist * 1.6, dist * 4]} />
      <PerspectiveCamera ref={cam} makeDefault fov={30} position={[Math.sin(0.62) * dist, h * 0.95, Math.cos(0.62) * dist]} near={0.05} far={60} onUpdate={(c) => c.lookAt(0, h * 0.48, 0)} />
      <hemisphereLight args={['#fff2dc', '#26261f', 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} color="#fff0d8" />
      <directionalLight position={[-3, 2.5, -4]} intensity={1.6} color="#cfe0ff" />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
        <planeGeometry args={[h * 2.6, h * 2.6]} />
        <meshBasicMaterial map={groundShadow()} transparent depthWrite={false} />
      </mesh>
      <group ref={turn}>
        <Suspense fallback={null}>
          <WildAnimal animalId={id} poseOf={standPose} castShadow={false} />
        </Suspense>
      </group>
    </>
  )
}

/** Shared turn state for the large preview: the yaw it shows, where it is heading, and who is driving it. */
export interface Spin {
  yaw: number
  target: number | null
  dragging: boolean
  /** seconds since the player last touched it (auto-rotation resumes after a pause) */
  idle: number
  /** 1 = whole animal in frame; up to ZOOM_MAX moves the camera in for a close look at the face and coat */
  zoom: number
  /** the facial expression picked on the character screen (null: the animal's own idle moods) */
  expr: Expression | null
}
/** animals whose model has a full face rig (jaw, lips, lids, ears, tongue), so expressions can be shown */
export const hasFace = (id: AnimalId) => MODELS[id].url.endsWith('/arctic.glb')
export const ZOOM_MIN = 0.85
export const ZOOM_MAX = 2.2
export const newSpin = (): Spin => ({ yaw: 0.6, target: null, dragging: false, idle: 9, zoom: 1, expr: null })

function FeatureScene({ id, spin }: { id: AnimalId; spin: Spin }) {
  const turn = useRef<THREE.Group>(null)
  const cam = useRef<THREE.PerspectiveCamera>(null)
  const box = useRef<{ size: THREE.Vector3; center: THREE.Vector3 } | null>(null)
  const settle = useRef(0)
  const remeasure = useRef(0)
  const camDist = useRef(0)
  const zoomNow = useRef(1)
  const faceBone = useRef<THREE.Object3D | null>(null)
  const faceMix = useRef(0)
  const def = MODELS[id]
  const h = def.height * (def.view ?? 1)
  useFrame((_, dt) => {
    const g = turn.current
    const c = cam.current
    if (!g || !c) return
    // measure the animal facing front once it has loaded, then again twice a second (big models finish fitting a
    // little later, and a pose change moves the tail), so the camera always holds the whole animal
    remeasure.current -= dt
    if (!box.current || remeasure.current <= 0) {
      const yaw = g.rotation.y
      g.rotation.y = 0
      g.updateMatrixWorld(true)
      tmpBox.setFromObject(g, true)
      g.rotation.y = yaw
      g.updateMatrixWorld(true)
      if (tmpBox.isEmpty() || (!box.current && ++settle.current < 4)) return
      box.current = { size: tmpBox.getSize(new THREE.Vector3()), center: tmpBox.getCenter(new THREE.Vector3()) }
      remeasure.current = 0.5
    }
    // a front / side / rear button eases the animal round; otherwise it turns slowly by itself once left alone
    spin.idle += dt
    if (spin.target !== null) {
      const d = Math.atan2(Math.sin(spin.target - spin.yaw), Math.cos(spin.target - spin.yaw))
      spin.yaw += d * Math.min(1, dt * 5)
      if (Math.abs(d) < 0.002) spin.target = null
    } else if (!spin.dragging && spin.idle > 2.5 && !spin.expr) spin.yaw += dt * 0.35
    g.rotation.y = spin.yaw
    // a level side-on camera: the whole animal, nose to tail, with room around it
    const { size, center } = box.current
    const t = Math.tan(THREE.MathUtils.degToRad(c.fov / 2))
    const span = Math.max(size.x, size.z) * 1.15
    const want = Math.max((size.y * 1.7) / (2 * t), span / (2 * t * Math.max(0.3, c.aspect)))
    camDist.current = camDist.current ? camDist.current + (want - camDist.current) * Math.min(1, dt * 4) : want
    // zoom eases the camera in; close up it rises a little toward the head height so the face stays in view
    zoomNow.current += (spin.zoom - zoomNow.current) * Math.min(1, dt * 6)
    const z = zoomNow.current
    const dist = camDist.current / z
    const lift = Math.min(1, (z - 1) / 1.2) * size.y * 0.34
    // a portrait of the face while an expression is shown: aim at the head bone and come in close
    if (!faceBone.current) g.traverse((o) => void (!faceBone.current && (o as THREE.Bone).isBone && /^face(_\d+)?$/.test(o.name) && (faceBone.current = o)))
    faceMix.current += ((spin.expr && faceBone.current ? 1 : 0) - faceMix.current) * Math.min(1, dt * 4)
    const fm = faceMix.current
    const eye = tmpEye.set(center.x, center.y + size.y * 0.25 / z + lift, center.z + dist)
    const aim = tmpAim.set(center.x, center.y * 0.85 + lift, center.z)
    if (fm > 1e-3 && faceBone.current) {
      const head = faceBone.current.getWorldPosition(tmpHead)
      head.y += size.y * 0.04
      aim.lerp(head, fm)
      eye.lerp(tmpHead2.set(head.x, head.y + size.y * 0.05, head.z + Math.max(size.y * 1.15, 0.6) / Math.max(1, z * 0.6)), fm)
    }
    c.position.copy(eye)
    c.lookAt(aim)
  })
  return (
    <>
      <color attach="background" args={['#161816']} />
      <fog attach="fog" args={['#161816', h * 6, h * 16]} />
      <PerspectiveCamera ref={cam} makeDefault fov={28} position={[0, h, h * 5]} near={0.05} far={80} />
      <hemisphereLight args={['#fff2dc', '#26261f', 1.05]} />
      <directionalLight position={[3, 5, 4]} intensity={2.4} color="#fff0d8" />
      <directionalLight position={[-4, 3, -3]} intensity={1.8} color="#cfe0ff" />
      <directionalLight position={[0, 2, -5]} intensity={0.8} color="#ffe2c0" />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
        <planeGeometry args={[h * 3.2, h * 3.2]} />
        <meshBasicMaterial map={groundShadow()} transparent depthWrite={false} />
      </mesh>
      <group ref={turn}>
        <Suspense fallback={null}>
          <WildAnimal key={id} animalId={id} poseOf={standPose} castShadow={false} fur expression={() => spin.expr} />
        </Suspense>
      </group>
    </>
  )
}

/** The large preview of the focused animal (turns by itself; drag or the view buttons drive it via \`spin\`). */
export function FeatureView({ id, spin, className, style }: { id: AnimalId; spin: Spin; className?: string; style?: CSSProperties }) {
  return (
    <View className={className} style={style}>
      <FeatureScene key={id} id={id} spin={spin} />
    </View>
  )
}

/** One card's live 3D animal (place it where the card's picture used to be). */
export function AnimalView({ id, index, className, style }: { id: AnimalId; index: number; className?: string; style?: CSSProperties }) {
  return (
    <View className={className} style={style}>
      <CardScene id={id} phase={index * 1.7} />
    </View>
  )
}

/** The single canvas every card's view draws into; mount it once, behind the roster. */
export function RosterCanvas() {
  return (
    <Canvas
      className="pointer-events-none"
      style={{ position: 'absolute', inset: 0 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = gradeToneMapping()
        gl.toneMappingExposure = 1.15
      }}
    >
      <View.Port />
    </Canvas>
  )
}
