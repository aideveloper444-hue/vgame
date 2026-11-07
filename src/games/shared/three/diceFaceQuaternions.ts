// Precomputed quaternions [x, y, z, w] that rotate a die so the given face value ends up
// pointing toward world +Y ("face up", visible from a camera looking down at the board).
// Face-to-local-axis assignment: 1=+X, 6=-X, 2=+Y, 5=-Y, 3=+Z, 4=-Z (opposite faces sum to 7),
// matching the material order used by DiceMesh's BoxGeometry ([+x,-x,+y,-y,+z,-z]).
const SQRT_HALF = Math.SQRT1_2

export const DICE_FACE_QUATERNION: Record<1 | 2 | 3 | 4 | 5 | 6, [number, number, number, number]> = {
  1: [0, 0, SQRT_HALF, SQRT_HALF],
  2: [0, 0, 0, 1],
  3: [-SQRT_HALF, 0, 0, SQRT_HALF],
  4: [SQRT_HALF, 0, 0, SQRT_HALF],
  5: [0, 0, 1, 0],
  6: [0, 0, -SQRT_HALF, SQRT_HALF],
}
