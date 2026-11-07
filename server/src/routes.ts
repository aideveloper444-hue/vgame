import { config, socialEnabled } from './config'
import { checkPassword, checkTotp, hashPassword, newId, newTotpSecret, signAccess } from './crypto'
import { all, one, run, tx } from './db'
import { ApiError, bad, int, route, str, type Ctx } from './http'
import {
  COSMETIC_IDS,
  EMAIL_RE,
  HANDLE_RE,
  STARTER_POINTS,
  assertCanPlay,
  canEquip,
  claimAd,
  claimDaily,
  claimLevelBonus,
  claimMission,
  createUser,
  deleteUser,
  grant,
  issueSession,
  login,
  mePayload,
  notify,
  profileOf,
  refreshSession,
  revokeAll,
  updateProfile,
  userById,
  type UserRow,
} from './accounts'
import { handleRtdn, playEnabled, verifyPlayPurchase, verifySocial } from './store'
import { COSMETICS, PLAY_PRODUCTS, VIP_PERKS, VIP_PRICE_INR } from '../../src/games/poker/data/cosmetics'
import { hub } from './game/hub'
import { lobbyTiers, rooms, tables } from './game/lobby'
import { listing, running } from './game/tournaments'
import { replayHand, type HandRecord } from '../../src/games/poker/engine/table'

const me = (c: Ctx) => c.user!.sub
const ok = { ok: true }

function audit(c: Ctx, action: string, targetType: string, targetId: string, reason: string, beforeAfter: unknown = {}) {
  run('INSERT INTO audit (actor_id, action, target_type, target_id, reason, before_after, timestamp, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', c.user?.sub ?? 'system', action, targetType, targetId, reason.slice(0, 300), JSON.stringify(beforeAfter), Date.now(), c.requestId)
}

function welcome(u: UserRow) {
  if (grant(u.id, 'STARTER_GRANT', STARTER_POINTS, 'Welcome to Royal Poker Club', `starter:${u.id}`)) notify(u.id, 'Welcome to the club!', `${STARTER_POINTS.toLocaleString('en-IN')} free points are in your account.`)
}

const sessionOut = (u: UserRow, device: string) => ({ ...issueSession(u, device), me: mePayload(u.id) })

/* ---------------------------------------------------------------- public config */

route('GET', '/v1/config', () => ({ social: socialEnabled, purchases: playEnabled(), products: Object.keys(PLAY_PRODUCTS), serverNow: Date.now() }), { auth: 'none', limit: 60 })

/* ---------------------------------------------------------------- auth */

route(
  'POST',
  '/v1/auth/register',
  (c) => {
    const handle = str(c.body, 'handle', { re: HANDLE_RE })
    const email = str(c.body, 'email', { re: EMAIL_RE, max: 120 }).toLowerCase()
    const password = str(c.body, 'password', { min: 8, max: 128 })
    if (c.body.ageConfirmed !== true || c.body.termsAccepted !== true) throw bad('You must be 18+ and accept the Terms', 'ELIGIBILITY')
    if (one('SELECT 1 FROM users WHERE email = ?', email)) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Log in instead.')
    if (one('SELECT 1 FROM users WHERE handle = ?', handle)) throw new ApiError(409, 'HANDLE_TAKEN', 'That name is taken, try another')
    const u = createUser({ handle, email, password, kind: 'email', ageConfirmed: true })
    welcome(u)
    return sessionOut(u, String(c.body.device ?? ''))
  },
  { auth: 'none', limit: 10 },
)

route(
  'POST',
  '/v1/auth/login',
  (c) => {
    const u = login(str(c.body, 'email', { max: 120 }), str(c.body, 'password', { max: 128 }))
    return sessionOut(u, String(c.body.device ?? ''))
  },
  { auth: 'none', limit: 15 },
)

route(
  'POST',
  '/v1/auth/guest',
  (c) => {
    if (c.body.ageConfirmed !== true) throw bad('You must be 18+ to play', 'ELIGIBILITY')
    const u = createUser({ handle: `Guest${Math.floor(1000 + Math.random() * 9000)}`, kind: 'guest', ageConfirmed: true })
    welcome(u)
    return sessionOut(u, String(c.body.device ?? ''))
  },
  { auth: 'none', limit: 6 },
)

