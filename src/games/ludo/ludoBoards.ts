import {
  BASE_QUADRANT,
  BASE_SLOT_COORDS,
  ENTRY_ABS,
  HOME_STRETCH_COORDS,
  RING_CELLS,
  SAFE_ABS_CELLS,
  type ClassicColor,
  type LudoColor,
} from './ludoBoardLayout'

/** World-space point on the board plane: [x, z]. */
export type Vec2 = [number, number]

/** World size of one board cell (the star boards; the classic board uses the uneven grid below). */
export const CELL = 0.62

/*
 * Classic board grid: 15 equal square spaces across. Every classic position (tokens, painted tiles,
 * center pyramid, yard glows) goes through classicEdge, so they all stay aligned. The lane and home step
 * are kept as separate constants so the walkway could be widened again, but they are equal: every space
 * on the board is the same square.
 */
/** Width of the whole classic playing grid, world units. */
export const CLASSIC_TOTAL = 9.6
/** Width of one walkway lane (rows/columns 6–8). */
export const CLASSIC_LANE = CLASSIC_TOTAL / 15
/** Size of one grid step inside a home zone (rows/columns 0–5 and 9–14). */
export const CLASSIC_HOME_STEP = (CLASSIC_TOTAL - 3 * CLASSIC_LANE) / 12

/** How far (in cells) each painted home plate is inset inside its 6-cell quadrant: the plate is 4 cells wide. */
export const HOME_INSET = 1

/** Distance of classic grid line `t` (0..15, fractional allowed) from the grid's top/left edge. */
export function classicEdge(t: number): number {
  if (t <= 6) return t * CLASSIC_HOME_STEP
  if (t <= 9) return 6 * CLASSIC_HOME_STEP + (t - 6) * CLASSIC_LANE
  return 6 * CLASSIC_HOME_STEP + 3 * CLASSIC_LANE + (t - 9) * CLASSIC_HOME_STEP
}

/*
 * Every board shares one track shape per arm: 6 cells running outward, the tip cell, and 6 cells
 * running back inward (13 per arm), plus a private 5-cell home lane down the middle of the arm. A
 * token's `distance` is counted from its start cell:
 *   -1                    in base
 *   0 .. ringSpan         on the shared ring (ringSpan = ringSize - 2, the tip of its own arm)
 *   homeStart .. +4       its home lane
 *   finish                home (the center)
 * With 4 arms that is exactly classic Ludo (52-cell ring, finish at 56).
 */
export interface LudoBoard {
  kind: 'classic' | 'radial'
  /** Number of arms (and bases) on the board. */
  arms: number
  /** Team color of each arm, in turn order around the board. */
  armColors: LudoColor[]
  ringSize: number
  ringSpan: number
  homeStart: number
  finish: number
  /** Scale applied to characters standing on this board. */
  pieceScale: number
  /** Absolute ring index of a team's start cell. */
  entryAbs: (color: LudoColor) => number
  isSafe: (abs: number) => boolean
  ringPos: (abs: number) => Vec2
  /** Direction of travel out of an absolute ring cell, as an angle for arrows. */
  ringNext: (abs: number) => Vec2
  homePos: (color: LudoColor, step: number) => Vec2
  basePos: (color: LudoColor, tokenIndex: number) => Vec2
  yardCenter: (color: LudoColor) => Vec2
  finishPos: (color: LudoColor, tokenIndex: number) => Vec2
  /** Outline points of the board body, used to frame the camera. */
  outline: Vec2[]
}

export function tokenPos(board: LudoBoard, color: LudoColor, distance: number, tokenIndex: number): Vec2 {
  if (distance === -1) return board.basePos(color, tokenIndex)
  if (distance >= board.finish) return board.finishPos(color, tokenIndex)
  if (distance >= board.homeStart) return board.homePos(color, distance - board.homeStart)
  return board.ringPos((board.entryAbs(color) + distance) % board.ringSize)
}

/** Absolute ring cell a token occupies, or null when it is in base, its home lane or finished. */
export function tokenAbs(board: LudoBoard, color: LudoColor, distance: number): number | null {
  if (distance < 0 || distance > board.ringSpan) return null
  return (board.entryAbs(color) + distance) % board.ringSize
}

