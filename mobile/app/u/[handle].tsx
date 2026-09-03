// Someone's room: the looks they've shared, their public closet, their
// earned standing, what of theirs you already own, and, between friends,
// the act of dressing them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { blockUser, followUser, getOverlap, getProfileByHandle, muteUser, removeFollower, unblockUser, unfollowUser, unmuteUser, type PublicProfile } from '@zauq/shared/social'
import { EmptyState, LoadError, Plaque, Stat } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { gutter } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { Dashed, GarmentThumb, Initials, Plate } from '@/src/features/circle/atoms'
import { LookCard } from '@/src/features/circle/cards'
import { useCardActions, useSocialInvalidate } from '@/src/features/circle/hooks'
import { ck } from '@/src/features/circle/keys'
import { MoreButton, type MenuItem } from '@/src/features/circle/MenuSheet'

type Lens = 'looks' | 'closet' | 'standing'

export default function UserRoom() {
  const { t } = useTheme()
  const flash = useFlash()
  const queryClient = useQueryClient()
  const invalidateSocial = useSocialInvalidate()
  const { width } = useWindowDimensions()
  const { handle = '' } = useLocalSearchParams<{ handle: string }>()
  const key = qk.user(handle)
  const q = useQuery({ queryKey: key, queryFn: () => getProfileByHandle(handle), enabled: !!handle })
  const profile = q.data
  const who = profile?.user.name ?? handle
  const overlap = useQuery({ queryKey: ck.overlap(handle), queryFn: () => getOverlap(handle), enabled: !!profile && !profile.isMe && !profile.blockedByMe && profile.publicItems.length > 0 })
  const [lens, setLens] = useState<Lens | null>(null)
  const actions = useCardActions()
  const shown: Lens = lens ?? (profile && profile.looks.length === 0 && profile.publicItems.length > 0 ? 'closet' : 'looks')

  const follow = useMutation({
    mutationFn: async (next: boolean) => (next ? followUser(handle) : unfollowUser(handle).then(() => ({ ok: true, isFriend: false }))),
    onMutate: (next) => {
      const prev = queryClient.getQueryData<PublicProfile>(key)
      queryClient.setQueryData<PublicProfile>(key, (p) => (p ? { ...p, isFollowing: next, isFriend: next && p.isFriend, counts: { ...p.counts, followers: p.counts.followers + (next ? 1 : -1) } } : p))
      haptics.tap()
      return { prev }
    },
    onSuccess: (r, next) => {
      queryClient.setQueryData<PublicProfile>(key, (p) => (p ? { ...p, isFriend: next ? r.isFriend : false } : p))
      invalidateSocial()
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev)
      haptics.failure()
      flash('Couldn’t update follow. Try again.')
    },
  })

  const safety = useMutation({
    mutationFn: async (action: 'mute' | 'unmute' | 'remove' | 'block' | 'unblock') => {
      if (action === 'mute') await muteUser(handle, 30)
      else if (action === 'unmute') await unmuteUser(handle)
      else if (action === 'remove') await removeFollower(handle)
      else if (action === 'block') await blockUser(handle)
      else await unblockUser(handle)
      return action
    },
    onSuccess: (action) => {
      const lines = {
        mute: `Muted ${who} for 30 days. Their posts leave your table; they won’t know.`,
        unmute: `${who} is back on your table.`,
        remove: `${who} no longer follows you.`,
        block: `Blocked ${who}. Neither of you sees the other now.`,
        unblock: `Unblocked ${who}.`,
      }
      flash(lines[action])
      void q.refetch()
      void queryClient.invalidateQueries({ queryKey: ck.hidden })
      invalidateSocial()
    },
    onError: (err) => flash(err instanceof Error ? err.message : 'That didn’t go through.'),
  })

  const menu: MenuItem[] = !profile || profile.isMe
    ? []
    : profile.blockedByMe
      ? [{ label: `Unblock ${who}`, onSelect: () => safety.mutate('unblock') }]
      : [
          profile.mutedUntil ? { label: 'Unmute', onSelect: () => safety.mutate('unmute') } : { label: 'Mute for 30 days', onSelect: () => safety.mutate('mute') },
          ...(profile.followsYou ? [{ label: 'Remove as a follower', onSelect: () => safety.mutate('remove') }] : []),
          { label: 'Report', onSelect: () => router.push({ pathname: '/sheets/circle-report', params: { type: 'user', id: handle, label: who } }) },
          { label: `Block ${who}`, danger: true, onSelect: () => safety.mutate('block') },
        ]

  const tileW = (width - gutter * 2 - 12) / 2

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile?.user.name ?? '',
          headerTintColor: t.brass,
          headerStyle: { backgroundColor: t.bone },
          headerTitleStyle: { fontFamily: fonts.serif, fontSize: 20, color: t.ink },
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={t.brass} />} showsVerticalScrollIndicator={false}>
        {!profile && q.isPending ? (
          <View style={{ gap: 16 }}>
            <SkeletonBlock width={220} height={40} />
            <SkeletonBlock width={180} height={16} />
            <ArchSkeleton count={2} width={width - gutter * 2} />
          </View>
        ) : null}
        {!profile && q.isError ? <LoadError message="Profile not found." onRetry={() => void q.refetch()} /> : null}

        {profile ? (
          <>
            {/* ---- mantel ---- */}
            <View style={styles.mantel}>
              <Initials handle={profile.user.handle} name={profile.user.name} size={64} />
              <View style={styles.mantelText}>
                <Plate>{profile.isMe ? 'Your room' : profile.isFriend ? 'A friend' : profile.followsYou ? 'Follows you' : 'In the circle'}</Plate>
                <T role="h1" accessibilityRole="header">
                  {profile.user.name}
                </T>
                <T role="caption" tone="muted">
                  {`${profile.counts.followers} follower${profile.counts.followers === 1 ? '' : 's'} · following ${profile.counts.following} · ${profile.counts.publicItems} public piece${profile.counts.publicItems === 1 ? '' : 's'}`}
                </T>
              </View>
            </View>
            {!profile.isMe ? (
              <View style={styles.actions}>
                {!profile.blockedByMe ? (
                  <Button label={profile.isFollowing ? 'Following' : 'Follow'} variant={profile.isFollowing ? 'ghost' : 'primary'} size="sm" loading={follow.isPending} onPress={() => follow.mutate(!profile.isFollowing)} accessibilityState={{ selected: profile.isFollowing }} />
                ) : null}
                {!profile.blockedByMe && profile.publicItems.length >= 2 ? (
                  <Button label="Style them" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/sheets/circle-style-friend', params: { handle } })} />
                ) : null}
                <View style={{ flex: 1 }} />
                <MoreButton items={menu} title={who} />
              </View>
            ) : null}

            {profile.blockedByMe ? (
              <EmptyState title={`You’ve blocked ${who}`} line="They can’t see you, you won’t see them, and any follows between you are gone. Undo it from the menu above." />
            ) : (
              <>
                {profile.mutedUntil ? (
                  <T role="caption" tone="faint">
                    {`Muted${profile.mutedUntil === 'forever' ? '' : ` until ${new Date(profile.mutedUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}. Their posts stay off your table.`}
                  </T>
                ) : null}

                {overlap.data && overlap.data.matchedCount > 0 ? (
                  <Plaque>
                    <Plate>From your own closet</Plate>
                    <T role="h3" style={{ marginTop: 4 }}>
                      {`You could recreate ${overlap.data.matchedCount} of their ${overlap.data.theirCount} public piece${overlap.data.theirCount === 1 ? '' : 's'}.`}
                    </T>
                    <T role="caption" tone="faint">
                      You both own
                    </T>
                    <View style={styles.pairs}>
                      {overlap.data.matches.slice(0, 6).map((m) => (
                        <View key={m.theirs.id} style={styles.pair}>
                          <GarmentThumb item={m.theirs} width={44} />
                          <T role="bodySm" tone="faint">
                            ≈
                          </T>
                          <GarmentThumb item={m.yours} width={44} />
                        </View>
                      ))}
                    </View>
                  </Plaque>
                ) : null}

                <Tabs<Lens>
                  items={[
                    { key: 'looks', label: 'Looks', count: profile.looks.length },
                    { key: 'closet', label: 'Closet', count: profile.publicItems.length },
                    { key: 'standing', label: 'Standing' },
                  ]}
                  value={shown}
                  onChange={setLens}
                />

                {shown === 'looks' ? (
                  profile.looks.length === 0 ? (
                    <Dashed>
                      <T role="h3" align="center">
                        Nothing shared yet
                      </T>
                      <T role="bodySm" tone="muted" align="center">
                        {profile.isMe ? 'Share a look from the Circle and it hangs here.' : 'When they share a look, it hangs here.'}
                      </T>
                      {profile.isMe ? <Button label="Share a look" size="sm" onPress={() => router.push('/sheets/circle-share-look')} /> : null}
                    </Dashed>
                  ) : (
                    <View style={{ gap: 14 }}>
                      {profile.looks.map((p) => (
                        <LookCard key={p.id} post={p} actions={actions} />
                      ))}
                    </View>
                  )
                ) : null}

                {shown === 'closet' ? (
                  profile.publicItems.length === 0 ? (
                    <Dashed>
                      <T role="bodySm" tone="muted" align="center">
                        {profile.isMe ? 'Your public closet is empty. Make a piece public from its page in the Closet.' : 'Their public closet is empty.'}
                      </T>
                      {profile.isMe ? <Button label="Open the Closet" variant="ghost" size="sm" onPress={() => router.push('/(tabs)/closet')} /> : null}
                    </Dashed>
                  ) : (
                    <View style={styles.grid}>
                      {profile.publicItems.map((item) => (
                        <GarmentTile key={item.id} imageUrl={item.imageUrl} width={tileW} label={item.subtype ?? item.category} sublabel={item.primaryColor ?? undefined} />
                      ))}
                    </View>
                  )
                ) : null}

                {shown === 'standing' ? (
                  <View style={styles.standing}>
                    <Standing n={profile.standing.picksWorn} title="A good eye" sub="picks that got worn" />
                    <Standing n={profile.standing.recreated} title="Recreated" sub="looks copied into closets" />
                    <Standing n={profile.standing.wouldWear} title="Would wear" sub="from the circle" />
                    <Standing n={profile.standing.looksShared} title="Looks shared" sub="on the circle" />
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

/** Earned, verified, never bought. */
function Standing({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <Plaque style={{ ...styles.plaque, opacity: n === 0 ? 0.6 : 1 }}>
      <Stat value={n} label={sub} />
      <T role="label" tone="brass">
        {title}
      </T>
    </Plaque>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 48, gap: 16 },
  mantel: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  mantelText: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pairs: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  standing: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  plaque: { width: '47%', flexGrow: 1, gap: 8 },
})
