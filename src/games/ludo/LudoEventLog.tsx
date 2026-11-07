import { AlertTriangle, Dices, Flag, MessageCircle, Navigation, Skull, Trophy, Zap, type LucideIcon } from 'lucide-react'
import { useLudoStore, type LudoLogEntry, type LudoLogKind } from './ludoStore'
import { COLOR_GLOW } from './ludoBoardLayout'

const KIND_ICON: Record<LudoLogKind, { icon: LucideIcon; tint: string }> = {
  capture: { icon: Skull, tint: '#ff5d7d' },
  roll: { icon: Dices, tint: '#e2e8f0' },
  move: { icon: Navigation, tint: '#93c5fd' },
  finish: { icon: Flag, tint: '#4ade80' },
  win: { icon: Trophy, tint: '#fcd34d' },
  warn: { icon: AlertTriangle, tint: '#fbbf24' },
  chat: { icon: MessageCircle, tint: '#c4b5fd' },
  power: { icon: Zap, tint: '#67e8f9' },
}

function clock(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
}

function Line({ entry }: { entry: LudoLogEntry }) {
  const { actor, color, target, targetColor } = entry
  if (!actor || !color || !entry.text.startsWith(actor)) return <>{entry.text}</>
  const rest = entry.text.slice(actor.length)
  const at = target ? rest.indexOf(target) : -1
  return (
    <>
      <span className="font-extrabold" style={{ color: COLOR_GLOW[color] }}>
        {actor}
      </span>
      {at >= 0 && target && targetColor ? (
        <>
          {rest.slice(0, at)}
          <span className="font-extrabold" style={{ color: COLOR_GLOW[targetColor] }}>
            {target}
          </span>
          {rest.slice(at + target.length)}
        </>
      ) : (
        rest
      )}
    </>
  )
}

export default function LudoEventLog({ limit = 3, large = false }: { limit?: number; large?: boolean }) {
  const row = large ? 3.1 : 1.9
  const eventLog = useLudoStore((s) => s.eventLog)
  const startedAt = useLudoStore((s) => s.startedAt)
  const entries = eventLog.slice(0, limit)

  return (
    <div
      className={`pointer-events-auto min-w-0 flex-1 overflow-hidden backdrop-blur-md ${large ? 'rounded-3xl px-5 py-2' : 'rounded-2xl px-2.5 py-1.5'}`}
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0) 40%), rgba(12,10,32,0.78)',
        border: `${large ? 1.5 : 1}px solid rgba(140,170,255,${large ? 0.6 : 0.35})`,
        boxShadow: '0 0 20px -6px rgba(120,150,255,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      {entries.length === 0 ? (
        <p className={`flex items-center justify-center font-semibold text-slate-400 ${large ? 'text-[16px]' : 'text-[12px]'}`} style={{ height: `${limit * row}rem` }}>
          Roll the dice to start the match!
        </p>
      ) : (
        <ul className="flex flex-col" style={{ height: `${limit * row}rem` }}>
          {entries.map((e, i) => {
            const { icon: Icon, tint } = KIND_ICON[e.kind]
            return (
              <li
                key={e.id}
                style={{ opacity: 1 - i * 0.12, height: `${row}rem` }}
                className={`flex items-center ${large ? 'gap-4 text-[17px]' : 'gap-2 text-[12.5px]'} leading-none text-slate-100 ${i === 0 ? 'ludo-log-in' : ''} ${i > 0 ? 'border-t border-white/[0.08]' : ''}`}
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-full ${large ? 'h-[2.3rem] w-[2.3rem]' : 'h-[1.45rem] w-[1.45rem]'}`}
                  style={{ background: `radial-gradient(circle at 50% 35%, ${tint}44, #0b0a1c 90%)`, boxShadow: `inset 0 0 0 1.5px ${tint}88, 0 0 8px -2px ${tint}` }}
                >
                  <Icon size={large ? 19 : 13} color={tint} strokeWidth={2.6} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  <Line entry={e} />
                </span>
                <span className={`shrink-0 font-bold tabular-nums text-slate-400 ${large ? 'text-[15px]' : 'text-[11px]'}`}>{clock(e.timestamp - startedAt)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