/* ------------------------------------------------------------------ classic 15x15 cross */

/** World [x, z] of the centre of classic cell (row, col); fractional coordinates allowed. */
function gridWorld(row: number, col: number): Vec2 {
  return [classicEdge(col + 0.5) - CLASSIC_TOTAL / 2, classicEdge(row + 0.5) - CLASSIC_TOTAL / 2]
}

const FINISH_DIR: Record<ClassicColor, Vec2> = { RED: [-1, 0], GREEN: [0, -1], YELLOW: [1, 0], BLUE: [0, 1] }
const CLASSIC_HALF = 5.0

function makeClassic(): LudoBoard {
  const armColors: ClassicColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE']
  const cc = (c: LudoColor) => c as ClassicColor
  return {
    kind: 'classic',
    arms: 4,
    armColors,
    ringSize: 52,
    ringSpan: 50,
    homeStart: 51,
    finish: 56,
    // warriors stand a little taller than a square so they read clearly from the board camera
    pieceScale: 1.55,
    entryAbs: (c) => ENTRY_ABS[cc(c)],
    isSafe: (abs) => SAFE_ABS_CELLS.has(abs),
    ringPos: (abs) => gridWorld(...RING_CELLS[abs]),
    ringNext: (abs) => gridWorld(...RING_CELLS[(abs + 1) % 52]),
    homePos: (c, step) => gridWorld(...HOME_STRETCH_COORDS[cc(c)][step]),
    basePos: (c, i) => gridWorld(...BASE_SLOT_COORDS[cc(c)][i]),
    yardCenter: (c) => {
      const q = BASE_QUADRANT[cc(c)]
      return gridWorld(q.row + 2.5, q.col + 2.5)
    },
    finishPos: (c, i) => {
      const [dx, dz] = FINISH_DIR[cc(c)]
      // finished warriors stand on their team's triangle of the (now larger) center home
      const spread = (i - 1.5) * CLASSIC_LANE * 0.31
      return [dx * CLASSIC_LANE * 1.07 + dz * spread, dz * CLASSIC_LANE * 1.07 + dx * spread]
    },
    outline: [
      [-CLASSIC_HALF - 0.1, -CLASSIC_HALF],
      [CLASSIC_HALF + 0.1, -CLASSIC_HALF],
      [CLASSIC_HALF + 0.1, CLASSIC_HALF],
      [-CLASSIC_HALF - 0.1, CLASSIC_HALF],
    ],
  }
}

/* ------------------------------------------------------------------ 5–8 arm star */

const RADIAL_COLORS: Record<number, LudoColor[]> = {
  5: ['RED', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE'],
  6: ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE'],
  7: ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'CYAN', 'BLUE', 'PURPLE'],
  8: ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'CYAN', 'BLUE', 'PURPLE', 'PINK'],
}

/** Geometry of an n-arm star board; shared by the rules, the 3D scene and the board painter. */
export interface RadialGeometry {
  n: number
  /** Distance from the center to the inner end of each arm (the center polygon's apothem). */
  r0: number
  /** Distance from the center to the arm tips. */
  armEnd: number
  /** Apothem and circumradius of the painted board polygon. */
  apothem: number
  circumradius: number
  /** Distance from the center to each base yard. */
  yardRadius: number
  /** Half-size of a base yard square. */
  yardHalf: number
  /** Angle of arm k (world x = cos, z = sin). */
  armAngle: (k: number) => number
  /** Center of the cell in arm k, lane -1 (outward), 0 (home lane) or +1 (inward), row 0 (center end) to 5 (tip). */
  cell: (k: number, lane: number, row: number) => Vec2
}

export function radialGeometry(n: number): RadialGeometry {
  const c = CELL
  const half = Math.PI / n
  const r0 = (1.5 * c) / Math.tan(half) + 0.02
  const armEnd = r0 + 6 * c
  const apothem = armEnd + 0.6 * c
  const circumradius = apothem / Math.cos(half)
  const yardHalf = 1.45 * c
  const yardRadius = Math.max((1.5 * c + yardHalf * 1.2) / Math.sin(half), 0.62 * circumradius)
  // put the first team's base straight toward the camera
  const phi0 = Math.PI / 2 - half
  const armAngle = (k: number) => phi0 + (k * 2 * Math.PI) / n
  const cell = (k: number, lane: number, row: number): Vec2 => {
    const a = armAngle(k)
    const ux = Math.cos(a)
    const uz = Math.sin(a)
    const r = r0 + (row + 0.5) * c
    return [ux * r - uz * lane * c, uz * r + ux * lane * c]
  }
  return { n, r0, armEnd, apothem, circumradius, yardRadius, yardHalf, armAngle, cell }
}

