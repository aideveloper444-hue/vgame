import { Gift, Sparkle, Award } from 'lucide-react'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { useRewardsStore } from '@/social/stores/useRewardsStore'
import { BackButton } from '@/social/components/ui'
import { sfx } from '@/lib/sound'
import RewardedAdCard from '@/social/components/RewardedAdCard'

export default function RewardsScreen() {
  const profile = usePlayerStore((s) => s.profile)
  const awardRewards = usePlayerStore((s) => s.awardRewards)
  const achievements = usePlayerStore((s) => s.achievements)
  const rewards = useRewardsStore()

  function handleClaimDaily() {
    const result = rewards.claimDaily()
    if (result) {
      awardRewards(result.coins, result.xp)
      sfx.success()
    }
  }

  function handleClaimChallenge(id: string) {
    const result = rewards.claimChallenge(id)
    if (result) awardRewards(result.coins, result.xp)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-bold">Rewards</h1>
      </div>
      <p className="mt-1 text-sm text-slate-400">Balance: 🪙 {profile.coins.toLocaleString()} coins</p>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold">
          <Gift size={18} /> Daily Reward
        </h2>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-soft bg-surface-1 p-5">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <div
              key={day}
              className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl text-xs font-bold ${
                day === rewards.dailyDay ? 'bg-gradient-to-br from-brand to-brand-2 text-white' : 'bg-surface-2 text-slate-400'
              }`}
            >
              <span>Day {day}</span>
              <span>🎁</span>
            </div>
          ))}
          <button
            onClick={handleClaimDaily}
            disabled={!rewards.canClaimDaily()}
            className="ml-auto rounded-xl bg-gradient-to-r from-brand to-brand-2 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {rewards.canClaimDaily() ? 'Claim +500 Coins' : 'Come back tomorrow'}
          </button>
        </div>
      </section>

      <div className="mt-4">
        <RewardedAdCard />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold">
          <Sparkle size={18} /> Weekly Challenges
        </h2>
        <div className="flex flex-col gap-2">
          {rewards.challenges.map((c) => {
            const pct = Math.round((c.progress / c.target) * 100)
            const done = c.progress >= c.target
            return (
              <div key={c.id} className="rounded-2xl border border-border-soft bg-surface-1 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{c.label}</p>
                  <span className="text-xs font-semibold text-brand-2">
                    +{c.rewardCoins} coins · +{c.rewardXp} XP
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-500">
                    {c.progress}/{c.target}
                  </span>
                </div>
                {done && !c.claimed && (
                  <button
                    onClick={() => handleClaimChallenge(c.id)}
                    className="mt-3 w-full rounded-lg bg-surface-3 py-2 text-xs font-bold hover:bg-surface-2"
                  >
                    Claim reward
                  </button>
                )}
                {c.claimed && <p className="mt-2 text-xs text-emerald-400">Claimed</p>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold">
          <Award size={18} /> Achievement Badges
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-3 text-center ${
                a.unlocked ? 'border-brand/40 bg-brand/10' : 'border-border-soft bg-surface-1 opacity-50'
              }`}
            >
              <p className="text-2xl">{a.icon}</p>
              <p className="mt-1 text-xs font-semibold">{a.name}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
