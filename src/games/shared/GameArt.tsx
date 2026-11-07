import type { GameDefinition } from '@/games/registry'

const PATTERNS: Record<GameDefinition['id'], string> = {
  ludo:
    'radial-gradient(circle at 15% 20%, #ef4444 0%, transparent 40%), radial-gradient(circle at 85% 25%, #3b82f6 0%, transparent 40%), radial-gradient(circle at 20% 85%, #22c55e 0%, transparent 40%), radial-gradient(circle at 85% 85%, #eab308 0%, transparent 40%), #14182a',
  city: 'linear-gradient(160deg, #064e3b 0%, #0f2f2b 45%, #0b0f1a 100%)',
  mess: 'linear-gradient(135deg, #7c2d12 0%, #92400e 35%, #1c1305 100%)',
  amazon: 'linear-gradient(160deg, #052e1a 0%, #14532d 45%, #0b0f1a 100%)',
  mystery: 'radial-gradient(circle at 70% 20%, #4c1d95 0%, transparent 55%), linear-gradient(180deg, #1e1147 0%, #0b0f1a 100%)',
  wildbound: 'radial-gradient(circle at 50% 30%, #2f6b2a 0%, transparent 60%), linear-gradient(180deg, #13280f 0%, #050a04 100%)',
  poker: 'radial-gradient(circle at 50% 30%, #6e4206 0%, transparent 60%), linear-gradient(180deg, #1a1208 0%, #050403 100%)',
}

export default function GameArt({ game, className = '' }: { game: GameDefinition; className?: string }) {
  const Icon = game.icon
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundImage: PATTERNS[game.id] }}
    >
      {game.id === 'city' && (
        <svg className="absolute bottom-0 left-0 w-full opacity-70" height="60" viewBox="0 0 200 60" preserveAspectRatio="none">
          {[10, 30, 50, 70, 90, 110, 130, 150, 170].map((x, i) => (
            <rect key={x} x={x} y={60 - ((i % 4) + 2) * 10} width="14" height={((i % 4) + 2) * 10} fill="#10b98155" />
          ))}
        </svg>
      )}
      {game.id === 'mess' && (
        <svg className="absolute inset-x-0 bottom-0 w-full opacity-40" height="40" viewBox="0 0 200 40">
          <path d="M0 20 L20 30 L40 10 L60 30 L80 10 L100 30 L120 10 L140 30 L160 10 L180 30 L200 20" stroke="#fbbf24" strokeWidth="3" fill="none" />
        </svg>
      )}
      {game.id === 'amazon' && (
        <div className="absolute inset-0 opacity-30">
          {[...Array(8)].map((_, i) => (
            <span key={i} className="absolute text-2xl" style={{ left: `${(i * 47) % 100}%`, top: `${(i * 31) % 100}%` }}>
              🌿
            </span>
          ))}
        </div>
      )}
      {game.id === 'mystery' && (
        <div className="absolute inset-0 opacity-50">
          {[...Array(14)].map((_, i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white"
              style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, opacity: 0.3 + ((i * 13) % 7) / 10 }}
            />
          ))}
        </div>
      )}
      <Icon size={56} className="relative z-10 opacity-90" color={game.accentHex} strokeWidth={1.6} />
    </div>
  )
}
