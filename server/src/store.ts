import { readFileSync, existsSync } from 'node:fs'
import { config, socialEnabled } from './config'
import { newId, signRs256, verifyIdToken } from './crypto'
import { one, run, tx } from './db'
import { ApiError } from './http'
import { PLAY_PRODUCTS } from '../../src/games/poker/data/cosmetics'
import { notify } from './accounts'
import { log } from './http'

/*
 * Third-party verification: social sign-in tokens, and Google Play purchases.
 * Nothing the client says about a purchase is trusted; the server asks Google.
 */

/* ---------------------------------------------------------------- social sign-in */

export interface SocialIdentity {
  provider: 'google' | 'facebook' | 'apple'
  id: string
  email: string | null
  name: string
}

export async function verifySocial(provider: string, token: string): Promise<SocialIdentity> {
  if (provider === 'google') {
    if (!socialEnabled.google) throw new ApiError(503, 'NOT_CONFIGURED', 'Google sign-in is not configured on the server')
    const c = await verifyIdToken(token, 'https://www.googleapis.com/oauth2/v3/certs', ['https://accounts.google.com', 'accounts.google.com'], config.google.clientIds)
    if (!c) throw new ApiError(401, 'BAD_TOKEN', 'Google sign-in failed')
    return { provider, id: String(c.sub), email: c.email_verified ? String(c.email) : null, name: String(c.given_name ?? c.name ?? 'Player') }
  }
  if (provider === 'apple') {
    if (!socialEnabled.apple) throw new ApiError(503, 'NOT_CONFIGURED', 'Apple sign-in is not configured on the server')
    const c = await verifyIdToken(token, 'https://appleid.apple.com/auth/keys', ['https://appleid.apple.com'], config.apple.clientIds)
    if (!c) throw new ApiError(401, 'BAD_TOKEN', 'Apple sign-in failed')
    return { provider, id: String(c.sub), email: c.email ? String(c.email) : null, name: 'Player' }
  }
  if (provider === 'facebook') {
    if (!socialEnabled.facebook) throw new ApiError(503, 'NOT_CONFIGURED', 'Facebook sign-in is not configured on the server')
    const app = `${config.facebook.appId}|${config.facebook.appSecret}`
    const dbg = (await (await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(app)}`)).json()) as { data?: { is_valid: boolean; app_id: string; user_id: string } }
    if (!dbg.data?.is_valid || dbg.data.app_id !== config.facebook.appId) throw new ApiError(401, 'BAD_TOKEN', 'Facebook sign-in failed')
    const me = (await (await fetch(`https://graph.facebook.com/me?fields=id,first_name,email&access_token=${encodeURIComponent(token)}`)).json()) as { id: string; first_name?: string; email?: string }
    return { provider, id: dbg.data.user_id, email: me.email ?? null, name: me.first_name ?? 'Player' }
  }
  throw new ApiError(400, 'INVALID_INPUT', 'Unknown provider')
}

/**
 * Facebook friends who also play: Graph returns only friends who have signed in to this app with Facebook and
 * granted user_friends. The token must belong to the signed-in player (checked against their facebook_id).
 */
export async function facebookFriendIds(token: string, facebookId: string): Promise<string[]> {
  if (!socialEnabled.facebook) throw new ApiError(503, 'NOT_CONFIGURED', 'Facebook sign-in is not configured on the server')
  const app = `${config.facebook.appId}|${config.facebook.appSecret}`
  const dbg = (await (await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(app)}`)).json()) as { data?: { is_valid: boolean; app_id: string; user_id: string } }
  if (!dbg.data?.is_valid || dbg.data.app_id !== config.facebook.appId || dbg.data.user_id !== facebookId) throw new ApiError(401, 'BAD_TOKEN', 'Facebook session expired, sign in again')
  const ids: string[] = []
  let url: string | null = `https://graph.facebook.com/me/friends?fields=id&limit=500&access_token=${encodeURIComponent(token)}`
  for (let page = 0; url && page < 10; page++) {
    const res = (await (await fetch(url)).json()) as { data?: { id: string }[]; paging?: { next?: string } }
    for (const f of res.data ?? []) ids.push(String(f.id))
    url = res.paging?.next ?? null
  }
  return ids
}

/* ---------------------------------------------------------------- Google Play */

interface ServiceAccount {
  client_email: string
  private_key: string
}
let sa: ServiceAccount | null | undefined
function serviceAccount(): ServiceAccount | null {
  if (sa !== undefined) return sa
  const raw = config.play.serviceAccount
  try {
    sa = raw ? (JSON.parse(raw.trim().startsWith('{') ? raw : existsSync(raw) ? readFileSync(raw, 'utf8') : 'null') as ServiceAccount) : null
  } catch {
    sa = null
  }
  return sa
}
export const playEnabled = () => !!serviceAccount()

let tokenCache: { token: string; exp: number } | null = null
async function googleToken(): Promise<string> {
  const acc = serviceAccount()
  if (!acc) throw new ApiError(503, 'NOT_CONFIGURED', 'Store purchases are not configured on the server')
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token
  const now = Math.floor(Date.now() / 1000)
  const assertion = signRs256({ iss: acc.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, acc.private_key)
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}` })
  const j = (await r.json()) as { access_token: string; expires_in: number }
  if (!j.access_token) throw new ApiError(502, 'STORE_ERROR', 'Could not reach Google Play')
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return j.access_token
}

const API = (path: string) => `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${config.play.packageName}/${path}`

/** POST /v1/purchases/verify: check the token with Google, grant the entitlement once, acknowledge. */
export async function verifyPlayPurchase(userId: string, productId: string, purchaseToken: string) {
  const product = PLAY_PRODUCTS[productId]
  if (!product) throw new ApiError(400, 'INVALID_INPUT', 'Unknown product')
  const existing = one<{ user_id: string; status: string }>('SELECT user_id, status FROM purchases WHERE receipt_reference = ?', purchaseToken)
  if (existing && existing.user_id !== userId) throw new ApiError(409, 'CONFLICT', 'This purchase belongs to another account')
  if (existing?.status === 'granted') return { itemId: product.itemId, duplicate: true }
  const token = await googleToken()
  const auth = { Authorization: `Bearer ${token}` }
  let expiry = 0
  if (product.type === 'inapp') {
    const p = (await (await fetch(API(`purchases/products/${productId}/tokens/${encodeURIComponent(purchaseToken)}`), { headers: auth })).json()) as { purchaseState?: number; acknowledgementState?: number; error?: unknown }
    if (p.purchaseState !== 0) throw new ApiError(402, 'NOT_PAID', 'The purchase is not complete')
    if (p.acknowledgementState === 0) await fetch(API(`purchases/products/${productId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`), { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' })
  } else {
    const s = (await (await fetch(API(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`), { headers: auth })).json()) as { subscriptionState?: string; acknowledgementState?: string; lineItems?: { expiryTime: string }[] }
    if (!['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(String(s.subscriptionState))) throw new ApiError(402, 'NOT_PAID', 'The subscription is not active')
    expiry = Math.max(...(s.lineItems ?? []).map((l) => Date.parse(l.expiryTime)))
    if (s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') await fetch(API(`purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`), { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' })
  }
  tx(() => {
    const id = existing ? one<{ id: string }>('SELECT id FROM purchases WHERE receipt_reference = ?', purchaseToken)!.id : newId('pur')
    run('INSERT OR REPLACE INTO purchases (id, user_id, store, product_id, receipt_reference, status, granted_entitlement, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, userId, 'google_play', productId, purchaseToken, 'granted', product.itemId, Date.now())
    if (product.itemId === 'vip') run('UPDATE profiles SET vip_until = MAX(vip_until, ?) WHERE user_id = ?', expiry, userId)
    else run('INSERT INTO entitlements (user_id, item_id, source, purchase_id, granted_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, item_id) DO UPDATE SET revoked_at = NULL, purchase_id = excluded.purchase_id', userId, product.itemId, 'google_play', id, Date.now())
  })
  notify(userId, 'Purchase complete', product.itemId === 'vip' ? 'VIP membership is active.' : 'Your new item is ready to equip.')
  return { itemId: product.itemId, vipUntil: expiry || undefined }
}

