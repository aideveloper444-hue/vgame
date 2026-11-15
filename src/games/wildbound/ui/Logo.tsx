import '@fontsource/cinzel/600.css'

/**
 * The AMAZON RUN wordmark, set in type: an engraved serif in brushed champagne gold over a hairline rule, and
 * INTO THE WILD in tracked capitals beneath. Upright and quiet, so it reads as a title card, not a sticker.
 */
export default function Logo({ size = 1, className = '' }: { size?: number; className?: string }) {
  const s = (px: number) => `${px * size}px`
  return (
    <div className={`relative inline-flex select-none flex-col items-center leading-none ${className}`} aria-label="Amazon Run – Into the Wild" role="img">
      <span
        style={{
          fontFamily: "'Cinzel', 'Times New Roman', serif",
          fontWeight: 600,
          // (never wider than the screen: on a narrow phone the title scales down instead of wrapping)
          fontSize: `min(${s(52)}, 8.6vw)`,
          whiteSpace: 'nowrap',
          letterSpacing: '0.14em',
          paddingLeft: '0.14em',
          background: 'linear-gradient(180deg, #f8edd2 0%, #e2c896 45%, #b08d55 78%, #d9bf8c 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.55)) drop-shadow(0 10px 24px rgba(0,0,0,0.45))',
        }}
      >
        AMAZON RUN
      </span>
      <span className="flex items-center" style={{ gap: s(10), marginTop: s(8) }}>
        <i style={{ display: 'block', width: s(34), height: 1, background: 'linear-gradient(90deg, transparent, rgba(226,200,150,0.8))' }} />
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 600,
            fontSize: s(15),
            letterSpacing: '0.46em',
            paddingLeft: '0.46em',
            color: 'rgba(245,240,230,0.82)',
            textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          }}
        >
          INTO THE WILD
        </span>
        <i style={{ display: 'block', width: s(34), height: 1, background: 'linear-gradient(270deg, transparent, rgba(226,200,150,0.8))' }} />
      </span>
    </div>
  )
}
