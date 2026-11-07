import type { ReactNode, SVGProps } from 'react'

/*
 * Filled gold icons in the reference's chunky style. The gradients are defined once by <GoldDefs/>; every
 * icon fills with url(#rpcGold) in its own 24×24 user space, so thin shapes keep the gradient too.
 */

export function GoldDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="rpcGold" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6c4" />
          <stop offset="0.35" stopColor="#ffd25a" />
          <stop offset="0.7" stopColor="#d99318" />
          <stop offset="1" stopColor="#fbd56a" />
        </linearGradient>
        <linearGradient id="rpcGoldDark" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe9a6" />
          <stop offset="1" stopColor="#a8670c" />
        </linearGradient>
        <linearGradient id="rpcSkin" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe6c4" />
          <stop offset="1" stopColor="#d9a36a" />
        </linearGradient>
      </defs>
    </svg>
  )
}

type P = SVGProps<SVGSVGElement> & { size?: number; fill?: string }

function Icon({ size = 24, fill = 'url(#rpcGold)', children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden {...rest}>
      {children}
    </svg>
  )
}

export const HomeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 2.6 1.6 11.4c-.6.5-.2 1.5.6 1.5H4v8.2c0 .6.4 1 1 1h4.6v-6.2h4.8v6.2H19c.6 0 1-.4 1-1v-8.2h1.8c.8 0 1.2-1 .6-1.5L12 2.6Z" />
  </Icon>
)

/** "Poker" tab: trophy cup with a spade. */
export const PokerIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 3h12v2h3.2c.5 0 .8.4.8.8 0 3.3-1.9 5.6-4.9 6.2A6.4 6.4 0 0 1 13.4 15v2.2h2.4c.6 0 1.2.5 1.2 1.2V21H7v-2.6c0-.7.5-1.2 1.2-1.2h2.4V15a6.4 6.4 0 0 1-3.7-3C3.9 11.4 2 9.1 2 5.8c0-.4.3-.8.8-.8H6V3Zm0 4H4.1c.2 1.7 1 2.9 2.4 3.4A9 9 0 0 1 6 7Zm12 0a9 9 0 0 1-.5 3.4c1.4-.5 2.2-1.7 2.4-3.4H18Z" />
    <path fill="#2a1500" d="M12 5.2c-.9 1.3-3 2.4-3 4 0 1 .8 1.7 1.7 1.7.4 0 .8-.2 1-.4-.1.7-.4 1.2-1 1.5h2.6c-.6-.3-.9-.8-1-1.5.2.2.6.4 1 .4.9 0 1.7-.7 1.7-1.7 0-1.6-2.1-2.7-3-4Z" />
  </Icon>
)

/** "Shop" tab: a pouch tied with a cord. */
export const ShopIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8.3 2.5c1.2.8 2.4.9 3.7.3 1.3.6 2.5.5 3.7-.3l-1.5 3.6h-4.4L8.3 2.5Z" />
    <path d="M9.4 7.2h5.2c3.6 2.2 6.4 5.8 6.4 9.4 0 3-2.4 4.9-5.6 4.9H8.6C5.4 21.5 3 19.6 3 16.6c0-3.6 2.8-7.2 6.4-9.4Z" />
    <path fill="#2a1500" d="M12 10.3c-.8 1.1-2.6 2-2.6 3.4 0 .9.7 1.5 1.5 1.5.3 0 .7-.1.9-.3-.1.6-.4 1-.9 1.3h2.2c-.5-.3-.8-.7-.9-1.3.2.2.6.3.9.3.8 0 1.5-.6 1.5-1.5 0-1.4-1.8-2.3-2.6-3.4Z" />
  </Icon>
)

export const GiftIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 8.5c0-.6.4-1 1-1h16c.6 0 1 .4 1 1V11c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V8.5Zm1.6 4.7h6.4V22H6.1c-.8 0-1.5-.7-1.5-1.5v-7.3Zm8.4 0h6.4v7.3c0 .8-.7 1.5-1.5 1.5H13v-8.8Z" />
    <path d="M11.2 7.3C9.5 7.1 6.2 6.3 6.2 4.4c0-1.2.9-2 2-2 1.7 0 2.7 2.2 3 4.9Zm1.6 0c.3-2.7 1.3-4.9 3-4.9 1.1 0 2 .8 2 2 0 1.9-3.3 2.7-5 2.9Z" />
  </Icon>
)

export const ProfileIcon = (p: P) => (
  <Icon {...p} fill={p.fill ?? 'url(#rpcSkin)'}>
    <circle cx="12" cy="7.3" r="4.6" />
    <path d="M3.4 21.2c0-4.4 3.8-7.6 8.6-7.6s8.6 3.2 8.6 7.6c0 .5-.4.8-.8.8H4.2c-.4 0-.8-.3-.8-.8Z" fill="url(#rpcGold)" />
  </Icon>
)

