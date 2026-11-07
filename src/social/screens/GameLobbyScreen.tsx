import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, Gift, Megaphone, Play, Trophy, UserPlus, Users } from 'lucide-react'
import { getGame } from '@/games/registry'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { InviteFriendsSheet } from '@/social/components/PartyPanel'
import { Avatar, BTN_SOFT, Card, SectionTitle } from '@/social/components/ui'

export default function GameLobbyScreen() {
  const { gameId } = useParams()
  const game = getGame(gameId)
  const navigate = useNavigate()
  const stats = usePlayerStore((s) => s.stats)
  const friends = useFriendsStore((s) => s.friends)
  const party = usePartyStore()
  const [inviting, setInviting] = useState(false)

  if (!game) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-slate-400">Game not found.</p>
        <Link to="/games" className="mt-3 inline-block text-brand-2 hover:underline">
          Back to Games
        </Link>
      </div>
    )
  }

  const gameStats = stats[game.id]
  const playing = friends.filter((f) => f.online && f.currentGameId === game.id)
  const partyOthers = party.active ? party.members.filter((m) => !m.isUser).length : 0

  return (
    <div className="mx-auto max-w-3xl pb-8 wide:grid wide:max-w-6xl wide:grid-cols-2 wide:items-start wide:gap-8 wide:px-6 wide:pt-5">
      <div className="relative h-[46vh] max-h-[420px] min-h-[280px] overflow-hidden md:rounded-b-[32px] wide:sticky wide:top-4 wide:h-[calc(100dvh-7.5rem)] wide:max-h-none wide:rounded-[32px]">
        <img src={`/posters/${game.id}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-0 via-surface-0/40 to-black/30" />
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
          <ChevronLeft size={22} />
        </button>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex flex-wrap gap-1.5">
            <span className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-extrabold text-white backdrop-blur">
              <Users size={12} /> {game.playersLabel}
            </span>
            <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-extrabold text-white backdrop-blur">{game.difficulty}</span>
          </div>
          <h1 className="mt-2 text-[2.1rem] font-black leading-none tracking-tight text-white">{game.name}</h1>
          <p className="mt-1.5 text-sm font-medium text-slate-300">{game.tagline}</p>
        </div>
      </div>

      <div className="px-4 wide:px-0">
        <div className="mt-4 flex gap-2 wide:mt-0">
          <button
            type="button"
            onClick={() => navigate(`/games/${game.id}/play`)}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-black uppercase tracking-wider text-white active:scale-[0.97]"
            style={{ background: `linear-gradient(135deg, ${game.accentHex}, ${game.accentHex}bb)`, boxShadow: `0 16px 30px -14px ${game.accentHex}` }}
          >
            <Play size={20} className="fill-white" /> Play
          </button>
          <button type="button" onClick={() => setInviting(true)} aria-label="Invite friends" className={`${BTN_SOFT} h-14 w-14 px-0`}>
            <UserPlus size={20} />
          </button>
        </div>
        {partyOthers > 0 && (
          <button
            type="button"
            onClick={() => {
              party.launchGame(game.id)
              navigate(`/games/${game.id}/play`)
            }}
            className={`${BTN_SOFT} mt-2 w-full`}
          >
            <Megaphone size={17} /> Play with my party ({partyOthers})
          </button>
        )}

        <p className="mt-5 text-[15px] leading-relaxed text-slate-300">{game.description}</p>

        {playing.length > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-500/10 p-3 ring-1 ring-emerald-400/20">
            <div className="flex -space-x-2">
              {playing.slice(0, 4).map((f) => (
                <Avatar key={f.id} emoji={f.avatarEmoji} size="xs" />
              ))}
            </div>
            <p className="text-xs font-bold text-emerald-200">
              {playing.map((f) => f.name).join(', ')} {playing.length === 1 ? 'is' : 'are'} playing now
            </p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ['Played', gameStats.played],
            ['Wins', gameStats.wins],
            ['Win rate', gameStats.played ? `${Math.round((gameStats.wins / gameStats.played) * 100)}%` : '—'],
          ].map(([label, v]) => (
            <Card key={label} className="p-3 text-center">
              <p className="text-xl font-black text-white">{v}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            </Card>
          ))}
        </div>

        <section className="mt-6">
          <SectionTitle>How to play</SectionTitle>
          <ul className="space-y-2.5">
            {game.howToPlay.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" style={{ color: game.accentHex }} />
                {step}
              </li>
            ))}
          </ul>
        </section>

        <Card className="mt-6 flex items-center gap-3 p-4">
          <Gift className="shrink-0 text-amber-300" />
          <p className="text-sm text-slate-300">{game.rewardsBlurb}</p>
          <Trophy className="ml-auto shrink-0 text-slate-600" size={18} />
        </Card>
      </div>
      <InviteFriendsSheet open={inviting} onClose={() => setInviting(false)} />
    </div>
  )
}
