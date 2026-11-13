/** The four teams of the classic cross-shaped board (2–4 players). */
export type ClassicColor = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE'
/** Every team color; the extra four appear on the 5–8 player star boards. */
export type LudoColor = ClassicColor | 'PURPLE' | 'ORANGE' | 'CYAN' | 'PINK'

export const LUDO_COLORS: ClassicColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE']
export const ALL_COLORS: LudoColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE', 'PURPLE', 'ORANGE', 'CYAN', 'PINK']

/** Main team color — crimson, emerald, gold, royal blue. */
export const COLOR_HEX: Record<LudoColor, string> = {
  RED: '#e0162e',
  GREEN: '#0fa83c',
  YELLOW: '#f2b01e',
  BLUE: '#1f5cf0',
  PURPLE: '#8b3dff',
  ORANGE: '#ff7a1a',
  CYAN: '#0fb9d6',
  PINK: '#ff3fa4',
}

/** Darker shade of each team color, for gradients and shadowed faces. */
export const COLOR_DEEP: Record<LudoColor, string> = {
  RED: '#8a0818',
  GREEN: '#055f22',
  YELLOW: '#9a5a04',
  BLUE: '#1537a8',
  PURPLE: '#48148f',
  ORANGE: '#9a3a05',
  CYAN: '#05616f',
  PINK: '#8e0f55',
}

/** Bright neon version of each team color, for emissive glow and highlights. */
export const COLOR_GLOW: Record<LudoColor, string> = {
  RED: '#ff4f73',
  GREEN: '#45ff7a',
  YELLOW: '#ffd24a',
  BLUE: '#5aa5ff',
  PURPLE: '#b98bff',
  ORANGE: '#ffa45c',
  CYAN: '#5cf0ff',
  PINK: '#ff80c8',
}

// Distance encoding per token (standard 52-cell Ludo):
//   -1        -> in base
//   0..50     -> on the shared 52-cell ring, relative to this color's own start cell
//   51..55    -> home lane (5 private cells leading into the center)
//   56        -> finished (on its own triangle of the center home)
export const RING_SPAN = 50
export const HOME_STRETCH_START = 51
export const HOME_STRETCH_END = 55
export const FINISH_DISTANCE = 56

type Cell = [row: number, col: number]

// One 13-cell quarter of the classic cross-shaped track (RED's start through to GREEN's start),
// rotated 90° clockwise three times to close the loop around the 3x3 center home.
const QUARTER: Cell[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
]
const rotate = ([r, c]: Cell): Cell => [c, 14 - r]
export const RING_CELLS: Cell[] = [0, 1, 2, 3].flatMap((turns) =>
  QUARTER.map((cell) => {
    let out = cell
    for (let i = 0; i < turns; i++) out = rotate(out)
    return out
  }),
)

export const ENTRY_ABS: Record<ClassicColor, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
}

// Absolute ring indices that are safe (no captures): each start square + the star 8 cells after it.
export const SAFE_ABS_CELLS = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47])

export const HOME_STRETCH_COORDS: Record<ClassicColor, Cell[]> = {
  RED: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  GREEN: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  YELLOW: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  BLUE: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
}

// Token spots inside each base yard (fractional cell coordinates, 2 cells apart around the yard center).
// Waiting spots sit close together in a compact home (the home plate is 4 of its 6 cells wide), just far
// enough apart that the warriors' glowing bases don't overlap.
export const BASE_SLOT_COORDS: Record<ClassicColor, Cell[]> = {
  RED: [[1.75, 1.75], [1.75, 3.25], [3.25, 1.75], [3.25, 3.25]],
  GREEN: [[1.75, 10.75], [1.75, 12.25], [3.25, 10.75], [3.25, 12.25]],
  YELLOW: [[10.75, 10.75], [10.75, 12.25], [12.25, 10.75], [12.25, 12.25]],
  BLUE: [[10.75, 1.75], [10.75, 3.25], [12.25, 1.75], [12.25, 3.25]],
}
export const BASE_QUADRANT: Record<ClassicColor, { row: number; col: number }> = {
  RED: { row: 0, col: 0 },
  GREEN: { row: 0, col: 9 },
  YELLOW: { row: 9, col: 9 },
  BLUE: { row: 9, col: 0 },
}

export const CENTER_CELL: Cell = [7, 7]

export function absoluteRingCell(color: ClassicColor, relativeDistance: number): Cell {
  const abs = (ENTRY_ABS[color] + relativeDistance) % RING_CELLS.length
  return RING_CELLS[abs]
}

export function isAbsCellSafe(absIndex: number): boolean {
  return SAFE_ABS_CELLS.has(absIndex)
}

/** Maps a token's (color, distance, tokenIndex) to a [row, col] cell on the 15x15 grid. */
export function getRenderCell(color: ClassicColor, distance: number, tokenIndex: number): Cell {
  if (distance === -1) return BASE_SLOT_COORDS[color][tokenIndex]
  if (distance === FINISH_DISTANCE) return CENTER_CELL
  if (distance >= HOME_STRETCH_START) return HOME_STRETCH_COORDS[color][distance - HOME_STRETCH_START]
  return absoluteRingCell(color, distance)
}

export function cellToPercent([row, col]: Cell): { left: string; top: string } {
  const GRID = 15
  return {
    left: `${((col + 0.5) / GRID) * 100}%`,
    top: `${((row + 0.5) / GRID) * 100}%`,
  }
}

export type CellMeta =
  | { kind: 'base'; color: ClassicColor }
  | { kind: 'ring'; safe: boolean }
  | { kind: 'stretch'; color: ClassicColor }
  | { kind: 'center' }

function buildCellMeta(): CellMeta[][] {
  const grid: (CellMeta | undefined)[][] = Array.from({ length: 15 }, () => Array<CellMeta | undefined>(15))

  for (const color of LUDO_COLORS) {
    const { row, col } = BASE_QUADRANT[color]
    for (let r = row; r < row + 6; r++) {
      for (let c = col; c < col + 6; c++) grid[r][c] = { kind: 'base', color }
    }
  }
  RING_CELLS.forEach(([r, c], i) => {
    grid[r][c] = { kind: 'ring', safe: isAbsCellSafe(i) }
  })
  for (const color of LUDO_COLORS) {
    for (const [r, c] of HOME_STRETCH_COORDS[color]) grid[r][c] = { kind: 'stretch', color }
  }
  for (let r = 6; r <= 8; r++) for (let c = 6; c <= 8; c++) grid[r][c] = { kind: 'center' }

  return grid as CellMeta[][]
}

export const CELL_META = buildCellMeta()
