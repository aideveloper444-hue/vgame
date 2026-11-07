import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useSave } from '../state/progress'

/*
 * Instanced scenery for the Wildbound world. Every prop (downloaded GLB or built here) is normalised to a
 * unit box standing on the origin, so a placement simply names its size in metres:
 *   scale: number          -> that height, proportions kept
 *   scale: [x, y, z]       -> exactly that box
 * Ground-like surfaces use world-space UVs so tiles and banks join without seams as the trail scrolls.
 */

const P = '/models/wildbound/props'
const AP = '/models/amazon/props'
const TX = '/models/wildbound/tex'

export const GLB_PROPS = {
  tree1: `${AP}/island_tree_01.glb`,
  tree2: `${AP}/island_tree_02.glb`,
  tree3: `${AP}/island_tree_03.glb`,
  fern: `${AP}/fern_02.glb`,
  shrub: `${AP}/shrub_02.glb`,
  grass: `${AP}/grass_medium_02.glb`,
  rootset: `${AP}/root_cluster_01.glb`,
  stump: `${AP}/tree_stump_01.glb`,
  boulder: `${AP}/boulder_01.glb`,
  trunk: `${AP}/dead_tree_trunk.glb`,
  calathea: `${P}/calathea_orbifolia_01.glb`,
  anthurium: `${P}/anthurium_botany_01.glb`,
  pachira: `${P}/pachira_aquatica_01.glb`,
  mossrocks: `${P}/rock_moss_set_01.glb`,
  pebble: `${P}/rock_07.glb`,
  rockface: `${P}/rock_face_01.glb`,
  mountain: `${P}/mountainside.glb`,
  bush: `${P}/shrub_04.glb`,
  // the same trees in autumn colours (foliage tinted at load)
  atree1: `${AP}/island_tree_01.glb`,
  atree2: `${AP}/island_tree_02.glb`,
  atree3: `${AP}/island_tree_03.glb`,
  // zone kits (2026-11-06): tinted copies of the same scans
  btree1: `${AP}/island_tree_01.glb`,
  btree2: `${AP}/island_tree_02.glb`,
  btree3: `${AP}/island_tree_03.glb`,
  wtree1: `${AP}/island_tree_01.glb`,
  wtree2: `${AP}/island_tree_03.glb`,
  acacia: `${AP}/island_tree_02.glb`,
  grassGold: `${AP}/grass_medium_02.glb`,
  redrock: `${P}/rock_face_01.glb`,
  sandrock: `${AP}/boulder_01.glb`,
  basalt: `${AP}/boulder_01.glb`,
  icerock: `${P}/rock_face_01.glb`,
  jtree1: `${AP}/island_tree_01.glb`,
  jtree2: `${AP}/island_tree_02.glb`,
} as const
export type GlbProp = keyof typeof GLB_PROPS

export type ProcProp =
  | 'tileStone'
  | 'tilePlank'
  | 'tileRuin'
  | 'tileMud'
  | 'tileSnow'
  | 'tileLeaf'
  | 'bankSnow'
  | 'bamboo'
  | 'pine'
  | 'pineSnow'
  | 'curb'
  | 'bank'
  | 'bankHill'
  | 'post'
  | 'rope'
  | 'pillar'
  | 'block'
  | 'trapBase'
  | 'trapSpikes'
  | 'barrier'
  | 'stub'
  | 'ice'
  | 'vine'
  | 'wall'
  | 'tileSand'
  | 'tileDirt'
  | 'tileBasalt'
  | 'tileIce'
  | 'bankSand'
  | 'bankGold'
  | 'bankBasalt'
  | 'lava'
  | 'dune'
  | 'palm'
  | 'reeds'
  | 'sleeper'
  | 'rail'
  | 'birch'
  | 'trolley'
  | 'chevron'
  | 'redwood'
  | 'treefern'
  | 'baobab'
  | 'cypress'
  | 'mushroom'
  | 'deadtree'
  | 'coral'
  | 'shadowDisc'
  | 'waterQuad'
  | 'caveRoof'
  | 'stalactite'
  | 'crystal'
  | 'tuft'
  | 'tuftDark'
  | 'tuftGold'
  | 'tuftAutumn'

export type PropId = GlbProp | ProcProp

export interface Placement {
  prop: PropId
  x: number
  y: number
  z: number
  rotY: number
  rotX?: number
  rotZ?: number
  scale: number | [number, number, number]
}

export interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}
export interface PropKit {
  parts: Part[]
  /** natural size, used for proportional (height-only) placements */
  size: THREE.Vector3
}

/** Shared uniform: the runner's distance (mod 1000), so world-UV textures scroll with the trail. */
export const worldUv = { uD: { value: 0 }, uT: { value: 0 } }

export function preloadProps() {
  for (const url of Object.values(GLB_PROPS)) useGLTF.preload(url)
}

/** Normalise a geometry to a unit box with its base centred on the origin. Returns the natural size. */
function unitize(g: THREE.BufferGeometry): THREE.Vector3 {
  g.computeBoundingBox()
  const b = g.boundingBox!
  const size = b.getSize(new THREE.Vector3())
  const c = b.getCenter(new THREE.Vector3())
  g.translate(-c.x, -b.min.y, -c.z)
  g.scale(1 / Math.max(1e-4, size.x), 1 / Math.max(1e-4, size.y), 1 / Math.max(1e-4, size.z))
  g.computeBoundingSphere()
  return size
}

/** colour corrections for scans that read too pale in the dark forest (multiplied into the albedo) */
const GLB_TINT: Partial<Record<GlbProp, string>> = { rootset: '#6a5440', trunk: '#8a7a68', redrock: '#e07a50', sandrock: '#f0c890', basalt: '#4a3a36', icerock: '#c8e0ff' }
/** foliage-only tints (autumn trees) */
const LEAF_TINT: Partial<Record<GlbProp, string>> = {
  atree1: '#ff8a2a',
  atree2: '#ffc23a',
  atree3: '#e0502a',
  btree1: '#ff9ac8',
  btree2: '#ffc4dc',
  btree3: '#f27ab0',
  wtree1: '#d8e070',
  wtree2: '#e8d468',
  acacia: '#8f9c3a',
  jtree1: '#a67ae8',
  jtree2: '#8a62d8',
  grassGold: '#d4b45a',
}

