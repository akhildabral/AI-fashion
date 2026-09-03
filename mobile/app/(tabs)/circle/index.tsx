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
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { Filter, Tabs } from '@/src/components/Tabs'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { gutter } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { IconButton } from '@/src/features/circle/atoms'
import { PostCard, useCardWidth } from '@/src/features/circle/cards'
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
  const cardWidth = useCardWidth()
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

  const header = (
    <View style={styles.header}>
      <TodayRail today={today.data?.entries ?? null} onShare={openShare} />
      {me.data && !me.data.handle ? <HandleNudge onPick={() => router.push('/sheets/circle-handle')} /> : null}
      <YouInCircle me={me.data} onInvite={openInvite} onPeople={() => openPeople('following')} />
      <View style={styles.lenses}>
        <Tabs items={LENSES} value={lens} onChange={setLens} />
      </View>
      {lens === 'explore' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {OCCASIONS.map(([k, l]) => (
            <Filter key={l} label={l} on={explore.occasion === k} onPress={() => setExplore((e) => ({ ...e, occasion: k }))} />
          ))}
          <View style={styles.sep} />
          <Filter label="Kindred taste" on={explore.kindred} onPress={() => setExplore((e) => ({ ...e, kindred: !e.kindred }))} />
        </ScrollView>
      ) : null}
      {feed.loading && !feed.posts ? (
        <View style={styles.skeleton}>
          <SkeletonBlock width={160} height={36} />
          <ArchSkeleton count={1} width={cardWidth} columns={1} />
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
            <>
              <IconButton icon="add" label="Post to your circle" onPress={() => router.push('/sheets/circle-compose')} />
              <IconButton icon="notifications-none" label="What happened" badge={unread.data?.unread ?? 0} onPress={() => router.push('/(tabs)/circle/notifications')} />
            </>
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

function Gap() {
  return <View style={{ height: 14 }} />
}

const styles = StyleSheet.create({
  room: { paddingHorizontal: gutter },
  header: { gap: 14, paddingBottom: 14 },
  lenses: { paddingHorizontal: gutter },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: gutter, alignItems: 'center' },
  sep: { width: 1, height: 20, marginHorizontal: 4, backgroundColor: 'rgba(128,128,128,0.25)' },
  skeleton: { marginHorizontal: gutter, gap: 12 },
  row: { paddingHorizontal: gutter },
  footer: { paddingVertical: 24, alignItems: 'center', minHeight: 48 },
})
