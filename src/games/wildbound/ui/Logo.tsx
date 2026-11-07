import { ART } from './art'

/**
 * The WILDBOUND / DEEP FOREST RUN wordmark, set in type (gold over a dark outline, slanted like the
 * reference) so it stays crisp at any size and sits on the scene without a box.
 */
export default function Logo({ size = 1, className = '' }: { size?: number; className?: string }) {
  const s = (px: number) => `${px * size}px`
  return (
    <div className={`relative inline-flex select-none flex-col items-center leading-none ${className}`} style={{ transform: 'rotate(-6deg) skewX(-6deg)' }} aria-label="Wildbound – Deep Forest Run" role="img">
      <img src={ART.paw} alt="" className="absolute" style={{ width: s(46), height: s(46), left: s(-14), top: s(-20), transform: 'rotate(-12deg)', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.6))' }} />
      <span
        className="wb-title"
        style={{
          fontSize: s(64),
          letterSpacing: '0.01em',
          background: 'linear-gradient(180deg, #fff7b0 0%, #ffd52e 38%, #f59a0a 70%, #c45f00 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: `${s(2.2)} #3a1a00`,
          filter: 'drop-shadow(0 4px 0 #2a1200) drop-shadow(0 6px 10px rgba(0,0,0,0.55))',
          paddingInline: s(6),
        }}
      >
        WILDBOUND
      </span>
      <span
        className="wb-title"
        style={{
          marginTop: s(-6),
          fontSize: s(30),
          letterSpacing: '0.03em',
          background: 'linear-gradient(180deg, #ffffff 0%, #e6f6ff 50%, #8fd3ff 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: `${s(1.4)} #0d2238`,
          filter: 'drop-shadow(0 3px 0 #0a1a2a) drop-shadow(0 4px 8px rgba(0,0,0,0.6))',
          paddingInline: s(4),
        }}
      >
        DEEP FOREST RUN
      </span>
    </div>
  )
}