export function useGlbKit(id: GlbProp): PropKit {
  const { scene } = useGLTF(GLB_PROPS[id])
  return useMemo(() => {
    const parts: Part[] = []
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    const norm = new THREE.Matrix4().makeScale(1 / size.x, 1 / size.y, 1 / size.z).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z))
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(norm)
      geometry.computeBoundingSphere()
      // the island trees stand on a pale stone-and-root collar that reads as a white slab at forest scale: bury it
      if (/tree|acacia/.test(id)) geometry.translate(0, -0.04, 0)
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const src of mats) {
        const mat = (src as THREE.MeshStandardMaterial).clone()
        if (mat.transparent || mat.alphaTest > 0) {
          // foliage: alpha-tested cutouts that cast leafy shadows, lifted a little so canopies read green
          mat.transparent = false
          mat.alphaTest = 0.45
          mat.depthWrite = true
          mat.side = THREE.DoubleSide
          mat.color.multiplyScalar(1.25)
          mat.emissive = new THREE.Color(LEAF_TINT[id] ?? '#5f8a45')
          mat.emissiveMap = mat.map
          mat.emissiveIntensity = LEAF_TINT[id] ? 0.85 : 0.28
        }
        mat.envMapIntensity = 0.55
        if (GLB_TINT[id]) mat.color.multiply(new THREE.Color(GLB_TINT[id]))
        if (LEAF_TINT[id] && mat.alphaTest > 0) {
          // autumn and blossom: recolour the leaves from their brightness, so green becomes orange, red or pink
          mat.color.set(LEAF_TINT[id])
          mat.emissive.set(LEAF_TINT[id]).multiplyScalar(0.22)
          mat.emissiveMap = null
          mat.emissiveIntensity = 1
          mat.onBeforeCompile = (sh) => {
            sh.fragmentShader = sh.fragmentShader.replace(
              '#include <map_fragment>',
              `#ifdef USE_MAP
                vec4 lt = texture2D(map, vMapUv);
                diffuseColor.rgb *= vec3(dot(lt.rgb, vec3(0.299, 0.587, 0.114))) * 2.1;
                diffuseColor.a *= lt.a;
              #endif`,
            )
          }
          mat.customProgramCacheKey = () => 'leafTint'
        }
        parts.push({ geometry, material: mat })
      }
    })
    return { parts, size }
  }, [scene, id])
}

// ---------------------------------------------------------------- materials

let ANISO = 8
function prepTex(t: THREE.Texture, color: boolean) {
  const c = t.clone()
  c.wrapS = c.wrapT = THREE.RepeatWrapping
  c.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  c.anisotropy = ANISO
  c.needsUpdate = true
  return c
}

