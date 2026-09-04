// The people in your circle: rows under five lenses, a search, and the
// ways back from a mute or a block.
import { FlashList } from '@shopify/flash-list'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import { followUser, getHidden, getNetwork, getStyleTwins, searchUsers, unblockUser, unfollowUser, unmuteUser, type Hidden, type NetworkEntry } from '@zauq/shared/social'
import { EmptyState } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Tabs, type TabItem } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { gutter, space } from '@/src/design/tokens'
import { useSocialInvalidate } from '@/src/features/circle/hooks'
import { ck } from '@/src/features/circle/keys'
import { PersonRow } from '@/src/features/circle/PersonRow'

type PeopleTab = 'following' | 'followers' | 'suggested' | 'find' | 'hidden'
const TABS: PeopleTab[] = ['following', 'followers', 'suggested', 'find', 'hidden']

interface Row {
  key: string
  handle: string | null
  name: string
  sub?: string
  following?: boolean | null
  dim?: boolean
  right?: ReactNode
}

type Network = { following: NetworkEntry[]; followers: NetworkEntry[] }

export default function PeopleScreen() {
  const { t } = useTheme()
  const flash = useFlash()
  const queryClient = useQueryClient()
  const invalidateSocial = useSocialInvalidate()
  const { tab: initial } = useLocalSearchParams<{ tab?: string }>()
  const [tab, setTab] = useState<PeopleTab>(TABS.includes(initial as PeopleTab) ? (initial as PeopleTab) : 'following')
  const network = useQuery({ queryKey: ck.network, queryFn: getNetwork })
  const twins = useQuery({ queryKey: ck.twins, queryFn: getStyleTwins })
  const hidden = useQuery({ queryKey: ck.hidden, queryFn: getHidden })

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])
  const results = useQuery({ queryKey: ck.search(debounced), queryFn: () => searchUsers(debounced), enabled: debounced.length >= 2 })

  const followingSet = new Set((network.data?.following ?? []).map((u) => u.handle))

  async function toggle(handle: string, name: string) {
    const was = followingSet.has(handle)
    const prev = queryClient.getQueryData<Network>(ck.network)
    queryClient.setQueryData<Network>(ck.network, (n) =>
      n ? { ...n, following: was ? n.following.filter((u) => u.handle !== handle) : [{ handle, name, isFriend: n.followers.some((f) => f.handle === handle) }, ...n.following] } : n,
    )
    haptics.tap()
    try {
      if (was) await unfollowUser(handle)
      else {
        const { isFriend } = await followUser(handle)
        queryClient.setQueryData<Network>(ck.network, (n) => (n ? { ...n, following: n.following.map((u) => (u.handle === handle ? { ...u, isFriend } : u)) } : n))
      }
      queryClient.setQueryData(ck.twins, (d: { twins: { handle: string; isFollowing: boolean }[] } | undefined) =>
        d ? { twins: d.twins.map((x) => (x.handle === handle ? { ...x, isFollowing: !was } : x)) } : d,
      )
      invalidateSocial()
    } catch {
      if (prev) queryClient.setQueryData(ck.network, prev)
      haptics.failure()
      flash('Couldn’t update that. Check your connection and try again.')
    }
  }

  async function unhide(kind: 'mute' | 'block', handle: string | null) {
    if (!handle) return
    try {
      if (kind === 'mute') await unmuteUser(handle)
      else await unblockUser(handle)
      queryClient.setQueryData<Hidden>(ck.hidden, (h) => (h ? { blocked: kind === 'block' ? h.blocked.filter((b) => b.handle !== handle) : h.blocked, muted: kind === 'mute' ? h.muted.filter((m) => m.handle !== handle) : h.muted } : h))
      invalidateSocial()
      flash(kind === 'mute' ? 'They’re back on your table.' : 'Unblocked.')
    } catch {
      flash('Couldn’t update that. Check your connection and try again.')
    }
  }

  const hiddenCount = (hidden.data?.blocked.length ?? 0) + (hidden.data?.muted.length ?? 0)
  const tabs: TabItem<PeopleTab>[] = [
    { key: 'following', label: 'Following', count: network.data?.following.length },
    { key: 'followers', label: 'Followers', count: network.data?.followers.length },
    { key: 'suggested', label: 'Kindred taste', count: twins.data?.twins.length },
    { key: 'find', label: 'Find' },
    ...(hiddenCount > 0 ? [{ key: 'hidden' as const, label: 'Hidden', count: hiddenCount }] : []),
  ]

  let rows: Row[] = []
  let loading = false
  let empty: string | null = null
  let lead: string | null = null
  if (tab === 'following' || tab === 'followers') {
    loading = network.isPending
    const list = tab === 'following' ? (network.data?.following ?? []) : (network.data?.followers ?? [])
    rows = list.map((u) => ({ key: u.handle, handle: u.handle, name: u.name, sub: u.isFriend ? 'Friends, you follow each other' : undefined, following: followingSet.has(u.handle) }))
    if (!loading && rows.length === 0) empty = tab === 'following' ? 'You aren’t following anyone yet.' : 'No followers yet.'
  } else if (tab === 'suggested') {
    loading = twins.isPending
    lead = 'Matched by wardrobe and taste, not follower counts.'
    rows = (twins.data?.twins ?? []).map((x) => ({ key: x.handle, handle: x.handle, name: x.name, sub: x.sharedTaste.length > 0 ? `You both: ${x.sharedTaste.join(' · ')}` : `${x.match}% match`, following: x.isFollowing || followingSet.has(x.handle) }))
    if (!loading && rows.length === 0) empty = 'No matches yet. Take the style quiz and fill your closet.'
  } else if (tab === 'find') {
    loading = debounced.length >= 2 && results.isPending
    rows = (results.data?.users ?? []).map((u) => ({ key: u.handle, handle: u.handle, name: u.name, following: followingSet.has(u.handle) }))
    if (!loading && debounced.length >= 2 && rows.length === 0) empty = 'No one goes by that yet.'
  } else {
    lead = 'People you’ve muted or blocked. They don’t know; you can undo it here.'
    rows = [
      ...(hidden.data?.muted ?? []).map((m) => ({
        key: `m-${m.handle}`,
        handle: m.handle,
        name: m.name,
        dim: true,
        sub: `Muted${m.until ? ` until ${new Date(m.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`,
        right: <Button label="Unmute" variant="ghost" size="sm" onPress={() => void unhide('mute', m.handle)} />,
      })),
      ...(hidden.data?.blocked ?? []).map((b) => ({
        key: `b-${b.handle}`,
        handle: b.handle,
        name: b.name,
        dim: true,
        sub: 'Blocked. Invisible both ways',
        right: <Button label="Unblock" variant="ghost" size="sm" onPress={() => void unhide('block', b.handle)} />,
      })),
    ]
    if (rows.length === 0) empty = 'No one is hidden.'
  }

  const header = (
    <View style={styles.header}>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'find' ? <Field label="Search" value={query} onChangeText={setQuery} placeholder="A name" autoFocus autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Find people by name" /> : null}
      {lead ? (
        <T role="caption" tone="faint" style={styles.lead}>
          {lead}
        </T>
      ) : null}
      {loading ? (
        // Rows shaped like the real ones: a 32 square, a name and a line.
        <View accessibilityState={{ busy: true }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonBlock width={32} height={32} />
              <View style={styles.skeletonText}>
                <SkeletonBlock width={i % 2 ? '52%' : '40%'} height={14} />
                <SkeletonBlock width="64%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {empty ? <EmptyState title={empty} /> : null}
    </View>
  )

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Your people' }} />
      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <PersonRow handle={item.handle} name={item.name} sub={item.sub} following={item.following} dim={item.dim} right={item.right} first={index === 0} onToggle={item.handle && typeof item.following === 'boolean' ? () => toggle(item.handle as string, item.name) : undefined} />
          </View>
        )}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={network.isRefetching || twins.isRefetching}
            onRefresh={() => {
              void network.refetch()
              void twins.refetch()
              void hidden.refetch()
            }}
            tintColor={t.brass}
          />
        }
        contentContainerStyle={{ paddingBottom: space.xxxl }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  // The tabs, then the search and the list 16 beneath.
  header: { paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: space.sm, gap: space.lg },
  // A line under its tabs: 8, label to line.
  lead: { marginTop: -space.sm },
  row: { paddingHorizontal: gutter },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  skeletonText: { flex: 1, gap: 6 },
})
