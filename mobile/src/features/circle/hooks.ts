// The Circle's data: the feed behind each lens, the unread count behind the
// bell, and the one set of verbs every card speaks. Reactions, saves, votes
// and wears are optimistic: the cache changes in the same frame as the
// haptic, and rolls back if the server says no.
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  getCircleExplore,
  getCircleFeed,
  getCircleSaved,
  getPost,
  getUnreadCount,
  reactToPost,
  saveLook,
  settleVerdict,
  unreactToPost,
  unsaveLook,
  unshareLook,
  voteOnVerdict,
  type ExploreOccasion,
  type Lens,
  type LookPost,
  type PickPost,
  type PostItem,
  type PostTarget,
  type ReactionKind,
  type VerdictPost,
} from '@zauq/shared/circle'
import { deletePoll } from '@zauq/shared/polls'
import { dismissPick, muteUser, thankPick, withdrawPick, type ReportTarget } from '@zauq/shared/social'
import { logWear } from '@zauq/shared/wearlog'
import { useFlash } from '@/src/components/Toast'
import { useAuth } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { apiUpload } from '@/src/lib/api'
import { qk } from '@/src/lib/query'
import { imageForm, PermissionDenied, pickImages, type PickSource } from '@/src/lib/upload'
import { applyReaction, dropByHandle, dropPost, dropPostIn, invalidateFeeds, patchPost, restore, snapshot } from './cache'
import { ck } from './keys'
import { postHref } from './notifications'
import { sharePage } from './share'

/* ---------- the feed ---------- */

export interface ExploreOpts {
  occasion: ExploreOccasion | null
  kindred: boolean
}

export function exploreExtra(o: ExploreOpts): string {
  return `${o.occasion ?? 'all'}${o.kindred ? ':kindred' : ''}`
}

export function useFeed(lens: Lens, explore: ExploreOpts) {
  const paged = lens === 'foryou' || lens === 'following'
  const pagedLens = paged ? lens : 'foryou'
  const inf = useInfiniteQuery({
    queryKey: qk.feed(pagedLens),
    queryFn: ({ pageParam }) => getCircleFeed(pagedLens, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: paged,
  })
  const flat = useQuery({
    queryKey: qk.feed(lens, lens === 'explore' ? exploreExtra(explore) : undefined),
    queryFn: () => (lens === 'explore' ? getCircleExplore({ occasion: explore.occasion ?? undefined, kindred: explore.kindred }) : getCircleSaved()),
    enabled: !paged,
  })

  if (paged) {
    return {
      posts: inf.data?.pages.flatMap((p) => p.posts) ?? null,
      circleSize: inf.data?.pages[0]?.circleSize ?? null,
      loading: inf.isPending,
      error: inf.error,
      refetch: inf.refetch,
      refreshing: inf.isRefetching && !inf.isFetchingNextPage,
      hasMore: !!inf.hasNextPage,
      fetchingMore: inf.isFetchingNextPage,
      fetchMore: () => {
        if (inf.hasNextPage && !inf.isFetchingNextPage) void inf.fetchNextPage()
      },
    }
  }
  return {
    posts: flat.data?.posts ?? null,
    circleSize: null,
    loading: flat.isPending,
    error: flat.error,
    refetch: flat.refetch,
    refreshing: flat.isRefetching,
    hasMore: false,
    fetchingMore: false,
    fetchMore: () => undefined,
  }
}

/* ---------- the bell ---------- */

/** The unread count, polled every minute while the screen is in front. */
export function useUnread() {
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )
  return useQuery({
    queryKey: qk.unread,
    queryFn: getUnreadCount,
    refetchInterval: focused ? 60_000 : false,
    refetchIntervalInBackground: false,
  })
}

/* ---------- the grammar ---------- */

/**
 * What a card can ask of the room. One object, passed to every card, so a
 * look, a verdict and a pick behave the same wherever they hang.
 */
export interface CardActions {
  react: (target: PostTarget, id: string, kind: ReactionKind | null) => void
  save: (wearLogId: string, saved: boolean) => void
  /** The post with its notes. */
  open: (target: PostTarget, id: string) => void
  vote: (pollId: string, optionId: string) => Promise<void>
  settle: (pollId: string) => Promise<void>
  takeDown: (target: PostTarget, id: string) => Promise<void>
  mute: (handle: string) => Promise<void>
  report: (target: ReportTarget, id: string, label: string) => void
  recreate: (who: string, items: PostItem[]) => void
  share: (target: 'look' | 'verdict', id: string, title: string) => Promise<void>
  /** Dressing each other. */
  thank: (pickId: string, reply: string) => Promise<void>
  wear: (post: PickPost) => Promise<void>
  photo: (post: PickPost, source: PickSource) => Promise<void>
  withdraw: (pickId: string) => Promise<void>
  dismiss: (pickId: string) => Promise<void>
  note: (msg: string) => void
}

type Reactable = LookPost | VerdictPost | PickPost

