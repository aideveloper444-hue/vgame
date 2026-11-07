import { randomBytes } from 'node:crypto'
import { config } from './config'
import { checkPassword, hashPassword, newId, newToken, sha256, signAccess } from './crypto'
import { all, one, run, tx } from './db'
import { ApiError, bad } from './http'
import { ACHIEVEMENTS, ADS_PER_DAY, AD_POINTS, DAILY_POINTS, MISSIONS, STARTER_POINTS, levelInfo } from '../../src/games/poker/data/progression'
import { COSMETICS, DEFAULT_EQUIPPED, cosmetic } from '../../src/games/poker/data/cosmetics'

/*
 * Accounts, sessions, profile and the points ledger.
 *
 * The balance only ever moves through grant(): one transaction appends the ledger row and updates the
 * balance, (user, type, correlation id) is unique so retries and duplicate settlements are no-ops, and the
 * balance column has a non-negative CHECK.
 */

export type LedgerType = 'STARTER_GRANT' | 'DAILY_GRANT' | 'MISSION_REWARD' | 'HAND_SETTLEMENT' | 'ADMIN_CORRECTION' | 'RESET'

export interface UserRow {
  id: string
  handle: string
  email: string | null
  password_hash: string | null
  kind: string
  role: string
  status: string
  muted_until: number
  suspended_until: number
  age_confirmed_at: number | null
  invite_code: string
  totp_secret: string | null
  created_at: number
}
export interface ProfileRow {
  user_id: string
  avatar: string
  xp: number
  balance: number
  tutorial_done: number
  level_bonus_claimed: number
  daily_last: number
  daily_streak: number
  stats: string
  achievements: string
  equipped: string
  settings: string
  missions: string
  vip_until: number
}

const today = () => new Date().toISOString().slice(0, 10)
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const inviteCode = () => 'RP' + [...randomBytes(6)].map((b) => CODE[b % CODE.length]).join('')

export const HANDLE_RE = /^[\p{L}\p{N}_.]{3,14}$/u
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const userById = (id: string) => one<UserRow>('SELECT * FROM users WHERE id = ?', id)
export const profileOf = (id: string) => one<ProfileRow>('SELECT * FROM profiles WHERE user_id = ?', id)

/* ---------------------------------------------------------------- creation & sessions */

function uniqueHandle(base: string): string {
  let h = base.replace(/[^\p{L}\p{N}_.]/gu, '').slice(0, 12) || 'Player'
  if (h.length < 3) h = h.padEnd(3, '0')
  if (!one('SELECT 1 FROM users WHERE handle = ?', h)) return h
  for (let i = 0; i < 50; i++) {
    const c = `${h.slice(0, 10)}${Math.floor(100 + Math.random() * 9900)}`
    if (!one('SELECT 1 FROM users WHERE handle = ?', c)) return c
  }
  throw bad('Could not find a free name, try another')
}

export function createUser(opts: { handle: string; email?: string | null; password?: string; kind: string; social?: { field: 'google_sub' | 'facebook_id' | 'apple_sub'; id: string }; ageConfirmed: boolean }): UserRow {
  const id = newId('u')
  const now = Date.now()
  const email = opts.email?.toLowerCase() ?? null
  const role = email && config.adminBootstrapEmail && email === config.adminBootstrapEmail ? 'admin' : 'player'
  return tx(() => {
    run(
      `INSERT INTO users (id, handle, email, password_hash, kind, role, invite_code, age_confirmed_at, created_at, updated_at${opts.social ? `, ${opts.social.field}` : ''})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?${opts.social ? ', ?' : ''})`,
      id,
      uniqueHandle(opts.handle),
      email,
      opts.password ? hashPassword(opts.password) : null,
      opts.kind,
      role,
      inviteCode(),
      opts.ageConfirmed ? now : null,
      now,
      now,
      ...(opts.social ? [opts.social.id] : []),
    )
    run('INSERT INTO profiles (user_id, equipped, settings) VALUES (?, ?, ?)', id, JSON.stringify(DEFAULT_EQUIPPED), '{}')
    for (const itemId of Object.values(DEFAULT_EQUIPPED)) run("INSERT OR IGNORE INTO entitlements (user_id, item_id, source, granted_at) VALUES (?, ?, 'default', ?)", id, itemId, now)
    return userById(id)!
  })
}

