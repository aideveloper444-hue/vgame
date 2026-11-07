// Geometry of the ALPHAZOX portrait screen. Everything is in "design units": the reference art is
// 900 x 1600, and the stage is scaled to the viewport as a whole, so these numbers are the reference
// pixel positions. Taller phones get extra space spread between the sections (see AlphaStage).

export const DESIGN_W = 900
export const DESIGN_H = 1600

/** The board art (skyline strip + tile ring + centre city) as cut from the reference. */
export const BOARD_ART = { x: 0, y: 205, w: 900, h: 955 }

export type Rect = [x0: number, y0: number, x1: number, y1: number]
export type RowSide = 'bottom' | 'right' | 'top' | 'left'

/** Tile rectangles by tile id (see buildBoard), measured on the reference. */
export const TILE_RECTS: Rect[] = [
  [18, 1008, 140, 1142], // 0 GO
  [142, 1066, 232, 1150], // 1 Los Angeles
  [234, 1066, 321, 1150], // 2 Las Vegas
  [323, 1066, 410, 1150], // 3 Miami
  [412, 1066, 497, 1150], // 4 Chance
  [500, 1066, 587, 1150], // 5 Chicago
  [589, 1066, 675, 1150], // 6 Mumbai
  [677, 1066, 762, 1150], // 7 Sydney
  [762, 1008, 884, 1142], // 8 Just Visiting
  [762, 918, 884, 1005], // 9 Community Chest
  [762, 818, 884, 915], // 10 Hong Kong
  [762, 718, 884, 815], // 11 Bangkok
  [762, 608, 884, 715], // 12 Singapore
  [762, 482, 884, 605], // 13 Dubai
  [754, 410, 884, 486], // 14 Free Parking
  [650, 410, 746, 486], // 15 Tokyo
  [553, 410, 646, 486], // 16 Berlin
  [460, 410, 550, 486], // 17 Chance
  [362, 410, 456, 486], // 18 Paris
  [258, 410, 356, 486], // 19 London
  [148, 410, 252, 486], // 20 New York
  [18, 410, 140, 486], // 21 Go to Jail
  [18, 488, 140, 605], // 22 Bali
  [18, 607, 140, 717], // 23 Seoul
  [18, 720, 140, 815], // 24 Community Chest
  [18, 818, 140, 915], // 25 Shanghai
  [18, 918, 140, 1005], // 26 Cairo
]

export function tileSide(id: number): RowSide {
  if (id >= 1 && id <= 7) return 'bottom'
  if (id >= 8 && id <= 13) return 'right'
  if (id >= 14 && id <= 21) return 'top'
  return 'left'
}

/**
 * Where a character stands for a tile (feet position). Top-row characters stand on the skyline above
 * their tile, side-column characters stand on the city just inside their tile, and bottom-row
 * characters stand on the city edge right above the tile's label, so no name or price is covered.
 */
export function tokenAnchor(id: number): [number, number] {
  const [x0, y0, x1, y1] = TILE_RECTS[id]
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  switch (tileSide(id)) {
    case 'top':
      return [cx, y0 + 2]
    case 'bottom':
      return [cx, y0 + 6]
    case 'right':
      return [716, Math.min(cy + 40, 1062)]
    default:
      return [186, Math.min(cy + 40, 1062)]
  }
}

/** Seat theme by player index: card colour, card rectangle, avatar centre and character art key. */
export interface SeatTheme {
  color: string
  glow: string
  card: Rect
  avatar: [number, number]
  key: 'rohan' | 'diya' | 'sneha' | 'doctor'
}

export const SEATS: SeatTheme[] = [
  { color: '#2f8dff', glow: '#38bdf8', card: [16, 104, 376, 216], avatar: [76, 160], key: 'rohan' },
  { color: '#ff3fbf', glow: '#ff5fd2', card: [560, 104, 884, 216], avatar: [624, 160], key: 'diya' },
  { color: '#ff3fd8', glow: '#ff64e3', card: [12, 1174, 436, 1288], avatar: [75, 1232], key: 'sneha' },
  { color: '#ffb000', glow: '#ffc93a', card: [464, 1174, 884, 1288], avatar: [534, 1232], key: 'doctor' },
]

/** Bottom action buttons, in the reference order. */
export const ACTION_RECTS: Record<'map' | 'build' | 'attack' | 'defend' | 'items', Rect> = {
  map: [96, 1316, 217, 1414],
  build: [244, 1316, 364, 1414],
  attack: [389, 1316, 510, 1414],
  defend: [538, 1316, 659, 1414],
  items: [686, 1316, 808, 1414],
}

export const CHAT_RECT: Rect = [14, 1472, 602, 1546]
export const SPECIAL_RECT: Rect = [632, 1430, 878, 1578]