/** Play Real-time Developer Notifications (Pub/Sub push): refunds/revocations remove the entitlement. */
export function handleRtdn(body: Record<string, unknown>) {
  const data = (body.message as { data?: string } | undefined)?.data
  if (!data) return
  const n = JSON.parse(Buffer.from(data, 'base64').toString()) as { voidedPurchaseNotification?: { purchaseToken: string }; subscriptionNotification?: { purchaseToken: string; notificationType: number } }
  const token = n.voidedPurchaseNotification?.purchaseToken ?? (n.subscriptionNotification && [3, 12, 13].includes(n.subscriptionNotification.notificationType) ? n.subscriptionNotification.purchaseToken : null)
  if (!token) return
  const p = one<{ id: string; user_id: string; granted_entitlement: string }>('SELECT id, user_id, granted_entitlement FROM purchases WHERE receipt_reference = ?', token)
  if (!p) return
  tx(() => {
    run("UPDATE purchases SET status = 'revoked', refund_state = 'refunded' WHERE id = ?", p.id)
    if (p.granted_entitlement === 'vip') run('UPDATE profiles SET vip_until = ? WHERE user_id = ?', Date.now(), p.user_id)
    else run('UPDATE entitlements SET revoked_at = ? WHERE user_id = ? AND item_id = ?', Date.now(), p.user_id, p.granted_entitlement)
  })
  log('info', { event: 'purchase_revoked', purchase: p.id })
}
