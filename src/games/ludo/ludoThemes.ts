import { create } from 'zustand'
import type { BoardImageCalibration } from './ludoImageBoard'

/*
 * Board looks the player picks before a match. Each theme is a complete material set for the painted
 * board (walkway stone, metal inlay, yard, home plates) and the 3D frame around it. Team colours never
 * change, so every theme stays instantly readable.
 */

export type BoardThemeId = 'noir' | 'jewel' | 'rune' | 'steam' | 'pirate' | 'grove' | 'space' | 'obsidian' | 'marble' | 'synth' | 'bronze'

export interface BoardTheme {
  id: BoardThemeId
  name: string
  tagline: string
  /** Grout / board body gradient (top-left → bottom-right). */
  body: [string, string]
  /** Neutral walkway stone: highlight, mid, shadow. */
  tile: [string, string, string]
  /** Polished top-left lip of each stone. */
  bevel: string
  /** Fine engraved line inside each stone. */
  engrave: string
  /** Veins across the walkway stone. */
  vein: string
  /** Strength of the speckled grain. */
  grain: number
  /** Metal inlay: highlight, mid, shadow (gold, platinum, neon, copper …). */
  inlay: [string, string, string]
  /** Inner yard where waiting warriors stand: light, mid, dark. */
  yard: [string, string, string]
  yardVein: string
  /** How far the team colour is pulled toward black on the home plates (start, middle, end). */
  plate: [number, number, number]
  /** Neon grid: the engraved lines also glow (Synthwave). */
  neonGrid?: boolean
  /**
   * Neon Noir: black gloss stone where every mark is a lit tube in the team's colour (outlined lanes,
   * hollow diamonds for safe squares, light-line arrows) and the centre is black glass with neon ridges.
   */
  neon?: boolean
  /**
   * A board photo shown as-is for the classic board: the photo alone, flat and unlit, with none of the 3D
   * frame, glass, centre pyramid or board lights. The procedural palette above paints 5- and 6-player boards.
   */
  image?: BoardImageCalibration
  /** The glass slab under the board. */
  slab: { color: string; emissive: string; emissiveIntensity: number }
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  noir: {
    id: 'noir',
    name: 'Neon Noir',
    tagline: 'Black gloss, live neon',
    body: ['#050508', '#000000'],
    tile: ['#1c1f2b', '#12141d', '#0a0b11'],
    bevel: 'rgba(255,255,255,0.18)',
    engrave: 'rgba(255,255,255,0.05)',
    vein: '#3a3e52',
    grain: 0.018,
    inlay: ['#ffffff', '#c9d2ff', '#4b5068'],
    yard: ['#0d0e14', '#08090d', '#030304'],
    yardVein: '#2a2d3c',
    plate: [-0.05, -0.38, -0.62],
    neon: true,
    slab: { color: '#030305', emissive: '#08061a', emissiveIntensity: 0.2 },
  },
  jewel: {
    id: 'jewel',
    name: 'Royal Jewel',
    tagline: 'Marble, gold, gemstones',
    body: ['#1c150a', '#070502'],
    tile: ['#f1e9d6', '#ddd0b4', '#b8a684'],
    bevel: 'rgba(255,250,235,0.9)',
    engrave: 'rgba(90,70,30,0.25)',
    vein: '#8a7a5c',
    grain: 0.03,
    inlay: ['#fbe7a6', '#d4a640', '#7a5518'],
    yard: ['#2a2116', '#17120b', '#0b0805'],
    yardVein: '#b49a62',
    plate: [-0.1, -0.35, -0.55],
    image: {
      url: '/textures/ludo/board-jewel.jpg',
      size: [1254, 1254],
      xs: [55, 506, 752, 1200],
      ys: [66, 501, 733, 1170],
      gems: {
        tl: { x: [213, 381], y: [216, 377] },
        tr: { x: [889, 1041], y: [234, 374] },
        bl: { x: [214, 367], y: [881, 1020] },
        br: { x: [884, 1044], y: [872, 1012] },
      },
      gemHalf: 0.66,
    },
    slab: { color: '#2a1d0c', emissive: '#3a2508', emissiveIntensity: 0.25 },
  },
  rune: {
    id: 'rune',
    name: 'Rune Forest',
    tagline: 'Runestones, fairy glade',
    body: ['#0d1a16', '#040807'],
    tile: ['#d6d2c4', '#b3ad9c', '#857f6e'],
    bevel: 'rgba(255,250,235,0.7)',
    engrave: 'rgba(40,60,50,0.3)',
    vein: '#6f7a66',
    grain: 0.035,
    inlay: ['#c9f2ff', '#5fd0e8', '#1f6b7a'],
    yard: ['#1d2a22', '#121b15', '#080c09'],
    yardVein: '#6fa58e',
    plate: [-0.1, -0.35, -0.55],
    image: {
      url: '/textures/ludo/board-rune.jpg',
      size: [1024, 1024],
      xs: [52, 420, 605, 972],
      ys: [78, 408, 580, 915],
      gems: {
        tl: { x: [213, 323], y: [215, 312] },
        tr: { x: [697, 807], y: [213, 313] },
        bl: { x: [213, 322], y: [663, 770] },
        br: { x: [697, 808], y: [678, 773] },
      },
      gemHalf: 0.64,
    },
    slab: { color: '#0d1f1a', emissive: '#10302a', emissiveIntensity: 0.25 },
  },
  steam: {
    id: 'steam',
    name: 'Steam Works',
    tagline: 'Brass gears, copper pipes',
    body: ['#2a1a0d', '#0e0804'],
    tile: ['#e6d4b0', '#c9b088', '#94795a'],
    bevel: 'rgba(255,240,210,0.6)',
    engrave: 'rgba(80,50,20,0.35)',
    vein: '#7a5a38',
    grain: 0.045,
    inlay: ['#ffd9a0', '#c88a3e', '#6e4216'],
    yard: ['#33251a', '#21170f', '#120c07'],
    yardVein: '#b5895a',
    plate: [-0.15, -0.38, -0.58],
    image: {
      url: '/textures/ludo/board-steam.jpg',
      size: [1024, 1024],
      xs: [48, 420, 608, 975],
      ys: [78, 408, 590, 922],
      gems: {
        tl: { x: [216, 323], y: [215, 320] },
        tr: { x: [698, 805], y: [210, 316] },
        bl: { x: [216, 323], y: [690, 793] },
        br: { x: [698, 805], y: [685, 790] },
      },
      gemHalf: 0.7,
    },
    slab: { color: '#2a1a0c', emissive: '#4a2c10', emissiveIntensity: 0.28 },
  },
  pirate: {
    id: 'pirate',
    name: 'Pirate Cove',
    tagline: 'Treasure, compass, open sea',
    body: ['#3a2410', '#140b04'],
    tile: ['#efe2c8', '#d6c4a2', '#a8936e'],
    bevel: 'rgba(255,250,235,0.85)',
    engrave: 'rgba(90,60,25,0.28)',
    vein: '#8a6f48',
    grain: 0.03,
    inlay: ['#ffe9a6', '#e0a83a', '#7a5214'],
    yard: ['#2c1e10', '#1b1209', '#0d0804'],
    yardVein: '#c39a58',
    plate: [-0.05, -0.3, -0.5],
    image: {
      url: '/textures/ludo/board-pirate.jpg',
      size: [1254, 1254],
      xs: [58, 515, 740, 1198],
      ys: [92, 488, 715, 1125],
      gems: {
        tl: { x: [262, 397], y: [260, 374] },
        tr: { x: [857, 990], y: [260, 374] },
        bl: { x: [262, 397], y: [830, 940] },
        br: { x: [857, 990], y: [830, 940] },
      },
      gemHalf: 0.64,
    },
    slab: { color: '#2a1a0a', emissive: '#4a2e0c', emissiveIntensity: 0.25 },
  },
  grove: {
    id: 'grove',
    name: 'Enchanted Grove',
    tagline: 'Glowing glade, gem stones',
    body: ['#0b1a1c', '#030809'],
    tile: ['#e2ddd0', '#c4bdaa', '#938b77'],
    bevel: 'rgba(255,250,235,0.75)',
    engrave: 'rgba(40,60,50,0.28)',
    vein: '#7d8670',
    grain: 0.03,
    inlay: ['#b8ffd6', '#4ee09a', '#17734a'],
    yard: ['#16261c', '#0e1912', '#060b08'],
    yardVein: '#5fb07e',
    plate: [-0.08, -0.32, -0.52],
    image: {
      url: '/textures/ludo/board-grove.jpg',
      size: [1024, 1024],
      xs: [40, 413, 608, 980],
      ys: [40, 393, 575, 942],
      gems: {
        tl: { x: [188, 305], y: [180, 297] },
        tr: { x: [720, 838], y: [180, 297] },
        bl: { x: [188, 305], y: [690, 800] },
        br: { x: [720, 838], y: [690, 800] },
      },
      gemHalf: 0.72,
    },
    slab: { color: '#0c1d1a', emissive: '#0f3a2c', emissiveIntensity: 0.28 },
  },
  space: {
    id: 'space',
    name: 'Star Command',
    tagline: 'Neon starship, deep space',
    body: ['#0a1030', '#02040e'],
    tile: ['#f4f6fb', '#dfe4ee', '#b9c1d2'],
    bevel: 'rgba(255,255,255,0.95)',
    engrave: 'rgba(80,100,140,0.25)',
    vein: '#9aa6c2',
    grain: 0.02,
    inlay: ['#c8f4ff', '#3ec8ff', '#1462a8'],
    yard: ['#1a2036', '#10142a', '#070a18'],
    yardVein: '#5f7bc8',
    plate: [-0.05, -0.28, -0.5],
    image: {
      url: '/textures/ludo/board-space.jpg',
      size: [1254, 1254],
      xs: [42, 518, 745, 1212],
      ys: [30, 467, 695, 1135],
      gems: {
        tl: { x: [225, 365], y: [191, 322] },
        tr: { x: [885, 1023], y: [191, 322] },
        bl: { x: [225, 365], y: [838, 967] },
        br: { x: [883, 1023], y: [838, 967] },
      },
      gemHalf: 0.66,
    },
    slab: { color: '#0a1230', emissive: '#16307a', emissiveIntensity: 0.4 },
  },
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Royale',
    tagline: 'Graphite stone, gold inlay',
    body: ['#12141c', '#06070b'],
    tile: ['#5d6680', '#3b4155', '#262a38'],
    bevel: 'rgba(255,255,255,0.28)',
    engrave: 'rgba(255,255,255,0.07)',
    vein: '#aab3cc',
    grain: 0.04,
    inlay: ['#f6dc9a', '#d9b25f', '#7a5a22'],
    yard: ['#1c1f2a', '#11131b', '#0a0b10'],
    yardVein: '#9aa3bd',
    plate: [-0.25, -0.5, -0.68],
    slab: { color: '#141a31', emissive: '#18213f', emissiveIntensity: 0.3 },
  },
  marble: {
    id: 'marble',
    name: 'Royal Marble',
    tagline: 'White Carrara, platinum',
    body: ['#c9cdd8', '#8e95a6'],
    tile: ['#ffffff', '#eef0f5', '#cdd2dd'],
    bevel: 'rgba(255,255,255,0.95)',
    engrave: 'rgba(110,118,140,0.22)',
    vein: '#8f97ad',
    grain: 0.025,
    inlay: ['#ffffff', '#c3c9d6', '#6f778b'],
    yard: ['#f7f8fb', '#e4e7ee', '#c9ced9'],
    yardVein: '#8e94aa',
    plate: [0.05, -0.12, -0.32],
    slab: { color: '#cfd5e3', emissive: '#7c8cb0', emissiveIntensity: 0.18 },
  },
  synth: {
    id: 'synth',
    name: 'Neon Synthwave',
    tagline: 'Violet glass, cyan grid',
    body: ['#16052e', '#05010d'],
    tile: ['#2c1656', '#1b0c3a', '#100626'],
    bevel: 'rgba(255,120,225,0.55)',
    engrave: 'rgba(92,240,255,0.6)',
    vein: '#ff4fd8',
    grain: 0.03,
    inlay: ['#a8fdff', '#3ee8ff', '#1670a8'],
    yard: ['#1d0a3c', '#110427', '#07010f'],
    yardVein: '#ff6ee0',
    plate: [-0.4, -0.6, -0.76],
    neonGrid: true,
    slab: { color: '#1a0836', emissive: '#3a0f6e', emissiveIntensity: 0.5 },
  },
  bronze: {
    id: 'bronze',
    name: 'Desert Bronze',
    tagline: 'Sandstone, copper inlay',
    body: ['#2c1b0f', '#120a04'],
    tile: ['#d3ad84', '#a9805a', '#7a5536'],
    bevel: 'rgba(255,240,210,0.55)',
    engrave: 'rgba(70,36,12,0.35)',
    vein: '#6b4a2a',
    grain: 0.045,
    inlay: ['#ffd9a8', '#c8823e', '#6e3d16'],
    yard: ['#3a2616', '#24170c', '#150d06'],
    yardVein: '#b58a5c',
    plate: [-0.15, -0.38, -0.58],
    slab: { color: '#3a2412', emissive: '#5a3414', emissiveIntensity: 0.28 },
  },
}

