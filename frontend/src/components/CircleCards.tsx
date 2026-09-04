import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'
import { Arch } from './ui'
import { Spinner } from './Spinner'
import { Initials } from './PeopleDrawer'
import { dismissPick } from '@zauq/shared/social'
import { logWear } from '@zauq/shared/wearlog'
import { copyText } from '../lib/clipboard'
import { composeLook, dressingOrder } from '@zauq/shared/flatlay'
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
  type PostTarget,
  type ReactionKind,
  type ReactionSummary,
  type VerdictPost,
  type WeekPost,
} from '@zauq/shared/circle'

// The Circle's cards — shared by the feed and by profiles, so a look reads
// the same wherever it hangs. Every card asks something of you.

/* ---------- atoms ---------- */

/** A person, by name; the handle is only the address behind the link. */
export function Handle({ handle, name, className = '' }: { handle: string | null; name?: string | null; className?: string }) {
  const label = name?.trim() || handle || 'someone'
  if (!handle) return <span className={`font-semibold text-ink ${className}`}>{label}</span>
  return (
    <Link to={`/u/${handle}`} className={`font-semibold text-ink underline-offset-2 hover:text-brass hover:underline ${className}`}>
      {label}
    </Link>
  )
}

export function Plate({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">{children}</p>
}

function PostHeader({ handle, name, label, meta, plate, menu }: { handle: string | null; name: string; label?: string; meta: ReactNode; plate?: ReactNode; menu?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4">
      <Link to={handle ? `/u/${handle}` : '#'} className="press">
        <Initials handle={handle} name={name} className="h-8 w-8" />
      </Link>
      <div className="min-w-0 flex-1">
        <Handle handle={handle} name={label ?? name} className="text-sm" />
        <p className="truncate text-xs text-ink/45">{meta}</p>
      </div>
      {plate && <div className="shrink-0">{plate}</div>}
      {menu}
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

  // A wide board is a 3px rectangle with a hairline, never an arch; the lit
  // niche fill stays so the cut-outs sit in a vitrine.
  const lay = (
    <div className="rect-frame aspect-[5/4] w-full">
      <div className="arch-niche h-full w-full">
        <FlatLay items={items} />
      </div>
    </div>
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
      className={`press inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1.5 text-xs font-semibold transition-colors sm:px-2.5 ${
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
  star: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  ),
  recreate: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
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
  onDone((await copyText(url)) ? 'Link copied. Paste it anywhere.' : url)
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
  const [failed, setFailed] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    getComments(target, id)
      .then((r) => alive && setComments(r.comments))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [target, id, reloadNonce])

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
      {comments === null && !failed && (
        <div className="py-3 text-center text-ink/40">
          <Spinner className="h-4 w-4" />
        </div>
      )}
      {failed && (
        <p className="pb-2 text-xs text-ink/45">
          Couldn’t load the notes.{' '}
          <button type="button" onClick={() => { setComments(null); setReloadNonce((n) => n + 1) }} className="press font-semibold text-brass hover:underline">Try again</button>
        </p>
      )}
      {!failed && comments && comments.length === 0 && (
        <p className="pb-2 text-xs text-ink/45">No notes yet. Say what works, or @mention a friend.</p>
      )}
      {comments && comments.length > 0 && (
        <ul className="flex flex-col gap-2.5 pb-1">
          {comments.map((c) => (
            <li key={c.id} className="group flex items-start gap-2.5">
              <Initials handle={c.handle} name={c.name} className="mt-0.5 h-6 w-6 !text-[9px]" />
              <div className="min-w-0 flex-1 text-sm leading-snug text-ink/80">
                <Handle handle={c.handle} name={c.name} className="text-xs" />{' '}
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

/* ---------- the grammar ---------- */

/**
 * What a card can ask of the page. One object, passed to every card, so a
 * look, a verdict and a pick read and behave the same wherever they hang.
 */
export interface CardActions {
  react: (target: PostTarget, id: string, kind: ReactionKind | null) => Promise<void>
  commentCount: (target: PostTarget, id: string, n: number) => void
  note: (msg: string) => void
  /** Mute the author for a while; the page drops their posts. */
  mute?: (handle: string) => void
  report?: (target: PostTarget, id: string, label: string) => void
  /** Your own post: take it off the circle. */
  takeDown?: (target: PostTarget, id: string) => Promise<void>
  /** Your own open verdict: close it now. */
  settle?: (pollId: string) => Promise<void>
  save?: (wearLogId: string, saved: boolean) => Promise<void>
  recreate?: (handle: string | null, items: PostItem[]) => void
  /** A pick you dismissed or wore: it leaves the feed. */
  gone?: (target: PostTarget, id: string) => void
  /** Dressing each other: thanks (with a line), a photo of the wear, taking a pick back. */
  thank?: (pickId: string, reply: string) => Promise<void>
  photo?: (pickId: string, wearLogId: string, file: File) => Promise<void>
  withdraw?: (pickId: string) => Promise<void>
}

function reactionLine(r: ReactionSummary, verb = 'would wear this'): string | null {
  const { total, sample, mine } = r
  if (total === 0) return null
  const others = total - (mine ? 1 : 0)
  const names = sample
  const parts: string[] = []
  if (mine) parts.push('You')
  parts.push(...names.slice(0, 2))
  const rest = others - Math.min(2, names.length)
  let s = parts.join(', ')
  if (rest > 0) s += ` and ${rest} other${rest === 1 ? '' : 's'}`
  return `${s} ${verb}`
}

/** The same three reactions on every post. On a look, "Would wear" is the primary verb and sits first. */
function Reactions({ target, post, mine, counts, actions, skipWouldWear = false }: { target: PostTarget; post: { id: string }; mine: ReactionKind | null; counts: Record<string, number>; actions: CardActions; skipWouldWear?: boolean }) {
  const toggle = (k: ReactionKind) => void actions.react(target, post.id, mine === k ? null : k)
  return (
    <>
      {!skipWouldWear && (
        <ActionButton label="Would wear" on={mine === 'would_wear'} onClick={() => toggle('would_wear')}>
          {ICON.heart}
          Would wear
          {counts.would_wear ? <Count n={counts.would_wear} /> : null}
        </ActionButton>
      )}
      <ActionButton label="Bold" on={mine === 'bold'} onClick={() => toggle('bold')}>
        {ICON.bolt}
        Bold
        {counts.bold ? <Count n={counts.bold} /> : null}
      </ActionButton>
      <ActionButton label="Love" on={mine === 'love'} onClick={() => toggle('love')}>
        {ICON.star}
        Love
        {counts.love ? <Count n={counts.love} /> : null}
      </ActionButton>
    </>
  )
}

function NotesButton({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  return (
    <ActionButton label="Notes" on={open} onClick={onClick}>
      {ICON.comment}
      {count > 0 ? <Count n={count} /> : 'Note'}
    </ActionButton>
  )
}

/** The "···" on every card: the rest, one list, closes on any choice. */
export function CardMenu({ items }: { items: { label: string; danger?: boolean; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (items.length === 0) return null
  return (
    <div ref={ref} className="relative -mr-2 shrink-0">
      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="btn-icon">
        ···
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden py-1 text-left">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-ink/5 ${it.danger ? 'text-red-500 dark:text-red-300' : 'text-ink/80'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A card's foot. Three parts that wrap as wholes, never one control alone on
 * a line: the verbs (primary first), the shared row (reactions, notes, more),
 * and the "···" pushed right.
 */
function CardFoot({ verbs, children, tone = 'border-ink/10' }: { verbs?: ReactNode; children: ReactNode; tone?: string }) {
  return (
    <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t ${tone} px-3 py-2.5`}>
      {verbs && <div className="flex flex-wrap items-center gap-2">{verbs}</div>}
      <div className="flex flex-wrap items-center gap-x-0.5">{children}</div>
    </div>
  )
}

/* ---------- cards ---------- */

export function LookCard({ post, actions, highlight = false }: { post: LookPost; actions: CardActions; highlight?: boolean }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const line = reactionLine(post.reactions)
  const menu: { label: string; danger?: boolean; onSelect: () => void }[] = []
  if (!post.isMine && actions.save) menu.push({ label: post.saved ? 'Remove from your board' : 'Save to your board', onSelect: () => void actions.save?.(post.id, !post.saved) })
  if (post.isMine) menu.push({ label: 'Share the page', onSelect: () => void sharePage(`/look/${post.id}`, 'Wore this today', actions.note) })
  if (!post.isMine && post.handle && actions.mute) menu.push({ label: `Mute ${post.name} for a while`, onSelect: () => actions.mute?.(post.handle as string) })
  if (!post.isMine && actions.report) menu.push({ label: 'Report', onSelect: () => actions.report?.('look', post.id, `${post.name}’s look`) })
  if (post.isMine && actions.takeDown) menu.push({ label: 'Take it down', danger: true, onSelect: () => void actions.takeDown?.('look', post.id) })
  return (
    <article id={`post-look-${post.id}`} className={`card overflow-hidden transition-shadow ${post.featured ? '!border-brass/45' : ''} ${highlight ? 'ring-1 ring-brass' : ''}`}>
      <PostHeader
        handle={post.handle}
        name={post.name}
        meta={
          <>
            Outfit of the day{post.eventType ? ` · ${post.eventType}` : ''} · {timeAgo(post.at)}
          </>
        }
        plate={<Plate>{post.featured ? 'Featured' : 'Look'}</Plate>}
        menu={<CardMenu items={menu} />}
      />
      <LookHero items={post.items} photoUrl={post.photoUrl} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      {line && <p className="px-4 pt-3 text-xs text-ink/50">{line}</p>}
      <CardFoot
        verbs={
          post.isMine ? (
            <span className="px-1 text-xs text-ink/45">Your look, on the circle.</span>
          ) : (
            <button type="button" aria-pressed={post.reactions.mine === 'would_wear'} onClick={() => void actions.react('look', post.id, post.reactions.mine === 'would_wear' ? null : 'would_wear')} className={post.reactions.mine === 'would_wear' ? 'btn-ghost !border-brass/60 btn-sm !text-brass' : 'btn-primary btn-sm'}>
              {post.reactions.mine === 'would_wear' ? 'Would wear ✓' : 'Would wear'}
              {post.reactions.counts.would_wear ? <Count n={post.reactions.counts.would_wear} /> : null}
            </button>
          )
        }
>
        {!post.isMine && <Reactions target="look" post={post} mine={post.reactions.mine} counts={post.reactions.counts} actions={actions} skipWouldWear />}
        <NotesButton open={open} count={post.comments} onClick={() => setOpen((v) => !v)} />
        {!post.isMine && post.items.length > 0 && actions.recreate && (
          <ActionButton label="Recreate from my closet" onClick={() => actions.recreate?.(post.handle, post.items)}>
            {ICON.recreate}
            Recreate
          </ActionButton>
        )}
      </CardFoot>
      {open && <CommentThread target="look" id={post.id} onCount={(n) => actions.commentCount('look', post.id, n)} onError={actions.note} />}
    </article>
  )
}

function Count({ n }: { n: number }) {
  return <span className="text-ink/40 [font-variant-numeric:tabular-nums]">{n}</span>
}

export function VerdictCard({ post, actions, onVote, highlight = false }: { post: VerdictPost; actions: CardActions; onVote: (pollId: string, optionId: string) => Promise<void>; highlight?: boolean }) {
  const [voting, setVoting] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  // One vote each, changeable until it settles.
  const canVote = !post.settled && !post.isMine
  const counts = post.counts
  const leader = counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] : null
  const menu: { label: string; danger?: boolean; onSelect: () => void }[] = []
  if (post.isMine && !post.settled) menu.push({ label: 'Share the vote page', onSelect: () => void sharePage(`/vote/${post.id}`, post.question, actions.note) })
  if (post.isMine && !post.settled && actions.settle) menu.push({ label: 'Settle it now', onSelect: () => void actions.settle?.(post.id) })
  if (!post.isMine && post.handle && actions.mute) menu.push({ label: `Mute ${post.name} for a while`, onSelect: () => actions.mute?.(post.handle as string) })
  if (!post.isMine && actions.report) menu.push({ label: 'Report', onSelect: () => actions.report?.('verdict', post.id, `${post.name}’s verdict`) })
  if (post.isMine && actions.takeDown) menu.push({ label: 'Take it down', danger: true, onSelect: () => void actions.takeDown?.('verdict', post.id) })

  return (
    <article id={`post-verdict-${post.id}`} className={`card overflow-hidden ${highlight ? 'ring-1 ring-brass' : ''}`}>
      <PostHeader
        handle={post.handle}
        name={post.name}
        meta={
          post.isMine
            ? `Your verdict${post.audience === 'friends' ? ` · asked ${post.askedOf.slice(0, 2).join(' and ')}${post.askedOf.length > 2 ? ` +${post.askedOf.length - 2}` : ''}` : post.audience === 'link' ? ' · by link' : ''} · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`
            : `${post.askedMe ? 'asked you' : 'needs a verdict'} · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`
        }
        plate={<Plate>{post.settled ? 'Verdict is in' : 'Verdict'}</Plate>}
        menu={<CardMenu items={menu} />}
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
                <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50">{voting === o.id ? 'Sending…' : o.id.toUpperCase()}</p>
              )}
            </>
          )
          return canVote ? (
            <button
              key={o.id}
              type="button"
              disabled={voting !== null}
              onClick={() => {
                if (chosen) return
                setVoting(o.id)
                void onVote(post.id, o.id).finally(() => setVoting(null))
              }}
              className="press flex-1 text-left disabled:opacity-60"
              aria-label={chosen ? `Your vote: ${o.id.toUpperCase()}` : `Vote ${o.id.toUpperCase()}`}
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
      <p className="mt-3 px-4 text-xs text-ink/50">
        {post.settled
          ? `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} · settled`
          : post.isMine
            ? post.voters.length > 0
              ? `${post.voters.map((v) => `${v.name} (${v.optionId.toUpperCase()})`).slice(0, 4).join(', ')}${post.voters.length > 4 ? ` and ${post.voters.length - 4} more` : ''}${post.totalVotes > post.voters.length ? ` · ${post.totalVotes - post.voters.length} by link` : ''}`
              : `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} so far`
            : post.myVote
              ? 'You weighed in. Tap another to change your mind until it settles.'
              : 'Tap the one they should wear.'}
      </p>

      <CardFoot>
        {!post.isMine && <Reactions target="verdict" post={post} mine={post.reactions.mine} counts={post.reactions.counts} actions={actions} />}
        <NotesButton open={open} count={post.comments} onClick={() => setOpen((v) => !v)} />
      </CardFoot>
      {open && <CommentThread target="verdict" id={post.id} onCount={(n) => actions.commentCount('verdict', post.id, n)} onError={actions.note} />}
    </article>
  )
}

