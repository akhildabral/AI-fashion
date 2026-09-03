// Query keys the Circle adds beyond `qk`. Feed-shaped caches (anything that
// holds posts) sit under `['feed', …]` so one patch reaches them all.
import { qk } from '@/src/lib/query'

export const ck = {
  /** Who wore what today: the rail above the feed. */
  today: qk.feed('today'),
  twins: ['social', 'twins'] as const,
  network: ['social', 'network'] as const,
  hidden: ['social', 'hidden'] as const,
  search: (q: string) => ['social', 'search', q] as const,
  /** Your recent wears, for sharing and asking. */
  mine: ['circle', 'mine'] as const,
  invite: ['invite'] as const,
  overlap: (handle: string) => ['user', handle, 'overlap'] as const,
  comments: (target: string, id: string) => ['comments', target, id] as const,
  dress: (handle: string, anchor?: string | null) => ['dress', handle, anchor ?? ''] as const,
  recreate: (ids: string) => ['recreate', ids] as const,
}

/** The web's key, kept so a dismissed rail stays dismissed across the two apps' idea of "me". */
export const RAIL_DISMISS_KEY = 'circle-suggested-dismissed'
