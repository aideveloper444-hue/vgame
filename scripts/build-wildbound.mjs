// Wildbound standalone release build: compiles the game into dist-wildbound/ (or the folder given as the first
// argument) and copies in exactly the public assets it loads at run time (models, textures, icons, credits).
// usage: node scripts/build-wildbound.mjs [outDir]
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, statSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.resolve(root, process.argv[2] ?? 'dist-wildbound')
const vite = path.join(root, 'node_modules', '.bin', 'vite')

const built = spawnSync(process.execPath, [vite, 'build', '-c', 'vite.wildbound.config.ts', '--outDir', out, '--emptyOutDir'], { cwd: root, stdio: 'inherit' })
if (built.status !== 0) process.exit(built.status ?? 1)

const assets = [
  'favicon.svg',
  'apple-touch-icon.png',
  'models/wildbound',
  // jungle props and the forest wall texture shared with the original Amazon prototype
  'models/amazon/props',
  'models/amazon/tex',
]
let bytes = 0
const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0) : statSync(p).size)
for (const a of assets) {
  const from = path.join(root, 'public', a)
  if (!existsSync(from)) {
    console.error(`missing asset: public/${a}`)
    process.exit(1)
  }
  cpSync(from, path.join(out, a), { recursive: true })
  bytes += size(from)
}
console.log(`\nWildbound release in ${path.relative(root, out) || '.'}: game + ${(bytes / 1048576).toFixed(1)} MB of assets`)
