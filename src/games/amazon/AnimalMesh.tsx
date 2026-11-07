import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import { ANIMALS, getAnimal } from './amazonTrackData'

export type AnimalPose = 'idle' | 'run' | 'jump' | 'slide' | 'dead'

export interface PoseState {
  pose: AnimalPose
  /** m/s, drives the gallop rate */
  speed: number
  /** 0..1 progress through the current jump or slide */
  progress: number
  /** semi-transparent blink (after a revive) */
  ghost?: boolean
}

/** Shoulder-to-ground target height (metres) of every model before the animal's own scale. */
const TARGET_HEIGHT = 1.05

const CLIP = { idle: 'Idle', run: 'Gallop', jump: 'Gallop_Jump', slide: 'Gallop', dead: 'Death' } as const

for (const a of ANIMALS) useGLTF.preload(a.model)

interface AnimalModelProps {
  animalId: string
  /** Read every frame, so the model follows the race without React re-renders. */
  poseOf: () => PoseState
  castShadow?: boolean
}

/** A rigged animal from /models/amazon, normalised to stand on y=0 facing +Z. */
export default function AnimalModel({ animalId, poseOf, castShadow = true }: AnimalModelProps) {
  const animal = getAnimal(animalId)
  const { scene, animations } = useGLTF(animal.model)
  const body = useRef<THREE.Group>(null)

  const { root, fit } = useMemo(() => {
    const root = SkeletonUtils.clone(scene) as THREE.Object3D
    const mats: THREE.Material[] = []
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (!m.isMesh) return
      m.castShadow = castShadow
      m.receiveShadow = false
      m.frustumCulled = false
      const mat = (m.material as THREE.MeshStandardMaterial).clone()
      mat.envMapIntensity = 0.6
      m.material = mat
      mats.push(mat)
    })
    root.userData.mats = mats
    // measure in the rest pose: height -> scale, long axis -> yaw so the head points down +Z
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root, true)
    const size = box.getSize(new THREE.Vector3())
    const scale = (TARGET_HEIGHT * animal.scale) / Math.max(0.01, size.y)
    const alongX = size.x > size.z
    return { root, fit: { scale, yaw: alongX ? -Math.PI / 2 : 0, lift: -box.min.y * scale } }
  }, [scene, animal.scale, castShadow])

  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root])
  const actions = useMemo(() => {
    const out: Partial<Record<AnimalPose, THREE.AnimationAction>> = {}
    for (const pose of Object.keys(CLIP) as AnimalPose[]) {
      const clip = animations.find((c) => c.name === CLIP[pose])
      if (!clip) continue
      const act = mixer.clipAction(clip)
      if (pose === 'jump' || pose === 'dead') {
        act.setLoop(THREE.LoopOnce, 1)
        act.clampWhenFinished = true
      }
      out[pose] = act
    }
    return out
  }, [animations, mixer])
  const current = useRef<AnimalPose | null>(null)
  useEffect(() => {
    current.current = null // (re)start the right clip on the next frame
    return () => void mixer.stopAllAction()
  }, [mixer])
  const sink = useRef(0)

  useFrame((_, dt) => {
    const st = poseOf()
    const pose = st.pose
    if (pose !== current.current) {
      const prev = current.current ? actions[current.current] : undefined
      const next = actions[pose] ?? actions.run
      if (next) {
        next.reset()
        if (pose === 'jump') next.timeScale = 1.1
        next.fadeIn(prev ? 0.12 : 0).play()
      }
      if (prev && prev !== next) prev.fadeOut(0.12)
      current.current = pose
    }
    const run = actions.run
    if (run && (pose === 'run' || pose === 'slide')) run.timeScale = Math.max(0.8, st.speed / 8.5)
    mixer.update(Math.min(dt, 0.05))

    const g = body.current
    if (!g) return
    // slide: crouch low and stretch; jump height is applied by the parent
    const targetSink = pose === 'slide' ? 1 : 0
    sink.current += (targetSink - sink.current) * Math.min(1, dt * 18)
    g.scale.set(fit.scale * (1 + sink.current * 0.06), fit.scale * (1 - sink.current * 0.42), fit.scale * (1 + sink.current * 0.12))
    g.rotation.x = pose === 'jump' ? -0.25 * Math.sin(Math.PI * st.progress) : 0
    const mats = root.userData.mats as THREE.Material[]
    const ghost = !!st.ghost
    const opacity = ghost ? 0.45 + 0.35 * Math.sin(performance.now() / 60) : 1
    for (const m of mats) {
      if (m.transparent !== ghost) {
        m.transparent = ghost
        m.needsUpdate = true
      }
      m.opacity = opacity
    }
  })

  return (
    <group ref={body} position={[0, fit.lift, 0]}>
      <primitive object={root} rotation={[0, fit.yaw, 0]} />
    </group>
  )
}
