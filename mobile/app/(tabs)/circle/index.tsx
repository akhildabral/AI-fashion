// The Circle: a salon where friends dress each other. One ranked column of
// posts under four lenses; a rail of who wore what today; the people behind
// a door; what happened to you behind the bell.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { FlashList } from '@shopify/flash-list'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { getCircleToday, type CirclePost, type ExploreOccasion, type Lens } from '@zauq/shared/circle'
import { followUser, getSocialMe, getStyleTwins } from '@zauq/shared/social'
import { LoadError } from '@/src/components/Bits'
import { RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { Filter, Tabs } from '@/src/components/Tabs'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, space } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { CARD_GAP, IconButton } from '@/src/features/circle/atoms'
import { CardSkeleton, PostCard } from '@/src/features/circle/cards'
import { useCardActions, useFeed, useSocialInvalidate, useUnread, type ExploreOpts } from '@/src/features/circle/hooks'
import { ck, RAIL_DISMISS_KEY } from '@/src/features/circle/keys'
import { EmptyFeed, HandleNudge, SuggestedRail, TodayRail, YouInCircle } from '@/src/features/circle/rails'

const LENSES: { key: Lens; label: string }[] = [
  { key: 'foryou', label: 'For you' },
  { key: 'following', label: 'Following' },
  { key: 'explore', label: 'Explore' },
  { key: 'saved', label: 'Saved' },
]

const OCCASIONS: [ExploreOccasion | null, string][] = [
  [null, 'Everything'],
  ['work', 'Work'],
  ['casual', 'Weekend'],
  ['evening', 'Evening'],
  ['occasion', 'Occasion'],
]

type Row = { kind: 'post'; post: CirclePost } | { kind: 'rail' }

