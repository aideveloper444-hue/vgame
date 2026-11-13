// Geometry of the ALPHAZOX portrait screen. Everything is in "design units": the reference art is
// 900 x 1600, and the stage is scaled to the viewport as a whole, so these numbers are the reference
// pixel positions. Taller phones get extra space spread between the sections (see AlphaStage).

export const DESIGN_W = 900
export const DESIGN_H = 1600

/** The board art (skyline strip + tile ring + centre city) as cut from the reference. */
export const BOARD_ART = { x: 0, y: 205, w: 900, h: 955 }

export type Rect = [x0: number, y0: number, x1: number, y1: number]
export type RowSide = 'bottom' | 'right' | 'top' | 'left'

/**
 * The tile ring sits exactly over the ring painted on the board art (outer edge 14..886 x 404..1152),
 * so the skyline above and the city in the middle stay visible. 40 spaces: a corner, 9 cells per side.
 */
export const RING = { x0: 14, y0: 404, x1: 886, y1: 1152, colW: 126, rowH: 88 }
const CELLS = 9
const CELL_W = (RING.x1 - RING.x0 - 2 * RING.colW) / CELLS
const CELL_H = (RING.y1 - RING.y0 - 2 * RING.rowH) / CELLS

function rectFor(id: number): Rect {
  const { x0, y0, x1, y1, colW, rowH } = RING
  const side = Math.floor(id / (CELLS + 1))
  const k = id % (CELLS + 1)
  if (k === 0) {
    // corners: Start bottom-left, Jail bottom-right, Free Parking top-right, Go to Jail top-left
    return [
      [x0, y1 - rowH, x0 + colW, y1],
      [x1 - colW, y1 - rowH, x1, y1],
      [x1 - colW, y0, x1, y0 + rowH],
      [x0, y0, x0 + colW, y0 + rowH],
    ][side] as Rect
  }
  const i = k - 1
  switch (side) {
    case 0: // bottom, left to right
      return [x0 + colW + i * CELL_W, y1 - rowH, x0 + colW + (i + 1) * CELL_W, y1]
    case 1: // right, bottom to top
      return [x1 - colW, y1 - rowH - (i + 1) * CELL_H, x1, y1 - rowH - i * CELL_H]
    case 2: // top, right to left
      return [x1 - colW - (i + 1) * CELL_W, y0, x1 - colW - i * CELL_W, y0 + rowH]
    default: // left, top to bottom
      return [x0, y0 + rowH + i * CELL_H, x0 + colW, y0 + rowH + (i + 1) * CELL_H]
  }
}

/** Tile rectangles by tile id (see buildBoard). */
export const TILE_RECTS: Rect[] = Array.from({ length: 4 * (CELLS + 1) }, (_, id) => rectFor(id))

/** Which side a tile sits on; each corner counts with the row or column it starts. */
export function tileSide(id: number): RowSide {
  if (id >= 1 && id <= 9) return 'bottom'
  if (id >= 10 && id <= 19) return 'right'
  if (id >= 20 && id <= 30) return 'top'
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
      return [716, Math.min(cy + 34, 1062)]
    default:
      return [186, Math.min(cy + 34, 1062)]
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
