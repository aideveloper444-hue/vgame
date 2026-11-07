import { useEffect, useMemo, useRef } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import type { Group } from 'three'
import type { ThreeEvent } from '@react-three/fiber'

const ONE_SHOT_CLIPS = new Set([
  'die',
  'emote-yes',
  'emote-no',
  'attack-melee-right',
  'attack-melee-left',
  'attack-kick-right',
  'attack-kick-left',
  'pick-up',
  'jump',
])

interface CharacterPawnProps {
  url: string
  animation: string
  tint?: string
  position: [number, number, number]
  rotationY?: number
  scale?: number
  onFinished?: () => void
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}

export default function CharacterPawn({
  url,
  animation,
  tint,
  position,
  rotationY = 0,
  scale = 1,
  onFinished,
  onClick,
}: CharacterPawnProps) {
  const { scene, animations } = useGLTF(url)
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const groupRef = useRef<Group>(null)
  const { actions, mixer } = useAnimations(animations, groupRef)

  useEffect(() => {
    if (!tint) return
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined
      if (mat && !mat.userData.__tinted) {
        const tintedMat = mat.clone()
        // Lerp toward white so the tint reads as a team color wash without crushing the
        // texture's darker pixels (jacket/pants) toward near-black via multiplication.
        const softenedTint = new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.55)
        tintedMat.color = softenedTint
        tintedMat.userData.__tinted = true
        mesh.material = tintedMat
      }
    })
  }, [cloned, tint])

  useEffect(() => {
    const action = actions[animation]
    if (!action) return
    const isOneShot = ONE_SHOT_CLIPS.has(animation)
    action.reset()
    if (isOneShot) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    action.fadeIn(0.15).play()

    function handleFinished(e: { action: THREE.AnimationAction }) {
      if (e.action === action) onFinished?.()
    }
    if (isOneShot) mixer.addEventListener('finished', handleFinished)

    return () => {
      action.fadeOut(0.15)
      if (isOneShot) mixer.removeEventListener('finished', handleFinished)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, animation, mixer])

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} scale={scale} onClick={onClick}>
      <primitive object={cloned} />
    </group>
  )
}
