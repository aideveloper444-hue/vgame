// View-only geometry for the 24-tile ring. The store only knows tile indices; this maps them onto
// a Monopoly-style square: GO bottom-left, then counter-clockwise (as seen by the camera) along the
// bottom row, up the right column, back along the top row and down the left column.

/** How long the dice tumble before the token starts walking, and the time per hop between tiles. */
export const DICE_ROLL_MS = 950
export const STEP_MS = 300

export const TILES_PER_SIDE = 6
export const CORNER = 2.3
export const CELL = 1.6
export const BOARD_SIZE = CORNER * 2 + CELL * (TILES_PER_SIDE - 1)
export const HALF = BOARD_SIZE / 2
/** Half-extent of the open area inside the tile ring. */
export const INNER_HALF = HALF - CORNER

export type BoardSide = 'bottom' | 'right' | 'top' | 'left'

export interface TilePlacement {
  x: number
  z: number
  /** footprint along x */
  w: number
  /** footprint along z */
  d: number
  side: BoardSide
  corner: boolean
  /** unit vector pointing from the tile toward the board centre */
  inward: [number, number]
  /** unit vector along the direction of travel */
  along: [number, number]
}

const SIDES: BoardSide[] = ['bottom', 'right', 'top', 'left']
const CORNER_C = HALF - CORNER / 2
const FIRST_CELL = HALF - CORNER - CELL / 2

export function tilePlacement(index: number): TilePlacement {
  const side = SIDES[Math.floor(index / TILES_PER_SIDE) % 4]
  const p = index % TILES_PER_SIDE
  const corner = p === 0
  const offset = FIRST_CELL - (p - 1) * CELL

  switch (side) {
    case 'bottom':
      return corner
        ? { x: -CORNER_C, z: CORNER_C, w: CORNER, d: CORNER, side, corner, inward: [0, -1], along: [1, 0] }
        : { x: -offset, z: CORNER_C, w: CELL, d: CORNER, side, corner, inward: [0, -1], along: [1, 0] }
    case 'right':
      return corner
        ? { x: CORNER_C, z: CORNER_C, w: CORNER, d: CORNER, side, corner, inward: [-1, 0], along: [0, -1] }
        : { x: CORNER_C, z: offset, w: CORNER, d: CELL, side, corner, inward: [-1, 0], along: [0, -1] }
    case 'top':
      return corner
        ? { x: CORNER_C, z: -CORNER_C, w: CORNER, d: CORNER, side, corner, inward: [0, 1], along: [-1, 0] }
        : { x: offset, z: -CORNER_C, w: CELL, d: CORNER, side, corner, inward: [0, 1], along: [-1, 0] }
    default:
      return corner
        ? { x: -CORNER_C, z: -CORNER_C, w: CORNER, d: CORNER, side, corner, inward: [1, 0], along: [0, 1] }
        : { x: -CORNER_C, z: -offset, w: CORNER, d: CELL, side, corner, inward: [1, 0], along: [0, 1] }
  }
}

const SPREAD = [-0.3, -0.1, 0.1, 0.3]
const TOKEN_SLOTS_CORNER: [number, number][] = [
  [-0.45, -0.5],
  [0.45, -0.5],
  [-0.45, 0.2],
  [0.45, 0.2],
]

/**
 * Where player `slot` (0-3) stands on a tile. Every card keeps its name/price in its lower (camera-near)
 * half, so tokens stand on the far half and spread horizontally to stay readable from the camera.
 */
export function tokenPosition(index: number, slot: number): [number, number] {
  const t = tilePlacement(index)
  if (t.corner) {
    const [ox, oz] = TOKEN_SLOTS_CORNER[slot % 4]
    return [t.x + ox, t.z + oz]
  }
  return [t.x + SPREAD[slot % 4] * t.w, t.z - t.d * 0.22]
}
