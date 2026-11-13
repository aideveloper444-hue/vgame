import type { GameId } from '@/games/registry'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { useRewardsStore } from '@/social/stores/useRewardsStore'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { onGameFinished } from '@/lib/ads'

export interface SessionCompleteOptions {
  gameId: GameId
  won: boolean
  coins: number
  xp: number
  playedWithFriend?: boolean
}

export function completeGameSession(opts: SessionCompleteOptions) {
  const { gameId, won, coins, xp } = opts
  usePlayerStore.getState().recordGamePlayed(gameId, won)
  usePlayerStore.getState().awardRewards(coins, xp)
  void onGameFinished()

  const rewards = useRewardsStore.getState()
  rewards.bumpChallenge('play-2', 1)
  if (won) rewards.bumpChallenge('win-1', 1)

  const partyHasFriend = usePartyStore.getState().members.some((m) => !m.isUser && !m.isBot)
  if (opts.playedWithFriend ?? partyHasFriend) {
    rewards.bumpChallenge('play-friend', 1)
    usePlayerStore.getState().unlockAchievement('party-player')
  }
}