export const BellIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 2.2c.8 0 1.4.6 1.4 1.4v.6c3 .7 4.9 3.3 4.9 6.5v3.5l1.9 2.6c.4.6 0 1.5-.8 1.5H4.6c-.8 0-1.2-.9-.8-1.5l1.9-2.6v-3.5c0-3.2 1.9-5.8 4.9-6.5v-.6c0-.8.6-1.4 1.4-1.4Zm-2.6 17h5.2a2.6 2.6 0 0 1-5.2 0Z" />
  </Icon>
)

export const GearIcon = (p: P) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      d="M10.3 1.8h3.4l.5 2.7c.7.2 1.3.6 1.9 1l2.6-.9 1.7 3-2.1 1.8c.1.4.1.8.1 1.1s0 .8-.1 1.1l2.1 1.8-1.7 3-2.6-.9c-.6.4-1.2.8-1.9 1l-.5 2.7h-3.4l-.5-2.7c-.7-.2-1.3-.6-1.9-1l-2.6.9-1.7-3 2.1-1.8c-.1-.4-.1-.8-.1-1.1s0-.8.1-1.1L3.6 7.6l1.7-3 2.6.9c.6-.4 1.2-.8 1.9-1l.5-2.7ZM12 7.9a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"
      transform="translate(0 .5)"
    />
  </Icon>
)

export const CrownIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2.5 7.5 7.2 11 12 4l4.8 7 4.7-3.5-1.8 10.5H4.3L2.5 7.5Zm2 12h15v2.3h-15V19.5Z" />
    <circle cx="2.5" cy="7" r="1.5" />
    <circle cx="21.5" cy="7" r="1.5" />
    <circle cx="12" cy="3.4" r="1.6" />
  </Icon>
)

export const TrophyIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 2.5h12v2h3.2c.5 0 .8.4.8.8 0 3.3-1.9 5.6-4.9 6.2A6.4 6.4 0 0 1 13.4 15v2.2h2.4c.6 0 1.2.5 1.2 1.2v2.6H7v-2.6c0-.7.5-1.2 1.2-1.2h2.4V15a6.4 6.4 0 0 1-3.7-3.5C3.9 10.9 2 8.6 2 5.3c0-.4.3-.8.8-.8H6v-2Zm0 4H4.1c.2 1.7 1 2.9 2.4 3.4A9 9 0 0 1 6 6.5Zm12 0a9 9 0 0 1-.5 3.4c1.4-.5 2.2-1.7 2.4-3.4H18Z" />
  </Icon>
)

export const StarIcon = (p: P) => (
  <Icon {...p}>
    <path d="m12 1.8 3 6.5 7.1.8-5.3 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L1.9 9.1 9 8.3l3-6.5Z" />
  </Icon>
)

export const CoinIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="url(#rpcGoldDark)" />
    <circle cx="12" cy="12" r="8.6" fill="url(#rpcGold)" stroke="#a8670c" strokeWidth="1" />
    <path fill="#b06d06" d="M12 6.4c-1 1.5-3.3 2.6-3.3 4.4 0 1.1.9 1.9 1.9 1.9.4 0 .9-.2 1.1-.4-.1.8-.5 1.4-1.1 1.7h2.8c-.6-.3-1-.9-1.1-1.7.2.2.7.4 1.1.4 1 0 1.9-.8 1.9-1.9 0-1.8-2.3-2.9-3.3-4.4Z" />
  </svg>
)

/* ---------------- suits ---------------- */

export type SuitKey = 's' | 'h' | 'd' | 'c'

export function SuitGlyph({ suit, size, color = 'currentColor' }: { suit: SuitKey; size: number | string; color?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill={color} aria-hidden style={{ display: 'block', width: size, height: size }}>
      {suit === 's' && <path d="M50 4C36 24 6 39 6 62c0 15 14 24 27 18 5-2 9-6 12-10-1 12-5 19-13 25h36c-8-6-12-13-13-25 3 4 7 8 12 10 13 6 27-3 27-18C94 39 64 24 50 4Z" />}
      {suit === 'h' && <path d="M50 93C30 76 5 59 5 33 5 17 17 6 31 6c9 0 15 5 19 12 4-7 10-12 19-12 14 0 26 11 26 27 0 26-25 43-45 60Z" />}
      {suit === 'd' && <path d="M50 3 88 50 50 97 12 50Z" />}
      {suit === 'c' && (
        <>
          <circle cx="50" cy="27" r="20" />
          <circle cx="26" cy="58" r="20" />
          <circle cx="74" cy="58" r="20" />
          <path d="M44 50h12c0 20 3 32 13 45H31c10-13 13-25 13-45Z" />
        </>
      )}
    </svg>
  )
}

export const SpadeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 1.5C8.6 6.3 1.5 9.9 1.5 15.4c0 3.6 3.4 5.8 6.5 4.3 1.2-.5 2.2-1.4 2.9-2.4-.2 2.9-1.2 4.6-3.1 6h8.4c-1.9-1.4-2.9-3.1-3.1-6 .7 1 1.7 1.9 2.9 2.4 3.1 1.5 6.5-.7 6.5-4.3 0-5.5-7.1-9.1-10.5-13.9Z" />
  </Icon>
)
