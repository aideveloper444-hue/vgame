import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { config } from './config'
import { all, run } from './db'
import { handleApi, log } from './http'
import { newId } from './crypto'
import './routes'
import { attachSockets } from './game/socket'
import { tables } from './game/lobby'
import { running } from './game/tournaments'
import { ADMIN_HTML } from './admin'

/*
 * Royal Poker Club game server: REST API (/v1), realtime tables (/ws), the admin console (/admin), and,
 * when the web build is present, the web app itself (dist/).
 */

const WEB = resolve(process.env.WEB_DIST ?? 'dist')
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' }

const server = createServer(async (req, res) => {
  if (await handleApi(req, res)) return
  const path = new URL(req.url ?? '/', 'http://x').pathname
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (path === '/health') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: true, tables: tables.size, tournaments: running.size }))
  }
  if (path === '/admin' || path === '/admin/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
    res.setHeader('X-Frame-Options', 'DENY')
    return res.end(ADMIN_HTML)
  }
  // the web app (single-page: unknown paths get index.html)
  if (existsSync(WEB)) {
    let file = normalize(join(WEB, decodeURIComponent(path)))
    if (!file.startsWith(WEB)) file = join(WEB, 'index.html')
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB, 'index.html')
    if (existsSync(file)) {
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
      if (file.includes(`${join(WEB, 'assets')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      return res.end(readFileSync(file))
    }
  }
  res.statusCode = 404
  res.end('Not found')
})

attachSockets(server)

/** Nightly reconciliation: every balance must equal its ledger; mismatches open a review ticket, never a silent edit. */
function reconcile() {
  const bad = all<{ user_id: string; balance: number; sum: number }>('SELECT p.user_id, p.balance, COALESCE(SUM(l.amount), 0) AS sum FROM profiles p LEFT JOIN ledger l ON l.user_id = p.user_id GROUP BY p.user_id HAVING p.balance != sum')
  for (const b of bad) run('INSERT INTO reports (id, reporter_id, target_id, reason, note, priority, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)', newId('rec'), 'system', b.user_id, 'Ledger mismatch', `balance ${b.balance} vs ledger ${b.sum}`, Date.now())
  log(bad.length ? 'warn' : 'info', { event: 'reconcile', mismatches: bad.length })
}
setInterval(reconcile, 24 * 3600_000).unref()
setTimeout(reconcile, 10_000).unref()

server.listen(config.port, () => {
  log('info', { event: 'listening', port: config.port, db: config.dbPath })
  if (config.jwtSecretIsRandom) log('warn', { event: 'JWT_SECRET not set: sessions reset on every restart. Set it in production.' })
})

function shutdown() {
  log('info', { event: 'shutdown' })
  for (const t of tables.values()) t.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