route(
  'POST',
  '/v1/auth/social',
  async (c) => {
    const id = await verifySocial(str(c.body, 'provider'), str(c.body, 'token', { max: 4096 }))
    const field = id.provider === 'google' ? 'google_sub' : id.provider === 'facebook' ? 'facebook_id' : 'apple_sub'
    let u = one<UserRow>(`SELECT * FROM users WHERE ${field} = ?`, id.id)
    if (!u && id.email) {
      // link to an existing email account with the same verified address
      u = one<UserRow>('SELECT * FROM users WHERE email = ?', id.email)
      if (u) run(`UPDATE users SET ${field} = ? WHERE id = ?`, id.id, u.id)
    }
    if (!u) {
      if (c.body.ageConfirmed !== true) throw new ApiError(400, 'ELIGIBILITY', 'Confirm you are 18+ to create an account')
      u = createUser({ handle: id.name, email: id.email, kind: id.provider, social: { field, id: id.id }, ageConfirmed: true })
      welcome(u)
    }
    assertCanPlay(u)
    return sessionOut(u, String(c.body.device ?? ''))
  },
  { auth: 'none', limit: 15 },
)

route('POST', '/v1/auth/refresh', (c) => refreshSession(str(c.body, 'refreshToken', { max: 200 })), { auth: 'none', limit: 30 })

route('POST', '/v1/auth/logout', (c) => {
  run('UPDATE sessions SET revoked_at = ? WHERE id = ?', Date.now(), c.user!.sid)
  return ok
})

route(
  'POST',
  '/v1/auth/password',
  (c) => {
    const u = userById(me(c))!
    if (u.password_hash && !checkPassword(String(c.body.current ?? ''), u.password_hash)) throw new ApiError(401, 'BAD_CREDENTIALS', 'Current password is wrong')
    const next = str(c.body, 'next', { min: 8, max: 128 })
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(next), Date.now(), u.id)
    // a password change signs out every other device
    run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL', Date.now(), u.id, c.user!.sid)
    return ok
  },
  { limit: 10 },
)

/** Turn a guest account into an email account (keeps points and history). */
route(
  'POST',
  '/v1/auth/upgrade',
  (c) => {
    const u = userById(me(c))!
    if (u.kind !== 'guest') throw bad('Already a full account')
    const email = str(c.body, 'email', { re: EMAIL_RE, max: 120 }).toLowerCase()
    if (one('SELECT 1 FROM users WHERE email = ?', email)) throw new ApiError(409, 'EMAIL_TAKEN', 'That email is already in use')
    run("UPDATE users SET email = ?, password_hash = ?, kind = 'email', updated_at = ? WHERE id = ?", email, hashPassword(str(c.body, 'password', { min: 8, max: 128 })), Date.now(), u.id)
    return mePayload(u.id)
  },
  { limit: 10 },
)

/* ---------------------------------------------------------------- me */

route('GET', '/v1/me', (c) => mePayload(me(c)))

route('PATCH', '/v1/me', (c) => {
  const id = me(c)
  const b = c.body
  if (b.handle != null) {
    const h = str(b, 'handle', { re: HANDLE_RE })
    if (one('SELECT 1 FROM users WHERE handle = ? AND id != ?', h, id)) throw new ApiError(409, 'HANDLE_TAKEN', 'That name is taken')
    run('UPDATE users SET handle = ?, updated_at = ? WHERE id = ?', h, Date.now(), id)
  }
  if (b.ageConfirmed === true) run('UPDATE users SET age_confirmed_at = COALESCE(age_confirmed_at, ?) WHERE id = ?', Date.now(), id)
  updateProfile(id, (p) => {
    if (b.avatar != null) p.avatar = str(b, 'avatar', { re: /^[a-z]{2,12}$/ })
    if (b.tutorialDone === true) p.tutorial_done = 1
    if (b.settings && typeof b.settings === 'object') {
      const allowed = ['sound', 'music', 'vibration', 'reducedMotion', 'fourColorDeck', 'largeText', 'showOnline', 'autoCheckFold']
      const cur = JSON.parse(p.settings || '{}')
      for (const [k, v] of Object.entries(b.settings as Record<string, unknown>)) if (allowed.includes(k) && typeof v === 'boolean') cur[k] = v
      p.settings = JSON.stringify(cur)
    }
    if (b.equip && typeof b.equip === 'object') {
      const { itemId } = b.equip as { itemId: string }
      const item = COSMETICS.find((x) => x.id === itemId)
      if (!item || !COSMETIC_IDS.has(itemId)) throw bad('Unknown item')
      if (!canEquip(id, p, itemId)) throw new ApiError(403, 'LOCKED', 'You don’t own this item yet')
      p.equipped = JSON.stringify({ ...JSON.parse(p.equipped || '{}'), [item.slot]: itemId })
    }
  })
  return mePayload(id)
})

