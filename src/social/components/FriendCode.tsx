import { useState } from 'react'
import { Check, Copy, Share2, UserPlus } from 'lucide-react'
import { formatFriendCode, myNetId } from '@/net/identity'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { usePlayerStore } from '@/social/stores/usePlayerStore'
import { BTN_PRIMARY } from './ui'

export function shareText() {
  const code = formatFriendCode(myNetId())
  const name = usePlayerStore.getState().profile.name
  return { code, text: `Add me on VIBO! My friend code is ${code} — ${name}` }
}

/** This device's friend code with copy and share buttons. */
export function MyFriendCode({ compact }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const { code, text } = shareText()

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'VIBO', text })
        return
      } catch {
        /* dismissed */
      }
    }
    void navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`rounded-3xl border border-brand/30 bg-gradient-to-br from-brand/20 via-surface-2/80 to-brand-2/10 ${compact ? 'p-3.5' : 'p-4'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-2">Your friend code</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className={`font-mono font-black tracking-[0.12em] text-white ${compact ? 'text-2xl' : 'text-[1.9rem]'}`} data-testid="my-code">
          {code}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            aria-label="Copy code"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white active:scale-90"
          >
            {copied ? <Check size={18} className="text-emerald-300" /> : <Copy size={18} />}
          </button>
          <button type="button" onClick={() => void share()} aria-label="Share code" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white active:scale-90">
            <Share2 size={18} />
          </button>
        </div>
      </div>
      {!compact && <p className="mt-1 text-xs font-medium text-slate-400">Send this to friends so they can add you.</p>}
    </div>
  )
}

/** Input to add a friend by their code. */
export function AddFriendForm() {
  const addByCode = useFriendsStore((s) => s.addByCode)
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const r = addByCode(code)
        setResult(r)
        if (r.ok) setCode('')
      }}
    >
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setResult(null)
          }}
          placeholder="Friend code, e.g. AB12-CD34"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          aria-label="Friend code"
          className="min-w-0 flex-1 rounded-2xl bg-white/[0.06] px-4 py-3 font-mono text-[15px] font-bold tracking-wider text-white ring-1 ring-white/10 placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand/60"
        />
        <button type="submit" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 8} className={`${BTN_PRIMARY} shrink-0 px-4`}>
          <UserPlus size={17} /> Add
        </button>
      </div>
      {result && <p className={`mt-2 text-xs font-semibold ${result.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{result.message}</p>}
    </form>
  )
}