function makeRadial(n: number): LudoBoard {
  const g = radialGeometry(n)
  const armColors = RADIAL_COLORS[n]
  const armOf = (color: LudoColor) => Math.max(0, armColors.indexOf(color))
  const ringSize = 13 * n

  const ring: Vec2[] = []
  for (let k = 0; k < n; k++) {
    for (let row = 0; row <= 5; row++) ring.push(g.cell(k, -1, row))
    ring.push(g.cell(k, 0, 5))
    for (let row = 5; row >= 0; row--) ring.push(g.cell(k, 1, row))
  }
  const safe = new Set<number>()
  for (let k = 0; k < n; k++) {
    safe.add(13 * k + 8)
    safe.add((13 * k + 16) % ringSize)
  }
  const wedge = (k: number) => g.armAngle(k) + Math.PI / n

  const outline: Vec2[] = []
  const bodyR = g.circumradius + 0.3 // matches the slim frame drawn by RadialFrame
  for (let k = 0; k < n; k++) {
    const a = wedge(k)
    outline.push([Math.cos(a) * bodyR, Math.sin(a) * bodyR])
  }

  return {
    kind: 'radial',
    arms: n,
    armColors,
    ringSize,
    ringSpan: ringSize - 2,
    homeStart: ringSize - 1,
    finish: ringSize + 4,
    pieceScale: n >= 7 ? 0.98 : 1.08,
    entryAbs: (color) => 13 * armOf(color) + 8,
    isSafe: (abs) => safe.has(abs),
    ringPos: (abs) => ring[abs],
    ringNext: (abs) => ring[(abs + 1) % ringSize],
    homePos: (color, step) => g.cell(armOf(color), 0, 4 - step),
    basePos: (color, i) => {
      const a = wedge(armOf(color))
      const [cx, cz] = [Math.cos(a) * g.yardRadius, Math.sin(a) * g.yardRadius]
      const ux = Math.cos(a)
      const uz = Math.sin(a)
      const along = (i < 2 ? -1 : 1) * 0.8 * CELL
      const across = (i % 2 ? 1 : -1) * 0.8 * CELL
      return [cx + ux * along - uz * across, cz + uz * along + ux * across]
    },
    yardCenter: (color) => {
      const a = wedge(armOf(color))
      return [Math.cos(a) * g.yardRadius, Math.sin(a) * g.yardRadius]
    },
    finishPos: (color, i) => {
      const a = g.armAngle(armOf(color))
      const ux = Math.cos(a)
      const uz = Math.sin(a)
      const r = g.r0 * 0.6
      const spread = (i - 1.5) * Math.min(0.19, g.r0 * 0.16)
      return [ux * r - uz * spread, uz * r + ux * spread]
    },
    outline,
  }
}

/* ------------------------------------------------------------------ lookup */

const cache = new Map<number, LudoBoard>()

/** Board with the given number of arms: 4 is the classic cross, 5–8 are star boards. */
export function getBoard(arms: number): LudoBoard {
  const key = arms >= 5 && arms <= 8 ? arms : 4
  let b = cache.get(key)
  if (!b) {
    b = key === 4 ? makeClassic() : makeRadial(key)
    cache.set(key, b)
  }
  return b
}

/** How many arms the board needs for a table of `players`. */
export function armsFor(players: number): number {
  return players <= 4 ? 4 : Math.min(8, players)
}

/** Team colors for each seat, in turn order. Two players sit opposite each other on the classic board. */
export function seatColors(players: number): LudoColor[] {
  if (players <= 2) return ['RED', 'YELLOW']
  if (players === 3) return ['RED', 'GREEN', 'YELLOW']
  if (players === 4) return ['RED', 'GREEN', 'YELLOW', 'BLUE']
  return RADIAL_COLORS[Math.min(8, players)]
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