route('DELETE', '/v1/me', (c) => {
  deleteUser(me(c))
  hub.kick(me(c), 'Account deleted')
  return ok
})

route('POST', '/v1/me/notices/read', (c) => {
  run('UPDATE notices SET read = 1 WHERE user_id = ?', me(c))
  return ok
})

route('GET', '/v1/me/ledger', (c) => all('SELECT id, type, amount, balance, reason, correlation_id AS correlationId, at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 200', me(c)))
route('GET', '/v1/me/hands', (c) => all<{ summary: string }>('SELECT summary FROM player_hands WHERE user_id = ? ORDER BY at DESC LIMIT 80', me(c)).map((r) => JSON.parse(r.summary)))
route('GET', '/v1/me/tournaments', (c) => all('SELECT id, tournament_id AS tournamentId, name, place, field, prize, at FROM tournament_results WHERE user_id = ? ORDER BY at DESC LIMIT 40', me(c)))

/* ---------------------------------------------------------------- free points */

route('POST', '/v1/rewards/daily', (c) => ({ amount: claimDaily(me(c)), me: mePayload(me(c)) }), { limit: 10 })
route('POST', '/v1/rewards/ad', (c) => ({ amount: claimAd(me(c)), me: mePayload(me(c)) }), { limit: 10 })
route('POST', '/v1/rewards/level', (c) => ({ amount: claimLevelBonus(me(c)), me: mePayload(me(c)) }), { limit: 10 })
route('POST', '/v1/rewards/missions/:id', (c) => ({ amount: claimMission(me(c), c.params.id), me: mePayload(me(c)) }), { limit: 20 })

/* ---------------------------------------------------------------- store (cosmetics only) */

route('GET', '/v1/catalog', () => ({ items: COSMETICS, products: PLAY_PRODUCTS, vip: { priceInr: VIP_PRICE_INR, perks: VIP_PERKS }, purchases: playEnabled() }), { auth: 'none' })
route('GET', '/v1/entitlements', (c) => all('SELECT item_id AS itemId, source, granted_at AS grantedAt FROM entitlements WHERE user_id = ? AND revoked_at IS NULL', me(c)))
route('POST', '/v1/purchases/verify', async (c) => ({ ...(await verifyPlayPurchase(me(c), str(c.body, 'productId'), str(c.body, 'purchaseToken', { max: 1024 }))), me: mePayload(me(c)) }), { limit: 20 })
route(
  'POST',
  '/v1/purchases/restore',
  async (c) => {
    const list = Array.isArray(c.body.purchases) ? (c.body.purchases as { productId: string; purchaseToken: string }[]).slice(0, 30) : []
    const results = []
    for (const p of list) {
      try {
        results.push({ productId: p.productId, ...(await verifyPlayPurchase(me(c), String(p.productId), String(p.purchaseToken))) })
      } catch (e) {
        results.push({ productId: p.productId, error: (e as Error).message })
      }
    }
    return { results, me: mePayload(me(c)) }
  },
  { limit: 6 },
)
route(
  'POST',
  '/v1/purchases/rtdn',
  (c) => {
    if (!process.env.RTDN_TOKEN || process.env.RTDN_TOKEN.startsWith('change-me') || c.query.get('token') !== process.env.RTDN_TOKEN) throw new ApiError(403, 'FORBIDDEN', 'Bad token')
    handleRtdn(c.body)
    return ok
  },
  { auth: 'none', limit: 600 },
)

