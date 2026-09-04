// Someone's room (UserProfilePage on the web): the mantel, their earned
// standing, what of theirs you already own, then the looks they've shared
// and their public wardrobe under two lenses; and, between friends, the act
// of dressing them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { blockUser, followUser, getOverlap, getProfileByHandle, muteUser, removeFollower, unblockUser, unfollowUser, unmuteUser, type PublicProfile } from '@zauq/shared/social'
import { EmptyState, LoadError, Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { CARD_GAP, GarmentThumb, Initials, Plate } from '@/src/features/circle/atoms'
import { LookCard } from '@/src/features/circle/cards'
import { useCardActions, useSocialInvalidate } from '@/src/features/circle/hooks'
import { ck } from '@/src/features/circle/keys'
import { MoreButton, type MenuItem } from '@/src/components/MenuSheet'

type Lens = 'looks' | 'wardrobe'

/** Two columns of tiles, 12 apart. */
const GRID_GAP = 12

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
  const shown: Lens = lens ?? (profile && profile.looks.length === 0 && profile.publicItems.length > 0 ? 'wardrobe' : 'looks')

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
      ? [{ label: `Unblock ${who}`, onPress: () => safety.mutate('unblock') }]
      : [
          profile.mutedUntil ? { label: 'Unmute', onPress: () => safety.mutate('unmute') } : { label: 'Mute for 30 days', onPress: () => safety.mutate('mute') },
          ...(profile.followsYou ? [{ label: 'Remove as a follower', onPress: () => safety.mutate('remove') }] : []),
          { label: 'Report', onPress: () => router.push({ pathname: '/sheets/circle-report', params: { type: 'user', id: handle, label: who } }) },
          { label: `Block ${who}`, danger: true, onPress: () => safety.mutate('block') },
        ]

  const inner = width - gutter * 2
  const tileW = (inner - GRID_GAP) / 2

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile?.user.name ?? '',
          headerTintColor: t.brass,
          headerStyle: { backgroundColor: t.bone },
          headerTitleStyle: { fontFamily: fonts.serifMedium, fontSize: 20, color: t.ink },
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={t.brass} />} showsVerticalScrollIndicator={false}>
        {!profile && q.isPending ? (
          // Shaped like the room: the mantel, the four plaques, the first tiles.
          <View accessibilityLabel="Loading profile">
            <View style={styles.mantel}>
              <SkeletonBlock width={64} height={64} />
              <View style={styles.mantelText}>
                <SkeletonBlock width={96} height={12} />
                <SkeletonBlock width={200} height={40} />
                <SkeletonBlock width={220} height={14} />
              </View>
            </View>
            <View style={[styles.standing, styles.section]}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonBlock key={i} width={tileW} height={104} />
              ))}
            </View>
            <View style={styles.section}>
              <ArchSkeleton count={2} width={inner} />
            </View>
          </View>
        ) : null}
        {!profile && q.isError ? <LoadError message="Profile not found." onRetry={() => void q.refetch()} /> : null}

        {profile ? (
          <>
            {/* ---- mantel: a 64 square, the eyebrow, the name, the counts ---- */}
            <View style={styles.mantel}>
              <Initials handle={profile.user.handle} name={profile.user.name} size={40} />
              <View style={styles.mantelText}>
                <T role="micro" tone="brass" style={styles.eyebrow}>
                  {profile.isMe ? 'Your room' : profile.isFriend ? 'A friend' : profile.followsYou ? 'Follows you' : 'In the circle'}
                </T>
                <T role="h1" accessibilityRole="header">
                  {profile.user.name}
                </T>
                <T role="bodySm" tone="muted" style={styles.counts}>
                  {`${profile.counts.followers} follower${profile.counts.followers === 1 ? '' : 's'}`}
                  <T role="bodySm" style={{ color: alpha(t.ink, 0.25) }}>
                    {'  ·  '}
                  </T>
                  {`following ${profile.counts.following}`}
                  <T role="bodySm" style={{ color: alpha(t.ink, 0.25) }}>
                    {'  ·  '}
                  </T>
                  {`${profile.counts.publicItems} public piece${profile.counts.publicItems === 1 ? '' : 's'}`}
                </T>
              </View>
            </View>
            {!profile.isMe ? (
              <View style={styles.actions}>
                {!profile.blockedByMe && profile.publicItems.length >= 2 ? <Button label="Style them" variant="ghost" onPress={() => router.push({ pathname: '/sheets/circle-style-friend', params: { handle } })} /> : null}
                {!profile.blockedByMe ? (
                  <Button label={profile.isFollowing ? 'Following' : 'Follow'} variant={profile.isFollowing ? 'ghost' : 'primary'} loading={follow.isPending} onPress={() => follow.mutate(!profile.isFollowing)} accessibilityState={{ selected: profile.isFollowing }} />
                ) : null}
                <View style={styles.spacer} />
                {/* Beside 44 actions the square is 44 too: never 44 and 36 in one row. */}
                <MoreButton items={menu} title={who} tall />
              </View>
            ) : null}

            {profile.blockedByMe ? (
              <View style={[styles.quiet, styles.section]}>
                <T role="lede" align="center">
                  {`You’ve blocked ${who}`}
                </T>
                <T role="bodySm" tone="muted" align="center" style={styles.quietBody}>
                  They can’t see you, you won’t see them, and any follows between you are gone. Undo it from the menu above.
                </T>
              </View>
            ) : (
              <>
                {profile.mutedUntil ? (
                  <T role="caption" tone="faint" style={{ marginTop: space.lg }}>
                    {`Muted${profile.mutedUntil === 'forever' ? '' : ` until ${new Date(profile.mutedUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}. Their posts stay off your table.`}
                  </T>
                ) : null}

                {/* ---- standing: earned, verified, never bought (`mt-8 grid grid-cols-2 gap-3`) ---- */}
                <View style={[styles.standing, styles.section]} accessibilityLabel="Standing">
                  <Standing n={profile.standing.picksWorn} title="A good eye" sub="picks that got worn" width={tileW} />
                  <Standing n={profile.standing.recreated} title="Recreated" sub="looks copied into closets" width={tileW} />
                  <Standing n={profile.standing.wouldWear} title="Would wear" sub="from the circle" width={tileW} />
                  <Standing n={profile.standing.looksShared} title="Looks shared" sub="on the circle" width={tileW} />
                </View>

                {overlap.data && overlap.data.matchedCount > 0 ? (
                  <Plaque style={styles.overlap}>
                    <Plate>From your own closet</Plate>
                    <T role="h3" style={{ marginTop: space.xs }}>
                      {`You could recreate ${overlap.data.matchedCount} of their ${overlap.data.theirCount} public piece${overlap.data.theirCount === 1 ? '' : 's'}.`}
                    </T>
                    <View style={styles.pairs}>
                      {overlap.data.matches.slice(0, 6).map((m) => (
                        <View key={m.theirs.id} style={styles.pair}>
                          <GarmentThumb item={m.theirs} width={48} />
                          <T role="bodySm" style={{ color: alpha(t.ink, 0.35) }}>
                            ≈
                          </T>
                          <GarmentThumb item={m.yours} width={48} />
                        </View>
                      ))}
                    </View>
                  </Plaque>
                ) : null}

                {/* ---- lens (`mt-8`) ---- */}
                <View style={styles.section}>
                  <Tabs<Lens>
                    items={[
                      { key: 'looks', label: 'Looks', count: profile.looks.length },
                      { key: 'wardrobe', label: 'Wardrobe', count: profile.publicItems.length },
                    ]}
                    value={shown}
                    onChange={setLens}
                  />
                </View>

                {/* ---- looks (`mt-5`) ---- */}
                {shown === 'looks' ? (
                  profile.looks.length === 0 ? (
                    <View style={[styles.quiet, styles.lensBody]}>
                      <T role="lede" align="center">
                        Nothing shared yet
                      </T>
                      <T role="bodySm" tone="muted" align="center" style={styles.quietBody}>
                        {profile.isMe ? 'Share a look from the Circle and it hangs here.' : 'When they share a look, it hangs here.'}
                      </T>
                      {profile.isMe ? <Button label="Share a look" style={{ marginTop: space.sm }} onPress={() => router.push('/sheets/circle-share-look')} /> : null}
                    </View>
                  ) : (
                    <View style={[styles.looks, styles.lensBody]}>
                      {profile.looks.map((p) => (
                        <LookCard key={p.id} post={p} actions={actions} />
                      ))}
                    </View>
                  )
                ) : null}

                {/* ---- wardrobe (`mt-5`) ---- */}
                {shown === 'wardrobe' ? (
                  profile.publicItems.length === 0 ? (
                    <EmptyState
                      style={styles.lensBody}
                      title={profile.isMe ? 'Your public wardrobe is empty. Make a piece public from its page in the Closet.' : 'Their public wardrobe is empty.'}
                      action={profile.isMe ? <Button label="Open the Closet" variant="ghost" onPress={() => router.push('/(tabs)/closet')} /> : undefined}
                    />
                  ) : (
                    <View style={[styles.grid, styles.lensBody]}>
                      {profile.publicItems.map((item) => (
                        <GarmentTile key={item.id} imageUrl={item.imageUrl} width={tileW} label={item.subtype ?? item.category} />
                      ))}
                    </View>
                  )
                ) : null}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

/** Earned, verified, never bought: the web's `plaque p-4`, a Bodoni figure, the title in brass, the line beneath. */
function Standing({ n, title, sub, width }: { n: number; title: string; sub: string; width: number }) {
  return (
    <Plaque style={{ ...styles.plaque, width, opacity: n === 0 ? 0.6 : 1 }}>
      <T role="stat" accessibilityLabel={`${n} ${title}, ${sub}`}>
        {String(n)}
      </T>
      <T role="label" tone="brass" style={styles.plaqueTitle}>
        {title}
      </T>
      <T role="caption" tone="faint">
        {sub}
      </T>
    </Plaque>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxxl },
  // The mantel: a 40 square and the name on one baseline, 16 apart.
  mantel: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  mantelText: { flex: 1, gap: space.xs },
  // The eyebrow's .28em, as RoomHeader sets it.
  eyebrow: { letterSpacing: 2.8 },
  counts: { marginTop: 2 },
  // The actions 16 under the mantel, 8 apart.
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  spacer: { flex: 1 },
  // Block to block: 32.
  section: { marginTop: space.xxl },
  // The overlap plaque a group under the standing; the pairs 16 apart, 12 under the line, 6 around the "≈".
  overlap: { marginTop: space.xl, padding: space.ml, paddingLeft: 22 },
  pairs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.md },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // The lens's body 20 under its tabs.
  lensBody: { marginTop: space.ml },
  looks: { gap: CARD_GAP },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  standing: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  plaque: { padding: space.lg, paddingLeft: 18 },
  // The label 8 under the figure.
  plaqueTitle: { marginTop: space.sm },
  // The quiet room: one italic line, its note 8 beneath, 32 of air.
  quiet: { paddingVertical: space.xxl, paddingHorizontal: space.xl, alignItems: 'center', gap: space.sm },
  quietBody: { maxWidth: 300 },
})
