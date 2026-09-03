// Patching posts wherever they are cached: the feeds (paged and flat), the
// today rail, a single post, and the looks on someone's room. Every
// optimistic update goes through here, so a reaction on a card in the feed
// is the same reaction on the post screen and on the profile.
import type { CirclePost, PostTarget, ReactionKind, ReactionSummary } from '@zauq/shared/circle'
import { queryClient } from '@/src/lib/query'

/** Return the post to keep (patched or not), or null to drop it. */
type PostFn = (p: CirclePost) => CirclePost | null

const POST_KEY_ROOTS = ['feed', 'post', 'user']

function mapList(list: unknown[], fn: PostFn): unknown[] {
  const out: unknown[] = []
  for (const p of list) {
    if (p && typeof p === 'object' && 'type' in p && 'id' in p) {
      const r = fn(p as CirclePost)
      if (r) out.push(r)
    } else out.push(p)
  }
  return out
}

function transform(data: unknown, fn: PostFn): unknown {
  if (!data || typeof data !== 'object') return data
  const d = data as Record<string, unknown>
  if (Array.isArray(d.pages)) return { ...d, pages: d.pages.map((page) => transform(page, fn)) }
  if (Array.isArray(d.posts)) return { ...d, posts: mapList(d.posts, fn) }
  if (Array.isArray(d.entries)) return { ...d, entries: mapList(d.entries, fn) }
  if (Array.isArray(d.looks)) return { ...d, looks: mapList(d.looks, fn) }
  if (d.post && typeof d.post === 'object') {
    const r = fn(d.post as CirclePost)
    return r ? { ...d, post: r } : d
  }
  return data
}

function applyEverywhere(fn: PostFn) {
  for (const root of POST_KEY_ROOTS) {
    queryClient.setQueriesData({ queryKey: [root] }, (data: unknown) => transform(data, fn))
  }
}

/** Patch one post in every cache that holds it. */
export function patchPost<P extends CirclePost>(target: P['type'], id: string, fn: (p: P) => P) {
  applyEverywhere((p) => (p.type === target && p.id === id ? fn(p as P) : p))
}

/** Remove one post from every list (a single post cache keeps it). */
export function dropPost(target: PostTarget | 'week', id: string) {
  applyEverywhere((p) => (p.type === target && p.id === id ? null : p))
}

/** Remove one post from one cache only (a look unsaved leaves the Saved lens, nothing else). */
export function dropPostIn(queryKey: readonly unknown[], target: PostTarget, id: string) {
  queryClient.setQueriesData({ queryKey }, (data: unknown) => transform(data, (p) => (p.type === target && p.id === id ? null : p)))
}

/** Remove everything by one author (a mute or a block). */
export function dropByHandle(handle: string) {
  applyEverywhere((p) => (p.type !== 'week' && p.handle === handle ? null : p))
}

export type Snapshot = [readonly unknown[], unknown][]

/** Every post-holding cache as it stands, for a rollback. */
export function snapshot(): Snapshot {
  return queryClient.getQueriesData({ predicate: (q) => POST_KEY_ROOTS.includes(String(q.queryKey[0])) })
}

export function restore(snap: Snapshot) {
  for (const [key, data] of snap) queryClient.setQueryData(key, data)
}

/** The reaction summary after you react (or unreact), before the server answers. */
export function applyReaction(r: ReactionSummary, next: ReactionKind | null): ReactionSummary {
  const counts = { ...r.counts }
  let total = r.total
  if (r.mine) {
    counts[r.mine] = Math.max(0, (counts[r.mine] ?? 0) - 1)
    total = Math.max(0, total - 1)
  }
  if (next) {
    counts[next] = (counts[next] ?? 0) + 1
    total += 1
  }
  return { ...r, counts, total, mine: next }
}

/** Every feed revalidates; the screens keep showing what they have meanwhile. */
export function invalidateFeeds() {
  void queryClient.invalidateQueries({ queryKey: ['feed'] })
}
