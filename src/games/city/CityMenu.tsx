import GameModeMenu from '@/games/shared/online/GameModeMenu'
import { useLudoPortraits } from '@/games/ludo/ludoPortraits'
import { CITY_PLAYER_COLORS } from './cityStore'
import { CITY_BOT_NAMES, CITY_MAX_PLAYERS, CITY_MIN_PLAYERS, useCityMatch } from './cityMatch'
import { cityRoom } from './cityNet'
import { cityCharacterColor } from './cityCharacters'
import { money } from './cityFormat'

const COUNTS = Array.from({ length: CITY_MAX_PLAYERS - CITY_MIN_PLAYERS + 1 }, (_, i) => i + CITY_MIN_PLAYERS)
const COLOR_NAMES = ['blue', 'pink', 'purple', 'gold']
const GLOW = ['#60a5fa', '#ff5fd2', '#e879f9', '#fcd34d']

/** The seat's own 3D character, head-and-shoulders; initials until the portraits are rendered. */
function SeatAvatar({ name, index }: { name: string; index: number }) {
  const hex = CITY_PLAYER_COLORS[index]
  const src = useLudoPortraits((s) => s.portraits[cityCharacterColor(hex)])
  return (
    <span className="flex h-full w-full items-center justify-center text-sm font-black text-white" style={{ background: `radial-gradient(circle at 35% 30%, ${hex}, #0b1230 75%)` }}>
      {src ? <img src={src} alt="" className="h-full w-full scale-110 object-cover" draggable={false} /> : (name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Tiny ring of property tiles with the seats' colours on the corners. */
function Preview({ count }: { count: number }) {
  const S = 84
  const cell = S / 7
  const tiles: [number, number][] = []
  for (let i = 0; i < 7; i++) tiles.push([i, 0], [i, 6], [0, i], [6, i])
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-2.5 ring-1 ring-white/5">
      <svg viewBox={`0 0 ${S} ${S}`} className="h-[84px] w-[84px] shrink-0" aria-hidden>
        <rect x="1" y="1" width={S - 2} height={S - 2} rx="8" fill="#141736" stroke="#e9b949" strokeWidth="1.5" />
        <rect x={cell + 2} y={cell + 2} width={S - 2 * cell - 4} height={S - 2 * cell - 4} rx="4" fill="#1d4f8f" />
        <rect x={S / 2 - 7} y={S / 2 - 7} width="14" height="14" rx="7" fill="#3aa35a" />
        {tiles.map(([x, y], i) => (
          <rect key={i} x={x * cell + 1.5} y={y * cell + 1.5} width={cell - 1.5} height={cell - 1.5} rx="1.5" fill={i % 5 === 0 ? '#c084fc' : '#eef0f8'} opacity="0.92" />
        ))}
        {CITY_PLAYER_COLORS.slice(0, count).map((c, i) => (
          <circle key={c} cx={S * 0.18 + i * 7} cy={S * 0.82} r="3.2" fill={c} stroke="#fff" strokeWidth="0.8" />
        ))}
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-black text-white">World cities board</p>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-400">
          {count} tycoons start with {money(1500)} each. Buy cities, build and bankrupt your rivals.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {CITY_PLAYER_COLORS.slice(0, count).map((c) => (
            <span key={c} className="h-3 w-3 rounded-full ring-1 ring-black/30" style={{ background: c, boxShadow: `0 0 6px ${c}88` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Monopoly's mode menu: online, friends by code, pass & play, solo and vs computer, for 2–4 players. */
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
