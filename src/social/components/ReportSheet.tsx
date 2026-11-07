import { useState } from 'react'
import { create } from 'zustand'
import { Ban, Flag } from 'lucide-react'
import { useFriendsStore } from '@/social/stores/useFriendsStore'
import { useChatStore } from '@/social/stores/useChatStore'
import { usePartyStore } from '@/social/stores/usePartyStore'
import { formatFriendCode } from '@/net/identity'
import { Sheet } from './ui'

const REASONS = ['Bullying or harassment', 'Hate speech', 'Sexual or inappropriate content', 'Spam or scams', 'Something else']

const env = import.meta.env as Record<string, string | undefined>
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL ?? ''

/** Block a player: they're removed as a friend, and their requests, messages, invites and party lines are ignored. */
export function blockPlayer(id: string, name: string) {
  useFriendsStore.getState().block(id, name)
  const party = usePartyStore.getState()
  if (party.active && party.leaderId === id) party.leaveParty()
  else if (party.active && party.members.some((m) => m.id === id) && party.leaderId !== id) party.removeMember(id)
}

function sendReport(id: string, name: string, reason: string, details: string) {
  if (!SUPPORT_EMAIL) return false
  const chat = useChatStore.getState()
  const lines = [...(chat.messages[`dm-${id}`] ?? []), ...(chat.messages.party ?? [])]
    .filter((m) => m.senderId === id)
    .slice(-15)
    .map((m) => `[${new Date(m.timestamp).toISOString()}] ${m.text}`)
  const body = [`Player: ${name} (code ${formatFriendCode(id)})`, `Reason: ${reason}`, details && `Details: ${details}`, '', 'Their recent messages:', ...lines]
    .filter(Boolean)
    .join('\n')
  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Report: ${name}`)}&body=${encodeURIComponent(body)}`
  return true
}

/** Which player the Block / Report sheet is open for. One sheet lives in the app shell, so blocking a friend
 * (which removes their row) doesn't close it before the confirmation shows. */
const useReportTarget = create<{ target: { id: string; name: string } | null }>(() => ({ target: null }))

export function openReport(id: string, name: string) {
  useReportTarget.setState({ target: { id, name } })
}

export function ReportSheetHost() {
  const target = useReportTarget((s) => s.target)
  if (!target) return null
  return <ReportSheet key={target.id} open onClose={() => useReportTarget.setState({ target: null })} id={target.id} name={target.name} />
}

function ReportSheet({ open, onClose, id, name }: { open: boolean; onClose: () => void; id: string; name: string }) {
  const [mode, setMode] = useState<'menu' | 'report' | 'done'>('menu')
  const [reason, setReason] = useState(REASONS[0])
  const [details, setDetails] = useState('')
  const [emailed, setEmailed] = useState(false)
  const close = () => {
    setMode('menu')
    setDetails('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={mode === 'report' ? `Report ${name}` : name}>
      {mode === 'menu' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMode('report')}
            className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] p-3.5 text-left text-sm font-bold text-white"
          >
            <Flag size={18} className="text-amber-300" />
            <span>
              Report {name}
              <span className="block text-xs font-medium text-slate-400">Tell us what happened. They'll also be blocked.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              blockPlayer(id, name)
              setMode('done')
            }}
            className="flex w-full items-center gap-3 rounded-2xl bg-rose-500/10 p-3.5 text-left text-sm font-bold text-rose-300"
          >
            <Ban size={18} />
            <span>
              Block {name}
              <span className="block text-xs font-medium text-rose-200/70">They can't message you, invite you or add you again.</span>
            </span>
          </button>
        </div>
      )}

      {mode === 'report' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            blockPlayer(id, name)
            setEmailed(sendReport(id, name, reason, details.trim()))
            setMode('done')
          }}
        >
          <fieldset className="space-y-1.5">
            <legend className="mb-2 text-sm font-semibold text-slate-300">What's wrong?</legend>
            {REASONS.map((r) => (
              <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 text-sm font-bold ring-1 ${reason === r ? 'bg-brand/15 text-white ring-brand/50' : 'bg-white/[0.03] text-slate-300 ring-white/[0.06]'}`}>
                <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[#7c5cff]" />
                {r}
              </label>
            ))}
          </fieldset>
          <label htmlFor="report-details" className="mt-3 block text-xs font-bold text-slate-400">
            More details (optional)
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-2xl bg-white/[0.06] p-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-brand/60"
          />
          <button type="submit" className="mt-3 w-full rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white active:scale-[0.98]">
            Report and block
          </button>
        </form>
      )}

      {mode === 'done' && (
        <div className="text-center">
          <p className="text-4xl">🛡️</p>
          <p className="mt-2 text-base font-extrabold text-white">{name} is blocked</p>
          <p className="mt-1 text-sm text-slate-400">
            {emailed ? 'Your email app opened with the report filled in — press Send to deliver it.' : 'They can no longer contact you.'} You can unblock them in Settings.
          </p>
          <button type="button" onClick={close} className="mt-4 w-full rounded-2xl bg-white/[0.08] py-3 text-sm font-bold text-white">
            Done
          </button>
        </div>
      )}
    </Sheet>
  )
}
