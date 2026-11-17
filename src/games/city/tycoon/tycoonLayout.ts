// Geometry of the World Tycoon board art. Everything is in image pixels of board.jpg (1671 x 941);
// the stage scales the whole picture to the screen, so these numbers stay valid at any size.

export const DESIGN_W = 1671
export const DESIGN_H = 941

/** How long the dice tumble before the token starts walking, and the time per hop between squares. */
export const DICE_ROLL_MS = 900
export const STEP_MS = 260

export type Rect = [x0: number, y0: number, x1: number, y1: number]
export type Side = 'bottom' | 'right' | 'top' | 'left' | 'corner'

/** The painted label card of every square, by tile id (clockwise from START). */
export const TILE_RECTS: Rect[] = [
  // bottom row, START (bottom-left corner) to Jail (bottom-right corner)
  [78, 668, 258, 768],
  [260, 676, 390, 770],
  [392, 676, 528, 770],
  [530, 676, 672, 770],
  [674, 676, 818, 770],
  [820, 676, 970, 770],
  [972, 676, 1110, 770],
  [1112, 676, 1250, 770],
  [1252, 676, 1398, 770],
  [1400, 668, 1576, 768],
  // right column, bottom to top
  [1410, 618, 1626, 665],
  [1400, 568, 1612, 616],
  [1390, 519, 1596, 566],
  [1376, 470, 1580, 517],
  [1360, 421, 1562, 468],
  [1346, 375, 1546, 419],
  [1330, 329, 1530, 373],
  [1320, 283, 1520, 326],
  // top row, Casino (top-right corner) to Grand Club (top-left corner)
  [1288, 195, 1456, 282],
  [1180, 200, 1290, 286],
  [1072, 200, 1178, 286],
  [952, 200, 1070, 286],
  [830, 200, 950, 286],
  [697, 200, 828, 286],
  [580, 200, 695, 286],
  [464, 200, 578, 286],
  [346, 200, 462, 286],
  [205, 196, 352, 282],
  // left column, top to bottom
  [172, 284, 342, 323],
  [146, 327, 326, 372],
  [128, 373, 312, 418],
  [96, 421, 296, 467],
  [76, 470, 280, 516],
  [56, 519, 270, 566],
  [40, 568, 262, 616],
  [30, 618, 258, 665],
]

export const CORNERS = new Set([0, 9, 18, 27])

export function tileSide(id: number): Side {
  if (CORNERS.has(id)) return 'corner'
  if (id < 9) return 'bottom'
  if (id < 18) return 'right'
  if (id < 27) return 'top'
  return 'left'
}

/** Where a token's feet go on each square: just inside the ring so names and prices stay readable. */
export function tokenAnchor(id: number): [number, number] {
  const [x0, y0, x1, y1] = TILE_RECTS[id]
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  switch (id) {
    case 0:
      return [cx - 8, y1 - 18]
    case 9:
      return [cx + 8, y1 - 18]
    case 18:
      return [cx, y1 - 10]
    case 27:
      return [cx, y1 - 10]
  }
  switch (tileSide(id)) {
    case 'bottom':
      return [cx, y0 + 10]
    case 'top':
      return [cx, y0 + 18]
    case 'right':
      return [x0 - 34, cy + 20]
    default:
      return [x1 + 34, cy + 20]
  }
}

/** Which way tokens sharing a square fan out. */
export function fanDirection(id: number): [number, number] {
  switch (tileSide(id)) {
    case 'left':
      return [30, 0]
    case 'right':
      return [-30, 0]
    default:
      return [30, 0]
  }
}

/* ------------------------------------------------------------------ HUD regions painted on the art */

export const BACK_BTN: Rect = [24, 11, 92, 79]
export const SETTINGS_BTN: Rect = [1591, 15, 1651, 75]
/** The painted title banner, covered with the World Tycoon title. */
export const LOGO_COVER: Rect = [98, 2, 456, 98]
export const COIN_TEXT: Rect = [1106, 22, 1214, 66]
export const GEM_TEXT: Rect = [1338, 22, 1402, 66]
export const PLAYERS_TEXT: Rect = [1514, 22, 1576, 66]

export interface SeatGeom {
  /** whole painted card */
  card: Rect
  /** name + cash text area */
  text: Rect
  /** painted dice, used for the seat's last roll */
  dice: Rect
  /** avatar circle centre and radius */
  avatar: [number, number, number]
}

export const SEAT_GEOM: SeatGeom[] = [
  { card: [8, 95, 312, 186], text: [102, 103, 224, 170], dice: [222, 101, 308, 178], avatar: [55, 139, 46] },
  { card: [1356, 95, 1666, 186], text: [1454, 103, 1574, 170], dice: [1572, 101, 1662, 178], avatar: [1405, 140, 46] },
  { card: [8, 763, 318, 858], text: [110, 775, 232, 843], dice: [230, 773, 314, 849], avatar: [58, 808, 46] },
  { card: [1334, 763, 1666, 858], text: [1446, 775, 1570, 843], dice: [1568, 773, 1660, 849], avatar: [1385, 808, 46] },
]

export type ActionKey = 'map' | 'cards' | 'info' | 'bank' | 'items'

export const ACTION_RECTS: Record<ActionKey, Rect> = {
  map: [422, 780, 552, 890],
  cards: [572, 780, 716, 890],
  info: [734, 780, 898, 890],
  bank: [916, 780, 1052, 890],
  items: [1070, 780, 1218, 890],
}

/** The control hub over the globe in the middle of the board. */
export const HUB_CENTER: [number, number] = [820, 470]

/** The open water between Sneha's card and the buttons, used for the chat bubble. */
export const CHAT_BTN: Rect = [338, 800, 402, 864]

/**
 * Printed values on the art that differ from the rule book. Each is painted over with the rule-book
 * value so what you see on the board is what the game charges.
 */
export interface PricePatch {
  tileId: number
  rect: Rect
  text: string
  tone: 'cream' | 'red' | 'small'
}

export const PRICE_PATCHES: PricePatch[] = [
  { tileId: 35, rect: [154, 636, 232, 661], text: '$1,600', tone: 'cream' },
  { tileId: 10, rect: [1525, 636, 1603, 661], text: '$2,300', tone: 'cream' },
  { tileId: 13, rect: [1484, 488, 1563, 512], text: '$1,500', tone: 'cream' },
  { tileId: 15, rect: [1446, 389, 1538, 413], text: '$2,500', tone: 'cream' },
  { tileId: 31, rect: [196, 441, 268, 465], text: '$5,000', tone: 'red' },
  { tileId: 5, rect: [858, 733, 942, 752], text: 'max $500', tone: 'small' },
  { tileId: 32, rect: [148, 499, 210, 513], text: 'max $500', tone: 'small' },
]
