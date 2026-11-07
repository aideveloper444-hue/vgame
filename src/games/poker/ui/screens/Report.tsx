import { useState } from 'react'
import { Sheet, toast } from '../kit'
import { api } from '../../net/api'
import { usePokerTable } from '../../state/tableStore'

export const REPORT_REASONS = ['Harassment', 'Hate', 'Spam', 'Impersonation', 'Suspected collusion', 'Cheating', 'Inappropriate profile', 'Other'] as const

/** Report flow (reasons from the moderation policy). The server attaches recent table chat and the hand as evidence. */
export function ReportSheet({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!target) return null
  const submit = async () => {
    if (!reason) return
    setBusy(true)
    try {
      await api('/reports', { body: { targetId: target.id, targetName: target.name, reason, note: note.slice(0, 500), tableId: usePokerTable.getState().tableId ?? '' } })
      toast('Report sent. Our moderators will review it.', 'good')
      setReason(null)
      setNote('')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open onClose={onClose} title={`Report ${target.name}`}>
      <div className="grid grid-cols-2 gap-2">
        {REPORT_REASONS.map((r) => (
          <button key={r} className={`btn h-11 text-[0.95em] ${reason === r ? 'btn-gold' : 'btn-dark'}`} onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <label className="rpc-field mt-3">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else? (optional)" maxLength={500} aria-label="Details" />
      </label>
      <button disabled={!reason || busy} className="btn btn-red mt-3 h-12 w-full text-[1.15em]" onClick={() => void submit()}>
        Send report
      </button>
    </Sheet>
  )
}
