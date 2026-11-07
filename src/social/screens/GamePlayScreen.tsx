import { Suspense, useEffect } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { getGame } from '@/games/registry'
import { GAME_VIEWS } from '@/games/shared/gameViews'
import GameArt from '@/games/shared/GameArt'
import GameSocialOverlay from '@/social/components/GameSocialOverlay'
import { setPresence } from '@/net/social'

export default function GamePlayScreen() {
  const { gameId } = useParams()
  const game = getGame(gameId)

  const navigate = useNavigate()
  const { search } = useLocation()

  useEffect(() => {
    if (!game) return
    setPresence(`Playing ${game.name}`, game.id)
    return () => setPresence(null, null)
  }, [game])

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

  const View = GAME_VIEWS[game.id]
  if (View) {
    return (
      <>
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface-0">
              <img src={`/posters/${game.id}.webp`} alt="" className="h-28 w-28 rounded-3xl object-cover shadow-2xl" />
              <p className="text-sm font-bold text-slate-300">Loading {game.name}…</p>
            </div>
          }
        >
          {/* a party call to a room (?room=…) remounts the game so it picks the new room up */}
          <View key={search} />
        </Suspense>
        {/* the club has its own chat, emotes and invites; the party overlay would sit on its seats */}
        {game.id !== 'poker' && game.id !== 'wildbound' && <GameSocialOverlay game={game} />}
      </>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-14 text-center">
      <GameArt game={game} className="h-32 w-32 rounded-2xl" />
      <h1 className="mt-5 text-xl font-bold">{game.name} is being built</h1>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
        <Hammer size={14} /> This game's full gameplay lands in its own build phase.
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={() => navigate(`/games/${game.id}`)} className="rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:bg-surface-3">
          Back to Lobby
        </button>
        <button onClick={() => navigate('/games')} className="rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: game.accentHex }}>
          Choose Another Game
        </button>
      </div>
    </div>
  )
}
