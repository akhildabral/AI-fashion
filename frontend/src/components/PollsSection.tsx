import { useEffect, useState } from 'react'
import { deletePoll, listPolls, type Poll } from '../lib/polls'

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'closed'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins} min left`
  return `${Math.round(mins / 60)} h left`
}

const LETTERS: Record<string, string> = { a: 'A', b: 'B', c: 'C' }

/** The asker's verdict polls: options with live vote counts, share + delete. */
export function PollsSection({ refreshKey }: { refreshKey: number }) {
  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPolls()
      .then(({ polls: p }) => {
        if (!cancelled) setPolls(p ?? [])
      })
      .catch(() => {
        if (!cancelled) setPolls([])
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  function copy(poll: Poll) {
    void navigator.clipboard?.writeText(poll.shareUrl).then(() => {
      setCopiedId(poll.id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  if (!polls || polls.length === 0) return null

  return (
    <section className="mt-14">
      <h2 className="mb-1 font-serif text-3xl font-semibold text-ink">Your polls</h2>
      <p className="mb-6 text-sm text-ink/55">
        Votes are only visible to you. Friends just see the choices.
      </p>
      <div className="space-y-4">
        {polls.map((poll) => {
          const winner =
            poll.counts && Object.keys(poll.counts).length > 0
              ? Object.entries(poll.counts).sort((a, b) => b[1] - a[1])[0][0]
              : null
          return (
            <article
              key={poll.id}
              className="rounded-2xl border border-ink/10 bg-surface p-5 "
            >
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{poll.question}</p>
                <p className="text-xs text-ink/45">
                  {poll.totalVotes ?? 0} vote{(poll.totalVotes ?? 0) === 1 ? '' : 's'} ·{' '}
                  {timeLeft(poll.expiresAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                {poll.options.map((opt) => {
                  const count = poll.counts?.[opt.id] ?? 0
                  const isWinner = winner === opt.id && count > 0
                  return (
                    <div key={opt.id} className="w-24 text-center">
                      <div
                        className={
                          isWinner
                            ? 'aspect-[3/4] overflow-hidden rounded-xl border-2 border-sage'
                            : 'aspect-[3/4] overflow-hidden rounded-xl border border-ink/10'
                        }
                      >
                        <img
                          src={opt.imageUrl}
                          alt={`Option ${LETTERS[opt.id]}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-ink/70">
                        {LETTERS[opt.id]} · {count} {isWinner ? '🏆' : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex gap-3">
                {!poll.expired && (
                  <button type="button" onClick={() => copy(poll)} className="btn-ghost text-xs">
                    {copiedId === poll.id ? 'Link copied ✓' : 'Copy share link'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void deletePoll(poll.id)
                      .then(() => setPolls((prev) => prev?.filter((p) => p.id !== poll.id) ?? prev))
                      .catch(() => {})
                  }}
                  className="text-xs text-ink/35 transition hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
