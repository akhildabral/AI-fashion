import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getFeed,
  recreateFromCloset,
  type FeedCard,
  type RecreateResponse,
} from '../lib/brief'
import { resolveImageUrl } from '../lib/api'
import { Modal, PageShell } from '../components/ui'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { apiFetch } from '../lib/api'

// Circle ring 1: things to do, not lists to read. The people-management
// surface (search, follow, handle, twins) lives one tap away.

interface CardItem {
  id: string
  imageUrl: string
  subtype: string | null
  category: string
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days > 14) return ''
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `${hours}h ago`
  return 'just now'
}

export function CirclePage() {
  const navigate = useNavigate()
  const [cards, setCards] = useState<FeedCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recreate, setRecreate] = useState<{ handle: string; result: RecreateResponse | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4000)
  }

  function openRecreate(handle: string, itemIds: string[]) {
    setRecreate({ handle, result: null })
    recreateFromCloset(itemIds)
      .then((result) => setRecreate({ handle, result }))
      .catch((err) => {
        setRecreate(null)
        flash(err instanceof Error ? err.message : 'Could not recreate that look.')
      })
  }

  async function saveRecreated() {
    const ids = recreate?.result?.pairs.map((p) => p.match.id) ?? []
    if (ids.length === 0) return
    setSaving(true)
    try {
      await apiFetch('/outfits', {
        method: 'POST',
        body: {
          itemIds: ids,
          provenance: 'copied',
          rationale: `Recreated from @${recreate?.handle}'s outfit of the day`,
        },
      })
      flash('Saved to your outfits.')
      setRecreate(null)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    getFeed()
      .then((r) => setCards(r.cards))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load your circle.'),
      )
  }, [])

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="animate-rise font-display text-4xl font-extrabold tracking-tight text-ink">
            Circle
          </h1>
          <p className="mt-1 animate-rise-1 text-sm text-ink/55">
            Friends styling friends — picks, polls, and people worth following.
          </p>
        </div>
        <Link to="/circle/people" className="btn-ghost animate-rise-1">
          People & follows →
        </Link>
      </div>

      {cards === null && !error && (
        <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}
      {error && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
      )}

      {cards !== null && cards.length === 0 && (
        <div className="mt-10 rounded-3xl border border-dashed border-ink/15 py-16 text-center">
          <p className="font-display text-xl font-bold text-ink">It's quiet in here</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/50">
            Follow a friend and this feed fills with their picks for you, polls to vote on, and
            looks to react to.
          </p>
          <Link to="/circle/people" className="btn-primary mt-5 inline-flex">
            Find your people
          </Link>
        </div>
      )}

      {cards !== null && cards.length > 0 && (
        <div className="mt-8 grid animate-rise-2 gap-4 sm:grid-cols-2">
          {cards.map((card, i) => {
            const ago = timeAgo(String(card.at))
            if (card.type === 'ootd') {
              const items = (card.items as CardItem[] | undefined) ?? []
              return (
                <div key={i} className="card p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-iris">
                      Outfit of the day
                    </p>
                    <span className="text-xs text-ink/40">{ago}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink/80">
                    <Link
                      to={`/u/${String(card.handle)}`}
                      className="font-semibold text-ink hover:text-iris"
                    >
                      @{String(card.handle)}
                    </Link>{' '}
                    wore this today
                    {card.eventType ? (
                      <span className="font-serif italic text-ink/60"> — {String(card.eventType)}</span>
                    ) : null}
                  </p>
                  {items.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {items.slice(0, 5).map((it) => (
                        <img
                          key={it.id}
                          src={resolveImageUrl(it.imageUrl)}
                          alt={it.subtype ?? it.category}
                          className="h-16 w-16 rounded-xl border border-ink/10 bg-white object-contain p-1"
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openRecreate(String(card.handle), items.map((it) => it.id))}
                    className="btn-ghost mt-4 !px-4 !py-2 !text-xs"
                  >
                    Recreate from my closet ✦
                  </button>
                </div>
              )
            }
            if (card.type === 'pick_received') {
              const items = (card.items as CardItem[] | undefined) ?? []
              return (
                <div key={i} className="card p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-iris">
                      Styled for you
                    </p>
                    <span className="text-xs text-ink/40">{ago}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink/80">
                    <Link
                      to={`/u/${String(card.byHandle)}`}
                      className="font-semibold text-ink hover:text-iris"
                    >
                      @{String(card.byHandle)}
                    </Link>{' '}
                    picked an outfit for you
                    {card.note ? (
                      <span className="font-serif italic text-ink/60"> — “{String(card.note)}”</span>
                    ) : null}
                  </p>
                  {items.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {items.slice(0, 4).map((it) => (
                        <img
                          key={it.id}
                          src={resolveImageUrl(it.imageUrl)}
                          alt={it.subtype ?? it.category}
                          className="h-16 w-16 rounded-xl border border-ink/10 bg-bone object-contain p-1"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            if (card.type === 'poll_result' || card.type === 'poll_open') {
              const counts = (card.counts as Record<string, number> | undefined) ?? {}
              const options =
                (card.options as { id: string; imageUrl: string }[] | undefined) ?? []
              const total = Number(card.totalVotes ?? 0)
              const leader = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
              return (
                <div key={i} className="card p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-spark">
                      {card.type === 'poll_result' ? 'Verdict is in' : 'Poll running'}
                    </p>
                    <span className="text-xs text-ink/40">{ago}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-ink">{String(card.question)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    {options.slice(0, 3).map((o) => (
                      <div key={o.id} className="relative">
                        <img
                          src={resolveImageUrl(o.imageUrl)}
                          alt={`Option ${o.id.toUpperCase()}`}
                          className={`h-20 w-16 rounded-xl border object-cover ${
                            card.type === 'poll_result' && leader && leader[0] === o.id
                              ? 'border-iris ring-2 ring-iris/40'
                              : 'border-ink/10'
                          }`}
                        />
                        <span className="absolute -bottom-1 -right-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-bone">
                          {counts[o.id] ?? 0}
                        </span>
                      </div>
                    ))}
                    <p className="ml-2 text-xs text-ink/50">
                      {total} vote{total === 1 ? '' : 's'}
                      {card.type === 'poll_result' && leader && (
                        <>
                          {' '}
                          · <span className="font-semibold text-ink/75">{leader[0].toUpperCase()} won</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )
            }
            if (card.type === 'new_follower') {
              return (
                <div key={i} className="card p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-iris">
                      New follower
                    </p>
                    <span className="text-xs text-ink/40">{ago}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink/80">
                    <Link
                      to={`/u/${String(card.handle)}`}
                      className="font-semibold text-ink hover:text-iris"
                    >
                      @{String(card.handle)}
                    </Link>{' '}
                    started following your closet.
                  </p>
                </div>
              )
            }
            // style_a_friend
            const handles = (card.handles as string[] | undefined) ?? []
            return (
              <div key={i} className="card border-iris/25 bg-iris-soft/60 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-iris">
                  Be someone's stylist
                </p>
                <p className="mt-1.5 text-sm text-ink/80">
                  Browse a friend's closet and compose a look for them — when they wear it, it
                  counts.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {handles.map((h) => (
                    <Link key={h} to={`/u/${h}`} className="chip !bg-surface">
                      @{h}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-xl bg-ink px-5 py-3 text-sm font-medium text-bone shadow-float">
          {toast}
        </div>
      )}

      <Modal
        open={recreate !== null}
        onClose={() => setRecreate(null)}
        title={recreate ? `In your closet, @${recreate.handle}'s look` : 'Recreate'}
      >
        {recreate && recreate.result === null && (
          <div className="flex justify-center py-10 text-ink/50">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {recreate?.result && (
          <>
            {recreate.result.pairs.length > 0 ? (
              <div className="space-y-3">
                {recreate.result.pairs.map((p) => (
                  <div key={p.source.id} className="flex items-center gap-3">
                    <img
                      src={resolveImageUrl(p.source.imageUrl)}
                      alt={p.source.label}
                      className="h-16 w-16 rounded-xl border border-ink/10 bg-white object-contain p-1"
                    />
                    <span className="text-ink/35">→</span>
                    <img
                      src={resolveImageUrl(p.match.imageUrl)}
                      alt={p.match.label}
                      className="h-16 w-16 rounded-xl border border-iris/40 bg-white object-contain p-1"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium capitalize text-ink">{p.match.label}</p>
                      <p className="text-xs text-ink/45">your {p.match.label} for their {p.source.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-ink/15 p-4 text-sm text-ink/55">
                Nothing in your closet matches this look yet
                {recreate.result.closetSize === 0 ? ' — it looks empty. Add some pieces first.' : '.'}
              </p>
            )}
            {recreate.result.missing.length > 0 && (
              <div className="mt-4 rounded-xl bg-spark-soft/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-spark-deep">
                  To complete the look
                </p>
                <ul className="mt-2 space-y-1 text-sm text-ink/70">
                  {recreate.result.missing.map((m) => (
                    <li key={m.source.id}>· {m.wanted || m.source.label} — not in your closet yet</li>
                  ))}
                </ul>
              </div>
            )}
            {recreate.result.pairs.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/mirror?items=${recreate.result!.pairs.map((p) => p.match.id).join(',')}`)}
                  className="btn-primary !px-4 !py-2 !text-sm"
                >
                  See it on you ✦
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveRecreated()}
                  className="btn-ghost !px-4 !py-2 !text-sm"
                >
                  {saving ? 'Saving…' : 'Save as outfit'}
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </PageShell>
  )
}