export function PickCard({ post, actions, highlight = false }: { post: PickPost; actions: CardActions; highlight?: boolean }) {
  const navigate = useNavigate()
  const [worn, setWorn] = useState<string | null>(post.wornLogId)
  const [open, setOpen] = useState(false)
  const [thanking, setThanking] = useState(false)
  const [reply, setReply] = useState('')
  const [photo, setPhoto] = useState<string | null>(post.photoUrl)
  const fileRef = useRef<HTMLInputElement>(null)
  const byMe = post.role === 'by_me'
  const menu: { label: string; danger?: boolean; onSelect: () => void }[] = []
  if (post.handle && actions.mute && !byMe) menu.push({ label: `Mute ${post.name} for a while`, onSelect: () => actions.mute?.(post.handle as string) })
  if (actions.report && !byMe) menu.push({ label: 'Report', onSelect: () => actions.report?.('pick', post.id, `${post.name}’s pick`) })
  if (byMe && !post.wornAt && actions.withdraw) menu.push({ label: 'Take it back', danger: true, onSelect: () => void actions.withdraw?.(post.id) })
  if (!byMe)
    menu.push({
      label: 'Dismiss',
      danger: true,
      onSelect: () =>
        void dismissPick(post.id)
          .then(() => actions.gone?.('pick', post.id))
          .catch(() => actions.note('Couldn’t dismiss that. Try again.')),
    })
  const forLine = post.forDay ? ` · for ${post.forDay}` : ''
  const meta = byMe
    ? `you styled a look for ${post.name}${forLine} · ${timeAgo(post.at)}`
    : `styled a look for you${forLine} · ${timeAgo(post.at)}`
  // What's happened since, from either side.
  const state = post.wornAt
    ? byMe
      ? `${post.name} wore it${photo ? '' : '. The photo will land here'}.`
      : 'Worn. They’ll know.'
    : post.thanksAt
      ? byMe
        ? `${post.name} said thanks${post.reply ? `: “${post.reply}”` : '.'}`
        : `You said thanks${post.reply ? `: “${post.reply}”` : '.'}`
      : byMe
        ? 'Waiting for them.'
        : null

  return (
    <article id={`post-pick-${post.id}`} className={`card overflow-hidden ${byMe ? '' : '!border-brass/35 bg-iris-soft/40'} ${highlight ? 'ring-1 ring-brass' : ''}`}>
      <PostHeader handle={post.handle} name={post.name} label={byMe ? `For ${post.name}` : undefined} meta={meta} plate={<Plate>{byMe ? 'Your pick' : 'For you'}</Plate>} menu={<CardMenu items={menu} />} />
      {post.note && <p className="mt-2 px-4 font-display text-sm italic text-ink/70">“{post.note}”</p>}
      <div className="mt-3 flex items-start gap-3 px-4">
        {post.items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.items.slice(0, 5).map((it) => (
              <GarmentThumb key={it.id} item={it} />
            ))}
          </div>
        )}
        {photo && (
          <div className="ml-auto w-24 shrink-0">
            <Arch aspect="aspect-[3/4]" className="arch-photo w-full" bright>
              <img src={resolveImageUrl(photo)} alt={`${post.name} wearing it`} className="relative z-[1] h-full w-full object-cover" />
            </Arch>
          </div>
        )}
      </div>
      {state && <p className="mt-3 px-4 text-xs text-ink/55">{state}</p>}
      {thanking && !byMe && (
        <form
          className="mt-3 flex gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault()
            void actions.thank?.(post.id, reply.trim()).then(() => setThanking(false))
          }}
        >
          <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={280} autoFocus className="field field-sm min-w-0 flex-1" placeholder="A line back (optional)" />
          <button type="submit" className="btn-primary btn-sm shrink-0">
            Send thanks
          </button>
        </form>
      )}
      <CardFoot
        tone="border-brass/20"
        verbs={
          byMe ? undefined : (
            <>
              <button
                type="button"
                disabled={worn !== null || post.items.length === 0}
                onClick={() =>
                  void logWear({ itemIds: post.items.map((i) => i.id), pickId: post.id })
                    .then((r) => setWorn(r.log?.id ?? 'worn'))
                    .catch(() => actions.note('Couldn’t log the wear. Try again.'))
                }
                className={worn ? 'btn-ghost !border-brass/50 btn-sm !text-brass' : 'btn-primary btn-sm'}
              >
                {worn ? 'Worn ✓' : 'I wore it'}
              </button>
              {worn && worn !== 'worn' && !photo && actions.photo && (
                <>
                  <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost btn-sm">
                    Add the photo
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f && worn) void actions.photo?.(post.id, worn, f).then(() => setPhoto(URL.createObjectURL(f)))
                    }}
                  />
                </>
              )}
              {!worn && (
                <button type="button" onClick={() => navigate(`/mirror?items=${post.items.map((i) => i.id).join(',')}`)} className="btn-ghost btn-sm">
                  See it on me
                </button>
              )}
              {!post.thanksAt && !thanking && actions.thank && (
                <button type="button" onClick={() => setThanking(true)} className="btn-quiet btn-quiet-sm">
                  Say thanks
                </button>
              )}
            </>
          )
        }
      >
        {!byMe && <Reactions target="pick" post={post} mine={post.reactions.mine} counts={post.reactions.counts} actions={actions} />}
        <NotesButton open={open} count={post.comments} onClick={() => setOpen((v) => !v)} />
      </CardFoot>
      {open && <CommentThread target="pick" id={post.id} onCount={(n) => actions.commentCount('pick', post.id, n)} onError={actions.note} />}
    </article>
  )
}

