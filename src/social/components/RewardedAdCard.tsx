import { useState } from 'react'
import { Loader2, PlayCircle } from 'lucide-react'
import { adsAvailable, REWARD_COINS, REWARDS_PER_DAY, watchRewardedAd } from '@/lib/ads'
import { useRewardsStore } from '@/social/stores/useRewardsStore'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { sfx } from '@/lib/sound'
import { Card } from './ui'

/** "Watch an ad for coins": the player always chooses to watch; capped per day. */
export default function RewardedAdCard({ compact }: { compact?: boolean }) {
  const left = useRewardsStore((s) => s.adsLeftToday(REWARDS_PER_DAY))
  const recordAdWatch = useRewardsStore((s) => s.recordAdWatch)
  const awardRewards = usePlayerStore((s) => s.awardRewards)
  const [state, setState] = useState<'idle' | 'loading' | 'earned' | 'failed'>('idle')
  if (!adsAvailable) return null

  async function watch() {
    setState('loading')
    const earned = await watchRewardedAd()
    if (earned) {
      recordAdWatch()
      awardRewards(REWARD_COINS, 0)
      sfx.success()
      setState('earned')
    } else setState('failed')
  }

  return (
    <Card className={compact ? 'p-3.5' : 'p-4'}>
      <div className="flex items-center gap-3">
        <PlayCircle size={compact ? 20 : 24} className="shrink-0 text-emerald-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-white">Free coins</p>
          <p className="text-[11px] text-slate-400">
            {state === 'earned' ? `+${REWARD_COINS} coins added!` : state === 'failed' ? 'No ad right now — try again soon.' : `Watch a short ad · +${REWARD_COINS} 🪙 · ${left} left today`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void watch()}
        disabled={left === 0 || state === 'loading'}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-2 text-xs font-black text-[#032018] disabled:from-white/10 disabled:to-white/10 disabled:text-slate-400"
      >
        {state === 'loading' && <Loader2 size={14} className="animate-spin" />}
        {left === 0 ? 'Come back tomorrow' : state === 'loading' ? 'Loading ad…' : 'Watch ad'}
      </button>
    </Card>
  )
}
