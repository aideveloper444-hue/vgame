import { randomBytes } from 'node:crypto'

/* Server configuration. Every secret comes from the environment; nothing is committed. */

const env = process.env
const isProduction = env.NODE_ENV === 'production'

/* Fail fast in production: a missing or placeholder JWT secret would log everyone out on each restart (or be guessable). */
if (isProduction && (!env.JWT_SECRET || env.JWT_SECRET.startsWith('change-me') || env.JWT_SECRET.length < 32)) {
  console.error('FATAL: JWT_SECRET must be set to at least 32 random characters when NODE_ENV=production (e.g. `openssl rand -hex 32`).')
  process.exit(1)
}

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

export const config = {
  port: Number(env.PORT ?? 8787),
  dbPath: env.DB_PATH ?? 'server/data/rpc.sqlite',
  /** HS256 key for access tokens. Must be set in production; a random one only lasts until restart. */
  jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString('hex'),
  jwtSecretIsRandom: !env.JWT_SECRET,
  accessTtlSec: 15 * 60,
  refreshTtlSec: 30 * 24 * 3600,
  adminSessionSec: 30 * 60,
  isProduction,
  corsOrigins: list(env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5182,capacitor://localhost,https://localhost,http://localhost'),
  /** first sign-up with this email becomes an administrator */
  adminBootstrapEmail: (env.ADMIN_BOOTSTRAP_EMAIL ?? '').toLowerCase(),
  google: { clientIds: list(env.GOOGLE_CLIENT_IDS) },
  facebook: { appId: env.FACEBOOK_APP_ID ?? '', appSecret: env.FACEBOOK_APP_SECRET ?? '' },
  apple: { clientIds: list(env.APPLE_CLIENT_IDS) },
  play: {
    packageName: env.PLAY_PACKAGE_NAME ?? 'com.Vibo.myvibo',
    /** service-account JSON (inline or a file path) with access to the Play Developer API */
    serviceAccount: env.PLAY_SERVICE_ACCOUNT_JSON ?? '',
  },
  /** keep tournaments and tables busy when few people are online */
  minTournamentField: Number(env.MIN_TOURNAMENT_FIELD ?? 6),
}

export const socialEnabled = {
  google: config.google.clientIds.length > 0,
  facebook: !!(config.facebook.appId && config.facebook.appSecret),
  apple: config.apple.clientIds.length > 0,
}
