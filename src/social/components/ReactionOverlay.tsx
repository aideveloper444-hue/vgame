import { useReactionStore } from '@/social/stores/useReactionStore'

export default function ReactionOverlay() {
  const reactions = useReactionStore((s) => s.reactions)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 h-40 md:bottom-6">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="reaction-float absolute bottom-0 text-3xl drop-shadow-lg"
          style={{ left: `${r.x}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  )
}
