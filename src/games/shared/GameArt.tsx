import type { GameDefinition } from '@/games/registry'

const PATTERNS: Record<GameDefinition['id'], string> = {
  ludo:
    'radial-gradient(circle at 15% 20%, #ef4444 0%, transparent 40%), radial-gradient(circle at 85% 25%, #3b82f6 0%, transparent 40%), radial-gradient(circle at 20% 85%, #22c55e 0%, transparent 40%), radial-gradient(circle at 85% 85%, #eab308 0%, transparent 40%), #14182a',
  city: 'linear-gradient(160deg, #064e3b 0%, #0f2f2b 45%, #0b0f1a 100%)',
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
      <Icon size={56} className="relative z-10 opacity-90" color={game.accentHex} strokeWidth={1.6} />
    </div>
  )
}
