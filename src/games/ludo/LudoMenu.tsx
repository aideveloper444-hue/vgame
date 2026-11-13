import { COLOR_DEEP, COLOR_GLOW, COLOR_HEX, type LudoColor } from './ludoBoardLayout'
import { MAX_PLAYERS, MIN_PLAYERS, radialGeometry, seatColors } from './ludoBoards'
import { BOT_NAMES, useLudoMatch } from './ludoMatch'
import { ludoRoom } from './ludoNet'
import { useLudoPortraits } from './ludoPortraits'
import LudoAvatar from './LudoAvatar'
import GameModeMenu from '@/games/shared/online/GameModeMenu'
import { Check } from 'lucide-react'
import { BOARD_THEMES, CHARACTER_STYLES, STYLE_ORDER, THEME_ORDER, useBoardTheme, useCharacterStyle, type BoardTheme, type CharacterStyleId } from './ludoThemes'

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)
const seatColor = (i: number, total: number) => seatColors(total)[i] ?? 'RED'

/** Miniature of the board this many players will use: the classic cross for 2–4, a star with one arm per player above that. */
function BoardPreview({ count }: { count: number }) {
  const colors = seatColors(count)
  const theme = BOARD_THEMES[useBoardTheme((st) => st.themeId)]
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
        <rect x="1" y="1" width={S - 2} height={S - 2} rx="9" fill={theme.body[0]} stroke={theme.inlay[1]} strokeWidth="1.5" />
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
              fill={on && !theme.neon ? COLOR_DEEP[c] : theme.body[1]}
              stroke={on ? COLOR_GLOW[c] : 'none'}
              strokeWidth={theme.neon ? 1.8 : 1.2}
              style={on && theme.neon ? { filter: `drop-shadow(0 0 3px ${COLOR_GLOW[c]})` } : undefined}
              className="transition-[fill] duration-300"
            />
          )
        })}
        <rect x={q + 5} y="4" width={S - 2 * q - 10} height={S - 8} fill={theme.tile[1]} opacity="0.95" />
        <rect x="4" y={q + 5} width={S - 8} height={S - 2 * q - 10} fill={theme.tile[1]} opacity="0.95" />
        <rect x={q + 5} y={q + 5} width={S - 2 * q - 10} height={S - 2 * q - 10} fill={theme.inlay[1]} />
      </svg>
    )
  }
  const g = radialGeometry(count)
  const scale = (h - 3) / g.circumradius
  const pt = (a: number, r: number) => `${h + Math.cos(a) * r * scale},${h + Math.sin(a) * r * scale}`
  const wedge = (k: number) => g.armAngle(k) + Math.PI / count
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-[84px] w-[84px] shrink-0" aria-hidden>
      <polygon points={colors.map((_, k) => pt(wedge(k), g.circumradius)).join(' ')} fill={theme.body[0]} stroke={theme.inlay[1]} strokeWidth="1.5" />
      {colors.map((c, k) => (
        <polygon
          key={c}
          points={[pt(g.armAngle(k), g.r0), pt(g.armAngle(k), g.apothem), pt(wedge(k), g.circumradius - 0.3), pt(g.armAngle(k + 1), g.apothem), pt(g.armAngle(k + 1), g.r0)].join(' ')}
          fill={COLOR_DEEP[c]}
          stroke={theme.inlay[2]}
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
            fill={theme.tile[1]}
            opacity="0.95"
            transform={`rotate(${(a * 180) / Math.PI} ${x0} ${y0})`}
          />
        )
      })}
      <circle cx={h} cy={h} r={g.r0 * scale * 0.9} fill={theme.inlay[1]} />
    </svg>
  )
}

