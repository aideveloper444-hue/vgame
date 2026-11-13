import { create } from 'zustand'

/*
 * Board looks the player picks before a match. Each theme is a complete material set for the painted
 * board (walkway stone, metal inlay, yard, home plates) and the 3D frame around it. Team colours never
 * change, so every theme stays instantly readable.
 */

export type BoardThemeId = 'noir' | 'obsidian' | 'marble' | 'synth' | 'bronze'

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
  /** The glass slab under the board. */
  slab: { color: string; emissive: string; emissiveIntensity: number }
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  noir: {
    id: 'noir',
    name: 'Neon Noir',
    tagline: 'Black gloss, live neon',
    body: ['#050508', '#000000'],
    tile: ['#0d0e13', '#07080b', '#020203'],
    bevel: 'rgba(255,255,255,0.12)',
    engrave: 'rgba(255,255,255,0.05)',
    vein: '#3a3e52',
    grain: 0.018,
    inlay: ['#ffffff', '#c9d2ff', '#4b5068'],
    yard: ['#0d0e14', '#08090d', '#030304'],
    yardVein: '#2a2d3c',
    plate: [-0.72, -0.82, -0.9],
    neon: true,
    slab: { color: '#030305', emissive: '#08061a', emissiveIntensity: 0.2 },
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

export const THEME_ORDER: BoardThemeId[] = ['noir', 'obsidian', 'marble', 'synth', 'bronze']

const STORAGE_KEY = 'ludo.boardTheme.v2'

function savedTheme(): BoardThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as BoardThemeId | null
    if (v && v in BOARD_THEMES) return v
  } catch {
    // storage blocked (private mode): fall back to the default look
  }
  return 'noir'
}

/** The board look chosen on this device; remembered between sessions when storage is available. */
export const useBoardTheme = create<{ themeId: BoardThemeId; setTheme: (id: BoardThemeId) => void }>((set) => ({
  themeId: savedTheme(),
  setTheme: (themeId) => {
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
  shadow: { id: 'shadow', name: 'Shadow', tagline: 'Black ops, neon trim' },
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
