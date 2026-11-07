import { createHash, createHmac, createPublicKey, createSign, randomBytes, scryptSync, timingSafeEqual, verify as rsaVerify } from 'node:crypto'
import { config } from './config'

/* Passwords (scrypt), access tokens (HS256 JWT), refresh tokens, TOTP and third-party JWT verification. */

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export function checkPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false
  const [, saltHex, keyHex] = stored.split('$')
  const key = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 })
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'))
}

export interface AccessClaims {
  sub: string
  role: string
  sid: string
  /** admin console sessions carry a second factor */
  mfa?: boolean
  exp: number
}

export function signAccess(claims: Omit<AccessClaims, 'exp'>, ttlSec = config.accessTtlSec): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSec }))
  const sig = createHmac('sha256', config.jwtSecret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

export function verifyAccess(token: string): AccessClaims | null {
  const [head, body, sig] = token.split('.')
  if (!head || !body || !sig) return null
  const want = createHmac('sha256', config.jwtSecret).update(`${head}.${body}`).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as AccessClaims
  return claims.exp * 1000 > Date.now() ? claims : null
}

export const newToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`

/* ---------------------------------------------------------------- TOTP (RFC 6238) for admin MFA */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function newTotpSecret(): string {
  return [...randomBytes(20)].map((b) => B32[b % 32]).join('')
}
function b32decode(s: string): Buffer {
  let bits = ''
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0')
  const out: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(out)
}
export function totp(secret: string, at = Date.now(), step = 30): string {
  const counter = Math.floor(at / 1000 / step)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', b32decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  const code = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}
export function checkTotp(secret: string, code: string): boolean {
  return [-1, 0, 1].some((w) => totp(secret, Date.now() + w * 30000) === code)
}

/* ---------------------------------------------------------------- RS256 tokens from Google / Apple */

interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
}
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>()

async function jwks(url: string): Promise<Jwk[]> {
  const hit = jwksCache.get(url)
  if (hit && Date.now() - hit.at < 3600_000) return hit.keys
  const r = await fetch(url)
  const { keys } = (await r.json()) as { keys: Jwk[] }
  jwksCache.set(url, { at: Date.now(), keys })
  return keys
}

/** Verify an RS256 ID token against a JWKS endpoint, issuer and audiences; returns its claims. */
export async function verifyIdToken(token: string, jwksUrl: string, issuers: string[], audiences: string[]): Promise<Record<string, unknown> | null> {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) return null
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { kid: string; alg: string }
  if (header.alg !== 'RS256') return null
  const key = (await jwks(jwksUrl)).find((k) => k.kid === header.kid)
  if (!key) return null
  const pub = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' })
  if (!rsaVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, Buffer.from(s, 'base64url'))) return null
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>
  if (!issuers.includes(String(claims.iss))) return null
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.some((a) => audiences.includes(String(a)))) return null
  if (Number(claims.exp) * 1000 < Date.now()) return null
  return claims
}

/** Sign an RS256 JWT with a PEM private key (Google service-account OAuth). */
export function signRs256(payload: Record<string, unknown>, pem: string): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(pem).toString('base64url')
  return `${head}.${body}.${sig}`
}
