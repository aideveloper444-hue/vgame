import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config'

/*
 * SQLite (built into Node). One file, WAL mode, foreign keys on. Schema follows the handoff blueprint:
 * users, profiles, sessions, ledger, hands/events, rooms, entitlements/purchases, social, reports, audit.
 */

mkdirSync(dirname(config.dbPath), { recursive: true })
export const db = new DatabaseSync(config.dbPath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  google_sub TEXT UNIQUE, facebook_id TEXT UNIQUE, apple_sub TEXT UNIQUE,
  kind TEXT NOT NULL DEFAULT 'email',
  role TEXT NOT NULL DEFAULT 'player',
  status TEXT NOT NULL DEFAULT 'active',
  muted_until INTEGER NOT NULL DEFAULT 0,
  suspended_until INTEGER NOT NULL DEFAULT 0,
  age_confirmed_at INTEGER,
  invite_code TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL DEFAULT 'IN',
  totp_secret TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar TEXT NOT NULL DEFAULT 'akash',
  xp INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  tutorial_done INTEGER NOT NULL DEFAULT 0,
  level_bonus_claimed INTEGER NOT NULL DEFAULT 1,
  daily_last INTEGER NOT NULL DEFAULT 0,
  daily_streak INTEGER NOT NULL DEFAULT 0,
  stats TEXT NOT NULL DEFAULT '{}',
  achievements TEXT NOT NULL DEFAULT '{}',
  equipped TEXT NOT NULL DEFAULT '{}',
  settings TEXT NOT NULL DEFAULT '{}',
  missions TEXT NOT NULL DEFAULT '{}',
  vip_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash TEXT NOT NULL UNIQUE,
  device TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  reason TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  UNIQUE (user_id, type, correlation_id)
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id DESC);
CREATE TABLE IF NOT EXISTS hands (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  record TEXT NOT NULL,
  summary TEXT
);
CREATE TABLE IF NOT EXISTS hand_events (
  hand_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  server_time INTEGER NOT NULL,
  PRIMARY KEY (hand_id, sequence_no)
);
CREATE TABLE IF NOT EXISTS player_hands (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hand_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  summary TEXT NOT NULL,
  PRIMARY KEY (user_id, hand_id)
);
CREATE INDEX IF NOT EXISTS player_hands_at ON player_hands(user_id, at DESC);
CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS blocks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT
);
CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  purchase_id TEXT,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  product_id TEXT NOT NULL,
  receipt_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  granted_entitlement TEXT,
  created_at INTEGER NOT NULL,
  refund_state TEXT
);
CREATE TABLE IF NOT EXISTS tournament_regs (
  tournament_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (tournament_key, user_id)
);
CREATE TABLE IF NOT EXISTS tournament_results (
  id TEXT PRIMARY KEY,
  tournament_key TEXT NOT NULL,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  place INTEGER NOT NULL,
  field INTEGER NOT NULL,
  prize INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_after TEXT NOT NULL DEFAULT '{}',
  timestamp INTEGER NOT NULL,
  request_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog_overrides (
  item_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`)

// the audit trail is append-only
db.exec(`
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
`)

// columns added after the first release: create them on databases made before they existed
const hasColumn = (table: string, col: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col)
// the app-wide friend code (social hub net id) of the device a player signed in on, so Facebook friends can be found
if (!hasColumn('users', 'net_id')) db.exec('ALTER TABLE users ADD COLUMN net_id TEXT')
db.exec('CREATE INDEX IF NOT EXISTS users_net_id ON users (net_id)')

type Row = Record<string, unknown>
export const one = <T = Row>(sql: string, ...args: unknown[]) => db.prepare(sql).get(...(args as never[])) as T | undefined
export const all = <T = Row>(sql: string, ...args: unknown[]) => db.prepare(sql).all(...(args as never[])) as T[]
export const run = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...(args as never[]))

/** Run fn inside one transaction (nested calls join the outer one). */
let depth = 0
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn()
  depth++
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  } finally {
    depth--
  }
}