export function issueSession(user: UserRow, device = ''): { accessToken: string; refreshToken: string } {
  const sid = newId('s')
  const refreshToken = newToken()
  run('INSERT INTO sessions (id, user_id, refresh_hash, device, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', sid, user.id, sha256(refreshToken), device.slice(0, 80), Date.now(), Date.now() + config.refreshTtlSec * 1000)
  return { accessToken: signAccess({ sub: user.id, role: user.role, sid }), refreshToken }
}

/** Refresh-token rotation: the old token is spent; reusing a spent token revokes every session of that user. */
export function refreshSession(refreshToken: string): { accessToken: string; refreshToken: string } {
  const s = one<{ id: string; user_id: string; expires_at: number; revoked_at: number | null }>('SELECT * FROM sessions WHERE refresh_hash = ?', sha256(refreshToken))
  if (!s) throw new ApiError(401, 'AUTH_REQUIRED', 'Session expired')
  if (s.revoked_at) {
    run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', Date.now(), s.user_id)
    throw new ApiError(401, 'AUTH_REQUIRED', 'Session expired')
  }
  if (s.expires_at < Date.now()) throw new ApiError(401, 'AUTH_REQUIRED', 'Session expired')
  const user = userById(s.user_id)
  if (!user || user.status === 'deleted') throw new ApiError(401, 'AUTH_REQUIRED', 'Account not found')
  const next = newToken()
  run('UPDATE sessions SET refresh_hash = ?, expires_at = ? WHERE id = ?', sha256(next), Date.now() + config.refreshTtlSec * 1000, s.id)
  return { accessToken: signAccess({ sub: user.id, role: user.role, sid: s.id }), refreshToken: next }
}

export function login(email: string, password: string) {
  const u = one<UserRow>('SELECT * FROM users WHERE email = ?', email.toLowerCase())
  if (!u || !checkPassword(password, u.password_hash)) throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong email or password')
  assertCanPlay(u)
  return u
}

export function assertCanPlay(u: UserRow) {
  if (u.status === 'deleted') throw new ApiError(401, 'AUTH_REQUIRED', 'Account not found')
  if (u.status === 'banned') throw new ApiError(403, 'SUSPENDED', 'This account is permanently suspended')
  if (u.suspended_until > Date.now()) throw new ApiError(403, 'SUSPENDED', `This account is suspended until ${new Date(u.suspended_until).toUTCString()}`)
}

export function revokeAll(userId: string) {
  run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', Date.now(), userId)
}

/** DELETE /v1/me: anonymise the account, drop personal data, keep append-only audit/ledger integrity. */
export function deleteUser(userId: string) {
  tx(() => {
    revokeAll(userId)
    run("UPDATE users SET status = 'deleted', email = NULL, password_hash = NULL, google_sub = NULL, facebook_id = NULL, apple_sub = NULL, handle = ?, totp_secret = NULL, updated_at = ? WHERE id = ?", `deleted_${userId.slice(-8)}`, Date.now(), userId)
    run('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?', userId, userId)
    run('DELETE FROM notices WHERE user_id = ?', userId)
    run('DELETE FROM tournament_regs WHERE user_id = ?', userId)
  })
}

/* ---------------------------------------------------------------- ledger */

export function grant(userId: string, type: LedgerType, amount: number, reason: string, correlationId: string): boolean {
  return tx(() => {
    if (one('SELECT 1 FROM ledger WHERE user_id = ? AND type = ? AND correlation_id = ?', userId, type, correlationId)) return false
    const p = profileOf(userId)
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'No profile')
    const balance = p.balance + amount
    if (balance < 0) throw new ApiError(409, 'INSUFFICIENT_POINTS', 'Not enough points')
    run('UPDATE profiles SET balance = ? WHERE user_id = ?', balance, userId)
    run('INSERT INTO ledger (user_id, type, amount, balance, reason, correlation_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, type, amount, balance, reason.slice(0, 120), correlationId, Date.now())
    return true
  })
}