export default function CircleRoom() {
  const { t } = useTheme()
  const flash = useFlash()
  const queryClient = useQueryClient()
  const [lens, setLens] = useState<Lens>('foryou')
  const [explore, setExplore] = useState<ExploreOpts>({ occasion: null, kindred: false })
  const feed = useFeed(lens, explore)
  const me = useQuery({ queryKey: qk.social, queryFn: getSocialMe })
  const twins = useQuery({ queryKey: ck.twins, queryFn: getStyleTwins })
  const today = useQuery({ queryKey: ck.today, queryFn: getCircleToday })
  const unread = useUnread()
  const actions = useCardActions()
  const invalidateSocial = useSocialInvalidate()

  // The suggested rail stays hidden until we know it wasn't dismissed.
  const [railDismissed, setRailDismissed] = useState(true)
  useEffect(() => {
    AsyncStorage.getItem(RAIL_DISMISS_KEY)
      .then((v) => setRailDismissed(v === '1'))
      .catch(() => setRailDismissed(false))
  }, [])
  const dismissRail = () => {
    setRailDismissed(true)
    AsyncStorage.setItem(RAIL_DISMISS_KEY, '1').catch(() => undefined)
  }

  const quickFollow = async (handle: string) => {
    try {
      await followUser(handle)
      queryClient.setQueryData(ck.twins, (d: { twins: { handle: string; isFollowing: boolean }[] } | undefined) =>
        d ? { twins: d.twins.map((x) => (x.handle === handle ? { ...x, isFollowing: true } : x)) } : d,
      )
      haptics.success()
      flash('Following.')
      invalidateSocial()
    } catch {
      haptics.failure()
      flash('Could not follow.')
    }
  }

  const suggested = (twins.data?.twins ?? []).filter((x) => !x.isFollowing)
  const showRail = !railDismissed && suggested.length > 0 && (feed.posts?.length ?? 0) > 0
  const rows = useMemo<Row[]>(() => {
    const posts = feed.posts ?? []
    const out: Row[] = posts.map((post) => ({ kind: 'post', post }))
    if (showRail) out.splice(Math.min(2, out.length), 0, { kind: 'rail' })
    return out
  }, [feed.posts, showRail])

  const onRefresh = () => {
    void feed.refetch()
    void today.refetch()
    void me.refetch()
    void twins.refetch()
    void unread.refetch()
  }

  const openShare = () => router.push('/sheets/circle-share-look')
  const openPeople = (tab: string) => router.push({ pathname: '/(tabs)/circle/people', params: { tab } })
  const openInvite = () => router.push('/sheets/circle-invite')

  // The web's column, top to bottom: the today rail, the compose door, the
  // lenses (`mt-6`), the explore filters (`mt-3`), then the feed (`mt-5`).
  const header = (
    <View style={styles.header}>
      <TodayRail today={today.data?.entries ?? null} onShare={openShare} />
      {me.data && !me.data.handle ? <HandleNudge onPick={() => router.push('/sheets/circle-handle')} /> : null}
      <YouInCircle me={me.data} onInvite={openInvite} onPeople={() => openPeople('following')} />
      <View style={styles.lenses}>
        <Tabs items={LENSES} value={lens} onChange={setLens} />
      </View>
      {lens === 'explore' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRail} contentContainerStyle={styles.filters}>
          {OCCASIONS.map(([k, l]) => (
            <Filter key={l} label={l} on={explore.occasion === k} onPress={() => setExplore((e) => ({ ...e, occasion: k }))} />
          ))}
          <View style={[styles.sep, { backgroundColor: alpha(t.ink, 0.15) }]} />
          <Filter label="Kindred taste" on={explore.kindred} onPress={() => setExplore((e) => ({ ...e, kindred: !e.kindred }))} />
        </ScrollView>
      ) : null}
      {feed.loading && !feed.posts ? (
        <View style={styles.skeleton}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : null}
      {feed.error && !feed.posts ? <LoadError message={feed.error instanceof Error ? feed.error.message : 'Could not load your circle.'} onRetry={() => void feed.refetch()} /> : null}
      {feed.posts && feed.posts.length === 0 ? <EmptyFeed lens={lens} circleSize={feed.circleSize} onFind={() => openPeople('find')} onShare={openShare} onInvite={openInvite} /> : null}
    </View>
  )

  return (
    <Screen edges={['top']}>
      <View style={styles.room}>
        <RoomHeader
          eyebrow="The Circle"
          title="Circle"
          right={
            // Two 36 squares (the web's `btn-icon`), their feet on the title's baseline.
            <View style={styles.headActions}>
              <IconButton icon="add" label="Post to your circle" onPress={() => router.push('/sheets/circle-compose')} />
              <IconButton icon="notifications-none" label="What happened" badge={unread.data?.unread ?? 0} onPress={() => router.push('/(tabs)/circle/notifications')} />
            </View>
          }
        />
      </View>
      <FlashList
        data={rows}
        keyExtractor={(r) => (r.kind === 'post' ? `${r.post.type}-${r.post.id}` : 'rail')}
        getItemType={(r) => (r.kind === 'post' ? r.post.type : 'rail')}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.kind === 'post' ? (
              <PostCard post={item.post} actions={actions} />
            ) : (
              <SuggestedRail people={suggested.slice(0, 6)} onFollow={(h) => void quickFollow(h)} onDismiss={dismissRail} onSeeAll={() => openPeople('suggested')} />
            )}
          </View>
        )}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={header}
        ListFooterComponent={
          <View style={styles.footer}>{feed.fetchingMore ? <ActivityIndicator color={t.brass} /> : null}</View>
        }
        onEndReached={feed.fetchMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={onRefresh} tintColor={t.brass} />}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

/** Between cards: the web's `space-y-3`. */
function Gap() {
  return <View style={{ height: CARD_GAP }} />
}

const styles = StyleSheet.create({
  room: { paddingHorizontal: gutter },
  // The bell and the plus: RoomHeader sets them 4 down; 8 more puts a 36 square's foot on the h1's baseline.
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  header: { gap: 16, paddingBottom: 20 },
  // `mt-6` above the lenses, less the column's own 16
  lenses: { paddingHorizontal: gutter, marginTop: 8 },
  // `mt-3 gap-1`, with the `filter-sep` (`mx-1 h-4 w-px bg-ink/15`)
  filterRail: { marginTop: -4 },
  filters: { flexDirection: 'row', gap: 4, paddingHorizontal: gutter, alignItems: 'center' },
  sep: { width: 1, height: 16, marginHorizontal: 4 },
  // `mt-5` above the feed, less the column's own 16
  skeleton: { marginHorizontal: gutter, gap: CARD_GAP, marginTop: 4 },
  row: { paddingHorizontal: gutter },
  footer: { paddingTop: space.xl, paddingBottom: space.xxxl, alignItems: 'center', minHeight: 48 },
})
