import { useEffect, useState } from 'react'
import { useMessStore, POWER_CONFIG, type PowerType } from './messStore'
import MessScene3D from './MessScene3D'
import GameResultScreen from '@/games/shared/GameResultScreen'
import { GAME_REGISTRY } from '@/games/registry'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { makeId } from '@/lib/id'

interface Participant {
  id: string
  name: string
  avatarEmoji: string
  isBot: boolean
}

const BOT_POOL = [
  { name: 'Nova', avatarEmoji: '🤖' },
  { name: 'Rex', avatarEmoji: '🐺' },
  { name: 'Kato', avatarEmoji: '🐯' },
]

function buildParticipants(): Participant[] {
  // party friends play on their own phones (with party chat and voice on top); this device seats only you
  const profile = usePlayerStore.getState().profile
  const base: Participant[] = [{ id: 'you', name: profile.name, avatarEmoji: profile.avatarEmoji, isBot: false }]

  let botIndex = 0
  while (base.length < 4) {
    const pool = BOT_POOL[botIndex % BOT_POOL.length]
    base.push({ id: makeId('bot'), name: pool.name, avatarEmoji: pool.avatarEmoji, isBot: true })
    botIndex += 1
  }
  return base
}

const game = GAME_REGISTRY.mess
const POWERS: PowerType[] = ['freeze', 'push', 'reverse', 'trap']

function useNowTick(intervalMs: number) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

export default function MessGame() {
  const phase = useMessStore((s) => s.phase)
  const players = useMessStore((s) => s.players)
  const countdown = useMessStore((s) => s.countdown)
  const lastEvent = useMessStore((s) => s.lastEvent)
  const cooldowns = useMessStore((s) => s.cooldowns)
  const startGame = useMessStore((s) => s.startGame)
  const activatePower = useMessStore((s) => s.usePower)
  const resetGame = useMessStore((s) => s.resetGame)

  const [pickerFor, setPickerFor] = useState<PowerType | null>(null)
  useNowTick(250)

  useEffect(() => {
    startGame(buildParticipants())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  function handleRematch() {
    resetGame()
    startGame(buildParticipants())
  }

  if (phase === 'FINISHED') {
    const human = players.find((p) => !p.isBot)
    const ranked = [...players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    const won = human?.rank === 1
    const humanHits = human?.hitsLanded ?? 0
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <GameResultScreen
          game={game}
          won={won}
          title={won ? '🏆 You Win!' : `😈 ${ranked[0].name} Wins`}
          subtitle={human ? `You finished #${human.rank} of ${players.length}` : undefined}
          coins={(won ? 300 : 90) + humanHits * 15}
          xp={(won ? 200 : 55) + humanHits * 8}
          stats={ranked.map((p) => ({ label: `#${p.rank} ${p.name}`, value: p.isBot ? `${p.hitsLanded} hits` : `${p.hitsLanded} hits landed` }))}
          onRematch={handleRematch}
        />
      </div>
    )
  }

  if (players.length === 0) return null

  const human = players.find((p) => !p.isBot)
  const now = Date.now()

  function cooldownRemaining(playerId: string, power: PowerType): number {
    const until = cooldowns[playerId]?.[power] ?? 0
    return Math.max(0, Math.ceil((until - now) / 1000))
  }

  function handlePowerClick(power: PowerType) {
    if (!human) return
    if (cooldownRemaining(human.id, power) > 0) return
    if (!POWER_CONFIG[power].needsTarget) {
      activatePower(human.id, power)
      return
    }
    setPickerFor((cur) => (cur === power ? null : power))
  }

  function pickTarget(targetId: string) {
    if (!human || !pickerFor) return
    activatePower(human.id, pickerFor, targetId)
    setPickerFor(null)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#03040c] text-white">
      <MessScene3D className="absolute inset-0 h-full w-full" />

      {/* progress bars */}
      <div className="absolute inset-x-2 top-3 z-20 flex flex-col gap-1.5 sm:inset-x-6 sm:top-4">
        {players.map((p) => (
          <div key={p.id} className="hud-glass flex items-center gap-2 rounded-full px-2.5 py-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm" style={{ background: `${p.color}33` }}>
              {p.avatarEmoji}
            </span>
            <span className="w-16 shrink-0 truncate text-[11px] font-bold text-white sm:w-24 sm:text-[13px]">{p.name}</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-150"
                style={{ width: `${p.progress}%`, background: p.color, boxShadow: `0 0 8px ${p.color}` }}
              />
            </div>
            {p.finished ? (
              <span className="w-8 shrink-0 text-right text-[11px] font-black text-amber-300">#{p.rank}</span>
            ) : (
              <span className="w-8 shrink-0 text-right text-[11px] font-bold text-slate-300">{Math.min(99, Math.round(p.progress))}%</span>
            )}
          </div>
        ))}
      </div>

      {phase === 'COUNTDOWN' && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <span
            className="text-8xl font-black text-white drop-shadow-[0_0_30px_rgba(245,158,11,0.8)]"
            style={{ animation: 'city-pop 0.5s ease-out' }}
            key={countdown}
          >
            {countdown > 0 ? countdown : 'GO!'}
          </span>
        </div>
      )}

      {lastEvent && Date.now() - lastEvent.ts < 2600 && (
        <div
          className="hud-glass pointer-events-none absolute left-1/2 top-[92px] z-30 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-bold text-white sm:top-[104px]"
          style={{ animation: 'city-toast 2.6s ease-out' }}
          key={lastEvent.id}
        >
          {lastEvent.text}
        </div>
      )}

      {human && !human.finished && phase === 'RACING' && (
        <div className="absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2">
          {pickerFor && (
            <div className="hud-glass flex items-center gap-2 rounded-2xl px-3 py-2">
              <span className="text-[11px] font-bold text-slate-300">Target:</span>
              {players
                .filter((p) => p.id !== human.id && !p.finished)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pickTarget(p.id)}
                    className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-bold text-white hover:bg-white/20"
                  >
                    <span>{p.avatarEmoji}</span>
                    {p.name}
                  </button>
                ))}
              <button onClick={() => setPickerFor(null)} className="text-[11px] font-bold text-slate-400 hover:text-white">
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-center gap-2.5">
            {POWERS.map((power) => {
              const cfg = POWER_CONFIG[power]
              const remaining = cooldownRemaining(human.id, power)
              const disabled = remaining > 0
              return (
                <button
                  key={power}
                  onClick={() => handlePowerClick(power)}
                  disabled={disabled}
                  className={`hud-glass relative flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-2xl transition-transform ${
                    disabled ? 'opacity-40' : pickerFor === power ? 'scale-105 ring-2 ring-amber-400' : 'hover:scale-105'
                  }`}
                >
                  <span>{cfg.icon}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-slate-300">{cfg.label}</span>
                  {disabled && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-lg font-black text-white">
                      {remaining}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {human?.finished && phase === 'RACING' && (
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center">
          <div className="hud-glass rounded-2xl px-5 py-3 text-center text-sm font-bold text-slate-200">
            You finished #{human.rank}! Waiting for the race to end…
          </div>
        </div>
      )}
    </div>
  )
}
