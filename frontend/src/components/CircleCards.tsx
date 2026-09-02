import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'
import { Arch } from './ui'
import { Spinner } from './Spinner'
import { Initials } from './PeopleDrawer'
import { dismissPick } from '../lib/social'
import { logWear } from '../lib/wearlog'
import { copyText } from '../lib/clipboard'
import { composeLook, dressingOrder } from '../lib/flatlay'
import {
  addComment,
  deleteComment,
  getComments,
  timeAgo,
  timeLeft,
  type Comment,
  type CommentTarget,
  type LookPost,
  type PickPost,
  type PostItem,
  type ReactionKind,
  type VerdictPost,
} from '../lib/circle'

// The Circle's cards — shared by the feed and by profiles, so a look reads
// the same wherever it hangs. Every card asks something of you.

/* ---------- atoms ---------- */

export function Handle({ handle, className = '' }: { handle: string | null; className?: string }) {
  if (!handle) return <span className={`font-semibold text-ink ${className}`}>someone</span>
  return (
    <Link to={`/u/${handle}`} className={`font-semibold text-ink underline-offset-2 hover:text-brass hover:underline ${className}`}>
      @{handle}
    </Link>
  )
}

export function Plate({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">{children}</p>
}

function PostHeader({ handle, meta, plate }: { handle: string | null; meta: ReactNode; plate?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4">
      <Link to={handle ? `/u/${handle}` : '#'} className="press">
        <Initials handle={handle} className="h-9 w-9" />
      </Link>
      <div className="min-w-0 flex-1">
        <Handle handle={handle} className="text-sm" />
        <p className="truncate text-xs text-ink/45">{meta}</p>
      </div>
      {plate && <div className="shrink-0">{plate}</div>}
    </div>
  )
}

export function GarmentThumb({ item, className = 'w-14' }: { item: PostItem; className?: string }) {
  return (
    <Arch aspect="aspect-[4/5]" className={className}>
      <img
        src={resolveImageUrl(item.imageUrl)}
        alt={item.subtype ?? item.category}
        loading="lazy"
        className="relative z-[1] h-full w-full object-contain p-[10%]"
      />
    </Arch>
  )
}

/**
 * The look, hung three ways. With a photo: the person in the arch, the
 * pieces as a strip beneath. Without: the flat-lay, pieces placed by role
 * the way they'd sit on a table. Expanded: the recipe, a labelled strip in
 * dressing order beside the flat-lay.
 */
export function LookHero({
  items,
  photoUrl,
  expanded = false,
  onToggle,
}: {
  items: PostItem[]
  photoUrl?: string | null
  expanded?: boolean
  onToggle?: () => void
}) {
  if (items.length === 0 && !photoUrl) return null
  const strip = dressingOrder(items)

  if (photoUrl) {
    return (
      <div className="mx-4 mt-3">
        <button type="button" onClick={onToggle} className="press block w-full text-left" aria-label={expanded ? 'Show the photo' : 'Show the pieces'}>
          <Arch aspect="aspect-[3/4]" className="w-full">
            <img src={resolveImageUrl(photoUrl)} alt="Wearing the look" loading="lazy" className="relative z-[1] h-full w-full object-cover" />
          </Arch>
        </button>
        {strip.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {strip.map((it) => (
              <div key={it.id} className="w-12 shrink-0 text-center">
                <GarmentThumb item={it} className="w-12" />
                {expanded && <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/50">{it.subtype ?? it.category}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const lay = (
    <Arch aspect="aspect-[5/4]" className="w-full">
      <FlatLay items={items} />
    </Arch>
  )

  if (expanded) {
    return (
      <div className="mx-4 mt-3">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[76px_minmax(0,1fr)]">
          <ol className="flex flex-col gap-1.5" aria-label="The pieces, in dressing order">
            {strip.map((it, i) => (
              <li key={it.id} className="text-center">
                <GarmentThumb item={it} className="w-full" />
                <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/55">{it.subtype ?? it.category}</p>
                {i < strip.length - 1 && <p className="leading-none text-brass-lo" aria-hidden>↓</p>}
              </li>
            ))}
          </ol>
          <button type="button" onClick={onToggle} className="press block self-start text-left" aria-label="Collapse the recipe">
            {lay}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-4 mt-3">
      <button type="button" onClick={onToggle} className="press block w-full text-left" aria-label="Show the recipe">
        {lay}
      </button>
      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 px-0.5">
        {strip.slice(0, 6).map((it) => (
          <span key={it.id} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/50">
            {it.subtype ?? it.category}
          </span>
        ))}
      </p>
    </div>
  )
}

/**
 * Pieces sized by their real-world height and their own image proportions,
 * anchored in body order and fitted to the vitrine. Aspects are measured as
 * the images load (a role default stands in until then), so the board
 * settles into place with a soft shift rather than a jump.
 */
export function FlatLay({ items, frameRatio = 1.25 }: { items: PostItem[]; frameRatio?: number }) {
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const placed = composeLook(
    items.map((it) => ({ ...it, aspect: aspects[it.id] })),
    frameRatio,
  )
  return (
    <div className="relative z-[1] h-full w-full">
      {placed.map((p) => {
        const it = items[p.index]
        return (
          <div
            key={it.id}
            className="absolute transition-[left,top,width,height] duration-300 ease-out motion-reduce:transition-none"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.w}%`, height: `${p.h}%`, zIndex: p.z, transform: `rotate(${p.rot}deg)` }}
          >
            <img
              src={resolveImageUrl(it.imageUrl)}
              alt={it.subtype ?? it.category}
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalWidth > 0) {
                  const a = img.naturalHeight / img.naturalWidth
                  setAspects((prev) => (prev[it.id] === a ? prev : { ...prev, [it.id]: a }))
                }
              }}
              className="block h-full w-full object-contain"
              style={{ filter: 'drop-shadow(0 10px 14px rgba(60,40,12,.22)) drop-shadow(0 1px 2px rgba(60,40,12,.14))' }}
            />
          </div>
        )
      })}
    </div>
  )
}

function ActionButton({
  on = false,
  onClick,
  children,
  label,
}: {
  on?: boolean
  onClick: () => void
  children: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`press inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        on ? 'text-brass' : 'text-ink/55 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

const ICON = {
  heart: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
    </svg>
  ),
  bolt: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  comment: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  ),
  bookmark: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  ),
}

/** Share a public page for one of your own posts — the growth loop. */
async function sharePage(path: string, title: string, onDone: (msg: string) => void) {
  const url = `${window.location.origin}${path}`
  try {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      await (navigator as Navigator & { share: (d: { title: string; url: string }) => Promise<void> }).share({ title, url })
      onDone('Shared.')
      return
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return
  }
  onDone((await copyText(url)) ? 'Link copied — paste it anywhere.' : url)
}

function ShareButton({ path, title, onDone }: { path: string; title: string; onDone: (msg: string) => void }) {
  return (
    <ActionButton label="Share" onClick={() => void sharePage(path, title, onDone)}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M12 3v12M7 8l5-5 5 5" />
        <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      Share
    </ActionButton>
  )
}

/* ---------- comments ---------- */

/** Render @handles in a comment as links. */
function Mentions({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9_]{3,20})/gi)
  return (
    <>
      {parts.map((p, i) =>
        /^@[a-z0-9_]{3,20}$/i.test(p) ? (
          <Link key={i} to={`/u/${p.slice(1).toLowerCase()}`} className="font-semibold text-brass hover:underline">
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export function CommentThread({
  target,
  id,
  onCount,
  onError,
}: {
  target: CommentTarget
  id: string
  onCount: (n: number) => void
  onError: (msg: string) => void
}) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    getComments(target, id)
      .then((r) => alive && setComments(r.comments))
      .catch(() => alive && setComments([]))
    return () => {
      alive = false
    }
  }, [target, id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const { comment } = await addComment(target, id, text)
      setComments((c) => {
        const next = [...(c ?? []), comment]
        onCount(next.length)
        return next
      })
      setBody('')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not post that.')
    } finally {
      setSending(false)
    }
  }

  async function remove(cid: string) {
    try {
      await deleteComment(cid)
      setComments((c) => {
        const next = (c ?? []).filter((x) => x.id !== cid)
        onCount(next.length)
        return next
      })
    } catch {
      onError('Could not remove that.')
    }
  }

  return (
    <div className="border-t border-ink/10 px-4 py-3">
      {comments === null && (
        <div className="py-3 text-center text-ink/40">
          <Spinner className="h-4 w-4" />
        </div>
      )}
      {comments && comments.length === 0 && (
        <p className="pb-2 text-xs text-ink/45">No notes yet — say what works, or @mention a friend.</p>
      )}
      {comments && comments.length > 0 && (
        <ul className="flex flex-col gap-2.5 pb-1">
          {comments.map((c) => (
            <li key={c.id} className="group flex items-start gap-2.5">
              <Initials handle={c.handle} className="mt-0.5 h-6 w-6 !text-[9px]" />
              <div className="min-w-0 flex-1 text-sm leading-snug text-ink/80">
                <Handle handle={c.handle} className="text-xs" />{' '}
                <Mentions text={c.body} />
                <span className="ml-2 text-[11px] text-ink/35">{timeAgo(c.at)}</span>
              </div>
              {c.isMine && (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  aria-label="Remove note"
                  className="press shrink-0 text-[11px] text-ink/30 opacity-0 transition-opacity hover:text-ink/60 focus:opacity-100 group-hover:opacity-100"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label htmlFor={`note-${target}-${id}`} className="sr-only">
          Add a note
        </label>
        <input
          id={`note-${target}-${id}`}
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          className="field !py-2 !text-sm"
          placeholder="Add a note… @mention a friend"
        />
        <button type="submit" disabled={sending || !body.trim()} className="btn-ghost btn-sm disabled:opacity-40">
          {sending ? '…' : 'Post'}
        </button>
      </form>
    </div>
  )
}

/* ---------- cards ---------- */

function reactionLine(p: LookPost): string | null {
  const { total, sample, mine } = p.reactions
  if (total === 0) return null
  const others = total - (mine ? 1 : 0)
  const names = sample.map((h) => `@${h}`)
  const parts: string[] = []
  if (mine) parts.push('You')
  parts.push(...names.slice(0, 2))
  const rest = others - Math.min(2, names.length)
  let s = parts.join(', ')
  if (rest > 0) s += ` and ${rest} other${rest === 1 ? '' : 's'}`
  return `${s} would wear this`
}

export function LookCard({
  post,
  onReact,
  onSave,
  onRecreate,
  onError,
  onCommentCount,
}: {
  post: LookPost
  onReact: (id: string, kind: ReactionKind | null) => Promise<void>
  onSave: (id: string, saved: boolean) => Promise<void>
  onRecreate: (handle: string | null, items: PostItem[]) => void
  onError: (msg: string) => void
  onCommentCount: (id: string, n: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const line = reactionLine(post)
  return (
    <article className={`card overflow-hidden ${post.featured ? '!border-brass/45' : ''}`}>
      <PostHeader
        handle={post.handle}
        meta={
          <>
            Outfit of the day{post.eventType ? ` · ${post.eventType}` : ''} · {timeAgo(post.at)}
          </>
        }
        plate={post.featured ? <Plate>Featured</Plate> : undefined}
      />
      <LookHero items={post.items} photoUrl={post.photoUrl} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      {line && <p className="px-4 pt-3 text-xs text-ink/50">{line}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-0.5 border-t border-ink/10 px-3 py-2.5">
        {!post.isMine && (
          <>
            <ActionButton
              label="Would wear"
              on={post.reactions.mine === 'would_wear'}
              onClick={() => void onReact(post.id, post.reactions.mine === 'would_wear' ? null : 'would_wear')}
            >
              {ICON.heart}
              Would wear
              {post.reactions.counts.would_wear ? <Count n={post.reactions.counts.would_wear} /> : null}
            </ActionButton>
            <ActionButton
              label="Bold"
              on={post.reactions.mine === 'bold'}
              onClick={() => void onReact(post.id, post.reactions.mine === 'bold' ? null : 'bold')}
            >
              {ICON.bolt}
              Bold
              {post.reactions.counts.bold ? <Count n={post.reactions.counts.bold} /> : null}
            </ActionButton>
          </>
        )}
        <ActionButton label="Notes" on={open} onClick={() => setOpen((v) => !v)}>
          {ICON.comment}
          {post.comments > 0 ? <Count n={post.comments} /> : 'Note'}
        </ActionButton>
        {!post.isMine && (
          <ActionButton label={post.saved ? 'Saved' : 'Save'} on={post.saved} onClick={() => void onSave(post.id, !post.saved)}>
            {ICON.bookmark}
            {post.saved ? 'Saved' : 'Save'}
          </ActionButton>
        )}
        {!post.isMine && post.items.length > 0 && (
          <button type="button" onClick={() => onRecreate(post.handle, post.items)} className="btn-primary ml-auto btn-sm">
            Recreate
          </button>
        )}
        {post.isMine && (
          <span className="ml-auto flex items-center gap-1">
            <span className="hidden px-1 text-xs text-ink/45 sm:inline">Your look, on the circle.</span>
            <ShareButton path={`/look/${post.id}`} title="Wore this today" onDone={onError} />
          </span>
        )}
      </div>
      {open && <CommentThread target="look" id={post.id} onCount={(n) => onCommentCount(post.id, n)} onError={onError} />}
    </article>
  )
}

function Count({ n }: { n: number }) {
  return <span className="text-ink/40 [font-variant-numeric:tabular-nums]">{n}</span>
}

export function VerdictCard({
  post,
  onVote,
  onError,
  onCommentCount,
}: {
  post: VerdictPost
  onVote: (pollId: string, optionId: string) => Promise<void>
  onError: (msg: string) => void
  onCommentCount: (id: string, n: number) => void
}) {
  const [voting, setVoting] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const canVote = !post.settled && !post.isMine && !post.myVote
  const counts = post.counts
  const leader = counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] : null

  return (
    <article className="card overflow-hidden">
      <PostHeader
        handle={post.handle}
        meta={
          post.isMine
            ? `Your verdict · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`
            : `needs a verdict · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`
        }
        plate={<Plate>{post.settled ? 'Verdict is in' : 'Verdict'}</Plate>}
      />
      <p className="mt-2 px-4 font-display text-lg font-medium text-ink">{post.question}</p>

      <div className="mt-3 flex items-start gap-3 px-4">
        {post.options.slice(0, 3).map((o) => {
          const won = Boolean(post.settled && leader && leader === o.id)
          const chosen = post.myVote === o.id
          const n = counts?.[o.id] ?? 0
          const share = counts && post.totalVotes > 0 ? Math.round((n / post.totalVotes) * 100) : null
          const inner = (
            <>
              <Arch aspect="aspect-[3/4]" bright={won || chosen}>
                <img src={resolveImageUrl(o.imageUrl)} alt={`Option ${o.id.toUpperCase()}`} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[6%]" />
              </Arch>
              {counts ? (
                <>
                  <div className="mt-2 h-1 overflow-hidden rounded-[2px] bg-ink/10">
                    <div className="h-full bg-gradient-to-r from-[var(--c-brass-lo)] to-[var(--c-brass-hi)] transition-[width] duration-700" style={{ width: `${share ?? 0}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between px-0.5">
                    <span className={`text-[11px] font-semibold ${won || chosen ? 'text-brass' : 'text-ink/50'}`}>
                      {o.id.toUpperCase()}
                      {won ? ' · won' : chosen ? ' · yours' : ''}
                    </span>
                    <span className="font-display text-sm text-ink [font-variant-numeric:tabular-nums]">{share ?? 0}%</span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                  {voting === o.id ? 'Sending…' : o.id.toUpperCase()}
                </p>
              )}
            </>
          )
          return canVote ? (
            <button
              key={o.id}
              type="button"
              disabled={voting !== null}
              onClick={() => {
                setVoting(o.id)
                void onVote(post.id, o.id).finally(() => setVoting(null))
              }}
              className="press flex-1 text-left disabled:opacity-60"
              aria-label={`Vote ${o.id.toUpperCase()}`}
            >
              {inner}
            </button>
          ) : (
            <div key={o.id} className="flex-1">
              {inner}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-ink/10 px-3 py-2.5">
        <p className="px-1 text-xs text-ink/50">
          {canVote
            ? 'Tap the one they should wear.'
            : post.settled
              ? `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} · settled`
              : `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} so far${post.myVote ? ' · you weighed in' : ''}`}
        </p>
        <span className="ml-auto flex items-center gap-0.5">
          {post.isMine && !post.settled && <ShareButton path={`/vote/${post.id}`} title={post.question} onDone={onError} />}
          <ActionButton label="Notes" on={open} onClick={() => setOpen((v) => !v)}>
            {ICON.comment}
            {post.comments > 0 ? <Count n={post.comments} /> : 'Note'}
          </ActionButton>
        </span>
      </div>
      {open && <CommentThread target="verdict" id={post.id} onCount={(n) => onCommentCount(post.id, n)} onError={onError} />}
    </article>
  )
}

export function PickCard({ post, onGone, onError }: { post: PickPost; onGone: (id: string) => void; onError: (msg: string) => void }) {
  const navigate = useNavigate()
  const [worn, setWorn] = useState(false)
  return (
    <article className="card overflow-hidden !border-brass/35 bg-iris-soft/40">
      <PostHeader handle={post.handle} meta={`styled a look for you · ${timeAgo(post.at)}`} plate={<Plate>For you</Plate>} />
      {post.note && <p className="mt-2 px-4 font-display text-sm italic text-ink/70">“{post.note}”</p>}
      {post.items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 px-4">
          {post.items.slice(0, 5).map((it) => (
            <GarmentThumb key={it.id} item={it} />
          ))}
        </div>
      )}
      <div className="action-row mt-4 border-t border-brass/20 px-4 py-3 !gap-x-3">
        <button
          type="button"
          disabled={worn || post.items.length === 0}
          onClick={() =>
            void logWear({ itemIds: post.items.map((i) => i.id), pickId: post.id })
              .then(() => setWorn(true))
              .catch(() => onError('Could not log the wear — try again.'))
          }
          className={worn ? 'btn-ghost !border-brass/50 btn-sm !text-brass' : 'btn-primary btn-sm'}
        >
          {worn ? 'Worn — they’ll know' : 'I wore it'}
        </button>
        <button type="button" onClick={() => navigate(`/mirror?items=${post.items.map((i) => i.id).join(',')}`)} className="btn-ghost btn-sm">
          See it on me
        </button>
        <button
          type="button"
          onClick={() =>
            void dismissPick(post.id)
              .then(() => onGone(post.id))
              .catch(() => onError('Could not dismiss that — try again.'))
          }
          className="btn-quiet ml-auto !h-9 !text-xs !text-ink/40"
        >
          Dismiss
        </button>
      </div>
    </article>
  )
}
