import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { FBXLoader, SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'

import { ANIM_IDLE_URL, ANIM_JUMP_URL, ANIM_RUN_URL, FBX_SCALE, MODEL_URL, applyRimLight } from './protagonistAssets'

export type PawnPose = 'idle' | 'walk' | 'attack' | 'die' | 'celebrate'

interface ProtagonistPawnProps {
  skinUrl: string
  tint?: string
  pose: PawnPose
  position: [number, number, number]
  rotationY?: number
  scale?: number
  /** Optional colored fresnel rim light (off by default). */
  rimColor?: string
  rimStrength?: number
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}

export default function ProtagonistPawn({
  skinUrl,
  tint,
  pose,
  position,
  rotationY = 0,
  scale = 1,
  rimColor,
  rimStrength = 1,
  onClick,
}: ProtagonistPawnProps) {
  // Load all four FBX files as one array so they fetch/parse in parallel — calling useLoader
  // separately per URL suspends-and-retries sequentially (a waterfall), which made this take
  // far longer than necessary.
  const [baseFbx, idleFbx, runFbx, jumpFbx] = useLoader(FBXLoader, [MODEL_URL, ANIM_IDLE_URL, ANIM_RUN_URL, ANIM_JUMP_URL])
  const skin = useTexture(skinUrl)

  const cloned = useMemo(() => SkeletonUtils.clone(baseFbx) as THREE.Group, [baseFbx])
  const outerRef = useRef<THREE.Group>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionsRef = useRef<Record<'idle' | 'run' | 'jump', THREE.AnimationAction>>({} as never)
  const currentClipRef = useRef<'idle' | 'run' | 'jump'>('idle')
  const poseStartRef = useRef(performance.now())

  useEffect(() => {
    skin.colorSpace = THREE.SRGBColorSpace
    skin.flipY = false
    skin.needsUpdate = true
    const softTint = tint ? new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.4) : null
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.7, metalness: 0.04 })
      if (softTint) mat.color = softTint
      if (rimColor) applyRimLight(mat, rimColor, rimStrength)
      mesh.material = mat
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
  }, [cloned, skin, tint, rimColor, rimStrength])

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(cloned)
    mixerRef.current = mixer
    const idleAction = mixer.clipAction(pickClip(idleFbx.animations))
    const runAction = mixer.clipAction(pickClip(runFbx.animations))
    const jumpAction = mixer.clipAction(pickClip(jumpFbx.animations))
    actionsRef.current = { idle: idleAction, run: runAction, jump: jumpAction }
    idleAction.play()
    currentClipRef.current = 'idle'
    return () => {
      mixer.stopAllAction()
    }
  }, [cloned, idleFbx, runFbx, jumpFbx])

  useEffect(() => {
    poseStartRef.current = performance.now()
    const actions = actionsRef.current
    if (!actions.idle) return
    const targetClip: 'idle' | 'run' | 'jump' = pose === 'walk' ? 'run' : pose === 'celebrate' ? 'jump' : 'idle'
    if (currentClipRef.current !== targetClip) {
      actions[currentClipRef.current]?.fadeOut(0.2)
      const next = actions[targetClip]
      next.reset()
      if (targetClip === 'jump') {
        next.setLoop(THREE.LoopRepeat, 2)
        next.clampWhenFinished = false
      }
      next.fadeIn(0.2).play()
      currentClipRef.current = targetClip
    }
  }, [pose])

  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
    const outer = outerRef.current
    if (!outer) return
    const elapsed = performance.now() - poseStartRef.current

    if (pose === 'attack') {
      const t = Math.min(1, elapsed / 380)
      const bump = Math.sin(t * Math.PI) * 0.28
      outer.scale.setScalar(scale * (1 + bump * 0.4))
      outer.position.set(position[0], position[1] + bump * 0.05, position[2])
      outer.rotation.set(0, rotationY, 0)
    } else if (pose === 'die') {
      const t = Math.min(1, elapsed / 550)
      outer.rotation.set(0, rotationY, -t * (Math.PI / 2.05))
      outer.position.set(position[0], position[1] - t * 0.05, position[2])
      outer.scale.setScalar(scale)
    } else {
      outer.rotation.set(0, rotationY, 0)
      outer.position.set(position[0], position[1], position[2])
      outer.scale.setScalar(scale)
    }
  })

  return (
    <group ref={outerRef} onClick={onClick}>
      <primitive object={cloned} scale={FBX_SCALE} />
    </group>
  )
}

/** Kenney's animation FBXs also carry a near-zero-length "Targeting Pose" (T-pose) clip, not always last. */
function pickClip(clips: THREE.AnimationClip[]): THREE.AnimationClip {
  return clips.find((c) => !c.name.includes('Targeting Pose')) ?? clips[0]
}

export function preloadProtagonistAssets() {
  useLoader.preload(FBXLoader, [MODEL_URL, ANIM_IDLE_URL, ANIM_RUN_URL, ANIM_JUMP_URL])
}