export function notify(userId: string, title: string, body: string) {
  run('INSERT INTO notices (id, user_id, title, body, at) VALUES (?, ?, ?, ?, ?)', newId('n'), userId, title.slice(0, 80), body.slice(0, 240), Date.now())
}

/* ---------------------------------------------------------------- profile helpers */

const J = <T>(s: string, d: T): T => {
  try {
    return { ...d, ...(JSON.parse(s) as T) }
  } catch {
    return d
  }
}
export const statsOf = (p: ProfileRow) => J(p.stats, { hands: 0, wins: 0, showdowns: 0, biggestPot: 0, totalWon: 0, tournaments: 0, tourneyCashes: 0, tourneyWins: 0 })
const missionsOf = (p: ProfileRow) => {
  const m = J(p.missions, { day: today(), progress: {} as Record<string, number>, claimed: [] as string[] })
  return m.day === today() ? m : { day: today(), progress: {}, claimed: [] }
}

export function updateProfile(userId: string, fn: (p: ProfileRow & { statsObj: ReturnType<typeof statsOf>; missionsObj: ReturnType<typeof missionsOf>; achObj: Record<string, number> }) => void) {
  tx(() => {
    const p = profileOf(userId)
    if (!p) return
    const x = { ...p, statsObj: statsOf(p), missionsObj: missionsOf(p), achObj: J(p.achievements, {} as Record<string, number>) }
    fn(x)
    run('UPDATE profiles SET xp = ?, stats = ?, missions = ?, achievements = ?, avatar = ?, tutorial_done = ?, equipped = ?, settings = ?, level_bonus_claimed = ?, daily_last = ?, daily_streak = ? WHERE user_id = ?', x.xp, JSON.stringify(x.statsObj), JSON.stringify(x.missionsObj), JSON.stringify(x.achObj), x.avatar, x.tutorial_done, x.equipped, x.settings, x.level_bonus_claimed, x.daily_last, x.daily_streak, userId)
  })
}

export function unlock(userId: string, achObj: Record<string, number>, id: string) {
  if (achObj[id]) return
  achObj[id] = Date.now()
  const def = ACHIEVEMENTS.find((a) => a.id === id)
  if (def) notify(userId, `Achievement: ${def.name}`, def.description)
}

export const isVip = (p: ProfileRow) => p.vip_until > Date.now()

export function ownedItems(userId: string): string[] {
  return all<{ item_id: string }>('SELECT item_id FROM entitlements WHERE user_id = ? AND revoked_at IS NULL', userId).map((r) => r.item_id)
}

export function canEquip(userId: string, p: ProfileRow, itemId: string): boolean {
  const c = cosmetic(itemId)
  if (!c) return false
  if (ownedItems(userId).includes(itemId)) return true
  if (c.vipOnly) return isVip(p)
  if (c.unlockLevel) return levelInfo(p.xp).level >= c.unlockLevel
  return false
}

/* ---------------------------------------------------------------- rewards */

export function claimDaily(userId: string): number {
  const p = profileOf(userId)!
  const last = p.daily_last ? new Date(p.daily_last).toISOString().slice(0, 10) : ''
  if (last === today()) throw new ApiError(409, 'ALREADY_CLAIMED', 'Come back tomorrow for your next bonus')
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const streak = last === yesterday ? Math.min(7, p.daily_streak + 1) : 1
  const weekend = [0, 6].includes(new Date().getDay())
  const amount = (DAILY_POINTS + (streak - 1) * 500) * (weekend ? 2 : 1) * (isVip(p) ? 2 : 1)
  tx(() => {
    if (!grant(userId, 'DAILY_GRANT', amount, `Daily bonus · day ${streak}${weekend ? ' · weekend 2x' : ''}`, `daily:${today()}`)) throw new ApiError(409, 'ALREADY_CLAIMED', 'Already claimed')
    run('UPDATE profiles SET daily_last = ?, daily_streak = ? WHERE user_id = ?', Date.now(), streak, userId)
  })
  return amount
}

