import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Evidence } from './mysteryCaseData'

// One realistic room at a time: Poly Haven CC0 furniture and PBR surfaces (see
// public/models/mystery/LICENSE.txt), lit by warm lamps with real shadows.
const W = 6
const D = 5
const M = '/models/mystery/'
const T = '/textures/mystery/'

type V3 = [number, number, number]

interface Prop {
  model: string
  pos: V3
  rot?: number
  scale?: number
  /** Pick one object out of a model that ships as a set. */
  node?: string
  /** Hang from the ceiling / wall instead of standing on the floor. */
  hang?: boolean
  tilt?: V3
}

interface Lamp {
  pos: V3
  color: string
  intensity: number
  shadow?: boolean
}

interface RoomDef {
  floor: string
  wall: string
  /** Lower wall panelling texture (wainscot), if any. */
  panel?: string
  floorRepeat: number
  wallRepeat: number
  height: number
  outdoor?: boolean
  water?: boolean
  glass?: boolean
  rug?: { pos: V3; size: [number, number]; color: string; border: string }
  window?: 'left' | 'right'
  props: Prop[]
  lamps: Lamp[]
  /** Where evidence can sit (4 spots). */
  anchors: V3[]
  ambient: number
}

const ROOMS: Record<string, RoomDef> = {
  library: {
    floor: 'herringbone_parquet',
    wall: 'beige_wall_001',
    panel: 'brown_planks_03',
    floorRepeat: 3,
    wallRepeat: 2,
    height: 3,
    window: 'right',
    rug: { pos: [-0.6, 0, 0.3], size: [3.2, 2.2], color: '#6b1d24', border: '#c9a54a' },
    props: [
      { model: 'wooden_bookshelf_worn', pos: [-2.05, 0, -2.2] },
      { model: 'wooden_bookshelf_worn', pos: [-0.62, 0, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-2.10, 0.42, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-1.72, 0.42, -2.2], rot: 0.0 },
      { model: 'book_encyclopedia_set_01', pos: [-2.35, 0.78, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-2.10, 1.14, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-1.72, 1.14, -2.2], rot: 0.0 },
      { model: 'book_encyclopedia_set_01', pos: [-2.35, 1.5, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-0.67, 0.42, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-0.29, 0.42, -2.2], rot: 0.0 },
      { model: 'book_encyclopedia_set_01', pos: [-0.92, 0.78, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-0.67, 1.14, -2.2] },
      { model: 'book_encyclopedia_set_01', pos: [-0.29, 1.14, -2.2], rot: 0.0 },
      { model: 'book_encyclopedia_set_01', pos: [-0.92, 1.5, -2.2] },
      { model: 'fancy_picture_frame_01', pos: [1.4, 1.75, -2.48], hang: true },
      { model: 'ArmChair_01', pos: [1.2, 0, -0.9], rot: -0.7 },
      { model: 'side_table_01', pos: [2.05, 0, -1.55] },
      { model: 'vintage_oil_lamp', pos: [2.1, 0.55, -1.6] },
      { model: 'Sofa_01', pos: [-2.55, 0, 0.6], rot: Math.PI / 2 },
      { model: 'coffee_table_round_01', pos: [-1.2, 0, 0.55] },
      { model: 'mantel_clock_01', pos: [-1.35, 0.49, 0.45], rot: 0.5 },
      { model: 'Chandelier_01', pos: [-0.3, 3, -0.3], hang: true },
    ],
    lamps: [
      { pos: [-0.3, 2.1, -0.3], color: '#ffd9a0', intensity: 9, shadow: true },
      { pos: [2.1, 1.1, -1.55], color: '#ffc27a', intensity: 3.5 },
    ],
    anchors: [[-1.0, 0.52, 0.72], [1.95, 0.58, -1.35], [0.35, 0.03, 0.75], [-2.5, 0.46, 1.05]],
    ambient: 0.18,
  },
  study: {
    floor: 'dark_wooden_planks',
    wall: 'brown_planks_03',
    floorRepeat: 3,
    wallRepeat: 3,
    height: 3,
    window: 'left',
    rug: { pos: [0.4, 0, -0.2], size: [2.6, 2.0], color: '#1f3a5a', border: '#d6b36a' },
    props: [
      { model: 'vintage_cabinet_01', pos: [-1.35, 0, -2.15] },
      { model: 'ClassicConsole_01', pos: [1.2, 0, -2.2] },
      { model: 'desk_lamp_arm_01', pos: [1.75, 0.95, -2.25], rot: -0.4 },
      { model: 'GreenChair_01', pos: [1.1, 0, -1.4], rot: Math.PI - 0.2 },
      { model: 'vintage_grandfather_clock_01', pos: [2.55, 0, -2.2] },
      { model: 'hanging_picture_frame_01', pos: [-2.97, 1.8, 0.2], rot: Math.PI / 2, hang: true },
      { model: 'book_encyclopedia_set_01', pos: [0.55, 0.95, -2.3], scale: 0.9 },
      { model: 'Chandelier_01', pos: [0.2, 3, -0.4], hang: true },
    ],
    lamps: [
      { pos: [0.2, 2.1, -0.4], color: '#ffd9a0', intensity: 8, shadow: true },
      { pos: [1.7, 1.35, -2.0], color: '#ffe3b0', intensity: 4 },
    ],
    anchors: [[0.85, 0.97, -2.05], [-1.3, 0.03, -1.35], [1.1, 0.5, -1.35], [-0.6, 0.03, 0.8]],
    ambient: 0.16,
  },
  kitchen: {
    floor: 'floor_tiles_06',
    wall: 'long_white_tiles',
    floorRepeat: 4,
    wallRepeat: 3,
    height: 3,
    window: 'right',
    props: [
      { model: 'painted_wooden_cabinet', pos: [-1.95, 0, -2.18] },
      { model: 'painted_wooden_cabinet', pos: [-0.72, 0, -2.18] },
      { model: 'pot_enamel_01', pos: [-2.1, 1.18, -2.2] },
      { model: 'jug_01', pos: [-0.5, 1.18, -2.2], rot: 0.6 },
      { model: 'WoodenTable_03', pos: [0.8, 0, -0.5] },
      { model: 'wooden_cutting_board', pos: [0.55, 0.83, -0.55], rot: 0.3 },
      { model: 'yellow_onion', pos: [0.6, 0.87, -0.5] },
      { model: 'brass_pan_01', pos: [1.25, 0.83, -0.4], rot: 1.2 },
      { model: 'wicker_basket_01', pos: [0.25, 0.83, -0.65] },
      { model: 'GreenChair_01', pos: [0.8, 0, 0.3], rot: Math.PI },
      { model: 'hanging_industrial_lamp', pos: [0.8, 3, -0.5], hang: true },
      { model: 'painted_wooden_cabinet', pos: [-2.68, 0, -0.35], rot: Math.PI / 2 },
      { model: 'potted_plant_04', pos: [-2.7, 1.18, -0.6] },
      { model: 'wicker_basket_02', pos: [-2.7, 1.18, 0.0] },
      { model: 'wooden_bucket_01', pos: [2.55, 0, -2.2] },
      { model: 'wicker_basket_02', pos: [1.9, 0, -2.25], rot: 0.4 },
      { model: 'pot_enamel_01', pos: [1.05, 0.83, -0.7], rot: 0.8 },
    ],
    lamps: [{ pos: [0.8, 1.75, -0.5], color: '#ffe2b8', intensity: 12, shadow: true }],
    anchors: [[0.95, 0.86, -0.35], [-1.35, 1.2, -2.2], [2.0, 0.03, -1.3], [-2.2, 0.03, 0.4]],
    ambient: 0.25,
  },
  garden: {
    floor: 'leafy_grass',
    wall: 'brick_wall_001',
    floorRepeat: 4,
    wallRepeat: 3,
    height: 2.2,
    outdoor: true,
    props: [
      { model: 'shrub_02', node: 'shrub_02_b', pos: [-1.7, 0, -1.85] },
      { model: 'shrub_02', node: 'shrub_02_a', pos: [1.9, 0, -1.8] },
      { model: 'painted_wooden_bench', pos: [0.1, 0, -1.8] },
      { model: 'street_lamp_01', pos: [-2.6, 0, -2.15] },
      { model: 'potted_plant_01', pos: [2.45, 0, 0.3] },
      { model: 'potted_plant_02', pos: [-2.35, 0, 0.7] },
      { model: 'garden_gnome', pos: [1.0, 0, -1.2], rot: -0.4 },
      { model: 'planter_box_01', pos: [2.55, 0, -0.9], rot: -Math.PI / 2 },
      { model: 'watering_can_metal_01', pos: [0.9, 0, 0.9], rot: 0.8 },
    ],
    lamps: [
      { pos: [-2.6, 3.5, -2.0], color: '#ffcf8a', intensity: 22, shadow: true },
      { pos: [2, 5, 3], color: '#8fb3ff', intensity: 6 },
    ],
    anchors: [[0.45, 0.47, -1.75], [1.45, 0.03, -0.75], [2.55, 0.45, -0.9], [-0.8, 0.03, 0.8]],
    ambient: 0.22,
  },
  cellar: {
    floor: 'cobblestone_floor_06',
    wall: 'castle_brick_07',
    floorRepeat: 3,
    wallRepeat: 2,
    height: 2.6,
    props: [
      { model: 'wooden_barrels_01', node: 'wooden_barrels_01_barrel01', pos: [-2.4, 0, -2.05] },
      { model: 'wooden_barrels_01', node: 'wooden_barrels_01_barrel02', pos: [-1.55, 0, -2.1] },
      { model: 'wine_barrel_01', pos: [2.35, 0, -2.0] },
      { model: 'wooden_crate_01', pos: [1.1, 0, -2.2] },
      { model: 'wooden_crate_02', pos: [2.45, 0, -0.35], rot: Math.PI / 2 },
      { model: 'wine_bottles_01', node: 'wine_bottles_01_bordeaux', pos: [0.9, 0.35, -2.2] },
      { model: 'wine_bottles_01', node: 'wine_bottles_01_champagne', pos: [1.05, 0.35, -2.15] },
      { model: 'Lantern_01', pos: [2.35, 0.87, -2.0] },
      { model: 'wooden_barrels_01', node: 'wooden_barrels_01_barrel02', pos: [-2.4, 0, -1.15] },
      { model: 'wooden_crate_01', pos: [-0.35, 0, -2.2], rot: 0.1 },
      { model: 'wooden_crate_02', pos: [-0.35, 0.35, -2.15], rot: Math.PI / 2 },
      { model: 'wooden_bucket_01', pos: [1.6, 0, -1.3] },
      { model: 'wine_bottles_01', node: 'wine_bottles_01_burgundy', pos: [-2.35, 0.92, -1.1] },
      { model: 'hanging_industrial_lamp', pos: [0, 2.6, -0.6], hang: true },
    ],
    lamps: [
      { pos: [0, 1.4, -0.6], color: '#ffc27a', intensity: 9, shadow: true },
      { pos: [2.35, 1.1, -1.9], color: '#ffae5c', intensity: 3 },
    ],
    anchors: [[1.4, 0.37, -2.15], [-1.55, 0.95, -2.1], [0.2, 0.03, 0.6], [2.45, 0.48, -0.05]],
    ambient: 0.12,
  },
  attic: {
    floor: 'old_planks_02',
    wall: 'brown_planks_05',
    floorRepeat: 3,
    wallRepeat: 3,
    height: 2.6,
    window: 'left',
    props: [
      { model: 'treasure_chest', pos: [-1.85, 0, -2.0], rot: 0.15 },
      { model: 'vintage_suitcase', pos: [1.5, 0, -2.25] },
      { model: 'Rockingchair_01', pos: [0.5, 0, -0.9], rot: -0.5 },
      { model: 'ornate_mirror_01', pos: [-2.93, 1.05, 0.4], rot: Math.PI / 2, hang: true },
      { model: 'old_bed_frame', pos: [2.45, 0, 0.5] },
      { model: 'wooden_ladder', pos: [-0.35, 0, -2.2] },
      { model: 'vintage_oil_lamp', pos: [-1.6, 0.62, -2.0] },
      { model: 'wooden_crate_02', pos: [-2.4, 0, -0.6], rot: 0.1 },
    ],
    lamps: [
      { pos: [-1.6, 1.25, -1.9], color: '#ffb866', intensity: 6, shadow: true },
      { pos: [0.4, 1.7, 0.6], color: '#ffd9a0', intensity: 2.2 },
    ],
    anchors: [[-1.35, 0.03, -1.35], [1.1, 0.58, -2.2], [0.55, 0.47, -0.85], [-0.8, 0.03, 0.85]],
    ambient: 0.14,
  },
  dock: {
    floor: 'oak_wood_planks',
    wall: 'brown_planks_05',
    floorRepeat: 3,
    wallRepeat: 3,
    height: 2.8,
    water: true,
    outdoor: true,
    props: [
      { model: 'old_military_crate', pos: [-1.7, 0, -1.5], rot: 0.2 },
      { model: 'wooden_crate_01', pos: [1.5, 0, -1.9] },
      { model: 'wooden_barrels_01', node: 'wooden_barrels_01_barrel01', pos: [2.4, 0, -0.5] },
      { model: 'lifebuoy', pos: [-2.95, 1.5, 0.2], rot: Math.PI / 2, hang: true },
      { model: 'wooden_lantern_01', pos: [1.5, 0.35, -1.9] },
      { model: 'wooden_bucket_01', pos: [0.35, 0, -1.25] },
      { model: 'seadogs_compass', pos: [-1.9, 0.3, -1.45], scale: 1.4 },
    ],
    lamps: [
      { pos: [1.5, 1.2, -1.8], color: '#ffb866', intensity: 7, shadow: true },
      { pos: [-3, 6, -8], color: '#9ab8ff', intensity: 30 },
    ],
    anchors: [[-1.35, 0.32, -1.35], [0.8, 0.03, -0.95], [2.4, 0.95, -0.5], [-0.6, 0.03, 0.85]],
    ambient: 0.2,
  },
  greenhouse: {
    floor: 'brick_floor_003',
    wall: 'brick_wall_001',
    floorRepeat: 4,
    wallRepeat: 3,
    height: 3,
    glass: true,
    props: [
      { model: 'WoodenTable_03', pos: [-1.6, 0, -2.15] },
      { model: 'calathea_orbifolia_01', node: 'calathea_orbifolia_01_b', pos: [-2.0, 0.83, -2.2] },
      { model: 'potted_plant_04', pos: [-1.35, 0.83, -2.15] },
      { model: 'planter_pot_clay', pos: [-1.0, 0.83, -2.2] },
      { model: 'planter_box_02', pos: [1.5, 0, -2.2] },
      { model: 'anthurium_botany_01', node: 'anthurium_botany_01_a', pos: [1.45, 0.45, -2.2], scale: 0.8 },
      { model: 'potted_plant_01', pos: [2.5, 0, 0.35] },
      { model: 'anthurium_botany_01', node: 'anthurium_botany_01_c', pos: [-2.45, 0, 0.5] },
      { model: 'wicker_basket_02', pos: [0.55, 0, -1.1] },
      { model: 'watering_can_metal_01', pos: [-0.6, 0, 0.55], rot: -0.6 },
      { model: 'potted_plant_02', pos: [-2.4, 0, -0.9] },
      { model: 'planter_box_01', pos: [2.55, 0, -1.0], rot: -Math.PI / 2 },
      { model: 'anthurium_botany_01', node: 'anthurium_botany_01_b', pos: [2.55, 0.42, -1.0], scale: 0.7 },
      { model: 'calathea_orbifolia_01', node: 'calathea_orbifolia_01_a', pos: [1.2, 0, 0.25] },
      { model: 'potted_plant_04', pos: [-1.9, 0.83, -2.0] },
      { model: 'calathea_orbifolia_01', node: 'calathea_orbifolia_01_c', pos: [-0.4, 0, -2.2], scale: 0.9 },
    ],
    lamps: [
      { pos: [0, 2.6, -0.5], color: '#e8f3ff', intensity: 10, shadow: true },
      { pos: [2, 5, 3], color: '#8fb3ff', intensity: 6 },
    ],
    anchors: [[-1.25, 0.86, -2.05], [1.9, 0.47, -2.2], [0.55, 0.22, -1.1], [0.2, 0.03, 0.9]],
    ambient: 0.22,
  },
}

