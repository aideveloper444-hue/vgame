import { Crown, RotateCcw } from 'lucide-react'
import { COLOR_GLOW } from './ludoBoardLayout'
import { ordinal, rankEmoji, type LudoPlayer } from './ludoStore'
import LudoAvatar from './LudoAvatar'
import LudoFireworks from './LudoFireworks'

/** End of the match: every player in the order they finished, with crackers for the champion. */
export default function LudoResultsBoard({
  standings,
  isLocal,
  onContinue,
  onRematch,
}: {
  standings: LudoPlayer[]
  isLocal: (id: string) => boolean
  onContinue: () => void
  onRematch: () => void
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-[#05030d]/75 backdrop-blur-[3px]">
      <LudoFireworks rockets={16} durationMs={5000} sound={false} />
      <div className="ludo-winner-in relative flex max-h-full w-full max-w-[24rem] flex-col items-center overflow-y-auto px-5 py-6 text-center">
        <img src="/assets/ludo/champion-crest.png" alt="" draggable={false} className="h-24 w-auto drop-shadow-[0_0_30px_rgba(251,191,36,0.55)]" />
        <div className="relative -mt-4 rounded-md bg-gradient-to-b from-[#ffe58a] via-[#f5b52a] to-[#b86e08] px-7 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.7)]">
          <p className="text-xl font-black uppercase tracking-[0.18em] text-[#4a2a02] [text-shadow:0_1px_0_rgba(255,255,255,0.5)]">Results</p>
        </div>

        <ol className="mt-5 flex w-full flex-col gap-2">
          {standings.map((p, i) => {
            const rank = i + 1
            const last = rank === standings.length
            const glow = COLOR_GLOW[p.color]
            const champ = rank === 1
            return (
              <li
                key={p.id}
                className="ludo-chip-in flex items-center gap-3 rounded-2xl p-2 pr-3 text-left"
                style={{
                  animationDelay: `${0.15 + i * 0.12}s`,
                  background: champ ? 'linear-gradient(150deg, rgba(60,40,10,0.9), rgba(16,12,30,0.92))' : 'rgba(14,14,34,0.85)',
                  border: `1px solid ${champ ? 'rgba(255,210,74,0.8)' : `${glow}77`}`,
                  boxShadow: champ ? '0 0 26px -4px rgba(255,190,60,0.6)' : `0 0 12px -6px ${glow}`,
                }}
              >
                <span className="w-9 shrink-0 text-center text-2xl">{last && standings.length > 1 ? '🏁' : rankEmoji(rank)}</span>
                <span className="relative h-11 w-11 shrink-0">
                  <span className="absolute inset-0 overflow-hidden rounded-full" style={{ boxShadow: `0 0 0 2px ${glow}` }}>
                    <LudoAvatar name={p.name} color={p.color} className="h-full w-full" />
                  </span>
                  {champ && <Crown size={16} className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,1)]" fill="currentColor" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-black text-white">
                    {p.name}
                    {isLocal(p.id) && <span className="ml-1.5 text-[10px] font-extrabold uppercase text-slate-400">You</span>}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-300">
                    {p.finishedCount}/4 home · {p.captures} capture{p.captures === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="text-sm font-black uppercase" style={{ color: champ ? '#fcd34d' : glow }}>
                  {ordinal(rank)}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="mt-5 flex w-full gap-2.5">
          <button
            type="button"
            onClick={onRematch}
            className="ludo-glass flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-transform active:scale-95"
          >
            <RotateCcw size={15} strokeWidth={2.8} /> Rematch
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex-[1.4] rounded-full bg-gradient-to-b from-[#ffe58a] via-[#f5b52a] to-[#c47a0a] py-3 text-sm font-black uppercase tracking-wide text-[#3d2200] shadow-[0_0_24px_rgba(251,191,36,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] transition-transform active:scale-95"
          >
            Collect Rewards
          </button>
        </div>
      </div>
    </div>
  )
}