/** Boards everyone has. Every other board is a one-time BOARD_PRICE_INR unlock (Google Play product ludo_board_<id>). */
export const FREE_THEMES: BoardThemeId[] = ['jewel', 'noir', 'obsidian', 'marble', 'synth', 'bronze']
/** the price of each locked board (never coins or gems) */
export const BOARD_PRICE_INR = '₹99'
/** The picker's order: the free boards first, then the ones to unlock. */
export const THEME_ORDER: BoardThemeId[] = [...FREE_THEMES, 'rune', 'steam', 'pirate', 'grove', 'space']

const OWNED_KEY = 'ludo.boardsOwned.v1'

function savedOwned(): BoardThemeId[] {
  try {
    const v = JSON.parse(localStorage.getItem(OWNED_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && x in BOARD_THEMES) as BoardThemeId[]) : []
  } catch {
    return []
  }
}

/** Locked boards this device has bought (a restore from Google Play adds them back after a reinstall). */
export const useOwnedBoards = create<{ owned: BoardThemeId[]; grant: (ids: BoardThemeId[]) => void }>((set, get) => ({
  owned: savedOwned(),
  grant: (ids) => {
    const owned = [...new Set([...get().owned, ...ids])]
    try {
      localStorage.setItem(OWNED_KEY, JSON.stringify(owned))
    } catch {
      // not persisted; owned for this session
    }
    set({ owned })
  },
}))

