import { useEffect, useMemo, useState } from 'react'
import { Alert, Arch, ArchSkeleton, Chip, EmptyState, Modal, RowSkeleton } from './ui'
import { Initials } from './PeopleDrawer'
import { FlatLay } from './CircleCards'
import { resolveImageUrl } from '../lib/api'
import { dressSuggest, getNetwork, sendPick, type DressSuggestion, type NetworkEntry } from '@zauq/shared/social'

// Dressing a friend, as a flow: who → which day → their pieces, with the
// stylist pairing alongside → a note → send. Their closet stays theirs: only
// what they've made public is here.

const MAX = 8

const DAYS: { key: string; label: string }[] = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
  { key: 'work', label: 'A work day' },
  { key: 'occasion', label: 'An occasion' },
]

export function StyleFriendModal({
  open,
  onClose,
  onSent,
  onNote,
  initialHandle,
}: {
  open: boolean
  onClose: () => void
  onSent: () => void
  onNote: (msg: string) => void
  /** Open straight on someone's closet (from their room). */
  initialHandle?: string | null
}) {
  const [people, setPeople] = useState<NetworkEntry[] | null>(null)
  const [friend, setFriend] = useState<NetworkEntry | null>(null)
  const [day, setDay] = useState<string>('saturday')
  const [occasion, setOccasion] = useState('')
  const [closet, setCloset] = useState<DressSuggestion | null>(null)
  const [closetError, setClosetError] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [pairs, setPairs] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setFriend(null)
    setDay('saturday')
    setOccasion('')
    setCloset(null)
    setClosetError(null)
    setAnchor(null)
    setPairs({})
    setSelected([])
    setNote('')
    void getNetwork()
      .then((n) => {
        setPeople(n.following)
        if (initialHandle) {
          const f = n.following.find((p) => p.handle === initialHandle) ?? n.followers.find((p) => p.handle === initialHandle)
          if (f) setFriend(f)
          else setFriend({ handle: initialHandle, name: initialHandle, isFriend: true })
        }
      })
      .catch(() => setPeople([]))
  }, [open, initialHandle])

  // Their closet, with the stylist's suggestions; re-asked when an anchor is chosen.
  useEffect(() => {
    if (!friend) return
    let cancelled = false
    setClosetError(null)
    dressSuggest(friend.handle, anchor ?? undefined)
      .then((d) => {
        if (cancelled) return
        setCloset(d)
        const m: Record<string, number> = {}
        for (const p of d.pairs) m[p.id] = p.score
        setPairs(m)
      })
      .catch((err) => !cancelled && setClosetError(err instanceof Error ? err.message : 'Could not open their closet.'))
    return () => {
      cancelled = true
    }
  }, [friend, anchor])

  const byId = useMemo(() => new Map((closet?.pieces ?? []).map((p) => [p.id, p])), [closet])
  const chosenItems = selected.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]))
    if (!selected.includes(id)) setAnchor(id)
  }

  const forDay = day === 'occasion' ? occasion.trim() || 'an occasion' : (DAYS.find((d) => d.key === day)?.label ?? day)

  async function send() {
    if (!friend || selected.length < 2 || sending) return
    setSending(true)
    try {
      await sendPick(friend.handle, { itemIds: selected, note: note.trim() || undefined, forDay })
      onNote(`Sent to ${friend.name}. They’ll see it on their table.`)
      onSent()
      onClose()
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  const title = friend ? `Dress ${friend.name}` : 'Style a friend'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {/* 1 · who */}
      {!friend && (
        <>
          <p className="text-sm text-ink/60">Friends you follow each other with, and anyone who came in on your invite.</p>
          {people === null && (
            <RowSkeleton className="mt-3" lines={1} label="Loading your people" />
          )}
          {people && people.length === 0 && <EmptyState className="mt-4" line="Follow a few people first; they’ll appear here." />}
          {people && people.length > 0 && (
            <div className="mt-3">
              {people.map((p) => (
                <button key={p.handle} type="button" onClick={() => setFriend(p)} className="press flex w-full items-center gap-3 border-t border-ink/10 py-3 text-left first:border-t-0">
                  <Initials handle={p.handle} name={p.name} className="h-8 w-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block truncate text-xs text-ink/50">{p.isFriend ? 'Friends, you follow each other' : 'You follow them'}</span>
                  </span>
                  <span className="text-xs font-semibold text-brass">Dress →</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {friend && (
        <>
          {/* 2 · which day: a chip picks a value, brass when chosen */}
          <p className="eyebrow">For</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <Chip key={d.key} on={day === d.key} onClick={() => setDay(d.key)}>
                {d.label}
              </Chip>
            ))}
          </div>
          {day === 'occasion' && (
            <div className="mt-4 max-w-xs">
              <label htmlFor="style-occasion" className="label">
                The occasion
              </label>
              <input id="style-occasion" value={occasion} onChange={(e) => setOccasion(e.target.value)} maxLength={40} className="field field-sm" placeholder="a wedding, a dinner…" autoFocus />
            </div>
          )}

          {/* 3 · their pieces, the stylist alongside */}
          <div className="mt-8 flex items-baseline justify-between gap-3">
            <p className="eyebrow">Their public closet</p>
            <p className="text-xs text-ink/45 [font-variant-numeric:tabular-nums]">{selected.length}/{MAX} chosen</p>
          </div>
          {closetError && <Alert className="mt-3">{closetError}</Alert>}
          {!closet && !closetError && <ArchSkeleton count={8} aspect="aspect-[4/5]" className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" />}
          {closet && closet.pieces.length < 2 && <EmptyState className="mt-3" line="They haven’t made enough pieces public yet." />}
          {closet && closet.pieces.length >= 2 && (
            <>
              {anchor && byId.get(anchor) && (
                <p className="mt-2 text-xs text-ink/55">
                  The stylist says the <b className="text-ink">{byId.get(anchor)?.subtype ?? byId.get(anchor)?.category}</b> goes with {closet.pairs.length} of their pieces. They’re lit.
                </p>
              )}
              <div className="mt-3 grid max-h-[34vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
                {closet.pieces.map((p) => {
                  const idx = selected.indexOf(p.id)
                  const lit = anchor !== null && anchor !== p.id && pairs[p.id] !== undefined
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={idx >= 0} className={`press relative text-left ${anchor && !lit && idx < 0 && anchor !== p.id ? 'opacity-50' : ''}`} aria-label={`${idx >= 0 ? 'Remove' : 'Choose'} ${p.subtype ?? p.category}`}>
                      <Arch aspect="aspect-[4/5]" bright={idx >= 0 || lit}>
                        <img src={resolveImageUrl(p.imageUrl)} alt={p.subtype ?? p.category} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                      </Arch>
                      {idx >= 0 && <span className="absolute right-1 top-1 z-[3] flex h-5 w-5 items-center justify-center rounded-[3px] bg-iris text-[10px] font-semibold text-on-brass">{idx + 1}</span>}
                      <p className="mt-1 truncate text-center text-[10px] font-semibold uppercase tracking-label-xs text-ink/55">{p.subtype ?? p.category}</p>
                    </button>
                  )
                })}
              </div>
              {closet.outfits.length > 0 && (
                <>
                  <p className="mt-4 eyebrow">The stylist suggests</p>
                  <div className="mt-2 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {closet.outfits.map((o, i) => {
                      const items = o.itemIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
                      const same = selected.length === o.itemIds.length && o.itemIds.every((id) => selected.includes(id))
                      return (
                        <button key={i} type="button" onClick={() => setSelected([...o.itemIds])} aria-pressed={same} className="press w-24 shrink-0 text-left">
                          <Arch aspect="aspect-[4/5]" bright={same}>
                            <FlatLay items={items} frameRatio={0.8} />
                          </Arch>
                          <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-label-xs text-ink/55">{items.length} pieces</p>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* 4 · the look and the note */}
          {chosenItems.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <div className="w-20 shrink-0">
                <Arch aspect="aspect-[4/5]">
                  <FlatLay items={chosenItems} frameRatio={0.8} />
                </Arch>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink/55">
                  For <b className="text-ink">{forDay}</b> · {chosenItems.map((i) => i.subtype ?? i.category).join(', ')}
                </p>
                <label htmlFor="style-note" className="label mt-3">
                  A note, optional
                </label>
                <input id="style-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} className="field field-sm" placeholder="Why this works" />
              </div>
            </div>
          )}

          {selected.length < 2 && (
            <p className="mt-5 text-xs text-ink/50">Pick at least two pieces to send a look.</p>
          )}
          <div className={`action-row ${selected.length < 2 ? 'mt-2' : 'mt-5'}`}>
            <button type="button" disabled={selected.length < 2 || sending} onClick={() => void send()} className="btn-primary disabled:opacity-40">
              {sending ? 'Sending…' : `Send it to ${friend.name}`}
            </button>
            {!initialHandle && (
              <button type="button" onClick={() => setFriend(null)} className="btn-quiet">
                Someone else
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-quiet">
              Cancel
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
