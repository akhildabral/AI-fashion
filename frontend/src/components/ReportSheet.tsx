import { useState } from 'react'
import { Chip, Modal } from './ui'
import { REPORT_REASONS, report, type ReportReason, type ReportTarget } from '@zauq/shared/social'

// "Report" from any card or profile: a reason, an optional line, one send.
// The person reported never learns who sent it.

export function ReportSheet({
  target,
  onClose,
  onNote,
}: {
  /** null = closed */
  target: { type: ReportTarget; id: string; label: string } | null
  onClose: () => void
  onNote: (msg: string) => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!target || !reason || busy) return
    setBusy(true)
    try {
      await report({ targetType: target.type, targetId: target.id, reason, detail: detail.trim() || undefined })
      onNote('Thank you. The house will take a look.')
      setReason(null)
      setDetail('')
      onClose()
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={target ? `Report ${target.label}` : 'Report'}>
      <p className="text-sm text-ink/60">Tell the house what’s wrong. They won’t know it came from you.</p>
      {/* A reason is a value: chips, brass when chosen. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {REPORT_REASONS.map((r) => (
          <Chip key={r.key} on={reason === r.key} onClick={() => setReason(r.key)}>
            {r.label}
          </Chip>
        ))}
      </div>
      <label htmlFor="report-detail" className="label mt-4">
        Anything else that helps, optional
      </label>
      <textarea id="report-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} rows={3} className="field !h-auto py-2.5" />
      <div className="action-row mt-5">
        <button type="button" disabled={!reason || busy} onClick={() => void send()} className="btn-primary">
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" onClick={onClose} className="btn-quiet">
          Cancel
        </button>
      </div>
    </Modal>
  )
}
