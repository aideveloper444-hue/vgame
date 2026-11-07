import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import GameCanvas from '@/games/shared/three/GameCanvas'
import { PROP_LIBRARY, type PropId } from './mysteryPropData'
import type { ThemeId } from './mysteryCaseData'

function makeIconTexture(icon: string, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.font = `${size * 0.62}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, size / 2, size / 2 + 4)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

const ROOM_THEME: Record<
  ThemeId,
  { wall: string; floor: string; trim: string; fog: string; ambient: string; furniture: PropId[]; backdrop: 'shelves' | 'paintings' | 'water' | 'pegboard' }
> = {
  murder: { wall: '#241f30', floor: '#2e2233', trim: '#4c1d95', fog: '#0d0b14', ambient: '#a78bfa', furniture: ['chest', 'torch', 'lantern'], backdrop: 'shelves' },
  theft: { wall: '#3a2a20', floor: '#463225', trim: '#92400e', fog: '#191410', ambient: '#f59e0b', furniture: ['chest', 'basket', 'lantern'], backdrop: 'paintings' },
  missing: { wall: '#123039', floor: '#1c4753', trim: '#0369a1', fog: '#08161b', ambient: '#38bdf8', furniture: ['barrel', 'basket', 'lantern'], backdrop: 'water' },
  sabotage: { wall: '#2c2620', floor: '#332b22', trim: '#c2410c', fog: '#120e0a', ambient: '#f97316', furniture: ['crate', 'barrel', 'torch'], backdrop: 'pegboard' },
}

const ROOM_WIDTH = 7.2
const ROOM_HALF = ROOM_WIDTH / 2
const WALL_Z = -3.1
const FRONT_Z = 2.3
const WALL_HEIGHT = 3

function PropMesh({ id }: { id: PropId }) {
  const def = PROP_LIBRARY[id]
  switch (id) {
    case 'lantern':
      return (
        <group>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.6, 6]} />
            <meshStandardMaterial color="#3f3f46" />
          </mesh>
          <mesh position={[0, 0.62, 0]} castShadow>
            <sphereGeometry args={[0.17, 12, 12]} />
            <meshStandardMaterial color={def.color} emissive={def.color} emissiveIntensity={1.4} />
          </mesh>
          <pointLight position={[0, 0.62, 0]} intensity={0.8} distance={2} color={def.color} />
        </group>
      )
    case 'crate':
      return (
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={def.color} roughness={0.85} />
        </mesh>
      )
    case 'barrel':
      return (
        <group>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.28, 0.6, 14]} />
            <meshStandardMaterial color={def.color} roughness={0.8} />
          </mesh>
          {[0.15, 0.45].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <torusGeometry args={[0.27, 0.025, 8, 20]} rotation-x={Math.PI / 2} />
              <meshStandardMaterial color={def.accent} metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )
    case 'torch':
      return (
        <group>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.7, 6]} />
            <meshStandardMaterial color="#57534e" />
          </mesh>
          <mesh position={[0, 0.75, 0]}>
            <coneGeometry args={[0.13, 0.32, 10]} />
            <meshStandardMaterial color={def.color} emissive={def.color} emissiveIntensity={1.6} />
          </mesh>
          <pointLight position={[0, 0.8, 0]} intensity={1} distance={2} color={def.color} />
        </group>
      )
    case 'chest':
      return (
        <group>
          <mesh position={[0, 0.16, 0]} castShadow>
            <boxGeometry args={[0.55, 0.32, 0.4]} />
            <meshStandardMaterial color={def.color} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.36, -0.05]} rotation={[-0.35, 0, 0]} castShadow>
            <boxGeometry args={[0.55, 0.18, 0.4]} />
            <meshStandardMaterial color={def.accent} roughness={0.6} metalness={0.2} />
          </mesh>
        </group>
      )
    case 'basket':
      return (
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.17, 0.32, 12]} />
          <meshStandardMaterial color={def.color} roughness={0.9} />
        </mesh>
      )
    default:
      return null
  }
}

function Room({ theme }: { theme: ThemeId }) {
  const cfg = ROOM_THEME[theme]
  return (
    <group>
      <mesh position={[0, 0, (WALL_Z + FRONT_Z) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_WIDTH, FRONT_Z - WALL_Z]} />
        <meshStandardMaterial color={cfg.floor} roughness={0.9} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT / 2, WALL_Z]} receiveShadow>
        <planeGeometry args={[ROOM_WIDTH, WALL_HEIGHT]} />
        <meshStandardMaterial color={cfg.wall} roughness={0.95} />
      </mesh>
      <mesh position={[-ROOM_HALF, WALL_HEIGHT / 2, (WALL_Z + FRONT_Z) / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[FRONT_Z - WALL_Z, WALL_HEIGHT]} />
        <meshStandardMaterial color={cfg.wall} roughness={0.95} />
      </mesh>
      <mesh position={[ROOM_HALF, WALL_HEIGHT / 2, (WALL_Z + FRONT_Z) / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[FRONT_Z - WALL_Z, WALL_HEIGHT]} />
        <meshStandardMaterial color={cfg.wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.01, WALL_Z + 1.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 1.6]} />
        <meshStandardMaterial color={cfg.trim} transparent opacity={0.14} />
      </mesh>
    </group>
  )
}

function Backdrop({ theme }: { theme: ThemeId }) {
  const cfg = ROOM_THEME[theme]
  const x = -1.9
  if (cfg.backdrop === 'shelves') {
    return (
      <group position={[x, 0, WALL_Z + 0.08]}>
        {[-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * 0.75, 1.3, 0]} castShadow>
            <boxGeometry args={[0.6, 2.4, 0.28]} />
            <meshStandardMaterial color="#3f2d1c" roughness={0.85} />
          </mesh>
        ))}
        {[-1, 0, 1].map((i) =>
          [0.5, 1, 1.5, 2].map((y) => (
            <mesh key={`${i}-${y}`} position={[i * 0.75, y, 0.16]}>
              <boxGeometry args={[0.5, 0.16, 0.08]} />
              <meshStandardMaterial color={y % 1 === 0 ? '#7c2d12' : '#1e3a8a'} roughness={0.7} />
            </mesh>
          )),
        )}
      </group>
    )
  }
  if (cfg.backdrop === 'paintings') {
    return (
      <group position={[x, 1.7, WALL_Z + 0.05]}>
        {[-1, 0, 1].map((i) => (
          <group key={i} position={[i * 0.85, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.6, 0.75, 0.05]} />
              <meshStandardMaterial color="#ca8a04" metalness={0.4} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[0.48, 0.62]} />
              <meshStandardMaterial color={i === 0 ? '#164e63' : '#7c2d12'} />
            </mesh>
          </group>
        ))}
      </group>
    )
  }
  if (cfg.backdrop === 'water') {
    return (
      <group position={[x, 0, WALL_Z + 0.05]}>
        <mesh position={[0, 0.9, 0]}>
          <planeGeometry args={[3.2, 1.8]} />
          <meshStandardMaterial color="#075985" emissive="#0369a1" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0.4, 1.1, 0.05]} rotation={[0, 0, 0.05]}>
          <boxGeometry args={[0.9, 0.35, 0.05]} />
          <meshStandardMaterial color="#1c1917" />
        </mesh>
        <mesh position={[0.4, 1.4, 0.05]} rotation={[0, 0, 0.05]}>
          <coneGeometry args={[0.02, 0.5, 4]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
      </group>
    )
  }
  // pegboard
  return (
    <group position={[x, 1.5, WALL_Z + 0.06]}>
      <mesh>
        <planeGeometry args={[2.6, 1.6]} />
        <meshStandardMaterial color="#44403c" roughness={0.9} />
      </mesh>
      {['🔧', '🔨', '🪛', '⚙️'].map((icon, i) => {
        const tex = makeIconTexture(icon)
        return (
          <sprite key={icon + i} position={[-0.9 + i * 0.6, 0.2, 0.05]} scale={[0.4, 0.4, 0.4]}>
            <spriteMaterial map={tex} transparent depthWrite={false} />
          </sprite>
        )
      })}
    </group>
  )
}

function Furniture({ theme }: { theme: ThemeId }) {
  const cfg = ROOM_THEME[theme]
  const positions: [number, number][] = [
    [1.6, -1.4],
    [2.4, 0.2],
    [1.3, 1.2],
  ]
  return (
    <group>
      {cfg.furniture.map((id, i) => (
        <group key={id + i} position={[positions[i][0], 0, positions[i][1]]}>
          <PropMesh id={id} />
        </group>
      ))}
    </group>
  )
}

interface BoardRowItem {
  id: string
  emoji: string
  ruledOut: boolean
}

function BoardPortrait({ item, x, y, hubX }: { item: BoardRowItem; x: number; y: number; hubX: number }) {
  const tex = useMemo(() => makeIconTexture(item.emoji), [item.emoji])
  return (
    <group>
      {item.ruledOut && (
        <Line points={[[hubX, y, 0.05] as [number, number, number], [x, y, 0.05] as [number, number, number]]} color="#ef4444" lineWidth={1.4} />
      )}
      <mesh position={[x, y, 0.035]}>
        <circleGeometry args={[0.05, 12]} />
        <meshStandardMaterial color={item.ruledOut ? '#7f1d1d' : '#f8fafc'} />
      </mesh>
      <sprite position={[x, y, 0.05]} scale={[0.36, 0.36, 0.36]}>
        <spriteMaterial map={tex} transparent depthWrite={false} opacity={item.ruledOut ? 0.35 : 1} />
      </sprite>
    </group>
  )
}

function BoardRow({ items, y, hubX }: { items: BoardRowItem[]; y: number; hubX: number }) {
  const spacing = 0.5
  const startX = hubX + 0.55
  return (
    <group>
      <mesh position={[hubX, y, 0.04]}>
        <circleGeometry args={[0.08, 16]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.6} />
      </mesh>
      {items.map((item, i) => (
        <BoardPortrait key={item.id} item={item} x={startX + i * spacing} y={y} hubX={hubX} />
      ))}
    </group>
  )
}

export interface CorkboardData {
  suspects: BoardRowItem[]
  items: BoardRowItem[]
  locations: BoardRowItem[]
}

function Corkboard({ data }: { data: CorkboardData }) {
  const boardX = 1.9
  return (
    <group position={[boardX, 1.65, WALL_Z + 0.06]}>
      <mesh>
        <planeGeometry args={[2.7, 2]} />
        <meshStandardMaterial color="#8a6640" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[2.56, 1.86]} />
        <meshStandardMaterial color="#a9835a" roughness={0.95} />
      </mesh>
      <BoardRow items={data.suspects} y={0.65} hubX={-1.1} />
      <BoardRow items={data.items} y={0} hubX={-1.1} />
      <BoardRow items={data.locations} y={-0.65} hubX={-1.1} />
    </group>
  )
}

interface MysteryScene3DProps {
  className?: string
  theme: ThemeId
  corkboard?: CorkboardData
}

export default function MysteryScene3D({ className = 'h-full w-full', theme, corkboard }: MysteryScene3DProps) {
  const cfg = ROOM_THEME[theme]

  return (
    <GameCanvas
      className={className}
      cameraPosition={[0, 2.9, 6.4]}
      fov={46}
      transparent
      glow={false}
      keyLightColor="#fff3d6"
      fillLightColor={cfg.ambient}
    >
      <fog attach="fog" args={[cfg.fog, 9, 18]} />
      <Room theme={theme} />
      <Backdrop theme={theme} />
      <Furniture theme={theme} />
      {corkboard && <Corkboard data={corkboard} />}
    </GameCanvas>
  )
}