export function useCardActions(): CardActions {
  const flash = useFlash()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id

  return useMemo<CardActions>(() => {
    const fail = (err: unknown, fallback: string) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : fallback)
    }

    return {
      react: (target, id, kind) => {
        const snap = snapshot()
        patchPost<Reactable>(target, id, (p) => ({ ...p, reactions: applyReaction(p.reactions, kind) }))
        haptics.tap()
        void (kind ? reactToPost(target, id, kind) : unreactToPost(target, id))
          .then(({ reactions }) => patchPost<Reactable>(target, id, (p) => ({ ...p, reactions })))
          .catch((err) => {
            restore(snap)
            fail(err, 'Could not react to that.')
          })
      },

      save: (id, saved) => {
        const snap = snapshot()
        patchPost<LookPost>('look', id, (p) => ({ ...p, saved, saves: Math.max(0, p.saves + (saved ? 1 : -1)) }))
        haptics.tap()
        void (saved ? saveLook(id) : unsaveLook(id))
          .then(() => {
            if (!saved) dropPostIn(qk.feed('saved'), 'look', id)
            else void queryClient.invalidateQueries({ queryKey: qk.feed('saved') })
            flash(saved ? 'Kept on your board.' : 'Removed from your board.')
          })
          .catch((err) => {
            restore(snap)
            fail(err, 'Could not save that.')
          })
      },

      open: (target, id) => router.push(postHref(target, id)),

      vote: async (pollId, optionId) => {
        if (!userId) return
        const snap = snapshot()
        patchPost<VerdictPost>('verdict', pollId, (p) => ({ ...p, myVote: optionId }))
        haptics.select()
        try {
          await voteOnVerdict(pollId, optionId, userId)
          const { post } = await getPost('verdict', pollId)
          patchPost<VerdictPost>('verdict', pollId, () => post as VerdictPost)
        } catch (err) {
          restore(snap)
          fail(err, 'Could not vote.')
        }
      },

      settle: async (pollId) => {
        try {
          await settleVerdict(pollId)
          const { post } = await getPost('verdict', pollId)
          patchPost<VerdictPost>('verdict', pollId, () => post as VerdictPost)
          haptics.success()
          flash('Settled. Everyone who voted will hear.')
        } catch (err) {
          fail(err, 'Could not settle that.')
        }
      },

      takeDown: async (target, id) => {
        try {
          if (target === 'look') await unshareLook(id)
          else if (target === 'verdict') await deletePoll(id)
          dropPost(target, id)
          void queryClient.invalidateQueries({ queryKey: ck.mine })
          haptics.thud()
          flash(target === 'look' ? 'Taken down.' : 'Verdict withdrawn.')
        } catch (err) {
          fail(err, 'Could not take that down.')
        }
      },

      mute: async (handle) => {
        try {
          await muteUser(handle, 30)
          dropByHandle(handle)
          void queryClient.invalidateQueries({ queryKey: ck.hidden })
          void queryClient.invalidateQueries({ queryKey: qk.user(handle) })
          flash('Muted them for 30 days. Undo it from Your people.')
        } catch (err) {
          fail(err, 'Could not mute them.')
        }
      },

      report: (target, id, label) => {
        router.push({ pathname: '/sheets/circle-report', params: { type: target, id, label } })
      },

      recreate: (who, items) => {
        router.push({ pathname: '/sheets/circle-recreate', params: { items: items.map((i) => i.id).join(','), who } })
      },

      share: async (target, id, title) => {
        const msg = await sharePage(target === 'look' ? `/look/${id}` : `/vote/${id}`, title)
        if (msg) flash(msg)
      },

      thank: async (pickId, reply) => {
        try {
          const r = await thankPick(pickId, reply || undefined)
          patchPost<PickPost>('pick', pickId, (p) => ({ ...p, thanksAt: r.thanksAt, reply: r.reply }))
          haptics.success()
          flash('Sent.')
        } catch (err) {
          fail(err, 'Could not send that.')
        }
      },

      wear: async (post) => {
        if (post.items.length === 0 || post.wornLogId) return
        try {
          const { log } = await logWear({ itemIds: post.items.map((i) => i.id), pickId: post.id })
          patchPost<PickPost>('pick', post.id, (p) => ({ ...p, wornAt: log.wornOn, wornLogId: log.id }))
          void queryClient.invalidateQueries({ queryKey: ['brief'] })
          void queryClient.invalidateQueries({ queryKey: ['journal'] })
          void queryClient.invalidateQueries({ queryKey: qk.insights })
          haptics.success()
          flash('Wearing it. They’ll know.')
        } catch (err) {
          fail(err, 'Couldn’t log the wear. Try again.')
        }
      },

      photo: async (post, source) => {
        const wearLogId = post.wornLogId
        if (!wearLogId) return
        try {
          const [image] = await pickImages(source)
          if (!image) return
          const { photoUrl } = await apiUpload<{ photoUrl: string }>(`/looks/${wearLogId}/photo`, imageForm('photo', image))
          patchPost<PickPost>('pick', post.id, (p) => ({ ...p, photoUrl }))
          haptics.success()
          flash('Photo added. They’ll see it.')
        } catch (err) {
          if (err instanceof PermissionDenied) flash(err.message)
          else fail(err, 'Could not add the photo.')
        }
      },

      withdraw: async (pickId) => {
        try {
          await withdrawPick(pickId)
          dropPost('pick', pickId)
          haptics.thud()
          flash('Taken back.')
        } catch (err) {
          fail(err, 'Could not take that back.')
        }
      },

      dismiss: async (pickId) => {
        try {
          await dismissPick(pickId)
          dropPost('pick', pickId)
        } catch (err) {
          fail(err, 'Couldn’t dismiss that. Try again.')
        }
      },

      note: flash,
    }
  }, [flash, userId, queryClient])
}

/** After anything that changes who you follow: the feeds, the rails and the counts revalidate. */
export function useSocialInvalidate() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    invalidateFeeds()
    void queryClient.invalidateQueries({ queryKey: qk.social })
    void queryClient.invalidateQueries({ queryKey: ck.twins })
    void queryClient.invalidateQueries({ queryKey: ck.network })
    void queryClient.invalidateQueries({ queryKey: ['user'] })
  }, [queryClient])
}
