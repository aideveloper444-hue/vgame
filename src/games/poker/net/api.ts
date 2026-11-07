/*
 * The club server's REST API. Access tokens are short-lived; the refresh token rotates on every use and
 * lives in this device's storage. A 401 triggers one refresh and a retry.
 */

const env = import.meta.env as Record<string, string | undefined>

/** Server address: VITE_RPC_SERVER, else the dev server on localhost, else the page's own origin. */
export const SERVER = (env.VITE_RPC_SERVER ?? (location.hostname === 'localhost' && location.port !== '8787' ? `http://${location.hostname}:8787` : location.origin)).replace(/\/$/, '')

const KEY = 'rpc-auth'
interface Tokens {
  accessToken: string
  refreshToken: string
}

let tokens: Tokens | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Tokens | null
  } catch {
    return null
  }
})()

export function setTokens(t: Tokens | null) {
  tokens = t
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: the session lasts until the app closes */
  }
}
export const hasSession = () => !!tokens
export const accessToken = () => tokens?.accessToken ?? null

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

let refreshing: Promise<boolean> | null = null
export function refresh(): Promise<boolean> {
  if (!tokens) return Promise.resolve(false)
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${SERVER}/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens!.refreshToken }) })
      if (!r.ok) {
        if (r.status === 401) setTokens(null)
        return false
      }
      setTokens((await r.json()) as Tokens)
      return true
    } catch {
      return false
    } finally {
      setTimeout(() => (refreshing = null), 0)
    }
  })()
  return refreshing
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const go = () =>
    fetch(`${SERVER}/v1${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(tokens && opts.auth !== false ? { Authorization: `Bearer ${tokens.accessToken}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
  let r: Response
  try {
    r = await go()
  } catch {
    throw new ApiError('OFFLINE', 'Can’t reach the club server. Check your connection.', 0)
  }
  if (r.status === 401 && tokens && opts.auth !== false && (await refresh())) r = await go()
  const j = (await r.json().catch(() => ({}))) as { error?: { code: string; message: string } }
  if (!r.ok) throw new ApiError(j.error?.code ?? 'ERROR', j.error?.message ?? 'Something went wrong', r.status)
  return j as T
}