export const ROOM_MODEL_URLS = (id: string) => [...new Set((ROOMS[id] ?? ROOMS.study).props.map((p) => `${M}${p.model}.glb`))]

/* ---------------------------------------------------------------- surfaces */

function useSurface(name: string, repeatX: number, repeatY: number) {
  const [diff, nor, rough] = useTexture([`${T}${name}_diff.webp`, `${T}${name}_nor.webp`, `${T}${name}_rough.webp`])
  return useMemo(() => {
    const set = (t: THREE.Texture, srgb: boolean) => {
      const c = t.clone()
      c.wrapS = c.wrapT = THREE.RepeatWrapping
      c.repeat.set(repeatX, repeatY)
      c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      c.anisotropy = 8
      c.needsUpdate = true
      return c
    }
    // the scanned roughness maps make polished floors mirror the lamps into a hard glare; a flat satin
    // finish keeps the surface detail from the normal map without the hotspot
    void rough
    return { map: set(diff, true), normalMap: set(nor, false) }
  }, [diff, nor, rough, repeatX, repeatY])
}

function Surface({ name, size, repeat, position, rotation, tint }: { name: string; size: [number, number]; repeat: [number, number]; position: V3; rotation: V3; tint?: string }) {
  const maps = useSurface(name, repeat[0], repeat[1])
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial {...maps} color={tint ?? '#ffffff'} roughness={0.72} normalScale={new THREE.Vector2(0.8, 0.8)} />
    </mesh>
  )
}

