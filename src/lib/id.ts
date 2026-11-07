let counter = 0

export function makeId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.floor(Math.random() * 1e6).toString(36)}`
}
