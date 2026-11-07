import { useReactionStore } from '@/social/stores/useReactionStore'

const REACTIONS = ['😂', '🔥', '👏', '😱', '💀', '😈']

export default function ReactionBar({ compact = false }: { compact?: boolean }) {
  const fire = useReactionStore((s) => s.fire)

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'rounded-2xl glass-panel p-1.5'}`}>
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => fire(emoji)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 active:scale-95"
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
