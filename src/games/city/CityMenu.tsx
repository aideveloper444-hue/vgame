import GameModeMenu from '@/games/shared/online/GameModeMenu'
import { useLudoPortraits } from '@/games/ludo/ludoPortraits'
import { CITY_PLAYER_COLORS } from './cityStore'
import { CITY_BOT_NAMES, CITY_MAX_PLAYERS, CITY_MIN_PLAYERS, useCityMatch, useTycoonVariant } from './cityMatch'
import { cityRoom } from './cityNet'
import { cityCharacterColor } from './cityCharacters'
import { VARIANTS, type VariantId } from './cityBoardData'
import { BOARD_IMG } from './tycoon/TycoonStage'

const COUNTS = Array.from({ length: CITY_MAX_PLAYERS - CITY_MIN_PLAYERS + 1 }, (_, i) => i + CITY_MIN_PLAYERS)
const COLOR_NAMES = ['blue', 'pink', 'purple', 'gold']
const GLOW = ['#60a5fa', '#ff5fd2', '#e879f9', '#fcd34d']

/** The seat's character, head-and-shoulders; initials until the portraits are rendered. */
function SeatAvatar({ name, index }: { name: string; index: number }) {
  const hex = CITY_PLAYER_COLORS[index]
  const src = useLudoPortraits((s) => s.portraits[cityCharacterColor(hex)])
  return (
    <span className="flex h-full w-full items-center justify-center text-sm font-black text-white" style={{ background: `radial-gradient(circle at 35% 30%, ${hex}, #0b1230 75%)` }}>
      {src ? <img src={src} alt="" className="h-full w-full scale-110 object-cover" draggable={false} /> : (name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Board thumbnail plus the rule-book variant picker. */
function Preview({ count }: { count: number }) {
  const variant = useTycoonVariant((s) => s.variant)
  const setVariant = useTycoonVariant((s) => s.setVariant)
  const v = VARIANTS[variant]
  return (
    <div className="rounded-2xl bg-black/20 p-2.5 ring-1 ring-white/5">
      <div className="flex items-center gap-3">
        <img src={BOARD_IMG} alt="" className="h-[60px] w-[106px] shrink-0 rounded-lg object-cover ring-1 ring-white/20" draggable={false} />
        <div className="min-w-0">
          <p className="text-sm font-black text-white">World Tycoon · {v.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-400">
            {count} tycoons. {v.blurb}
          </p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {(Object.keys(VARIANTS) as VariantId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setVariant(id)}
            className={`rounded-xl px-2 py-1.5 text-[11.5px] font-black ring-1 transition-colors ${variant === id ? 'bg-amber-400 text-amber-950 ring-amber-200' : 'bg-white/[0.05] text-slate-200 ring-white/10 hover:bg-white/10'}`}
          >
            {VARIANTS[id].name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** World Tycoon's mode menu: online, friends by code, pass & play, solo and vs computer, for 2–4 players. */
export default function CityMenu() {
  return (
    <GameModeMenu
      counts={COUNTS}
      defaultCount={4}
      seatStyle={(i) => ({ hex: CITY_PLAYER_COLORS[i], glow: GLOW[i], label: COLOR_NAMES[i] })}
      renderAvatar={(name, i) => <SeatAvatar name={name} index={i} />}
      renderPreview={(count) => <Preview count={count} />}
      botNames={CITY_BOT_NAMES}
      match={useCityMatch}
      room={cityRoom}
      invitePath="/games/city/play"
    />
  )
}
