import { useEffect, useId, useState } from 'react'
import { COLOR_DEEP, COLOR_GLOW, type LudoColor } from './ludoBoardLayout'
import { useLudoPortraits } from './ludoPortraits'

/** name -> photo URL, or null once we know there is no photo for that name. */
const photoCache = new Map<string, string | null>()

/**
 * Optional hand-made portrait: `public/assets/players/<name>.png`. Used only until the 3D portrait of
 * the player's warrior has rendered, which always wins so every card matches the figure on the board.
 */
function usePlayerPhoto(name: string): string | null {
  const key = name.trim().toLowerCase()
  const [photo, setPhoto] = useState<string | null>(() => photoCache.get(key) ?? null)
  useEffect(() => {
    if (!key || photoCache.has(key)) {
      setPhoto(photoCache.get(key) ?? null)
      return
    }
    const url = `/assets/players/${encodeURIComponent(key)}.png`
    const img = new Image()
    img.onload = () => {
      photoCache.set(key, url)
      setPhoto(url)
    }
    img.onerror = () => photoCache.set(key, null)
    img.src = url
  }, [key])
  return photo
}

/** Two-letter monogram for a player name ("Geethika Chowdary" -> "GC", "anishhh" -> "AN"). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] ?? '?').slice(0, 2).toUpperCase()
}

/**
 * Player portrait: the rendered 3D bust of the team's warrior in a dark lens with a team-coloured
 * neon rim; before that renders, a clean monogram on black glass.
 */
export default function LudoAvatar({ name, color, className = '' }: { name: string; color: LudoColor; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const rendered = useLudoPortraits((s) => s.portraits[color])
  const photo = usePlayerPhoto(name)
  const portrait = rendered ?? photo
  const glow = COLOR_GLOW[color]

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id={`pbg${uid}`} cx="50%" cy="30%" r="75%">
          <stop offset="0%" stopColor={COLOR_DEEP[color]} stopOpacity="0.85" />
          <stop offset="60%" stopColor="#0a0a12" />
          <stop offset="100%" stopColor="#020204" />
        </radialGradient>
        <linearGradient id={`pgl${uid}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`pclip${uid}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#pclip${uid})`}>
        <rect width="64" height="64" fill={`url(#pbg${uid})`} />
        {portrait ? (
          rendered ? (
            <image href={rendered} x="-4" y="-2" width="72" height="72" preserveAspectRatio="xMidYMid slice" />
          ) : (
            <image href={portrait} x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid slice" />
          )
        ) : (
          <text
            x="32"
            y="33"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'Barlow Condensed', 'Roboto Condensed', system-ui, sans-serif"
            fontWeight="700"
            fontSize="24"
            letterSpacing="1"
            fill="#ffffff"
            style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
          >
            {initials(name)}
          </text>
        )}
        <ellipse cx="22" cy="10" rx="26" ry="12" fill={`url(#pgl${uid})`} />
      </g>
      <circle cx="32" cy="32" r="31" fill="none" stroke={glow} strokeOpacity="0.7" strokeWidth="1.2" />
    </svg>
  )
}
