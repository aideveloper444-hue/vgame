/*
 * This device's network identity. Every install gets a random id that never changes; friends add each
 * other with it (shown as a friend code) and it doubles as the PeerJS id of the always-on social peer.
 */

const KEY = 'mw-netid'
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('')
}

let cached: string | null = null

export function myNetId(): string {
  if (cached) return cached
  let id: string | null = null
  try {
    id = localStorage.getItem(KEY)
  } catch {
    /* storage blocked: fall back to a session-only id */
  }
  if (!id || !/^[A-Z0-9]{8}$/.test(id)) {
    id = randomId()
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* ignore */
    }
  }
  cached = id
  return id
}

/** "AB12CD34" -> "AB12-CD34" for display. */
export function formatFriendCode(id: string): string {
  return `${id.slice(0, 4)}-${id.slice(4)}`
}

/** Accepts "ab12-cd34", "AB12 CD34", a pasted invite link… and returns the 8-character id, or null. */
export function parseFriendCode(raw: string): string | null {
  const fromLink = /[?&]friend=([A-Za-z0-9-]+)/.exec(raw)?.[1]
  const id = (fromLink ?? raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{8}$/.test(id) ? id : null
}

export const PEER_PREFIX = 'mwu-'
