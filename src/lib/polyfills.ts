// Small fallbacks for older iPhone / iPad Safari (iOS 14–15), so the games run there too.

if (typeof globalThis.structuredClone !== 'function') {
  // game state is plain data, so a JSON round-trip is an exact copy
  ;(globalThis as { structuredClone: <T>(v: T) => T }).structuredClone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
}

if (typeof window !== 'undefined' && !('AudioContext' in window) && 'webkitAudioContext' in window) {
  ;(window as unknown as { AudioContext: unknown }).AudioContext = (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext
}

export {}
