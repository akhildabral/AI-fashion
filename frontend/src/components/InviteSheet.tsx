import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Alert, Modal, SkeletonBlock } from './ui'
import { copyText } from '../lib/clipboard'
import { getMyInvite, type MyInvite } from '@zauq/shared/invites'

// The door. Your standing invite link, a code to scan, who came in on it,
// and the link that lets people already inside follow you in a tap.

function QR({ text }: { text: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    void QRCode.toCanvas(ref.current, text, {
      width: 132,
      margin: 1,
      // Fixed colours, whatever the theme: a code has to scan on either ground.
      color: { dark: '#0E0D0B', light: '#ECE5D8' },
    }).catch(() => undefined)
  }, [text])
  return <canvas ref={ref} width={132} height={132} className="block h-[132px] w-[132px]" aria-label="Invite code to scan" />
}

function LinkRow({ url, label, onCopied }: { url: string; label: string; onCopied: (msg: string) => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    const ok = await copyText(url)
    setCopied(ok)
    onCopied(ok ? 'Copied.' : 'Couldn’t copy. Select the link instead.')
    window.setTimeout(() => setCopied(false), 1800)
  }
  // A 36 field beside a 36 button: one height, so the row aligns.
  return (
    <div className="mt-2 flex gap-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={label} className="field field-sm min-w-0 flex-1" />
      <button type="button" onClick={() => void copy()} className="btn-primary btn-sm shrink-0">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const EYEBROW = 'eyebrow'

export function InviteSheet({ open, onClose, onNote }: { open: boolean; onClose: () => void; onNote: (msg: string) => void }) {
  const [invite, setInvite] = useState<MyInvite | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    getMyInvite()
      .then(setInvite)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your invite.'))
  }, [open])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  async function share() {
    if (!invite) return
    try {
      await navigator.share({ title: 'Come dress with me', text: 'My invite to the stylist I use. It skips the waitlist.', url: invite.url })
    } catch {
      /* dismissed */
    }
  }

  const used = invite?.used ?? []
  // null = unlimited (admins); the copy below only renders once `invite` is loaded.
  const left: number | null = invite ? invite.left : null
  const usedLine =
    used.length === 0
      ? 'No one has come in on it yet.'
      : `Used by ${used
          .slice(0, 4)
          .map((u) => u.name)
          .join(', ')}${used.length > 4 ? ` and ${used.length - 4} more` : ''}.`

  return (
    <Modal open={open} onClose={onClose} title="Bring someone in">
      {!invite && !error && (
        <div aria-busy="true" aria-label="Loading your invite">
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="mt-2 h-4 w-1/2 !bg-ink/[0.07]" />
          <SkeletonBlock className="mt-5 h-3 w-24" />
          <SkeletonBlock className="mt-2 h-9 w-full" />
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {invite && (
        <>
          <p className="text-sm text-ink/60">
            {left === null
              ? 'Your invites don’t run out. A friend who opens your link skips the waitlist and lands following you.'
              : left > 0
                ? `You hold ${left} invite${left === 1 ? '' : 's'}. A friend who opens your link skips the waitlist and lands following you.`
                : 'You’ve used all your invites. Ask the house for more when you need them.'}
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <p className={EYEBROW}>Your invite link</p>
              <LinkRow url={invite.url} label="Your invite link" onCopied={onNote} />
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                {canShare && (
                  <button type="button" onClick={() => void share()} className="btn-quiet btn-quiet-sm">
                    Send it by message
                  </button>
                )}
                <p className="text-xs text-ink/45">
                  {left === null ? '' : `${left} of ${left + used.length} left · `}
                  {usedLine}
                </p>
              </div>
            </div>
            <div className="hidden sm:block">
              <p className={EYEBROW}>Or scan</p>
              <div className="mt-2 rounded-[3px] border border-ink/10 bg-[#ECE5D8] p-2">
                <QR text={invite.url} />
              </div>
            </div>
          </div>

          {invite.profileUrl && (
            <div className="mt-8 border-t border-ink/10 pt-5">
              <p className={EYEBROW}>Already in?</p>
              <p className="mt-2 text-sm text-ink/60">Anyone who’s already a member follows you in a tap from this one.</p>
              <LinkRow url={invite.profileUrl} label="Your profile link" onCopied={onNote} />
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