export function claimAd(userId: string): number {
  const n = one<{ c: number }>("SELECT COUNT(*) AS c FROM ledger WHERE user_id = ? AND type = 'DAILY_GRANT' AND correlation_id LIKE ?", userId, `ad:${today()}:%`)!.c
  if (n >= ADS_PER_DAY) throw new ApiError(409, 'LIMIT_REACHED', 'That’s all the video bonuses for today')
  grant(userId, 'DAILY_GRANT', AD_POINTS, 'Video bonus', `ad:${today()}:${n + 1}`)
  return AD_POINTS
}

export function claimMission(userId: string, missionId: string): number {
  const m = MISSIONS.find((x) => x.id === missionId)
  if (!m) throw bad('Unknown mission')
  let amount = 0
  tx(() => {
    updateProfile(userId, (p) => {
      if (p.missionsObj.claimed.includes(m.id)) throw new ApiError(409, 'ALREADY_CLAIMED', 'Already claimed')
      if ((p.missionsObj.progress[m.id] ?? 0) < m.goal) throw new ApiError(409, 'NOT_READY', 'Mission not finished yet')
      p.missionsObj.claimed.push(m.id)
      p.xp += 50
    })
    grant(userId, 'MISSION_REWARD', m.reward, `Mission: ${m.title}`, `mission:${today()}:${m.id}`)
    amount = m.reward
  })
  return amount
}

export function claimLevelBonus(userId: string): number {
  const p = profileOf(userId)!
  const { level } = levelInfo(p.xp)
  if (level <= p.level_bonus_claimed) throw new ApiError(409, 'NOT_READY', `Reach Lv.${p.level_bonus_claimed + 1} for your next bonus`)
  const amount = (level - p.level_bonus_claimed) * 5000
  tx(() => {
    grant(userId, 'MISSION_REWARD', amount, `Level-up bonus · Lv.${level}`, `level:${level}`)
    run('UPDATE profiles SET level_bonus_claimed = ? WHERE user_id = ?', level, userId)
  })
  return amount
}

export function bumpMission(userId: string, id: string, by = 1) {
  updateProfile(userId, (p) => void (p.missionsObj.progress[id] = (p.missionsObj.progress[id] ?? 0) + by))
}

/* ---------------------------------------------------------------- the "me" payload */

export function mePayload(userId: string) {
  const u = userById(userId)!
  const p = profileOf(userId)!
  const missions = missionsOf(p)
  return {
    id: u.id,
    kind: u.kind,
    email: u.email,
    name: u.handle,
    avatar: p.avatar,
    role: u.role,
    inviteCode: u.invite_code,
    createdAt: u.created_at,
    ageConfirmedAt: u.age_confirmed_at,
    tutorialDone: !!p.tutorial_done,
    xp: p.xp,
    balance: p.balance,
    stats: statsOf(p),
    achievements: J(p.achievements, {} as Record<string, number>),
    owned: ownedItems(userId),
    equipped: { ...DEFAULT_EQUIPPED, ...J(p.equipped, {}) },
    vip: isVip(p),
    vipUntil: p.vip_until,
    missions,
    daily: { lastClaim: p.daily_last, streak: p.daily_streak },
    adGrants: { day: today(), count: one<{ c: number }>("SELECT COUNT(*) AS c FROM ledger WHERE user_id = ? AND correlation_id LIKE ?", userId, `ad:${today()}:%`)!.c },
    levelBonusClaimed: p.level_bonus_claimed,
    registered: all<{ tournament_key: string }>('SELECT tournament_key FROM tournament_regs WHERE user_id = ?', userId).map((r) => r.tournament_key.split(':')[0]),
    settings: J(p.settings, {}),
    mutedUntil: u.muted_until,
    notices: all('SELECT id, title, body, at, read FROM notices WHERE user_id = ? ORDER BY at DESC LIMIT 40', userId).map((n) => ({ ...n, read: !!n.read })),
  }
}

export const COSMETIC_IDS = new Set(COSMETICS.map((c) => c.id))
export { STARTER_POINTS }
