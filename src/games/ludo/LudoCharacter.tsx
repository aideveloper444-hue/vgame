import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { CLIP, buildHero, heroAnimations, useHeroAssets } from './ludoCharacters'
import { useCharacterStyle } from './ludoThemes'
import { COLOR_GLOW, type LudoColor } from './ludoBoardLayout'

export type CharacterPose = 'idle' | 'walk' | 'attack' | 'die' | 'celebrate'

const ONE_SHOT = new Set<string>([CLIP.attack, CLIP.death, CLIP.hit])
const TRAIL_SAMPLES = 16

/** Sword built in the hand bone's space: grip in the fist, blade along +Y. */
function makeSword(glow: string) {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#e8eef8', metalness: 1, roughness: 0.18, emissive: glow, emissiveIntensity: 0.25 })
  const gold = new THREE.MeshStandardMaterial({ color: '#e0a82e', metalness: 1, roughness: 0.28 })
  const leather = new THREE.MeshStandardMaterial({ color: '#3b2415', roughness: 0.8 })
  const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(3), toneMapped: false })

  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(-0.028, 0)
  bladeShape.lineTo(0.028, 0)
  bladeShape.lineTo(0.022, 0.7)
  bladeShape.lineTo(0, 0.8)
  bladeShape.lineTo(-0.022, 0.7)
  bladeShape.closePath()
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }), steel)
  blade.position.set(0, 0.1, -0.005)
  group.add(blade)
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.62, 0.022), edge)
  fuller.position.set(0, 0.42, 0)
  group.add(fuller)
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.045), gold)
  guard.position.y = 0.09
  group.add(guard)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.15, 10), leather)
  group.add(grip)
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), gold)
  pommel.position.y = -0.085
  group.add(pommel)
  group.visible = false
  return group
}

function makeTrail(glow: string) {
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array(TRAIL_SAMPLES * 2 * 3)
  const uvs = new Float32Array(TRAIL_SAMPLES * 2 * 2)
  const index: number[] = []
  for (let i = 0; i < TRAIL_SAMPLES; i++) {
    uvs.set([i / (TRAIL_SAMPLES - 1), 0, i / (TRAIL_SAMPLES - 1), 1], i * 4)
    if (i < TRAIL_SAMPLES - 1) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(index)

  const c = document.createElement('canvas')
  c.width = 128
  c.height = 16
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 128, 0)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 16)
  const vgrad = g.createLinearGradient(0, 0, 0, 16)
  vgrad.addColorStop(0, 'rgba(0,0,0,0.6)')
  vgrad.addColorStop(0.5, 'rgba(0,0,0,0)')
  vgrad.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = vgrad
  g.fillRect(0, 0, 128, 16)

  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    color: new THREE.Color(glow).lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(2.2),
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  return mesh
}

/**
 * A team's hero, driven by the Universal Animation Library clips: staggered idles so teammates never
 * move in sync, a jog between cells, a sword slash (with a glowing trail) when capturing, a fall when
 * captured, and a dance when celebrating.
 */
export default function LudoCharacter({
  color,
  pose,
  variant,
  onClick,
}: {
  color: LudoColor
  pose: CharacterPose
  /** Per-token index: offsets idle timing. */
  variant: number
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}) {
  const assets = useHeroAssets()
  const scene = useThree((s) => s.scene)
  const style = useCharacterStyle((st) => st.styleId)
  const hero = useMemo(() => buildHero(color, assets, style), [color, assets, style])
  const clips = useMemo(() => heroAnimations(assets, color), [assets, color])
  const glow = COLOR_GLOW[color]
  const sword = useMemo(() => makeSword(glow), [glow])
  const trail = useMemo(() => makeTrail(glow), [glow])

  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({})
  const currentRef = useRef<string>('')
  const attackStart = useRef(-1)
  const samples = useRef<THREE.Vector3[]>(Array.from({ length: TRAIL_SAMPLES * 2 }, () => new THREE.Vector3()))
  const scratch = useMemo(() => ({ base: new THREE.Vector3(), tip: new THREE.Vector3(), s: new THREE.Vector3() }), [])

  useEffect(() => {
    const hand = hero.hand
    if (!hand) return
    hand.add(sword)
    return () => {
      hand.remove(sword)
    }
  }, [hero, sword])

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(hero.root)
    mixerRef.current = mixer
    const actions: Record<string, THREE.AnimationAction> = {}
    for (const clip of clips) actions[clip.name] = mixer.clipAction(clip)
    actionsRef.current = actions
    currentRef.current = ''
    return () => {
      mixer.stopAllAction()
      mixerRef.current = null
    }
  }, [hero, clips])

  useEffect(() => {
    const actions = actionsRef.current
    const target =
      pose === 'walk' ? CLIP.run : pose === 'attack' ? CLIP.attack : pose === 'die' ? CLIP.death : pose === 'celebrate' ? CLIP.celebrate : CLIP.idle
    const next = actions[target] ?? actions[CLIP.idle]
    // a calm, weapon-free idle; the sword appears only for the capture strike itself
    sword.visible = pose === 'attack'
    if (pose === 'attack') attackStart.current = performance.now()
    if (!next || currentRef.current === target) return
    const prev = actions[currentRef.current]
    next.reset()
    if (ONE_SHOT.has(target)) {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity)
    }
    next.timeScale = target === CLIP.run ? 1.25 : target === CLIP.attack ? 1.15 : 1
    if (!prev) next.time = (variant * 0.61) % Math.max(0.1, next.getClip().duration)
    next.play()
    if (prev) next.crossFadeFrom(prev, target === CLIP.run ? 0.12 : target === CLIP.attack ? 0.08 : 0.25, false)
    currentRef.current = target
  }, [pose, variant, hero, sword])

  useFrame((_, delta) => {
    mixerRef.current?.update(Math.min(delta, 0.05))

    // Sword trail: sample the blade's base and tip in world space every frame of the slash.
    const mat = trail.material as THREE.MeshBasicMaterial
    if (!sword.visible || currentRef.current !== CLIP.attack) {
      mat.opacity = Math.max(0, mat.opacity - delta * 4)
      return
    }
    sword.updateWorldMatrix(true, false)
    const { base, tip, s } = scratch
    sword.getWorldScale(s)
    base.set(0, 0.25, 0).applyMatrix4(sword.matrixWorld)
    tip.set(0, 0.9, 0).applyMatrix4(sword.matrixWorld)
    const pts = samples.current
    const fresh = performance.now() - attackStart.current < 40
    for (let i = TRAIL_SAMPLES - 1; i > 0; i--) {
      pts[i * 2].copy(fresh ? base : pts[(i - 1) * 2])
      pts[i * 2 + 1].copy(fresh ? tip : pts[(i - 1) * 2 + 1])
    }
    pts[0].copy(base)
    pts[1].copy(tip)
    const pos = trail.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pts.length; i++) pos.setXYZ(i, pts[i].x, pts[i].y, pts[i].z)
    pos.needsUpdate = true
    const t = (performance.now() - attackStart.current) / 1000
    mat.opacity = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.6) * 2)
  })

  return (
    <>
      {/* true proportions: the old widening gave a chunky toy-figurine look */}
      <primitive object={hero.root} scale={hero.scale} onClick={onClick} />
      {createPortal(<primitive object={trail} />, scene)}
    </>
  )
}