/* ---------------------------------------------------------------- friends, blocks, reports */

function friendView(userId: string, f: { friend_id: string; status: string }) {
  const u = userById(f.friend_id)
  const p = profileOf(f.friend_id)
  const showOnline = p ? JSON.parse(p.settings || '{}').showOnline !== false : false
  return { id: f.friend_id, name: u?.handle ?? '?', avatar: p?.avatar ?? 'akash', status: f.status, online: showOnline && hub.online(f.friend_id), level: p ? Math.floor(p.xp / 600) + 1 : 1 }
}

route('GET', '/v1/friends', (c) => all<{ friend_id: string; status: string }>('SELECT friend_id, status FROM friendships WHERE user_id = ?', me(c)).map((f) => friendView(me(c), f)))

route(
  'POST',
  '/v1/friends/requests',
  (c) => {
    const q = str(c.body, 'code', { max: 40 })
    const target = one<UserRow>("SELECT * FROM users WHERE (invite_code = ? OR handle = ?) AND status = 'active'", q.toUpperCase().replace(/[^A-Z0-9]/g, ''), q)
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'No player with that code or name')
    const id = me(c)
    if (target.id === id) throw bad('That’s you!')
    if (one('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?', target.id, id)) throw new ApiError(404, 'NOT_FOUND', 'No player with that code or name')
    const theirs = one<{ status: string }>('SELECT status FROM friendships WHERE user_id = ? AND friend_id = ?', target.id, id)
    tx(() => {
      if (theirs?.status === 'requested') {
        // they already asked us: accept both ways
        run("UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", target.id, id)
        run("INSERT OR REPLACE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', ?)", id, target.id, Date.now())
      } else {
        run("INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'requested', ?)", id, target.id, Date.now())
        run("INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'incoming', ?)", target.id, id, Date.now())
        notify(target.id, 'Friend request', `${userById(id)!.handle} wants to be friends`)
      }
    })
    hub.send(target.id, { type: 'FRIENDS_CHANGED' })
    hub.send(target.id, { type: 'ME_CHANGED' })
    return { ok: true, status: theirs?.status === 'requested' ? 'accepted' : 'requested', name: target.handle }
  },
  { limit: 20 },
)

route('POST', '/v1/friends/requests/:id/accept', (c) => {
  const id = me(c)
  const r = one("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'incoming'", id, c.params.id)
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'No such request')
  tx(() => {
    run("UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", id, c.params.id)
    run("UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", c.params.id, id)
  })
  hub.send(c.params.id, { type: 'FRIENDS_CHANGED' })
  return ok
})

const unfriend = (a: string, b: string) => run('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', a, b, b, a)
route('POST', '/v1/friends/requests/:id/decline', (c) => (unfriend(me(c), c.params.id), ok))
route('DELETE', '/v1/friends/:id', (c) => {
  unfriend(me(c), c.params.id)
  hub.send(c.params.id, { type: 'FRIENDS_CHANGED' })
  return ok
})

route('GET', '/v1/blocks', (c) => all<{ blocked_id: string }>('SELECT blocked_id FROM blocks WHERE user_id = ?', me(c)).map((b) => ({ id: b.blocked_id, name: userById(b.blocked_id)?.handle ?? '?' })))
route('POST', '/v1/blocks', (c) => {
  const target = str(c.body, 'userId', { max: 60 })
  if (!userById(target) || target === me(c)) throw new ApiError(404, 'NOT_FOUND', 'No such player')
  run('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)', me(c), target, Date.now())
  unfriend(me(c), target)
  hub.invalidateBlocks(me(c))
  return ok
})
route('DELETE', '/v1/blocks/:id', (c) => {
  run('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?', me(c), c.params.id)
  hub.invalidateBlocks(me(c))
  return ok
})