/** A tiny classic board painted in a theme's real materials, for the theme picker. */
function ThemeSwatch({ theme }: { theme: BoardTheme }) {
  const quads: [LudoColor, number, number][] = [
    ['RED', 4, 4],
    ['GREEN', 34, 4],
    ['YELLOW', 34, 34],
    ['BLUE', 4, 34],
  ]
  return (
    <svg viewBox="0 0 56 56" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`b-${theme.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={theme.body[0]} />
          <stop offset="1" stopColor={theme.body[1]} />
        </linearGradient>
        <linearGradient id={`t-${theme.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.tile[0]} />
          <stop offset="1" stopColor={theme.tile[2]} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="54" height="54" rx="6" fill={`url(#b-${theme.id})`} stroke={theme.inlay[1]} strokeWidth="1.2" />
      {quads.map(([c, x, y]) => (
        <g key={c}>
          <rect x={x} y={y} width="18" height="18" rx="3" fill={theme.neon ? '#050508' : COLOR_DEEP[c]} stroke={theme.neon ? 'none' : theme.inlay[1]} strokeWidth="0.8" />
          <rect x={x + 4} y={y + 4} width="10" height="10" rx="2" fill={theme.yard[1]} stroke={COLOR_GLOW[c]} strokeWidth="0.6" />
        </g>
      ))}
      {/* walkway stones */}
      {[0, 1, 2].map((i) =>
        [0, 1, 2, 3, 4, 5].map((j) => (
          <g key={`${i}-${j}`}>
            <rect x={23 + i * 3.6} y={2 + j * 3.4} width="3" height="2.9" rx="0.5" fill={i === 1 && j > 0 ? (theme.neon ? COLOR_DEEP.GREEN : COLOR_HEX.GREEN) : `url(#t-${theme.id})`} />
            <rect x={23 + i * 3.6} y={35.3 + j * 3.4} width="3" height="2.9" rx="0.5" fill={i === 1 && j < 5 ? (theme.neon ? COLOR_DEEP.BLUE : COLOR_HEX.BLUE) : `url(#t-${theme.id})`} />
            <rect x={2 + j * 3.4} y={23 + i * 3.6} width="2.9" height="3" rx="0.5" fill={i === 1 && j > 0 ? (theme.neon ? COLOR_DEEP.RED : COLOR_HEX.RED) : `url(#t-${theme.id})`} />
            <rect x={35.3 + j * 3.4} y={23 + i * 3.6} width="2.9" height="3" rx="0.5" fill={i === 1 && j < 5 ? (theme.neon ? COLOR_DEEP.YELLOW : COLOR_HEX.YELLOW) : `url(#t-${theme.id})`} />
          </g>
        )),
      )}
      <rect x="22.5" y="22.5" width="11" height="11" fill={theme.neon ? '#050508' : theme.inlay[1]} />
      {theme.neonGrid && <rect x="1" y="1" width="54" height="54" rx="6" fill="none" stroke={theme.inlay[0]} strokeWidth="0.6" opacity="0.8" />}
      {theme.neon && (
        <g fill="none" strokeWidth="1.1" style={{ filter: 'drop-shadow(0 0 1.5px currentColor)' }}>
          {quads.map(([c, x, y]) => (
            <rect key={c} x={x} y={y} width="18" height="18" rx="2" stroke={COLOR_GLOW[c]} style={{ color: COLOR_GLOW[c] }} />
          ))}
          <path d="M28 24 L32 28 L28 32 L24 28 Z" stroke="#ffffff" />
        </g>
      )}
    </svg>
  )
}