export const themeUnlocked = (id: BoardThemeId) => FREE_THEMES.includes(id) || useOwnedBoards.getState().owned.includes(id)

// v3: Royal Jewel became the free default; earlier saved picks are dropped so every player starts on it
const STORAGE_KEY = 'ludo.boardTheme.v3'

function savedTheme(): BoardThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as BoardThemeId | null
    // a locked board that was picked before the locks (or never bought) falls back to the default
    if (v && v in BOARD_THEMES && (FREE_THEMES.includes(v) || savedOwned().includes(v))) return v
  } catch {
    // storage blocked (private mode): fall back to the default look
  }
  // the default board: Royal Jewel
  return 'jewel'
}

/** The board look chosen on this device; remembered between sessions when storage is available. */
export const useBoardTheme = create<{ themeId: BoardThemeId; setTheme: (id: BoardThemeId) => void }>((set) => ({
  themeId: savedTheme(),
  setTheme: (themeId) => {
    if (!themeUnlocked(themeId)) return
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch {
      // not persisted; the choice still applies for this session
    }
    set({ themeId })
  },
}))

/* ------------------------------------------------------------------ warrior styles */

export type CharacterStyleId = 'ranger' | 'vanguard' | 'knight' | 'shadow'

export interface CharacterStyle {
  id: CharacterStyleId
  name: string
  tagline: string
}

