const COLORS = ['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#a78bfa', '#22d3ee']

export default function Confetti({ count = 60 }: { count?: number }) {
  const pieces = Array.from({ length: count }, (_, i) => {
    const left = Math.random() * 100
    const delay = Math.random() * 0.6
    const duration = 1.8 + Math.random() * 1.4
    const color = COLORS[i % COLORS.length]
    const size = 6 + Math.random() * 6
    const rotate = Math.random() * 360
    return { id: i, left, delay, duration, color, size, rotate }
  })

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  )
}