/** Four board looks to pick from before the match; the choice is remembered on this device. */
function ThemePicker() {
  const themeId = useBoardTheme((st) => st.themeId)
  const setTheme = useBoardTheme((st) => st.setTheme)
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Board theme</p>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${THEME_ORDER.length}, minmax(0, 1fr))` }}>
        {THEME_ORDER.map((id) => {
          const t = BOARD_THEMES[id]
          const on = id === themeId
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={on}
              className="group relative flex flex-col items-center rounded-2xl p-1.5 text-center transition-transform active:scale-95"
              style={{
                background: on ? `linear-gradient(180deg, ${t.inlay[1]}33, rgba(0,0,0,0.25))` : 'rgba(0,0,0,0.25)',
                boxShadow: on ? `0 0 0 2px ${t.inlay[1]}, 0 0 18px ${t.inlay[1]}66` : '0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <span className="block aspect-square w-full overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-[1.04]">
                <ThemeSwatch theme={t} />
              </span>
              <span className="mt-1 line-clamp-1 text-[10.5px] font-black leading-tight text-white">{t.name}</span>
              <span className="line-clamp-1 text-[9px] font-semibold leading-tight text-slate-400">{t.tagline}</span>
              {on && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-black" style={{ background: t.inlay[0], boxShadow: `0 0 8px ${t.inlay[1]}` }}>
                  <Check size={13} strokeWidth={3.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Illustrated badge for each warrior style. */
function StyleBadge({ id }: { id: CharacterStyleId }) {
  const bg = { ranger: ['#2c3a1e', '#0e140a'], vanguard: ['#1d2c5a', '#080d1f'], knight: ['#3a3f4c', '#101217'], shadow: ['#1b1626', '#050308'] }[id]
  return (
    <svg viewBox="0 0 56 56" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`sb-${id}`} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor={bg[0]} />
          <stop offset="1" stopColor={bg[1]} />
        </radialGradient>
        <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0f3f8" />
          <stop offset="0.55" stopColor="#a9b0bd" />
          <stop offset="1" stopColor="#5d6472" />
        </linearGradient>
      </defs>
      <rect width="56" height="56" rx="10" fill={`url(#sb-${id})`} />
      {id === 'ranger' && (
        <g>
          {/* hood with a shadowed face and a strap across the chest */}
          <path d="M28 9 C17 10 13 20 14 30 L13 47 L43 47 L42 30 C43 20 39 10 28 9 Z" fill="#7b5a34" stroke="#3c2a16" strokeWidth="1" />
          <path d="M28 17 C22 17 20 23 20.5 29 C21 34 24 37 28 37 C32 37 35 34 35.5 29 C36 23 34 17 28 17 Z" fill="#1a120a" />
          <ellipse cx="28" cy="30" rx="5.5" ry="6.5" fill="#c99a76" opacity="0.9" />
          <path d="M17 44 L39 38" stroke="#3c2a16" strokeWidth="2.4" />
        </g>
      )}
      {id === 'vanguard' && (
        <g>
          {/* fitted suit, high collar, glowing chest line and visor */}
          <path d="M14 48 C14 38 20 34 28 34 C36 34 42 38 42 48 Z" fill="#2f56d8" />
          <path d="M28 36 L28 48" stroke="#9fd0ff" strokeWidth="1.6" />
          <path d="M20 40 L36 40" stroke="#9fd0ff" strokeWidth="1.2" opacity="0.7" />
          <ellipse cx="28" cy="22" rx="8.5" ry="10" fill="#c99a76" />
          <path d="M19.5 18 C20 12 36 12 36.5 18 C33 15 23 15 19.5 18 Z" fill="#2b1a10" />
          <rect x="20" y="20.5" width="16" height="4.2" rx="2" fill="#5ad8ff" opacity="0.92" />
        </g>
      )}
      {id === 'knight' && (
        <g>
          {/* plumed great helm with a visor slit and a centre ridge */}
          <path d="M28 4 C36 4 42 8 44 12 C38 9 32 9 28 10 Z" fill="#d4142a" />
          <path d="M17 18 C17 11 39 11 39 18 L39 40 C39 44 17 44 17 40 Z" fill="url(#steel)" stroke="#3d434e" strokeWidth="1" />
          <rect x="18.5" y="23" width="19" height="3" rx="1.4" fill="#0b0d12" />
          <rect x="27" y="12" width="2" height="30" fill="#e9edf3" opacity="0.85" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx={21 + i * 2.2} cy={32 + i * 2} r="0.9" fill="#2a2f39" />
              <circle cx={35 - i * 2.2} cy={32 + i * 2} r="0.9" fill="#2a2f39" />
            </g>
          ))}
          <path d="M14 48 C16 44 22 43 28 43 C34 43 40 44 42 48 Z" fill="url(#steel)" />
        </g>
      )}
      {id === 'shadow' && (
        <g>
          {/* black hood, masked face, two glowing eyes */}
          <path d="M28 8 C17 9 12 20 13 31 L12 48 L44 48 L43 31 C44 20 39 9 28 8 Z" fill="#14121c" stroke="#b07cff" strokeWidth="1" />
          <path d="M28 17 C22 17 20 23 20.5 29 C21 34 24 37 28 37 C32 37 35 34 35.5 29 C36 23 34 17 28 17 Z" fill="#050408" />
          <ellipse cx="24.5" cy="26.5" rx="2.3" ry="1.1" fill="#d6b2ff" />
          <ellipse cx="31.5" cy="26.5" rx="2.3" ry="1.1" fill="#d6b2ff" />
          <path d="M13 40 C20 37 36 37 43 40" stroke="#b07cff" strokeWidth="0.8" opacity="0.7" fill="none" />
        </g>
      )}
    </svg>
  )
}

/** Four warrior styles; the choice applies to every player's warriors on this device. */
function StylePicker() {
  const renders = useLudoPortraits((st) => st.styles)
  const styleId = useCharacterStyle((st) => st.styleId)
  const setStyle = useCharacterStyle((st) => st.setStyle)
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Warriors</p>
      <div className="grid grid-cols-4 gap-2">
        {STYLE_ORDER.map((id) => {
          const st = CHARACTER_STYLES[id]
          const on = id === styleId
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStyle(id)}
              aria-pressed={on}
              className="group relative flex flex-col items-center rounded-2xl p-1.5 text-center transition-transform active:scale-95"
              style={{
                background: on ? 'linear-gradient(180deg, rgba(0,229,255,0.16), rgba(0,0,0,0.3))' : 'rgba(0,0,0,0.3)',
                boxShadow: on ? '0 0 0 1.5px #00e5ff, 0 0 18px rgba(0,229,255,0.45)' : '0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <span className="block aspect-square w-full overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-[1.04]">
                {renders[id] ? (
                  <span className="relative block h-full w-full bg-[radial-gradient(circle_at_50%_35%,#1e1e2a,#030306)]">
                    <img src={renders[id]} alt="" draggable={false} className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <StyleBadge id={id} />
                )}
              </span>
              <span className="mt-1 line-clamp-1 text-[10.5px] font-black leading-tight text-white">{st.name}</span>
              <span className="line-clamp-1 text-[9px] font-semibold leading-tight text-slate-400">{st.tagline}</span>
              {on && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#00e5ff] text-black shadow-[0_0_8px_#00e5ff]">
                  <Check size={13} strokeWidth={3.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Board shape, a line about it and the team colours for the chosen player count. */
function Preview({ count }: { count: number }) {
  const colors = seatColors(count)
  return (
    <div>
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
    <ThemePicker />
    <StylePicker />
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
