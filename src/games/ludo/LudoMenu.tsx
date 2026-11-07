import { COLOR_DEEP, COLOR_GLOW, COLOR_HEX, type LudoColor } from './ludoBoardLayout'
import { MAX_PLAYERS, MIN_PLAYERS, radialGeometry, seatColors } from './ludoBoards'
import { BOT_NAMES, useLudoMatch } from './ludoMatch'
import { ludoRoom } from './ludoNet'
import LudoAvatar from './LudoAvatar'
import GameModeMenu from '@/games/shared/online/GameModeMenu'

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)
const seatColor = (i: number, total: number) => seatColors(total)[i] ?? 'RED'

/** Miniature of the board this many players will use: the classic cross for 2–4, a star with one arm per player above that. */
function BoardPreview({ count }: { count: number }) {
  const colors = seatColors(count)
  const S = 84
  const h = S / 2
  if (count <= 4) {
    const quads: [LudoColor, number, number][] = [
      ['RED', 0, 0],
      ['GREEN', 1, 0],
      ['YELLOW', 1, 1],
      ['BLUE', 0, 1],
    ]
    const q = S * 0.4
    return (
      <svg viewBox={`0 0 ${S} ${S}`} className="h-[84px] w-[84px] shrink-0" aria-hidden>
        <rect x="1" y="1" width={S - 2} height={S - 2} rx="9" fill="#141736" stroke="#e9b949" strokeWidth="1.5" />
        {quads.map(([c, qx, qy]) => {
          const on = colors.includes(c)
          return (
            <rect
              key={c}
              x={qx ? S - q - 4 : 4}
              y={qy ? S - q - 4 : 4}
              width={q}
              height={q}
              rx="5"
              fill={on ? COLOR_HEX[c] : '#2a2d4a'}
              stroke={on ? COLOR_GLOW[c] : 'none'}
              strokeWidth="1.2"
              className="transition-[fill] duration-300"
            />
          )
        })}
        <rect x={q + 5} y="4" width={S - 2 * q - 10} height={S - 8} fill="#eef0f8" opacity="0.85" />
        <rect x="4" y={q + 5} width={S - 8} height={S - 2 * q - 10} fill="#eef0f8" opacity="0.85" />
        <rect x={q + 5} y={q + 5} width={S - 2 * q - 10} height={S - 2 * q - 10} fill="#f5c64a" />
      </svg>
    )
  }
  const g = radialGeometry(count)
  const scale = (h - 3) / g.circumradius
  const pt = (a: number, r: number) => `${h + Math.cos(a) * r * scale},${h + Math.sin(a) * r * scale}`
  const wedge = (k: number) => g.armAngle(k) + Math.PI / count
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-[84px] w-[84px] shrink-0" aria-hidden>
      <polygon points={colors.map((_, k) => pt(wedge(k), g.circumradius)).join(' ')} fill="#141736" stroke="#e9b949" strokeWidth="1.5" />
      {colors.map((c, k) => (
        <polygon
          key={c}
          points={[pt(g.armAngle(k), g.r0), pt(g.armAngle(k), g.apothem), pt(wedge(k), g.circumradius - 0.3), pt(g.armAngle(k + 1), g.apothem), pt(g.armAngle(k + 1), g.r0)].join(' ')}
          fill={COLOR_HEX[c]}
          stroke={COLOR_DEEP[c]}
          strokeWidth="0.6"
        />
      ))}
      {colors.map((_, k) => {
        const a = g.armAngle(k)
        const w = 1.5 * 0.62 * scale
        const x0 = h + Math.cos(a) * g.r0 * scale
        const y0 = h + Math.sin(a) * g.r0 * scale
        const len = (g.armEnd - g.r0) * scale
        return (
          <rect
            key={k}
            x={x0}
            y={y0 - w}
            width={len}
            height={w * 2}
            fill="#eef0f8"
            opacity="0.9"
            transform={`rotate(${(a * 180) / Math.PI} ${x0} ${y0})`}
          />
        )
      })}
      <circle cx={h} cy={h} r={g.r0 * scale * 0.9} fill="#f5c64a" />
    </svg>
  )
}

/** Board shape, a line about it and the team colours for the chosen player count. */
function Preview({ count }: { count: number }) {
  const colors = seatColors(count)
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-2.5 ring-1 ring-white/5">
      <BoardPreview count={count} />
      <div className="min-w-0">
        <p className="text-sm font-black text-white">{count <= 4 ? 'Classic board' : `${count}-arm star board`}</p>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-400">
          {count <= 4 ? (count === 2 ? 'Two players race from opposite corners.' : `${count} bases on the classic cross.`) : `One arm and base for each of the ${count} players.`}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {colors.map((c) => (
            <span key={c} className="h-3 w-3 rounded-full ring-1 ring-black/30" style={{ background: COLOR_HEX[c], boxShadow: `0 0 6px ${COLOR_GLOW[c]}88` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Ludo's mode menu: online, friends by code, pass & play, solo and vs computer, for 2–8 players. */
export default function LudoMenu() {
  return (
    <GameModeMenu
      counts={COUNTS}
      defaultCount={4}
      seatStyle={(i, total) => {
        const c = seatColor(i, total)
        return { hex: COLOR_HEX[c], glow: COLOR_GLOW[c], label: c.toLowerCase() }
      }}
      renderAvatar={(name, i, total) => <LudoAvatar name={name} color={seatColor(i, total)} className="h-full w-full" />}
      renderPreview={(count) => <Preview count={count} />}
      botNames={BOT_NAMES}
      match={useLudoMatch}
      room={ludoRoom}
      invitePath="/games/ludo/play"
    />
  )
}
