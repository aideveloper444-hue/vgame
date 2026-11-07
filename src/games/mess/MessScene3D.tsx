import { Suspense, useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import GameCanvas from '@/games/shared/three/GameCanvas'
import ProtagonistPawn from '@/games/shared/three/ProtagonistPawn'
import { useMessStore } from './messStore'
import { LANE_X, TRACK_HALF_LENGTH, TRACK_ZONES, ZONE_COLOR, ZONE_ICON, trackZ } from './messTrackData'

const SKIN_URLS = [
  '/models/ludo/protagonists/skins/skaterMaleA.png',
  '/models/ludo/protagonists/skins/cyborgFemaleA.png',
  '/models/ludo/protagonists/skins/skaterFemaleA.png',
  '/models/ludo/protagonists/skins/criminalMaleA.png',
]

function makeIconTexture(icon: string): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.font = `${size * 0.6}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, size / 2, size / 2 + 4)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function ZoneMarker({ zone }: { zone: (typeof TRACK_ZONES)[number] }) {
  const z = trackZ(zone.progress)
  const color = ZONE_COLOR[zone.type]
  const iconTexture = useMemo(() => makeIconTexture(ZONE_ICON[zone.type]), [zone.type])
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.2, 0.9]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} transparent opacity={0.55} />
      </mesh>
      <sprite position={[0, 0.9, 0]} scale={[0.7, 0.7, 0.7]}>
        <spriteMaterial map={iconTexture} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

function TrapMarker({ atProgress, id }: { atProgress: number; id: string }) {
  const iconTexture = useMemo(() => makeIconTexture('🕸️'), [])
  return (
    <group position={[0, 0, trackZ(atProgress)]} key={id}>
      <mesh position={[0, -0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={1.4} transparent opacity={0.7} />
      </mesh>
      <sprite position={[0, 0.6, 0]} scale={[0.5, 0.5, 0.5]}>
        <spriteMaterial map={iconTexture} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

function Track() {
  return (
    <group>
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[5.4, 0.3, TRACK_HALF_LENGTH * 2 + 2]} />
        <meshStandardMaterial color="#141a30" roughness={0.6} metalness={0.35} />
      </mesh>
      {LANE_X.slice(1).map((_, i) => {
        const x = (LANE_X[i] + LANE_X[i + 1]) / 2
        return (
          <mesh key={i} position={[x, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.03, TRACK_HALF_LENGTH * 2]} />
            <meshStandardMaterial color="#7c5cff" emissive="#7c5cff" emissiveIntensity={0.8} transparent opacity={0.5} />
          </mesh>
        )
      })}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 2.85, 0.15, 0]} castShadow>
          <boxGeometry args={[0.2, 0.5, TRACK_HALF_LENGTH * 2 + 2]} />
          <meshStandardMaterial color="#232c4a" emissive="#3a4270" emissiveIntensity={0.3} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`pillar-${side}`} position={[side * 2.85, 1.1, TRACK_HALF_LENGTH]} castShadow>
          <boxGeometry args={[0.3, 2.2, 0.3]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 2.05, TRACK_HALF_LENGTH]}>
        <boxGeometry args={[6, 0.25, 0.25]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, -0.02, -TRACK_HALF_LENGTH]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.2, 0.4]} />
        <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.6} />
      </mesh>
      {TRACK_ZONES.map((zone) => (
        <ZoneMarker key={zone.id} zone={zone} />
      ))}
    </group>
  )
}

function Racers() {
  const players = useMessStore((s) => s.players)
  return (
    <group>
      {players.map((p, i) => {
        const now = Date.now()
        const frozen = now < p.frozenUntil
        const reversed = now < p.reversedUntil
        const recentlyHit = now - p.lastHitAt < 380
        const pose = p.finished ? 'celebrate' : recentlyHit ? 'attack' : frozen ? 'idle' : 'walk'
        return (
          <group key={p.id} position={[LANE_X[i % LANE_X.length], 0, trackZ(p.progress)]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <ringGeometry args={[0.1, 0.13, 20]} />
              <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={2} transparent opacity={0.9} side={THREE.DoubleSide} />
            </mesh>
            <pointLight position={[0, 0.3, 0]} intensity={0.6} distance={0.9} color={p.color} />
            <ProtagonistPawn
              skinUrl={SKIN_URLS[i % SKIN_URLS.length]}
              tint={p.color}
              pose={pose}
              position={[0, 0, 0]}
              rotationY={reversed ? Math.PI : 0}
              scale={0.72}
            />
          </group>
        )
      })}
    </group>
  )
}

function Traps() {
  const traps = useMessStore((s) => s.traps)
  return (
    <group>
      {traps.map((t) => (
        <TrapMarker key={t.id} id={t.id} atProgress={t.atProgress} />
      ))}
    </group>
  )
}

export default function MessScene3D({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <GameCanvas
      className={className}
      cameraPosition={[0, 9.5, -13.5]}
      fov={54}
      transparent
      keyLightColor="#fff3e0"
      fillLightColor="#7fa8ff"
      bloomIntensity={0.5}
      vignetteDarkness={0.55}
    >
      <fog attach="fog" args={['#0c1226', 16, 32]} />
      <RoundedBox args={[6.2, 0.1, TRACK_HALF_LENGTH * 2 + 3]} radius={0.06} position={[0, -0.5, 0]} receiveShadow>
        <meshStandardMaterial color="#05070f" roughness={0.7} />
      </RoundedBox>
      <Track />
      <Traps />
      <Suspense fallback={null}>
        <Racers />
      </Suspense>
    </GameCanvas>
  )
}