/** Sunday's gathering: what the circle did this week, as one card. */
export function WeekCard({ post, onOpen }: { post: WeekPost; onOpen?: (target: PostTarget, id: string) => void }) {
  const from = new Date(post.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const to = new Date(post.to).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return (
    <article id={`post-week-${post.id}`} className="card overflow-hidden !border-brass/40">
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-brass/50 font-display text-base text-brass">7</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Your circle this week</p>
          <p className="text-xs text-ink/45">
            {from} – {to} · {post.looksShared} look{post.looksShared === 1 ? '' : 's'} from {post.people} {post.people === 1 ? 'person' : 'people'}
          </p>
        </div>
        <Plate>The week</Plate>
      </div>
      <div className="mt-3 grid gap-3 px-4 pb-4 sm:grid-cols-2">
        {post.topLook && (
          <button type="button" onClick={() => onOpen?.('look', post.topLook!.id)} className="press flex items-center gap-3 rounded-[3px] border border-ink/10 p-3 text-left hover:border-brass/50">
            <div className="w-16 shrink-0">
              <Arch aspect="aspect-[4/5]" bright className={post.topLook.photoUrl ? 'arch-photo' : ''}>
                {post.topLook.photoUrl ? <img src={resolveImageUrl(post.topLook.photoUrl)} alt="" className="relative z-[1] h-full w-full object-cover" /> : <FlatLay items={post.topLook.items} frameRatio={0.8} />}
              </Arch>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Look of the week</p>
              <p className="mt-1 text-sm text-ink">
                <b className="font-semibold">{post.topLook.name}</b> · {post.topLook.wouldWear} would wear it
              </p>
            </div>
          </button>
        )}
        {post.mostWorn && (
          <div className="flex items-center gap-3 rounded-[3px] border border-ink/10 p-3">
            <GarmentThumb item={post.mostWorn.item} className="w-14 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Most on the table</p>
              <p className="mt-1 text-sm text-ink">
                The <b className="font-semibold">{post.mostWorn.item.subtype ?? post.mostWorn.item.category}</b>, {post.mostWorn.count} times
                {post.mostWorn.by.length > 0 ? ` · ${post.mostWorn.by.join(', ')}` : ''}
              </p>
            </div>
          </div>
        )}
        {post.bestVerdict && (
          <button type="button" onClick={() => onOpen?.('verdict', post.bestVerdict!.id)} className="press rounded-[3px] border border-ink/10 p-3 text-left hover:border-brass/50">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">The verdict of the week</p>
            <p className="mt-1 font-display text-base text-ink">“{post.bestVerdict.question}”</p>
            <p className="mt-1 text-xs text-ink/55">
              {post.bestVerdict.name} asked · {post.bestVerdict.votes} vote{post.bestVerdict.votes === 1 ? '' : 's'} · {post.bestVerdict.winner ? `${post.bestVerdict.winner} won` : 'a split'}
            </p>
          </button>
        )}
        {post.dressed.length > 0 && (
          <div className="rounded-[3px] border border-ink/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Dressed each other</p>
            <ul className="mt-1 space-y-0.5 text-sm text-ink">
              {post.dressed.map((d, i) => (
                <li key={i}>
                  <b className="font-semibold">{d.by}</b> dressed <b className="font-semibold">{d.for}</b>
                  {d.worn ? <span className="text-ink/50"> · worn</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  )
}