/** Standard PBR material whose map/normal UVs come from world position (top: xz, sides: zy / xy). */
function worldUvMaterial(map: THREE.Texture, nor: THREE.Texture, tile: number, params: THREE.MeshStandardMaterialParameters = {}, verge?: string, vary = false) {
  const mat = new THREE.MeshStandardMaterial({ map: prepTex(map, true), normalMap: prepTex(nor, false), roughness: 0.92, envMapIntensity: 0.45, ...params })
  const vc = verge ? new THREE.Color(verge) : null
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uD = worldUv.uD
    if (vc) {
      // a natural trail: large-scale colour variation (no visible tiling) and a soft, broken verge where
      // the worn earth fades into moss, grass or leaf litter instead of ending in a hard straight edge
      sh.uniforms.uVerge = { value: vc }
      sh.fragmentShader =
        'uniform vec3 uVerge;\nvarying float vEdge;\n' +
        sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float vgN = texture2D(map, vMapUv * 0.21 + vec2(0.37, 0.11)).g;
          float vgL = texture2D(map, vMapUv * 0.043).r;
          diffuseColor.rgb *= 0.8 + 0.42 * vgL;
          // worn tracks along the three lanes: packed, slightly lighter earth where every runner treads
          float vgX = vEdge * 3.15;
          float vgT = 1.0 - smoothstep(0.3, 0.85, min(vgX, abs(vgX - 2.1)) + (vgN - 0.5) * 0.3);
          diffuseColor.rgb *= 1.0 + 0.09 * vgT;
          float vgE = smoothstep(0.74, 1.08, vEdge + (vgN - 0.5) * 0.4);
          diffuseColor.rgb = mix(diffuseColor.rgb, uVerge * (0.55 + 0.9 * vgN), vgE * 0.9);
          diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(0.55, 0.9, vEdge) * (1.0 - vgE);`,
        )
    }
    if (vary && !vc) {
      // open ground: large-scale light and colour variation, so a 40 m bank never looks like one tile repeated
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float gvA = texture2D(map, vMapUv * 0.061 + vec2(0.13, 0.71)).g;
        float gvB = texture2D(map, vMapUv * 0.017).r;
        diffuseColor.rgb *= 0.74 + 0.5 * gvA;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.96, 0.82), smoothstep(0.35, 0.75, gvB) * 0.6);`,
      )
    }
    sh.vertexShader =
      (vc ? 'varying float vEdge;\n' : '') +
      'uniform float uD;\n' +
      sh.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vec4 wuvP = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wuvP = instanceMatrix * wuvP;
        #endif
        ${vc ? 'vEdge = abs(wuvP.x) / 3.15;' : ''}
        wuvP = modelMatrix * wuvP;
        vec3 wuvN = abs(normal);
        vec2 wuv = wuvN.y > 0.5 ? vec2(wuvP.x, wuvP.z + uD) : (wuvN.x > 0.5 ? vec2(wuvP.z + uD, wuvP.y) : vec2(wuvP.x, wuvP.y));
        wuv *= ${(1 / tile).toFixed(5)};
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif`,
      )
  }
  mat.customProgramCacheKey = () => `wuv${tile}${vc ? 'v' : ''}${vary ? 'g' : ''}`
  return mat
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rz = 0, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rx) g.rotateX(rx)
  if (rz) g.rotateZ(rz)
  g.translate(x, y, z)
  return g
}

/** Everything built in code: trail tiles, banks, bridge timber, ruins, traps, ice. */
export function useProcKits(): Record<ProcProp, PropKit> {
  // 2K trail scans on Ultra; High and below get 1K copies of the same scans (a quarter of the decode and
  // upload work when a run starts, which mattered on phones)
  const q = useSave.getState().settings.quality
  const ultra = q === 'ultra'
  // Ultra: 4K colour scans with 2K normal maps
  const HD = ultra || q === 'high' ? '' : '_1k'
  const HDN = ultra ? '' : '_1k'
  ANISO = ultra ? 16 : 8
  const tex = useTexture({
    pathD: `${TX}/path_diff.jpg`,
    pathN: `${TX}/path_nor.jpg`,
    plankD: `${TX}/planks_diff.jpg`,
    plankN: `${TX}/planks_nor.jpg`,
    ruinD: `${TX}/ruin_diff.jpg`,
    ruinN: `${TX}/ruin_nor.jpg`,
    wallD: '/models/amazon/tex/jungle_wall.webp',
    groundD: `${TX}/ground_diff.jpg`,
    groundN: `${TX}/ground_nor.jpg`,
    cliffD: `${TX}/cliff_diff.jpg`,
    cliffN: `${TX}/cliff_nor.jpg`,
    // 2K photo-scanned trail surfaces (Poly Haven, CC0): see tex/hd/CREDITS.txt
    mudD: `${TX}/hd/mud_diff${HD}.webp`,
    mudN: `${TX}/hd/mud_nor${HDN}.webp`,
    dirtD: `${TX}/hd/dirt_diff${HD}.webp`,
    dirtN: `${TX}/hd/dirt_nor${HDN}.webp`,
    sandD: `${TX}/hd/sand_diff${HD}.webp`,
    sandN: `${TX}/hd/sand_nor${HDN}.webp`,
    snowD: `${TX}/hd/snow_diff${HD}.webp`,
    snowN: `${TX}/hd/snow_nor${HDN}.webp`,
    leafD: `${TX}/hd/leaf_diff${HD}.webp`,
    leafN: `${TX}/hd/leaf_nor${HDN}.webp`,
    meadowD: `${TX}/hd/meadow_diff${HDN}.webp`,
    meadowN: `${TX}/hd/meadow_nor${HDN}.webp`,
    dryD: `${TX}/hd/drygrass_diff${HDN}.webp`,
    dryN: `${TX}/hd/drygrass_nor${HDN}.webp`,
    hdPlankD: `${TX}/hd/plank_diff${HD}.webp`,
    hdPlankN: `${TX}/hd/plank_nor${HDN}.webp`,
  })
  return useMemo(() => {
    const stone = worldUvMaterial(tex.pathD, tex.pathN, 2.5, { color: '#d8d2c2' })
    const plank = worldUvMaterial(tex.hdPlankD, tex.hdPlankN, 2.2, { color: '#f2dcc4', roughness: 0.8 })
    const ruin = worldUvMaterial(tex.ruinD, tex.ruinN, 2.5, { color: '#cfc7ad' })
    // warm brown earth that stands apart from the green undergrowth (the scan's leaf patches turn olive, not grey)
    const mud = worldUvMaterial(tex.mudD, tex.mudN, 2.6, { color: '#f0b88e', roughness: 0.88, envMapIntensity: 0.25 }, '#3f4a22')
    // packed, trodden snow: a little darker and bluer than the fresh drifts beside it, so the trail reads clearly
    const snowTile = worldUvMaterial(tex.snowD, tex.snowN, 2.6, { color: '#c4ccd8', roughness: 0.7, emissive: new THREE.Color('#7a8aa0'), emissiveIntensity: 0.16 }, '#f4f7fb')
    const leafTile = worldUvMaterial(tex.leafD, tex.leafN, 2.6, { color: '#cdbcae', roughness: 0.9 }, '#7a4a24')
    const snowBank = worldUvMaterial(tex.groundD, tex.groundN, 6, { color: '#eef2f8', roughness: 0.8, emissive: new THREE.Color('#c4cedc'), emissiveIntensity: 0.25 })
    // zone kits: sand, dry earth, volcanic basalt with glowing cracks, glassy ice
    const sandTile = worldUvMaterial(tex.sandD, tex.sandN, 2.6, { color: '#fff2e0', roughness: 0.95 }, '#d8bf86')
    const dirtTile = worldUvMaterial(tex.dirtD, tex.dirtN, 2.4, { color: '#d2a88a', roughness: 0.9, envMapIntensity: 0.25 }, '#9a8442')
    const basaltTile = worldUvMaterial(tex.dirtD, tex.dirtN, 2.4, { color: '#8c8482', roughness: 0.9 }, '#2a2220')
    const iceTile = worldUvMaterial(tex.groundD, tex.groundN, 4, { color: '#9fc0dc', roughness: 0.25, metalness: 0.02, emissive: new THREE.Color('#3a5a80'), emissiveIntensity: 0.2, envMapIntensity: 1.1 }, '#f2f6fb')
    const sandBank = worldUvMaterial(tex.groundD, tex.groundN, 5, { color: '#f4d8a0', roughness: 1 })
    const goldBank = worldUvMaterial(tex.dryD, tex.dryN, 3.4, { color: '#f4dcae', roughness: 1, envMapIntensity: 0.3 }, undefined, true)
    const basaltBank = worldUvMaterial(tex.groundD, tex.groundN, 5, { color: '#463a36', roughness: 1 })
    const lavaMat = new THREE.MeshBasicMaterial({ color: '#ff6a1a', toneMapped: false })
    // palm: a leaning, curved trunk of tapering rings and a crown of drooping fronds
    const palmTrunk: THREE.BufferGeometry[] = []
    for (let i = 0; i < 10; i++) {
      const t = i / 10
      const c = new THREE.CylinderGeometry(0.14 - t * 0.05, 0.16 - t * 0.05, 0.62, 7)
      c.rotateZ(-0.05 - t * 0.12)
      c.translate(Math.pow(t, 1.6) * 1.4, i * 0.6 + 0.3, 0)
      palmTrunk.push(c)
    }
    const fronds: THREE.BufferGeometry[] = []
    for (let i = 0; i < 9; i++) {
      // a frond: a long leaf, widest in the middle, arching up then drooping
      const f = new THREE.PlaneGeometry(2.8, 0.8, 8, 2)
      const pos = f.attributes.position
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v) + 1.4
        const w = pos.getY(v) * Math.sin((x / 2.8) * Math.PI) * 1.1
        pos.setXYZ(v, x, 0.35 * x - 0.2 * x * x + Math.abs(w) * 0.25, w)
      }
      f.computeVertexNormals()
      f.rotateY((i / 9) * Math.PI * 2 + (i % 2) * 0.3)
      f.translate(1.4, 6.1, 0)
      fronds.push(f)
    }
    const palmBark = new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 1 })
    const frondMat = new THREE.MeshStandardMaterial({ color: '#4f8a2c', roughness: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color('#1d3a10'), emissiveIntensity: 0.4 })
    // reeds: a clump of thin blades
    const reedParts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 14; i++) {
      const c = new THREE.ConeGeometry(0.03, 1.4 + (i % 5) * 0.25, 4)
      c.rotateZ(((i % 7) - 3) * 0.06)
      c.translate(Math.cos(i * 2.4) * 0.35 * ((i % 3) / 2 + 0.3), 0.7, Math.sin(i * 2.4) * 0.35 * ((i % 3) / 2 + 0.3))
      reedParts.push(c)
    }
    const reedMat = new THREE.MeshStandardMaterial({ color: '#7d8a44', roughness: 0.9 })
    // birch: a slim white trunk with dark marks and a small light crown
    const birchTrunk = new THREE.CylinderGeometry(0.11, 0.15, 9, 8).translate(0, 4.5, 0)
    const birchCrown = mergeGeometries([new THREE.IcosahedronGeometry(1.5, 1).scale(1, 1.5, 1).translate(0, 8.6, 0), new THREE.IcosahedronGeometry(1.1, 1).translate(0.7, 7.2, 0.3)])!
    const birchBark = new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.8 })
    // rail maintenance trolley: a rusty flatbed on four wheels with a push bar
    const deck = box(1.5, 0.16, 2.1, 0, 0.62, 0)
    const deckRim = mergeGeometries([box(1.5, 0.18, 0.08, 0, 0.78, 1.03), box(1.5, 0.18, 0.08, 0, 0.78, -1.03), box(0.08, 0.18, 2.1, 0.73, 0.78, 0), box(0.08, 0.18, 2.1, -0.73, 0.78, 0)])!
    const frame = mergeGeometries([box(1.3, 0.14, 0.12, 0, 0.45, 0.7), box(1.3, 0.14, 0.12, 0, 0.45, -0.7), box(0.06, 0.9, 0.06, -0.55, 1.15, -0.9), box(0.06, 0.9, 0.06, 0.55, 1.15, -0.9), box(1.2, 0.07, 0.07, 0, 1.58, -0.9)])!
    const wheels: THREE.BufferGeometry[] = []
    for (const wx of [-0.72, 0.72]) for (const wz of [-0.7, 0.7]) wheels.push(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 14).rotateZ(Math.PI / 2).translate(wx, 0.3, wz))
    const rust = new THREE.MeshStandardMaterial({ color: '#9a4426', roughness: 0.75, metalness: 0.5 })
    const ironDark = new THREE.MeshStandardMaterial({ color: '#2e2e30', roughness: 0.5, metalness: 0.8 })
    const yellowBar = new THREE.MeshStandardMaterial({ color: '#e8b62a', roughness: 0.6, metalness: 0.3 })
    // cave: a rough rock vault over the trail, hanging spikes, glowing crystals
    const vault = new THREE.CylinderGeometry(6.5, 6.5, 1, 18, 1, true, -Math.PI / 2, Math.PI)
    vault.rotateX(Math.PI / 2)
    vault.rotateZ(Math.PI / 2)
    {
      const pos = vault.attributes.position
      for (let v = 0; v < pos.count; v++) {
        const n = Math.sin(pos.getX(v) * 3.1) * 0.35 + Math.cos(pos.getY(v) * 2.3) * 0.3
        pos.setX(v, pos.getX(v) * (1 + n * 0.06))
        pos.setY(v, pos.getY(v) * (1 + n * 0.06))
      }
      vault.computeVertexNormals()
    }
    const caveRock = new THREE.MeshStandardMaterial({ map: prepTex(tex.cliffD, true), normalMap: prepTex(tex.cliffN, false), color: '#6a5e54', roughness: 1, side: THREE.DoubleSide })
    const spikes2: THREE.BufferGeometry[] = []
    for (let i = 0; i < 7; i++) {
      const h = 0.9 + ((i * 37) % 5) * 0.18
      spikes2.push(new THREE.ConeGeometry(0.16 + (i % 3) * 0.04, h, 7).rotateX(Math.PI).translate(-0.9 + i * 0.3, 2.1 - h / 2, ((i * 53) % 7) * 0.05 - 0.15))
    }
    spikes2.push(box(2.1, 0.5, 0.7, 0, 2.2, 0))
    const crystalGeo = mergeGeometries([new THREE.ConeGeometry(0.18, 1.1, 6).translate(0, 0.55, 0), new THREE.ConeGeometry(0.12, 0.8, 6).rotateZ(0.4).translate(0.18, 0.35, 0.05), new THREE.ConeGeometry(0.1, 0.6, 6).rotateZ(-0.5).translate(-0.15, 0.28, -0.05)])!
    const crystalMat = new THREE.MeshStandardMaterial({ color: '#7ae8ff', emissive: '#2ac8ff', emissiveIntensity: 1.6, roughness: 0.2, toneMapped: false })
    const waterMat = new THREE.MeshStandardMaterial({ color: '#2f7f86', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, emissive: '#0c3a44', emissiveIntensity: 0.6, envMapIntensity: 1.4 })
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false })
    // 2026-11-06 forest kits: redwood, tree fern, baobab, cypress, glowing mushroom, dead tree, coral
    const redBark = new THREE.MeshStandardMaterial({ map: prepTex(tex.cliffD, true), color: '#b0583a', roughness: 1 })
    const redwoodTrunk = new THREE.CylinderGeometry(0.55, 1.0, 30, 10).translate(0, 15, 0)
    const redwoodCrown = mergeGeometries([0, 1, 2, 3].map((i) => new THREE.ConeGeometry(2.4 - i * 0.4, 3.2, 8).translate(Math.sin(i * 2.1) * 0.4, 25 + i * 2.4, Math.cos(i * 2.1) * 0.4)))!
    const darkNeedle = new THREE.MeshStandardMaterial({ color: '#24402a', roughness: 0.95, flatShading: true })
    const fernTrunk = new THREE.CylinderGeometry(0.12, 0.2, 4, 7).translate(0, 2, 0)
    const fernFronds: THREE.BufferGeometry[] = []
    for (let i = 0; i < 11; i++) {
      const f = new THREE.PlaneGeometry(2.2, 0.5, 6, 1)
      const pos = f.attributes.position
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v) + 1.1
        const w = pos.getY(v) * Math.sin((x / 2.2) * Math.PI)
        pos.setXYZ(v, x, 0.5 * x - 0.28 * x * x, w)
      }
      f.computeVertexNormals()
      f.rotateY((i / 11) * Math.PI * 2)
      f.translate(0, 4, 0)
      fernFronds.push(f)
    }
    const fernLeaf = new THREE.MeshStandardMaterial({ color: '#3f7a2a', roughness: 0.85, side: THREE.DoubleSide, emissive: '#16300c', emissiveIntensity: 0.5 })
    const fernBark = new THREE.MeshStandardMaterial({ color: '#4a3a28', roughness: 1 })
    const baoTrunk = new THREE.LatheGeometry([0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector2(i === 7 ? 0.6 : 1.3 + Math.sin((i / 7) * Math.PI) * 0.7 - i * 0.08, i * 1.1)), 12)
    const baoBranches = mergeGeometries([0, 1, 2, 3, 4, 5].map((i) => new THREE.CylinderGeometry(0.08, 0.2, 2.6, 5).rotateZ(0.9).rotateY((i / 6) * Math.PI * 2).translate(Math.cos((i / 6) * Math.PI * 2) * 1.1, 8.3, -Math.sin((i / 6) * Math.PI * 2) * 1.1)))!
    const baoCrown = mergeGeometries([0, 1, 2, 3, 4, 5].map((i) => new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.5, 1).translate(Math.cos((i / 6) * Math.PI * 2) * 2.1, 9.1, -Math.sin((i / 6) * Math.PI * 2) * 2.1)))!
    const baoBark = new THREE.MeshStandardMaterial({ map: prepTex(tex.cliffD, true), color: '#9a8270', roughness: 1 })
    const baoLeaf = new THREE.MeshStandardMaterial({ color: '#6f8a3a', roughness: 0.9, flatShading: true })
    const cypressGeo = new THREE.CylinderGeometry(0.05, 1.1, 1, 9, 6)
    {
      const pos = cypressGeo.attributes.position
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v) + 0.5
        const r = Math.sin(Math.min(1, y * 1.25) * Math.PI * 0.9) * (1 - y * 0.6)
        const a = Math.atan2(pos.getZ(v), pos.getX(v))
        pos.setXYZ(v, Math.cos(a) * r, y * 10 + 1.2, Math.sin(a) * r)
      }
      cypressGeo.computeVertexNormals()
    }
    const cypressTrunk = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0)
    const mushStem = new THREE.CylinderGeometry(0.14, 0.22, 1.2, 8).translate(0, 0.6, 0)
    const mushCap = new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 1.15, 0)
    const mushStemMat = new THREE.MeshStandardMaterial({ color: '#d8e8e0', emissive: '#4ad8c8', emissiveIntensity: 0.4, roughness: 0.6 })
    const mushCapMat = new THREE.MeshStandardMaterial({ color: '#4a6aff', emissive: '#3aa8ff', emissiveIntensity: 1.4, roughness: 0.4, toneMapped: false })
    const deadParts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.12, 0.3, 7, 7).translate(0, 3.5, 0)]
    for (let i = 0; i < 7; i++) {
      const y = 2.8 + i * 0.6
      const l = 2.6 - i * 0.25
      deadParts.push(new THREE.CylinderGeometry(0.03, 0.08, l, 5).translate(0, l / 2, 0).rotateZ(0.7 + (i % 3) * 0.2).rotateY(i * 2.4).translate(0, y, 0))
    }
    const deadBark = new THREE.MeshStandardMaterial({ color: '#5a4c44', roughness: 1 })
    const coralParts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 9; i++) coralParts.push(new THREE.ConeGeometry(0.1, 0.8 + (i % 3) * 0.3, 6).translate(0, 0.45, 0).rotateZ((i % 2 ? 1 : -1) * (0.2 + (i % 4) * 0.12)).rotateY(i * 0.8))
    const coralMat = new THREE.MeshStandardMaterial({ color: '#ff7a8a', emissive: '#a02a4a', emissiveIntensity: 0.4, roughness: 0.7 })
    // sharp-corner warning board: black chevrons on yellow, pointing the way (flip it with a negative x scale)
    const chevCanvas = document.createElement('canvas')
    chevCanvas.width = 256
    chevCanvas.height = 128
    {
      const g = chevCanvas.getContext('2d')!
      g.fillStyle = '#ffcc1a'
      g.fillRect(0, 0, 256, 128)
      g.fillStyle = '#141414'
      for (const x0 of [40, 120, 200]) {
        g.beginPath()
        g.moveTo(x0 - 28, 64)
        g.lineTo(x0 + 12, 14)
        g.lineTo(x0 + 34, 14)
        g.lineTo(x0 - 6, 64)
        g.lineTo(x0 + 34, 114)
        g.lineTo(x0 + 12, 114)
        g.closePath()
        g.fill()
      }
      g.strokeStyle = '#141414'
      g.lineWidth = 10
      g.strokeRect(5, 5, 246, 118)
    }
    const chevTex = new THREE.CanvasTexture(chevCanvas)
    chevTex.colorSpace = THREE.SRGBColorSpace
    const chevMat = new THREE.MeshStandardMaterial({ map: chevTex, emissive: '#ffffff', emissiveMap: chevTex, emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide })
    const chevBoard = new THREE.PlaneGeometry(2, 1).rotateY(Math.PI).translate(0, 1.6, 0)
    const chevPosts = mergeGeometries([new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6).translate(-0.7, 0.6, 0.03), new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6).translate(0.7, 0.6, 0.03)])!
    const birchLeaf = new THREE.MeshStandardMaterial({ color: '#b8c860', roughness: 0.9, flatShading: true, emissive: new THREE.Color('#3a4a10'), emissiveIntensity: 0.3 })
    // bamboo culm: a tall segmented stalk with nodes and a few leaf sprays
    const culmParts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 9; i++) {
      const c = new THREE.CylinderGeometry(0.05, 0.055, 0.98, 7)
      c.translate(0, i + 0.5, 0)
      culmParts.push(c)
      const n = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 7)
      n.translate(0, i + 1, 0)
      culmParts.push(n)
    }
    const culm = mergeGeometries(culmParts)!
    const sprayParts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 7; i++) {
      const l = new THREE.PlaneGeometry(0.9, 0.12)
      l.translate(0.45, 0, 0)
      l.rotateZ(-0.35)
      l.rotateY((i / 7) * Math.PI * 2)
      l.translate(0, 5 + (i % 4) * 1.1, 0)
      sprayParts.push(l)
    }
    const spray = mergeGeometries(sprayParts)!
    const culmMat = new THREE.MeshStandardMaterial({ color: '#7f9a3e', roughness: 0.55 })
    const leafMat = new THREE.MeshStandardMaterial({ color: '#5f8f34', roughness: 0.8, side: THREE.DoubleSide })
    // pine / fir: a tall tapering trunk and 14 tiers of drooping branch sprays (alpha-cut needle cards), the way
    // games build conifers; card normals point out from the crown so it shades softly like a real tree
    const pineTrunk = new THREE.CylinderGeometry(0.05, 0.24, 7.6, 9).translate(0, 3.8, 0)
    const needles = (() => {
      const parts: THREE.BufferGeometry[] = []
      const TIERS = 14
      for (let t = 0; t < TIERS; t++) {
        const f = t / (TIERS - 1)
        const y = 1.15 + f * 6.2
        const len = 2.1 * (1 - f) + 0.35
        const n = Math.max(5, Math.round(10 - f * 4))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + t * 0.9 + hash01(t * 31 + i, 11) * 0.5
          const droop = 0.32 + f * 0.25 + hash01(t * 31 + i, 12) * 0.2
          const g = new THREE.PlaneGeometry(len, len * 0.62, 2, 1)
          g.translate(len / 2, 0, 0)
          // sag: the outer half of the spray hangs lower
          const pos = g.attributes.position
          for (let v = 0; v < pos.count; v++) {
            const x = pos.getX(v)
            pos.setY(v, pos.getY(v) - (x / len) * (x / len) * len * 0.22)
          }
          g.rotateX(-Math.PI / 2 + 0.25)
          g.rotateZ(-droop)
          g.rotateY(-a)
          g.translate(0, y, 0)
          // soft crown normals: from the trunk axis outwards and a little up
          const nrm = new Float32Array(pos.count * 3)
          for (let v = 0; v < pos.count; v++) {
            const vx = pos.getX(v)
            const vz = pos.getZ(v)
            const l = Math.hypot(vx, vz) || 1
            nrm[v * 3] = (vx / l) * 0.8
            nrm[v * 3 + 1] = 0.6
            nrm[v * 3 + 2] = (vz / l) * 0.8
          }
          g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
          parts.push(g)
        }
      }
      // a spire at the top
      const tip = new THREE.ConeGeometry(0.22, 1.1, 6).translate(0, 7.9, 0)
      parts.push(tip)
      return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!
    })()
    const sprayTex = (snow: boolean) => {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 160
      const g = c.getContext('2d')!
      g.clearRect(0, 0, 256, 160)
      const twig = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
        g.strokeStyle = '#3a2a1c'
        g.lineWidth = depth === 0 ? 3 : 1.5
        g.beginPath()
        g.moveTo(x0, y0)
        g.lineTo(x1, y1)
        g.stroke()
        const steps = Math.round(Math.hypot(x1 - x0, y1 - y0) / 2.2)
        for (let i = 0; i < steps; i++) {
          const t = i / steps
          const x = x0 + (x1 - x0) * t
          const y = y0 + (y1 - y0) * t
          const ang = Math.atan2(y1 - y0, x1 - x0)
          for (const sd of [-1, 1]) {
            const na = ang + sd * (0.9 + Math.random() * 0.35)
            const nl = (7 + Math.random() * 6) * (1 - t * 0.45) * (depth === 0 ? 1.15 : 0.9)
            const k = 0.65 + Math.random() * 0.5
            g.strokeStyle = `rgb(${Math.round(40 * k)},${Math.round(78 * k)},${Math.round(44 * k)})`
            g.lineWidth = 1.3
            g.beginPath()
            g.moveTo(x, y)
            g.lineTo(x + Math.cos(na) * nl, y + Math.sin(na) * nl)
            g.stroke()
          }
          if (depth === 0 && i % 9 === 4 && t < 0.85) {
            const sd = i % 18 === 4 ? -1 : 1
            const bl = (1 - t) * 70
            twig(x, y, x + Math.cos(ang + sd * 0.7) * bl, y + Math.sin(ang + sd * 0.7) * bl, 1)
          }
        }
      }
      twig(4, 80, 250, 80, 0)
      if (snow) {
        // snow lying on top of the spray
        for (let i = 0; i < 260; i++) {
          const x = 10 + Math.random() * 236
          const y = 44 + Math.random() * 72
          g.fillStyle = `rgba(245,248,252,${0.75 + Math.random() * 0.25})`
          g.beginPath()
          g.ellipse(x, y, 3 + Math.random() * 6, 2 + Math.random() * 3, 0, 0, Math.PI * 2)
          g.fill()
        }
      }
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      return tex
    }
    const bark = new THREE.MeshStandardMaterial({ map: prepTex(tex.cliffD, true), normalMap: prepTex(tex.cliffN, false), color: '#6e5440', roughness: 1 })
    bark.map!.repeat.set(1, 6)
    bark.normalMap!.repeat.set(1, 6)
    const needleMat = new THREE.MeshStandardMaterial({ map: sprayTex(false), alphaTest: 0.45, side: THREE.DoubleSide, color: '#b8d0a8', roughness: 0.9, envMapIntensity: 0.4 })
    const snowNeedleMat = new THREE.MeshStandardMaterial({ map: sprayTex(true), alphaTest: 0.45, side: THREE.DoubleSide, color: '#e8eef4', roughness: 0.75, envMapIntensity: 0.5 })
    // all parts of a multi-part prop share one normalisation, so the pieces stay together
    const multi = (pieces: [THREE.BufferGeometry, THREE.Material][]): PropKit => {
      const all = mergeGeometries(pieces.map(([g]) => (g.index ? g.toNonIndexed() : g.clone()).deleteAttribute('uv').deleteAttribute('normal')))!
      all.computeBoundingBox()
      const b = all.boundingBox!
      const size = b.getSize(new THREE.Vector3())
      const c = b.getCenter(new THREE.Vector3())
      return {
        size,
        parts: pieces.map(([g, m]) => {
          const geometry = g.clone()
          geometry.translate(-c.x, -b.min.y, -c.z)
          geometry.scale(1 / size.x, 1 / size.y, 1 / size.z)
          geometry.computeBoundingSphere()
          return { geometry, material: m }
        }),
      }
    }
    // the land beside the trail: photo-scanned meadow (Poly Haven leafy_grass), shaded a little deeper in the forest
    const ground = worldUvMaterial(tex.meadowD, tex.meadowN, 3.2, { color: '#b4bc98', roughness: 0.95, envMapIntensity: 0.3 }, undefined, true)
    const hill = worldUvMaterial(tex.meadowD, tex.meadowN, 3.6, { color: '#d4dab4', roughness: 0.95, envMapIntensity: 0.3 }, undefined, true)
    const wood = new THREE.MeshStandardMaterial({ map: prepTex(tex.plankD, true), normalMap: prepTex(tex.plankN, false), color: '#a07650', roughness: 0.9 })
    const ruinUv = new THREE.MeshStandardMaterial({ map: prepTex(tex.ruinD, true), normalMap: prepTex(tex.ruinN, false), color: '#cfc7ad', roughness: 0.95 })
    ruinUv.map!.repeat.set(2, 2)
    ruinUv.normalMap!.repeat.set(2, 2)
    const metal = new THREE.MeshStandardMaterial({ color: '#8d9399', metalness: 0.85, roughness: 0.35 })
    const rope = new THREE.MeshStandardMaterial({ color: '#b39a6a', roughness: 1 })
    const vine = new THREE.MeshStandardMaterial({ color: '#4d5a2a', roughness: 1 })
    const ice = new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.5, emissive: '#5fb8ff', emissiveIntensity: 0.25, clearcoat: 1, depthWrite: false })

    const kit = (geometry: THREE.BufferGeometry, material: THREE.Material): PropKit => {
      const size = unitize(geometry)
      return { parts: [{ geometry, material }], size }
    }
    // wind grass: a clump of thin, curved blades (dark at the root, lighter at the tip) whose normals all point
    // up, so the clump is lit like a soft meadow from every side; the vertex shader sways it in gusts
    const tuftGeo = (() => {
      const pos: number[] = []
      const col: number[] = []
      const uvs: number[] = []
      const idx: number[] = []
      const SEGS = 4
      for (let b = 0; b < 34; b++) {
        const a = hash01(b, 1) * Math.PI * 2
        const r = Math.sqrt(hash01(b, 2)) * 0.42
        const bx = Math.cos(a) * r
        const bz = Math.sin(a) * r
        const h = 0.45 + hash01(b, 3) * 0.55
        const w = 0.034 + hash01(b, 4) * 0.03
        const yaw = hash01(b, 5) * Math.PI * 2
        const lean = (hash01(b, 6) - 0.3) * 0.5
        const dx = Math.cos(yaw)
        const dz = Math.sin(yaw)
        const shade = 0.75 + hash01(b, 7) * 0.5
        const base = pos.length / 3
        for (let i = 0; i <= SEGS; i++) {
          const t = i / SEGS
          const bend = lean * t * t * h
          const ww = w * (1 - t * 0.92)
          for (const side of [-1, 1]) {
            pos.push(bx + dz * ww * side + dx * bend, t * h, bz - dx * ww * side + dz * bend)
            const k = (0.55 + 0.45 * t) * shade
            col.push(k, k, k)
            uvs.push(side < 0 ? 0 : 1, t)
          }
          if (i < SEGS) {
            const q = base + i * 2
            // both windings with upward normals: the blade is lit the same from either side (no black backs)
            idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2, q, q + 2, q + 1, q + 1, q + 2, q + 3)
          }
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      g.setIndex(idx)
      const n = new Float32Array(pos.length)
      for (let i = 1; i < n.length; i += 3) n[i] = 1
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
      return g
    })()
    const tuftMat = (color: string) => {
      const m = new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.8, envMapIntensity: 0.4 })
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uD = worldUv.uD
        sh.uniforms.uT = worldUv.uT
        sh.vertexShader =
          'uniform float uD;\nuniform float uT;\n' +
          sh.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vec2 gwP = vec2(0.0);
            #ifdef USE_INSTANCING
              gwP = vec2(instanceMatrix[3].x, instanceMatrix[3].z + uD);
            #endif
            float gwH = uv.y * uv.y;
            float gwGust = sin(uT * 0.9 + gwP.y * 0.07) * 0.5 + 0.5;
            float gwS = sin(uT * 2.3 + gwP.x * 0.6 + gwP.y * 0.45) * (0.05 + 0.1 * gwGust) + 0.04 * gwGust;
            transformed.x += gwS * gwH;
            transformed.z += sin(uT * 1.7 + gwP.y * 0.3) * 0.03 * gwH;`,
          )
      }
      m.customProgramCacheKey = () => 'wbtuft'
      return m
    }
    // spiked trap: timber frame with rows of iron spikes
    const spikes: THREE.BufferGeometry[] = []
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 3; j++) {
        const c = new THREE.ConeGeometry(0.07, 0.38, 6)
        c.translate(-0.72 + i * 0.36, 0.19 + 0.12, -0.3 + j * 0.3)
        spikes.push(c)
      }
    // barricade: two posts, two cross planks (slide under), a diagonal brace above
    const barrier = mergeGeometries([
      box(0.18, 2.3, 0.18, -0.95, 1.15, 0),
      box(0.18, 2.3, 0.18, 0.95, 1.15, 0),
      box(2.2, 0.26, 0.1, 0, 1.25, 0.06),
      box(2.2, 0.26, 0.1, 0, 1.62, 0.06),
      box(2.3, 0.18, 0.1, 0, 1.98, 0.02, 0.32),
    ])!
    // broken plank ends sticking out over a gap
    const stub = mergeGeometries([box(0.5, 0.1, 0.5, -0.75, 0, 0, 0.12), box(0.45, 0.1, 0.38, 0.0, 0, -0.05, -0.08), box(0.55, 0.1, 0.62, 0.72, 0, 0.04, 0.1)])!

    // jungle wall: a unit plane facing +z (turned to face the trail); u runs along the trail in world space
    const wallTex = prepTex(tex.wallD, true)
    wallTex.wrapT = THREE.ClampToEdgeWrapping
    const wall = new THREE.MeshStandardMaterial({ map: wallTex, alphaTest: 0.5, color: '#b9d79a', emissive: '#2e4a1c', emissiveMap: wallTex, emissiveIntensity: 0.6, roughness: 1, side: THREE.DoubleSide })
    wall.onBeforeCompile = (sh) => {
      sh.uniforms.uD = worldUv.uD
      sh.vertexShader =
        'uniform float uD;\n' +
        sh.vertexShader.replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          vec4 wwP = modelMatrix * instanceMatrix * vec4(position, 1.0);
          float wwH = length(instanceMatrix[1].xyz);
          vMapUv = vec2((wwP.z + uD) / (wwH * 2.0) + wwH * 0.37, uv.y);
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv = vMapUv;
          #endif`,
        )
    }
    wall.customProgramCacheKey = () => 'wbwall'
    const wallGeo = new THREE.PlaneGeometry(1, 1)

    return {
      wall: { parts: [{ geometry: wallGeo.translate(0, 0.5, 0), material: wall }], size: new THREE.Vector3(1, 1, 1) },
      tileStone: kit(box(1, 1, 1), stone),
      tilePlank: kit(box(1, 1, 1), plank),
      tileRuin: kit(box(1, 1, 1), ruin),
      tileMud: kit(box(1, 1, 1), mud),
      tileSnow: kit(box(1, 1, 1), snowTile),
      tileLeaf: kit(box(1, 1, 1), leafTile),
      bankSnow: kit(box(1, 1, 1), snowBank),
      bamboo: multi([
        [culm, culmMat],
        [spray, leafMat],
      ]),
      pine: multi([
        [pineTrunk, bark],
        [needles, needleMat],
      ]),
      pineSnow: multi([
        [pineTrunk, bark],
        [needles, snowNeedleMat],
      ]),
      curb: kit(box(1, 1, 1), ruin),
      bank: kit(box(1, 1, 1), ground),
      tuft: kit(tuftGeo, tuftMat('#86a24e')),
      tuftDark: kit(tuftGeo.clone(), tuftMat('#7a9450')),
      tuftGold: kit(tuftGeo.clone(), tuftMat('#f0d290')),
      tuftAutumn: kit(tuftGeo.clone(), tuftMat('#d0a860')),
      bankHill: kit(box(1, 1, 1), hill),
      post: kit(new THREE.CylinderGeometry(0.09, 0.11, 1, 8), wood),
      rope: kit(new THREE.CylinderGeometry(0.03, 0.03, 1, 5).rotateX(Math.PI / 2), rope),
      vine: kit(new THREE.CylinderGeometry(0.025, 0.035, 1, 5), vine),
      pillar: kit(new THREE.CylinderGeometry(0.42, 0.5, 1, 14), ruinUv),
      block: kit(box(1, 1, 1), ruin),
      trapBase: kit(box(1.9, 0.12, 0.95), wood),
      trapSpikes: kit(mergeGeometries(spikes)!, metal),
      barrier: kit(barrier, wood),
      stub: kit(stub, wood),
      ice: kit(new THREE.IcosahedronGeometry(1, 1), ice),
      tileSand: kit(box(1, 1, 1), sandTile),
      tileDirt: kit(box(1, 1, 1), dirtTile),
      tileBasalt: kit(box(1, 1, 1), basaltTile),
      tileIce: kit(box(1, 1, 1), iceTile),
      bankSand: kit(box(1, 1, 1), sandBank),
      bankGold: kit(box(1, 1, 1), goldBank),
      bankBasalt: kit(box(1, 1, 1), basaltBank),
      lava: kit(box(1, 1, 1), lavaMat),
      dune: kit(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sandBank),
      palm: multi([
        [mergeGeometries(palmTrunk)!, palmBark],
        [mergeGeometries(fronds)!, frondMat],
      ]),
      reeds: kit(mergeGeometries(reedParts)!, reedMat),
      sleeper: kit(box(1, 1, 1), wood),
      rail: kit(box(1, 1, 1), metal),
      birch: multi([
        [birchTrunk, birchBark],
        [birchCrown, birchLeaf],
      ]),
      trolley: multi([
        [mergeGeometries([deck, deckRim])!, rust],
        [mergeGeometries(wheels)!, ironDark],
        [frame, yellowBar],
      ]),
      redwood: multi([
        [redwoodTrunk, redBark],
        [redwoodCrown, darkNeedle],
      ]),
      treefern: multi([
        [fernTrunk, fernBark],
        [mergeGeometries(fernFronds)!, fernLeaf],
      ]),
      baobab: multi([
        [mergeGeometries([baoTrunk, baoBranches])!, baoBark],
        [baoCrown, baoLeaf],
      ]),
      cypress: multi([
        [cypressTrunk, fernBark],
        [cypressGeo, darkNeedle],
      ]),
      mushroom: multi([
        [mushStem, mushStemMat],
        [mushCap, mushCapMat],
      ]),
      deadtree: kit(mergeGeometries(deadParts)!, deadBark),
      coral: kit(mergeGeometries(coralParts)!, coralMat),
      chevron: multi([
        [chevBoard, chevMat],
        [chevPosts, wood],
      ]),
      shadowDisc: kit(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), shadowMat),
      waterQuad: kit(box(1, 1, 1), waterMat),
      caveRoof: kit(vault, caveRock),
      stalactite: kit(mergeGeometries(spikes2)!, caveRock),
      crystal: kit(crystalGeo, crystalMat),
    }
  }, [tex])
}

