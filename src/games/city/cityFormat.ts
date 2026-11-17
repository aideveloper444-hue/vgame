/** World Tycoon money, in dollars as printed on the board and deeds. */
export function money(n: number) {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`
}