const REASONS = ['Harassment', 'Hate', 'Spam', 'Impersonation', 'Suspected collusion', 'Cheating', 'Inappropriate profile', 'Other']
route(
  'POST',
  '/v1/reports',
  (c) => {
    const reason = str(c.body, 'reason')
    if (!REASONS.includes(reason)) throw bad('Pick a reason')
    let targetId = String(c.body.targetId ?? '')
    if (!userById(targetId)) targetId = one<{ id: string }>('SELECT id FROM users WHERE handle = ?', String(c.body.targetName ?? ''))?.id ?? ''
    if (!targetId) throw new ApiError(404, 'NOT_FOUND', 'That player could not be found')
    const tableId = String(c.body.tableId ?? '')
    const evidence = tables.get(tableId)?.recentChat() ?? []
    const priority = ['Hate', 'Suspected collusion', 'Cheating'].includes(reason) ? 1 : reason === 'Spam' ? 3 : 2
    run('INSERT INTO reports (id, reporter_id, target_id, reason, note, evidence, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId('rep'), me(c), targetId, reason, str(c.body, 'note', { optional: true, max: 500 }), JSON.stringify({ chat: evidence, tableId, handId: tables.get(tableId)?.handId() }), priority, Date.now())
    return ok
  },
  { limit: 10 },
)

/* ---------------------------------------------------------------- lobby */

route('GET', '/v1/tables', () => ({ tiers: lobbyTiers(), online: hub.count().users }), { auth: 'none', limit: 60 })
route('GET', '/v1/tournaments', (c) => listing(c.user?.sub ?? null), { auth: 'none', limit: 60 })

/* ---------------------------------------------------------------- admin */

route(
  'POST',
  '/v1/admin/login',
  (c) => {
    const u = login(str(c.body, 'email', { max: 120 }), str(c.body, 'password', { max: 128 }))
    if (!['admin', 'moderator'].includes(u.role)) throw new ApiError(403, 'FORBIDDEN', 'Not an administrator')
    const code = str(c.body, 'totp', { optional: true, max: 6 })
    if (!u.totp_secret) {
      // first sign-in: enrol an authenticator, then sign in again with a code
      const secret = newTotpSecret()
      run('UPDATE users SET totp_secret = ? WHERE id = ?', secret, u.id)
      return { enrol: true, secret, otpauth: `otpauth://totp/RoyalPokerClub:${encodeURIComponent(u.email ?? u.handle)}?secret=${secret}&issuer=RoyalPokerClub` }
    }
    if (!code || !checkTotp(u.totp_secret, code)) throw new ApiError(401, 'MFA_REQUIRED', 'Enter the 6-digit code from your authenticator app')
    const sid = newId('s')
    run('INSERT INTO sessions (id, user_id, refresh_hash, device, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', sid, u.id, newId('adm'), 'admin-console', Date.now(), Date.now() + config.adminSessionSec * 1000)
    run('INSERT INTO audit (actor_id, action, target_type, target_id, reason, timestamp, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)', u.id, 'admin.login', 'user', u.id, `ip ${c.ip}`, Date.now(), c.requestId)
    return { accessToken: signAccess({ sub: u.id, role: u.role, sid, mfa: true }, config.adminSessionSec), role: u.role, name: u.handle }
  },
  { auth: 'none', limit: 8 },
)

const A = { auth: 'admin' as const, limit: 120 }
const adminOnly = (c: Ctx) => {
  if (c.user?.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Administrators only')
}

route(
  'GET',
  '/v1/admin/metrics',
  () => {
    const day = Date.now() - 86400000
    return {
      online: hub.count(),
      users: one<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE status = 'active'")!.c,
      newUsers24h: one<{ c: number }>('SELECT COUNT(*) AS c FROM users WHERE created_at > ?', day)!.c,
      hands24h: one<{ c: number }>('SELECT COUNT(*) AS c FROM hands WHERE started_at > ?', day)!.c,
      liveTables: [...tables.values()].filter((t) => !t.closed).length,
      rooms: rooms.size,
      tournaments: [...running.values()].filter((t) => !t.finished).length,
      openReports: one<{ c: number }>("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'")!.c,
      purchases24h: one<{ c: number }>('SELECT COUNT(*) AS c FROM purchases WHERE created_at > ?', day)!.c,
      pointsGranted24h: one<{ s: number }>("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE at > ? AND type != 'HAND_SETTLEMENT'", day)!.s,
      memory: Math.round(process.memoryUsage().rss / 1048576),
      uptimeMin: Math.round(process.uptime() / 60),
    }
  },
  A,
)

route('GET', '/v1/admin/users', (c) => {
  const q = `%${c.query.get('q') ?? ''}%`
  return all('SELECT u.id, u.handle, u.email, u.kind, u.role, u.status, u.muted_until AS mutedUntil, u.suspended_until AS suspendedUntil, u.created_at AS createdAt, p.balance FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.handle LIKE ? OR u.email LIKE ? OR u.id = ? ORDER BY u.created_at DESC LIMIT 50', q, q, c.query.get('q') ?? '')
}, A)

route('GET', '/v1/admin/users/:id', (c) => {
  const u = userById(c.params.id)
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'No such user')
  return {
    user: { ...u, password_hash: undefined, totp_secret: undefined },
    me: mePayload(u.id),
    ledger: all('SELECT type, amount, balance, reason, correlation_id AS correlationId, at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50', u.id),
    purchases: all('SELECT id, product_id AS productId, status, refund_state AS refundState, created_at AS createdAt FROM purchases WHERE user_id = ? ORDER BY created_at DESC', u.id),
    reportsAgainst: all('SELECT id, reason, status, created_at AS createdAt FROM reports WHERE target_id = ? ORDER BY created_at DESC LIMIT 20', u.id),
    sessions: all('SELECT id, device, created_at AS createdAt, revoked_at AS revokedAt FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', u.id),
  }
}, A)

route('GET', '/v1/admin/reports', (c) => {
  const status = c.query.get('status') ?? 'open'
  return all<Record<string, unknown>>('SELECT * FROM reports WHERE status = ? ORDER BY priority ASC, created_at ASC LIMIT 100', status).map((r) => ({ ...r, evidence: JSON.parse(String(r.evidence)), reporter: userById(String(r.reporter_id))?.handle, target: userById(String(r.target_id))?.handle }))
}, A)

route('POST', '/v1/admin/moderation-actions', (c) => {
  const target = userById(str(c.body, 'targetId', { max: 60 }))
  if (!target) throw new ApiError(404, 'NOT_FOUND', 'No such user')
  const action = str(c.body, 'action')
  const reason = str(c.body, 'reason', { min: 3, max: 300 })
  const minutes = c.body.minutes != null ? int(c.body, 'minutes', 1, 525600) : 60
  const before = { status: target.status, muted_until: target.muted_until, suspended_until: target.suspended_until }
  const until = Date.now() + minutes * 60000
  if (action === 'ban' && c.user?.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Permanent suspensions need an administrator')
  if (action === 'mute') run('UPDATE users SET muted_until = ? WHERE id = ?', until, target.id)
  else if (action === 'unmute') run('UPDATE users SET muted_until = 0 WHERE id = ?', target.id)
  else if (action === 'suspend') run('UPDATE users SET suspended_until = ? WHERE id = ?', until, target.id)
  else if (action === 'unsuspend') run("UPDATE users SET suspended_until = 0, status = 'active' WHERE id = ? AND status != 'deleted'", target.id)
  else if (action === 'ban') run("UPDATE users SET status = 'banned' WHERE id = ?", target.id)
  else throw bad('Unknown action')
  if (['suspend', 'ban'].includes(action)) {
    revokeAll(target.id)
    hub.kick(target.id, 'Account suspended')
  }
  if (action === 'mute') notify(target.id, 'Chat restricted', `You can’t chat for ${minutes} minutes. Reason: ${reason}`)
  const after = userById(target.id)!
  audit(c, `moderation.${action}`, 'user', target.id, reason, { before, after: { status: after.status, muted_until: after.muted_until, suspended_until: after.suspended_until }, minutes })
  if (c.body.reportId) run("UPDATE reports SET status = 'actioned', resolution = ?, resolved_at = ?, resolved_by = ? WHERE id = ?", `${action}: ${reason}`, Date.now(), c.user!.sub, String(c.body.reportId))
  return ok
}, A)

route('POST', '/v1/admin/reports/:id/resolve', (c) => {
  const reason = str(c.body, 'reason', { min: 3, max: 300 })
  run("UPDATE reports SET status = 'dismissed', resolution = ?, resolved_at = ?, resolved_by = ? WHERE id = ?", reason, Date.now(), c.user!.sub, c.params.id)
  audit(c, 'report.dismiss', 'report', c.params.id, reason)
  return ok
}, A)

route('GET', '/v1/admin/rooms', () => [...tables.values()].filter((t) => !t.closed).map((t) => t.describe()), A)

route('GET', '/v1/admin/hands/:id', (c) => {
  const h = one<{ record: string; summary: string | null; mode: string }>('SELECT record, summary, mode FROM hands WHERE id = ?', c.params.id)
  if (!h) throw new ApiError(404, 'NOT_FOUND', 'No such hand')
  const record = JSON.parse(h.record) as HandRecord
  const replay = replayHand(record)
  const summary = h.summary ? JSON.parse(h.summary) : null
  audit(c, 'hand.inspect', 'hand', c.params.id, 'support replay')
  return { mode: h.mode, summary, replayNet: replay.result?.net ?? null, replayMatches: summary ? JSON.stringify(replay.result?.net) === JSON.stringify(summary.net) : null, events: all('SELECT sequence_no AS seq, event_type AS type, payload, server_time AS at FROM hand_events WHERE hand_id = ? ORDER BY sequence_no', c.params.id) }
}, A)

route('POST', '/v1/admin/ledger-corrections', (c) => {
  adminOnly(c)
  const userId = str(c.body, 'userId', { max: 60 })
  const amount = int(c.body, 'amount', -10_000_000, 10_000_000)
  const reason = str(c.body, 'reason', { min: 5, max: 200 })
  if (c.body.confirm !== true) throw bad('Confirm the correction')
  const before = profileOf(userId)?.balance
  grant(userId, 'ADMIN_CORRECTION', amount, `Correction: ${reason}`, newId('corr'))
  audit(c, 'ledger.correction', 'user', userId, reason, { before, after: profileOf(userId)?.balance, amount })
  return ok
}, A)

route('GET', '/v1/admin/flags', () => all('SELECT key, value, updated_at AS updatedAt FROM flags'), A)
route('POST', '/v1/admin/flags', (c) => {
  adminOnly(c)
  const key = str(c.body, 'key', { re: /^[a-z0-9_.-]{2,40}$/ })
  const value = str(c.body, 'value', { max: 200 })
  const before = one<{ value: string }>('SELECT value FROM flags WHERE key = ?', key)?.value
  run('INSERT OR REPLACE INTO flags (key, value, updated_at) VALUES (?, ?, ?)', key, value, Date.now())
  audit(c, 'flag.set', 'flag', key, str(c.body, 'reason', { min: 3 }), { before, after: value })
  return ok
}, A)

route('POST', '/v1/admin/catalog-items', (c) => {
  adminOnly(c)
  const itemId = str(c.body, 'itemId', { max: 40 })
  if (!COSMETIC_IDS.has(itemId)) throw bad('Unknown item')
  const data = c.body.data && typeof c.body.data === 'object' ? c.body.data : {}
  run('INSERT OR REPLACE INTO catalog_overrides (item_id, data, updated_at) VALUES (?, ?, ?)', itemId, JSON.stringify(data), Date.now())
  audit(c, 'catalog.update', 'item', itemId, str(c.body, 'reason', { min: 3 }), data)
  return ok
}, A)

route('POST', '/v1/admin/notify', (c) => {
  adminOnly(c)
  const title = str(c.body, 'title', { max: 80 })
  const body = str(c.body, 'body', { max: 240 })
  const ids = all<{ id: string }>("SELECT id FROM users WHERE status = 'active'").map((r) => r.id)
  tx(() => ids.forEach((id) => notify(id, title, body)))
  audit(c, 'notify.broadcast', 'all', '*', title)
  return { sent: ids.length }
}, A)

route('GET', '/v1/admin/audit', (c) => all('SELECT * FROM audit ORDER BY id DESC LIMIT ?', Math.min(500, Number(c.query.get('limit') ?? 100))), A)
