import { useEffect, useId, useState } from 'react'
import { COLOR_DEEP, COLOR_GLOW, COLOR_HEX, type LudoColor } from './ludoBoardLayout'
import { useLudoPortraits } from './ludoPortraits'

const SKIN = ['#f3cfb1', '#e2ad86', '#c68b62', '#98613f']
const SKIN_SHADE = ['#dcae8d', '#c78f69', '#a8704b', '#7a4c31']
const HAIR = ['#1a1210', '#3a2216', '#5b3520', '#0d0d12', '#7a4a2a']
const BACKDROP = ['#2a1b4a', '#14284a', '#3a1630', '#12303a']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Illustrated player portrait: a stylized bust in a team-colored hoodie, with hair style, skin tone
 * and accessories derived deterministically from the player's name.
 */
/** name -> photo URL, or null once we know there is no photo for that name. */
const photoCache = new Map<string, string | null>()

/**
 * Optional hand-made portrait: `public/assets/players/<name>.png` (e.g. rohan.png, diya.png). When the
 * file exists it replaces the rendered 3D portrait everywhere that player appears.
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

export default function LudoAvatar({ name, color, className = '' }: { name: string; color: LudoColor; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const rendered = useLudoPortraits((s) => s.portraits[color])
  // each team's hero portrait (public/assets/players/team-<color>.png) wins over a per-name photo
  const teamPhoto = usePlayerPhoto(`team-${color.toLowerCase()}`)
  const namePhoto = usePlayerPhoto(name)
  const photo = teamPhoto ?? namePhoto
  const portrait = photo ?? rendered
  const h = hash(name)

  if (portrait) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <defs>
          <radialGradient id={`pbg${uid}`} cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor={COLOR_GLOW[color]} stopOpacity="0.55" />
            <stop offset="55%" stopColor={COLOR_DEEP[color]} stopOpacity="0.9" />
            <stop offset="100%" stopColor="#07060f" />
          </radialGradient>
          <linearGradient id={`pgl${uid}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`pclip${uid}`}>
            <circle cx="32" cy="32" r="32" />
          </clipPath>
        </defs>
        <g clipPath={`url(#pclip${uid})`}>
          <rect width="64" height="64" fill={`url(#pbg${uid})`} />
          {photo ? (
            <image href={photo} x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid slice" />
          ) : (
            <image href={portrait} x="-4" y="-2" width="72" height="72" preserveAspectRatio="xMidYMid slice" />
          )}
          <ellipse cx="22" cy="12" rx="26" ry="14" fill={`url(#pgl${uid})`} />
        </g>
      </svg>
    )
  }

  const skin = h % SKIN.length
  const hair = HAIR[(h >> 3) % HAIR.length]
  const style = (h >> 6) % 4
  const shades = (h >> 9) % 3 === 0
  const headphones = !shades && (h >> 11) % 3 === 0
  const bg = BACKDROP[(h >> 13) % BACKDROP.length]
  const main = COLOR_HEX[color]
  const deep = COLOR_DEEP[color]
  const glow = COLOR_GLOW[color]

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="30%" r="75%">
          <stop offset="0%" stopColor={bg} />
          <stop offset="100%" stopColor="#07060f" />
        </radialGradient>
        <linearGradient id={`hood${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={glow} />
          <stop offset="45%" stopColor={main} />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
        <linearGradient id={`face${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={SKIN[skin]} />
          <stop offset="100%" stopColor={SKIN_SHADE[skin]} />
        </linearGradient>
        <clipPath id={`clip${uid}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip${uid})`}>
        <rect width="64" height="64" fill={`url(#bg${uid})`} />
        <circle cx="50" cy="12" r="10" fill={glow} opacity="0.18" />

        {style === 1 && <path d="M18 30 C16 46 20 56 24 60 L40 60 C44 56 48 46 46 30 Z" fill={hair} />}

        {/* hoodie + neck */}
        <path d="M6 66 C7 50 17 43 32 43 C47 43 57 50 58 66 Z" fill={`url(#hood${uid})`} />
        <path d="M22 45 C25 52 39 52 42 45 C38 43 26 43 22 45 Z" fill={deep} opacity="0.7" />
        <path d="M27.5 36 L36.5 36 L36 45 C34 47 30 47 28 45 Z" fill={SKIN_SHADE[skin]} />
        <path d="M29 50 L29.5 58 M35 50 L34.5 58" stroke="#ffffff" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" />

        {/* head */}
        <ellipse cx="32" cy="27" rx="10.5" ry="12.2" fill={`url(#face${uid})`} />
        <ellipse cx="21.8" cy="28.5" rx="1.8" ry="2.6" fill={SKIN_SHADE[skin]} />
        <ellipse cx="42.2" cy="28.5" rx="1.8" ry="2.6" fill={SKIN_SHADE[skin]} />

        {/* hair */}
        {style === 0 && <path d="M21 25 C20 14 27 11 33 11 C40 11 44.5 16 43 25 C41 20 37 18.5 32 19 C27 18.5 23 21 21 25 Z" fill={hair} />}
        {style === 1 && <path d="M20.5 30 C19 15 26 10.5 32.5 10.5 C40 10.5 45 16 43.5 30 C42 22 39 18 32 18.5 C26 18 22 22 20.5 30 Z" fill={hair} />}
        {style === 2 && <path d="M21 24 L22 15 L26 17 L28 10 L32 15 L36 9.5 L38 16 L42 13 L43 24 C40 19.5 36 18.5 32 19 C27.5 18.5 23.5 20 21 24 Z" fill={hair} />}
        {style === 3 && (
          <>
            <circle cx="32" cy="9.5" r="5" fill={hair} />
            <path d="M21 25 C20.5 15 26.5 12.5 32 12.5 C38 12.5 44 15 43 25 C40.5 19.5 36 18 32 18.5 C27.5 18 23.5 20 21 25 Z" fill={hair} />
          </>
        )}

        {/* face */}
        {shades ? (
          <g>
            <rect x="23.2" y="24.6" width="7.6" height="4.6" rx="2" fill="#0b0c12" />
            <rect x="33.2" y="24.6" width="7.6" height="4.6" rx="2" fill="#0b0c12" />
            <path d="M30.8 26 L33.2 26" stroke="#0b0c12" strokeWidth="1.2" />
            <path d="M24.5 25.6 L27.5 25.6" stroke={glow} strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />
            <path d="M34.5 25.6 L37.5 25.6" stroke={glow} strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />
          </g>
        ) : (
          <g fill="#1b1414">
            <ellipse cx="27.6" cy="27" rx="1.35" ry="1.6" />
            <ellipse cx="36.4" cy="27" rx="1.35" ry="1.6" />
            <path d="M25.3 23.6 Q27.6 22.4 29.8 23.4 M34.2 23.4 Q36.4 22.4 38.7 23.6" stroke={hair} strokeWidth="1.1" fill="none" strokeLinecap="round" />
          </g>
        )}
        <path d="M28.6 33.2 Q32 35.6 35.4 33.2" stroke="#7a3b2e" strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {headphones && (
          <g>
            <path d="M20 27 C20 13 44 13 44 27" stroke="#15161f" strokeWidth="2.4" fill="none" />
            <rect x="17.6" y="24.5" width="5" height="8" rx="2.4" fill="#15161f" />
            <rect x="41.4" y="24.5" width="5" height="8" rx="2.4" fill="#15161f" />
            <rect x="18.6" y="26" width="1.3" height="5" rx="0.6" fill={glow} />
            <rect x="44.1" y="26" width="1.3" height="5" rx="0.6" fill={glow} />
          </g>
        )}

        {/* rim light from the team color */}
        <path d="M6 66 C7 50 17 43 32 43" stroke={glow} strokeWidth="1.2" fill="none" opacity="0.6" />
      </g>
    </svg>
  )
}
