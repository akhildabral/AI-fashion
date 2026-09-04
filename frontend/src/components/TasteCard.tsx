import { useEffect, useState } from 'react'
import { dismissTasteFact, formalityLean, getTaste } from '@zauq/shared/taste'
import type { TasteResponse } from '@zauq/shared/types'
import { SectionHead, SkeletonBlock, Stat } from './ui'

// Your taste: what the record has taught the stylist, said back in plain
// sentences the member can strike. Ten mornings in it starts to speak; until
// then the fitting does. Every fact carries a quiet "Not quite".

const COLD_LINE = 'Ten mornings in, I’ll know your taste. For now I go by your fitting.'

export function TasteCard({ onNotice, className = '' }: { onNotice: (msg: string) => void; className?: string }) {
  const [data, setData] = useState<TasteResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getTaste()
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  async function notQuite(id: string) {
    if (busy) return
    setBusy(id)
    try {
      setData(await dismissTasteFact(id))
      onNotice('Noted. I won’t say that again.')
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Could not note that just now.')
    } finally {
      setBusy(null)
    }
  }

  const profile = data?.profile
  const lean = formalityLean(profile?.formalityOffset)
  const favourite = profile?.colourAffinity.favourite ?? null

  return (
    <section className={className}>
      <SectionHead eyebrow="What I’ve learned" title="Your taste" />
      <div className="card p-5" aria-busy={!data && !failed}>
        {!data && !failed && (
          <div aria-label="Reading the record">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="mt-4 h-4 w-2/3" />
            <SkeletonBlock className="mt-4 h-4 w-1/2" />
          </div>
        )}
        {failed && <p className="empty-line">The record is out of reach for a moment. Try again in a few seconds.</p>}
        {data && data.coldStart && (
          <>
            <p className="empty-line">{COLD_LINE}</p>
            {data.signals.length > 0 && <p className="mt-4 text-sm text-ink/55">From the fitting: {data.signals.join(', ')}.</p>}
          </>
        )}
        {data && !data.coldStart && profile && (
          <>
            {profile.facts.length === 0 ? (
              <p className="empty-line">Nothing worth saying yet. A few more mornings and the record will speak.</p>
            ) : (
              <ul className="divide-y divide-ink/10">
                {profile.facts.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <p className="text-[15px] leading-6 text-ink">{f.text}</p>
                    <button type="button" onClick={() => void notQuite(f.id)} disabled={busy === f.id} className="btn-quiet btn-quiet-sm -my-2 shrink-0" aria-label={`Not quite: ${f.text}`}>
                      {busy === f.id ? '…' : 'Not quite'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-ink/10 pt-4">
              <Stat value={profile.sampleSize} label="wears learned from" />
              <Stat value={favourite ?? '—'} label="favourite colour" className="capitalize" />
              <Stat value={lean ?? 'As laid out'} label="formality lean" />
            </div>
          </>
        )}
      </div>
    </section>
  )
}