export const CHARACTER_STYLES: Record<CharacterStyleId, CharacterStyle> = {
  ranger: { id: 'ranger', name: 'Ranger', tagline: 'Hooded leather scout' },
  vanguard: { id: 'vanguard', name: 'Vanguard', tagline: 'Tactical bodysuit' },
  knight: { id: 'knight', name: 'Knight', tagline: 'Steel plate & great helm' },
  shadow: { id: 'shadow', name: 'Shadow', tagline: 'Team-dyed stealth, neon trim' },
}

export const STYLE_ORDER: CharacterStyleId[] = ['shadow', 'vanguard', 'knight', 'ranger']

const STYLE_KEY = 'ludo.characterStyle.v2'

function savedStyle(): CharacterStyleId {
  try {
    const v = localStorage.getItem(STYLE_KEY) as CharacterStyleId | null
    if (v && v in CHARACTER_STYLES) return v
  } catch {
    // storage blocked: default style
  }
  return 'shadow'
}

/** The warrior style chosen on this device (every team's warriors use it); remembered when storage allows. */
export const useCharacterStyle = create<{ styleId: CharacterStyleId; setStyle: (id: CharacterStyleId) => void }>((set) => ({
  styleId: savedStyle(),
  setStyle: (styleId) => {
    try {
      localStorage.setItem(STYLE_KEY, styleId)
    } catch {
      // not persisted
    }
    set({ styleId })
  },
}))