function Rug({ def }: { def: NonNullable<RoomDef['rug']> }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 352
    const g = c.getContext('2d')!
    g.fillStyle = def.color
    g.fillRect(0, 0, 512, 352)
    g.strokeStyle = def.border
    g.lineWidth = 14
    g.strokeRect(18, 18, 476, 316)
    g.lineWidth = 4
    g.strokeRect(40, 40, 432, 272)
    g.globalAlpha = 0.5
    for (let i = 0; i < 5; i++) {
      g.beginPath()
      g.ellipse(256, 176, 40 + i * 34, 26 + i * 22, 0, 0, Math.PI * 2)
      g.stroke()
    }
    g.globalAlpha = 0.18
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = i % 2 ? '#000' : '#fff'
      g.fillRect((i * 7919) % 512, (i * 104729) % 352, 2, 2)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [def.color, def.border])
  return (
    <mesh position={[def.pos[0], 0.006, def.pos[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={def.size} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  )
}

function NightWindow({ side, height }: { side: 'left' | 'right'; height: number }) {
  const x = side === 'left' ? -W / 2 + 0.02 : W / 2 - 0.02
  const rot = side === 'left' ? Math.PI / 2 : -Math.PI / 2
  const sky = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#0b1633')
    grad.addColorStop(1, '#2a3f73')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 256)
    g.fillStyle = '#e8eeff'
    for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 128, (i * 97) % 180, 1.5, 1.5)
    g.beginPath()
    g.arc(88, 60, 16, 0, Math.PI * 2)
    g.fill()
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const y = Math.min(1.6, height / 2 + 0.1)
  return (
    <group position={[x, y, -0.6]} rotation={[0, rot, 0]}>
      <mesh>
        <planeGeometry args={[1.1, 1.5]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      {[
        [0, 0.78, 1.26, 0.08],
        [0, -0.78, 1.26, 0.08],
        [-0.6, 0, 0.08, 1.6],
        [0.6, 0, 0.08, 1.6],
        [0, 0, 0.04, 1.5],
        [0, 0, 1.1, 0.04],
      ].map(([px, py, w, h], i) => (
        <mesh key={i} position={[px, py, 0.03]} castShadow>
          <boxGeometry args={[w, h, 0.06]} />
          <meshStandardMaterial color="#e8e2d6" roughness={0.6} />
        </mesh>
      ))}
      {[-0.82, 0.82].map((px) => (
        <mesh key={px} position={[px, -0.05, 0.08]} castShadow>
          <boxGeometry args={[0.36, 1.9, 0.06]} />
          <meshStandardMaterial color="#5b1a24" roughness={0.95} />
        </mesh>
      ))}
      <pointLight position={[0, 0, 0.5]} color="#7d9bff" intensity={1.2} distance={3} />
    </group>
  )
}

function Shell({ def }: { def: RoomDef }) {
  // a greenhouse only has a low brick base; glass panes carry the walls up to the roof
  const H = def.glass ? 0.8 : def.height
  const panelH = 1.0
  return (
    <group>
      <Surface name={def.floor} size={[W, D]} repeat={[def.floorRepeat, (def.floorRepeat * D) / W]} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {!def.water && (
        <Surface name={def.wall} size={[W, H]} repeat={[def.wallRepeat, (def.wallRepeat * H) / W]} position={[0, H / 2, -D / 2]} rotation={[0, 0, 0]} />
      )}
      {[-1, 1].map((s) => (
        <Surface key={s} name={def.wall} size={[D, H]} repeat={[(def.wallRepeat * D) / W, (def.wallRepeat * H) / W]} position={[(s * W) / 2, H / 2, 0]} rotation={[0, -s * (Math.PI / 2), 0]} tint="#e9e4dc" />
      ))}
      {def.panel && (
        <>
          <Surface name={def.panel} size={[W, panelH]} repeat={[3, 0.5]} position={[0, panelH / 2, -D / 2 + 0.01]} rotation={[0, 0, 0]} />
          {[-1, 1].map((s) => (
            <Surface key={s} name={def.panel!} size={[D, panelH]} repeat={[2.5, 0.5]} position={[(s * (W / 2 - 0.01)), panelH / 2, 0]} rotation={[0, -s * (Math.PI / 2), 0]} />
          ))}
          <mesh position={[0, panelH + 0.02, -D / 2 + 0.03]} castShadow>
            <boxGeometry args={[W, 0.05, 0.05]} />
            <meshStandardMaterial color="#3b2616" roughness={0.5} />
          </mesh>
        </>
      )}
      {!def.outdoor && !def.glass && (
        <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial color="#8f877c" roughness={0.95} />
        </mesh>
      )}
      {!def.outdoor && (
        <>
          <mesh position={[0, 0.06, -D / 2 + 0.02]}>
            <boxGeometry args={[W, 0.12, 0.03]} />
            <meshStandardMaterial color="#2a1c12" roughness={0.6} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * (W / 2 - 0.015)), 0.06, 0]}>
              <boxGeometry args={[0.03, 0.12, D]} />
              <meshStandardMaterial color="#2a1c12" roughness={0.6} />
            </mesh>
          ))}
        </>
      )}
      {def.glass && (
        <group>
          {[
            { p: [0, 1.9, -D / 2 + 0.03] as V3, r: [0, 0, 0] as V3, w: W },
            { p: [-W / 2 + 0.03, 1.9, 0] as V3, r: [0, Math.PI / 2, 0] as V3, w: D },
            { p: [W / 2 - 0.03, 1.9, 0] as V3, r: [0, -Math.PI / 2, 0] as V3, w: D },
          ].map((g, i) => (
            <group key={i} position={g.p} rotation={g.r}>
              <mesh>
                <planeGeometry args={[g.w, 2.2]} />
                <meshPhysicalMaterial color="#cfe9ff" transmission={0.3} transparent opacity={0.35} roughness={0.1} metalness={0} />
              </mesh>
              {Array.from({ length: Math.round(g.w / 0.75) + 1 }, (_, k) => (
                <mesh key={k} position={[-g.w / 2 + k * 0.75, 0, 0.02]}>
                  <boxGeometry args={[0.05, 2.2, 0.05]} />
                  <meshStandardMaterial color="#f1efe9" roughness={0.5} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      )}
      {def.water && (
        <>
          <mesh position={[0, -0.25, -D / 2 - 6]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[40, 12]} />
            <meshStandardMaterial color="#0b2438" roughness={0.12} metalness={0.7} />
          </mesh>
          {[-2.6, -0.9, 0.9, 2.6].map((x) => (
            <mesh key={x} position={[x, 0.45, -D / 2 + 0.08]} castShadow>
              <cylinderGeometry args={[0.07, 0.08, 1.4, 12]} />
              <meshStandardMaterial color="#4a3525" roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.9, -D / 2 + 0.08]}>
            <boxGeometry args={[W, 0.05, 0.05]} />
            <meshStandardMaterial color="#6b4f33" roughness={0.9} />
          </mesh>
        </>
      )}
      {def.rug && <Rug def={def.rug} />}
      {def.window && <NightWindow side={def.window} height={H} />}
    </group>
  )
}

/* ---------------------------------------------------------------- props */

function PropModel({ prop }: { prop: Prop }) {
  const { scene } = useGLTF(`${M}${prop.model}.glb`)
  const object = useMemo(() => {
    let src: THREE.Object3D = scene
    if (prop.node) src = scene.getObjectByName(prop.node) ?? scene
    const clone = src.clone(true)
    clone.position.set(0, 0, 0)
    clone.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(clone)
    const holder = new THREE.Group()
    // stand it on the floor (or hang it from its own top) with its footprint centered on the prop position
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    clone.position.set(-cx, prop.hang ? -box.max.y : -box.min.y, -cz)
    if (prop.hang && prop.model.includes('frame')) clone.position.y = -(box.min.y + box.max.y) / 2
    if (prop.hang && (prop.model.includes('mirror') || prop.model.includes('lifebuoy'))) clone.position.y = -(box.min.y + box.max.y) / 2
    holder.add(clone)
    clone.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    return holder
  }, [scene, prop])
  return <primitive object={object} position={prop.pos} rotation={prop.tilt ?? [0, prop.rot ?? 0, 0]} scale={prop.scale ?? 1} />
}

/* ---------------------------------------------------------------- evidence sparkles */

function sparkleTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.15, 'rgba(255,240,200,0.9)')
  grad.addColorStop(0.4, 'rgba(255,210,120,0.25)')
  grad.addColorStop(1, 'rgba(255,200,100,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(255,255,255,0.95)'
  for (const [w, h] of [
    [4, 120],
    [120, 4],
  ]) {
    g.beginPath()
    g.ellipse(64, 64, w / 2, h / 2, 0, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let sparkleTex: THREE.Texture | null = null

export interface RoomEvidence extends Evidence {
  found: boolean
}

function Sparkle({ ev, pos, onInspect }: { ev: RoomEvidence; pos: V3; onInspect: (ev: RoomEvidence) => void }) {
  sparkleTex ??= sparkleTexture()
  const ref = useRef<THREE.Sprite>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const seed = useMemo(() => [...ev.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 10, [ev.id])
  useFrame((state) => {
    const t = state.clock.elapsedTime + seed
    if (ref.current) {
      const k = ev.found ? 0.18 : 0.42 + Math.max(0, Math.sin(t * 3)) * 0.22
      ref.current.scale.set(k, k, 1)
      ref.current.material.rotation = t * 0.8
      ref.current.material.opacity = ev.found ? 0.35 : 1
    }
    if (ringRef.current) {
      const p = (t * 0.7) % 1
      ringRef.current.scale.setScalar(ev.found ? 1 : 0.6 + p * 0.8)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = ev.found ? 0.5 : (1 - p) * 0.8
    }
  })
  return (
    <group position={pos}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshBasicMaterial color={ev.found ? (ev.clueId ? '#4ade80' : '#94a3b8') : '#ffd27a'} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite ref={ref} position={[0, 0.14, 0]}>
        <spriteMaterial map={sparkleTex} color={ev.found ? '#a7f3d0' : '#fff2cc'} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <mesh
        position={[0, 0.14, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onInspect(ev)
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <sphereGeometry args={[0.32, 10, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ---------------------------------------------------------------- camera */

function Rig({ roomKey, auto }: { roomKey: string; auto: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const tall = aspect < 0.75
    // phones: step back into the doorway and look down at the floor and furniture, where evidence sits,
    // keeping the room above the search panel that covers the bottom of the screen
    camera.fov = tall ? 66 : 52
    camera.position.set(tall ? 0.7 : 1.9, tall ? 2.75 : 1.8, tall ? 5.1 : 3.4)
    camera.updateProjectionMatrix()
    controls.current?.target.set(-0.2, tall ? 0.15 : 0.75, tall ? -0.7 : -0.8)
    controls.current?.update()
  }, [roomKey, camera, size.width, size.height])
  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      minDistance={2.2}
      maxDistance={6.5}
      minAzimuthAngle={-0.6}
      maxAzimuthAngle={0.75}
      minPolarAngle={1.0}
      maxPolarAngle={1.5}
      autoRotate={auto}
      autoRotateSpeed={0.35}
    />
  )
}

export interface OffscreenHint {
  id: string
  side: 'left' | 'right'
  /** 0 (top) .. 1 (bottom) of the screen. */
  y: number
}

/** Reports unfound evidence that is outside the view, so the page can point the player toward it. */
function OffscreenTracker({ points, onChange }: { points: { id: string; pos: V3 }[]; onChange: (hints: OffscreenHint[]) => void }) {
  const camera = useThree((s) => s.camera)
  const v = useMemo(() => new THREE.Vector3(), [])
  const last = useRef('')
  const tick = useRef(0)
  useFrame((_, dt) => {
    tick.current += dt
    if (tick.current < 0.2) return
    tick.current = 0
    const hints: OffscreenHint[] = []
    for (const p of points) {
      v.set(p.pos[0], p.pos[1] + 0.14, p.pos[2]).project(camera)
      const behind = v.z > 1
      if (!behind && Math.abs(v.x) <= 0.92 && v.y >= -0.55 && v.y <= 0.95) continue
      hints.push({ id: p.id, side: (behind ? -v.x : v.x) < 0 ? 'left' : 'right', y: Math.min(0.62, Math.max(0.2, (1 - v.y) / 2)) })
    }
    const key = hints.map((h) => `${h.id}${h.side}${h.y.toFixed(2)}`).join('|')
    if (key !== last.current) {
      last.current = key
      onChange(hints)
    }
  })
  return null
}

/** Mounts only once the room's Suspense content has resolved; keyed per room so it fires again on a switch. */
function Ready({ onReady }: { onReady?: () => void }) {
  const cb = useRef(onReady)
  useLayoutEffect(() => {
    cb.current = onReady
  })
  useEffect(() => {
    cb.current?.()
  }, [])
  return null
}

/* ---------------------------------------------------------------- root */

export default function MysteryRoom3D({
  className = 'h-full w-full',
  locationId,
  evidence = [],
  onInspect,
  auto = false,
  onReady,
  onOffscreen,
}: {
  className?: string
  locationId: string
  evidence?: RoomEvidence[]
  onInspect?: (ev: RoomEvidence) => void
  /** Slow drift for the story screens. */
  auto?: boolean
  onReady?: () => void
  onOffscreen?: (hints: OffscreenHint[]) => void
}) {
  const def = ROOMS[locationId] ?? ROOMS.study
  const unfound = evidence.filter((e) => !e.found).map((e) => ({ id: e.id, pos: def.anchors[e.anchor] ?? def.anchors[0] }))
  return (
    <div className={className}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [1.9, 1.75, 3.3], fov: 52, near: 0.05, far: 60 }} gl={{ antialias: true }}>
        <color attach="background" args={[def.outdoor || def.glass ? '#0b1428' : '#07060b']} />
        {(def.outdoor || def.glass) && <fog attach="fog" args={['#0b1428', 8, 26]} />}
        <ambientLight intensity={def.ambient} color="#c9d4ff" />
        <hemisphereLight intensity={def.ambient * 0.8} color="#ffe9cc" groundColor="#1a1410" />
        <Environment resolution={128} environmentIntensity={0.35}>
          <Lightformer form="rect" intensity={1.2} color="#ffe2b8" position={[0, 3, 0]} rotation-x={Math.PI / 2} scale={[4, 4, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#9cb6ff" position={[4, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[3, 2, 1]} />
        </Environment>
        {def.lamps.map((l, i) => (
          <pointLight
            key={`${locationId}-${i}`}
            position={l.pos}
            color={l.color}
            intensity={l.intensity}
            distance={i === 0 ? 12 : 5}
            decay={2}
            castShadow={l.shadow}
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0015}
            shadow-radius={4}
          />
        ))}
        <Suspense fallback={null}>
          <Shell def={def} />
          {def.props.map((p, i) => (
            <PropModel key={`${locationId}-${i}`} prop={p} />
          ))}
          <ContactShadows key={`shadow-${locationId}`} position={[0, 0.004, 0]} scale={[W, D]} opacity={0.55} blur={2.2} far={1.6} resolution={512} frames={1} />
          {evidence.map((ev) => (
            <Sparkle key={ev.id} ev={ev} pos={def.anchors[ev.anchor] ?? def.anchors[0]} onInspect={onInspect ?? (() => {})} />
          ))}
          <Ready key={`ready-${locationId}`} onReady={onReady} />
          {onOffscreen && <OffscreenTracker points={unfound} onChange={onOffscreen} />}
        </Suspense>
        <Rig roomKey={locationId} auto={auto} />
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.55} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.65} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}

export function preloadRoom(locationId: string) {
  for (const url of ROOM_MODEL_URLS(locationId)) useGLTF.preload(url)
}
