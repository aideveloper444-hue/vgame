import { useNavigate } from 'react-router-dom'
import { ChevronRight, Gift, Play, Plus, Sparkle, Users, WifiOff } from 'lucide-react'
import { GAME_REGISTRY, GAME_LIST } from '@/games/registry'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { useChatStore } from '@/social/stores/useChatStore'
import { useRewardsStore } from '@/social/stores/useRewardsStore'
import { useNotificationStore } from '@/social/stores/useNotificationStore'
import { useHub } from '@/net/hub'
import { sfx } from '@/lib/sound'
import PartyPanel from '@/social/components/PartyPanel'
import RewardedAdCard from '@/social/components/RewardedAdCard'
import { Avatar, Card, SectionTitle } from '@/social/components/ui'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function HomeScreen() {
  const navigate = useNavigate()
  const profile = usePlayerStore((s) => s.profile)
  const recentGames = usePlayerStore((s) => s.recentGames)
  const awardRewards = usePlayerStore((s) => s.awardRewards)
  const allFriends = useFriendsStore((s) => s.friends)
  const ensureDm = useChatStore((s) => s.ensureDmConversation)
  const rewards = useRewardsStore()
  const pushNotification = useNotificationStore((s) => s.push)
  const hub = { status: useHub((s) => s.status), error: useHub((s) => s.error) }

  const friends = allFriends.filter((f) => f.status === 'friend').sort((a, b) => Number(b.online) - Number(a.online))
  const onlineCount = friends.filter((f) => f.online).length
  const featured = GAME_REGISTRY[recentGames[0]?.gameId ?? 'ludo']
  const canClaim = rewards.canClaimDaily()

  function claimDaily() {
    const result = rewards.claimDaily()
    if (!result) return
    awardRewards(result.coins, result.xp)
    sfx.success()
    pushNotification({ title: 'Coins received', body: `You received ${result.coins} coins.`, icon: '🪙', deepLink: { screen: 'me' } })
  }

  return (
    <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-4 md:px-6">
      <div className="app-aurora pointer-events-none absolute inset-x-0 -top-24 h-96" />

      <div className="relative">
        <p className="text-sm font-semibold text-slate-400">{greeting()},</p>
        <h1 className="text-[1.75rem] font-black leading-tight text-white">
          {profile.name}
        </h1>
      </div>

      {hub.status === 'error' && (
        <div className="relative mt-3 flex items-center gap-2 rounded-2xl bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/20">
          <WifiOff size={15} className="shrink-0" /> {hub.error}
        </div>
      )}

      {/* featured games: big poster cards, swipe across; the last played game comes first */}
      <section className="relative mt-4">
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6">
          {[featured, ...GAME_LIST.filter((g) => g.id !== featured.id)].map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => navigate(`/games/${g.id}/play`)}
              className="group relative aspect-[4/5] w-[78%] shrink-0 snap-center overflow-hidden rounded-[26px] text-left ring-1 ring-white/10 sm:w-[46%] lg:w-[31%]"
              style={{ boxShadow: `0 24px 50px -24px ${g.accentHex}88` }}
            >
              <img src={`/posters/${g.id}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" draggable={false} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10" />
              <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/90 ring-1 ring-white/15 backdrop-blur-md">
                {i === 0 && recentGames.length > 0 ? 'Continue' : 'Featured'}
              </span>
              <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white/90 ring-1 ring-white/15 backdrop-blur-md">
                <Users size={11} /> {g.playersLabel}
              </span>
              <span className="absolute inset-x-4 bottom-4">
                <span className="block text-[1.7rem] font-black leading-none tracking-tight text-white drop-shadow">{g.name}</span>
                <span className="mt-1.5 block text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70">{g.tagline}</span>
                <span className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-black text-surface-0 transition-transform group-active:scale-95">
                  <Play size={14} className="fill-surface-0" /> Play now
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="relative mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>Party</SectionTitle>
          <PartyPanel />
        </section>

        <section>
          <SectionTitle
            action={
              <button type="button" onClick={() => navigate('/chat?tab=friends')} className="flex items-center text-xs font-bold text-brand-2">
                {onlineCount} online <ChevronRight size={14} />
              </button>
            }
          >
            Friends
          </SectionTitle>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            <button type="button" onClick={() => navigate('/chat?tab=friends')} className="flex w-16 shrink-0 flex-col items-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-brand/50 bg-brand/10 text-brand-2">
                <Plus size={22} />
              </span>
              <span className="mt-1 text-[11px] font-bold text-slate-300">Add</span>
            </button>
            {friends.map((f) => (
              <button key={f.id} type="button" onClick={() => navigate(`/chat/${ensureDm(f.id)}`)} className="flex w-16 shrink-0 flex-col items-center">
                <Avatar emoji={f.avatarEmoji} size="lg" online={f.online} className={f.online ? '' : 'opacity-60'} />
                <span className="mt-1 w-full truncate text-center text-[11px] font-bold text-slate-200">{f.name}</span>
                <span className="w-full truncate text-center text-[9.5px] font-semibold text-emerald-300/90">{f.online ? (f.currentGameId ? GAME_REGISTRY[f.currentGameId].name : 'Online') : ''}</span>
              </button>
            ))}
          </div>
          {friends.length === 0 && <p className="mt-2 text-xs text-slate-500">Add friends with their friend code to chat, talk and play together.</p>}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Card className="p-3.5">
              <Gift size={20} className="text-amber-300" />
              <p className="mt-2 text-sm font-extrabold text-white">Daily reward</p>
              <p className="text-[11px] text-slate-400">Day {rewards.dailyDay} · +500 coins</p>
              <button
                type="button"
                onClick={claimDaily}
                disabled={!canClaim}
                className="mt-2.5 w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2 text-xs font-black text-[#2b1600] disabled:from-white/10 disabled:to-white/10 disabled:text-slate-400"
              >
                {canClaim ? 'Claim' : 'Come back tomorrow'}
              </button>
            </Card>
            <Card className="p-3.5">
              <Sparkle size={20} className="text-brand-2" />
              <p className="mt-2 text-sm font-extrabold text-white">Challenges</p>
              <p className="text-[11px] text-slate-400">
                {rewards.challenges.filter((c) => c.progress >= c.target).length}/{rewards.challenges.length} complete
              </p>
              <button type="button" onClick={() => navigate('/rewards')} className="mt-2.5 w-full rounded-xl bg-white/[0.08] py-2 text-xs font-black text-white ring-1 ring-white/10">
                View
              </button>
            </Card>
          </div>
          <div className="mt-3">
            <RewardedAdCard compact />
          </div>
        </section>
      </div>

    </div>
  )
}
