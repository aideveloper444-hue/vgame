import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { config } from './config'
import { verifyAccess, type AccessClaims } from './crypto'
import { one } from './db'

/*
 * Minimal JSON API layer: routing, body limits, CORS, request ids, per-route rate limits, auth guards and
 * stable error codes (AUTH_REQUIRED, FORBIDDEN, INVALID_INPUT, NOT_FOUND, RATE_LIMITED, CONFLICT…).
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export const bad = (msg: string, code = 'INVALID_INPUT') => new ApiError(400, code, msg)

export interface Ctx {
  req: IncomingMessage
  params: Record<string, string>
  query: URLSearchParams
  body: Record<string, unknown>
  requestId: string
  ip: string
  user: AccessClaims | null
}

type Handler = (ctx: Ctx) => unknown | Promise<unknown>
interface Route {
  method: string
  re: RegExp
  keys: string[]
  handler: Handler
  auth: 'none' | 'user' | 'admin'
  limit: number
}
const routes: Route[] = []

/** Register a route. `limit` = requests per minute per client for this route. */
export function route(method: string, path: string, handler: Handler, opts: { auth?: Route['auth']; limit?: number } = {}) {
  const keys: string[] = []
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$')
  routes.push({ method, re, keys, handler, auth: opts.auth ?? 'user', limit: opts.limit ?? 120 })
}

/* ---------------------------------------------------------------- rate limiting */

const buckets = new Map<string, { n: number; reset: number }>()
export function rateLimit(key: string, perMinute: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + 60000 })
    return true
  }
  b.n++
  return b.n <= perMinute
}
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k)
}, 60000).unref()

/* ---------------------------------------------------------------- validation helpers */

export function str(body: Record<string, unknown>, key: string, opts: { min?: number; max?: number; re?: RegExp; optional?: boolean } = {}): string {
  const v = body[key]
  if (v == null || v === '') {
    if (opts.optional) return ''
    throw bad(`${key} is required`)
  }
  if (typeof v !== 'string') throw bad(`${key} must be text`)
  const s = v.trim()
  if (opts.min && s.length < opts.min) throw bad(`${key} is too short`)
  if (s.length > (opts.max ?? 200)) throw bad(`${key} is too long`)
  if (opts.re && !opts.re.test(s)) throw bad(`${key} is not valid`)
  return s
}
export function int(body: Record<string, unknown>, key: string, min: number, max: number): number {
  const v = Number(body[key])
  if (!Number.isInteger(v) || v < min || v > max) throw bad(`${key} must be a whole number between ${min} and ${max}`)
  return v
}

/* ---------------------------------------------------------------- dispatch */

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  if (origin && (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '600')
  }
}

function readBody(req: IncomingMessage, max = 64 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {})
      } catch {
        reject(bad('Body must be JSON'))
      }
    })
    req.on('error', reject)
  })
}

export const clientIp = (req: IncomingMessage) => (String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?')

export function authFromHeader(req: IncomingMessage): AccessClaims | null {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return null
  return verifyAccess(h.slice(7))
}

export function send(res: ServerResponse, status: number, data: unknown, requestId?: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (requestId) res.setHeader('X-Request-Id', requestId)
  res.end(JSON.stringify(data))
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith('/v1/')) return false
  cors(req, res)
  const requestId = String(req.headers['x-request-id'] ?? randomBytes(8).toString('hex')).slice(0, 40)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }
  const started = Date.now()
  try {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname))
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'No such endpoint')
    const m = r.re.exec(url.pathname)!
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
    const ip = clientIp(req)
    const user = authFromHeader(req)
    if (!rateLimit(`${user?.sub ?? ip}:${r.method}:${r.re.source}`, r.limit)) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests, slow down')
    if (r.auth !== 'none') {
      if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Please sign in')
      const u = one<{ status: string; suspended_until: number; role: string }>('SELECT status, suspended_until, role FROM users WHERE id = ?', user.sub)
      if (!u || u.status === 'deleted') throw new ApiError(401, 'AUTH_REQUIRED', 'Account not found')
      const s = one<{ revoked_at: number | null }>('SELECT revoked_at FROM sessions WHERE id = ?', user.sid)
      if (!s || s.revoked_at) throw new ApiError(401, 'AUTH_REQUIRED', 'Session ended, sign in again')
      if (r.auth === 'admin' && (!['admin', 'moderator'].includes(u.role) || !user.mfa)) throw new ApiError(403, 'FORBIDDEN', 'Administrator sign-in with MFA required')
      user.role = u.role
    }
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req)
    const out = await r.handler({ req, params, query: url.searchParams, body, requestId, ip, user })
    send(res, 200, out ?? { ok: true }, requestId)
    log('info', { requestId, method: req.method, path: url.pathname, status: 200, ms: Date.now() - started, user: user?.sub?.slice(-6) })
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, 'INTERNAL', 'Something went wrong')
    if (!(e instanceof ApiError)) log('error', { requestId, path: url.pathname, error: String((e as Error)?.stack ?? e).slice(0, 800) })
    send(res, err.status, { error: { code: err.code, message: err.message, requestId } }, requestId)
  }
  return true
}

/** Structured logs; never pass passwords, tokens or card data in here. */
export function log(level: 'info' | 'warn' | 'error', data: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, ...data })
  if (level === 'error') console.error(line)
  else if (process.env.LOG_REQUESTS !== '0') console.log(line)
}
