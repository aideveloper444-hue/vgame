const BOKEH = [
  { left: '4%', top: '8%', size: 180, color: '#f59e0b', opacity: 0.18 },
  { left: '16%', top: '30%', size: 90, color: '#fbbf24', opacity: 0.22 },
  { left: '78%', top: '6%', size: 160, color: '#38bdf8', opacity: 0.16 },
  { left: '90%', top: '34%', size: 110, color: '#a855f7', opacity: 0.2 },
  { left: '60%', top: '2%', size: 70, color: '#fde68a', opacity: 0.25 },
  { left: '32%', top: '4%', size: 60, color: '#fca5a5', opacity: 0.2 },
  { left: '2%', top: '62%', size: 140, color: '#f97316', opacity: 0.12 },
  { left: '88%', top: '70%', size: 150, color: '#6366f1', opacity: 0.16 },
]

/** Night-time penthouse lounge behind the board: deep navy, warm lamp bokeh and faint city windows. */
export default function CityBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 42%, #1a2552 0%, #0e1533 45%, #070a1c 75%, #03040c 100%)',
        }}
      />
      {/* distant skyline windows glowing through a panoramic window at the top */}
      <div
        className="absolute inset-x-0 top-0 h-[34%] opacity-60"
        style={{
          background:
            'repeating-linear-gradient(90deg, transparent 0 22px, rgba(125,160,255,0.08) 22px 24px), linear-gradient(to bottom, rgba(40,52,110,0.55), transparent)',
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[30%] opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,214,140,0.9) 1px, transparent 1.6px), radial-gradient(circle, rgba(160,200,255,0.8) 1px, transparent 1.6px)',
          backgroundSize: '37px 23px, 53px 31px',
          backgroundPosition: '0 0, 11px 7px',
          maskImage: 'linear-gradient(to bottom, black 20%, transparent)',
        }}
      />
      {BOKEH.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{ left: b.left, top: b.top, width: b.size, height: b.size, background: b.color, opacity: b.opacity }}
        />
      ))}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 75% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)' }} />
    </div>
  )
}