// ---------------------------------------------------------------- instanced sets

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()

export function placementMatrix(p: Placement, size: THREE.Vector3, out = tmpM) {
  tmpE.set(p.rotX ?? 0, p.rotY, p.rotZ ?? 0, 'YXZ')
  tmpQ.setFromEuler(tmpE)
  tmpP.set(p.x, p.y, p.z)
  if (typeof p.scale === 'number') tmpS.set((size.x / size.y) * p.scale, p.scale, (size.z / size.y) * p.scale)
  else tmpS.set(p.scale[0], p.scale[1], p.scale[2])
  return out.compose(tmpP, tmpQ, tmpS)
}

/** One prop drawn for every placement the source returns this frame. */
export function PropSet({ kit, prop, capacity, source, shadows = false, receive = true }: { kit: PropKit; prop: PropId; capacity: number; source: (time: number) => Map<PropId, Placement[]>; shadows?: boolean; receive?: boolean }) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  useFrame((state) => {
    const list = source(state.clock.elapsedTime).get(prop) ?? []
    const n = Math.min(capacity, list.length)
    for (let i = 0; i < n; i++) {
      placementMatrix(list[i], kit.size)
      for (const im of refs.current) im?.setMatrixAt(i, tmpM)
    }
    for (const im of refs.current) {
      if (!im) continue
      im.count = n
      im.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      {kit.parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          args={[part.geometry, part.material, capacity]}
          castShadow={shadows}
          receiveShadow={receive}
          frustumCulled={false}
        />
      ))}
    </>
  )
}

export function GlbSet(props: { prop: GlbProp; capacity: number; source: (time: number) => Map<PropId, Placement[]>; shadows?: boolean }) {
  const kit = useGlbKit(props.prop)
  return <PropSet kit={kit} {...props} />
}

/** Deterministic 0..1 hash. */
export function hash01(n: number, salt = 0): number {
  let h = (n * 374761393 + salt * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
