// The basket: what's out of rotation and why. The stylist never proposes a
// piece that's here; a swipe, or one tap, brings it back.
import { router, Stack } from 'expo-router'
import { useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated from 'react-native-reanimated'
import type { WardrobeItem } from '@zauq/shared/types'
import { basketClean, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { Arch } from '@/src/components/Arch'
import { EmptyState, LoadError, Plaque, SectionHead } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { daysAgo, nameOf, title, useBasket, useInvalidateCloset } from '@/src/features/closet/data'
import { RoomTabs } from '@/src/features/closet/RoomTabs'

type BasketState = 'in-wash' | 'packed' | 'lent-out'
const STATE_LABEL: Record<BasketState, string> = { 'in-wash': 'In the wash', packed: 'Packed', 'lent-out': 'Lent out' }
const BACK_LABEL: Record<BasketState, string> = { 'in-wash': 'Back from the wash', packed: 'Unpacked', 'lent-out': 'Returned' }

/** A basket row: swipe left to bring it back, or tap the word. */
function Row({ item, state, busy, onBack }: { item: WardrobeItem; state: BasketState; busy: boolean; onBack: () => void }) {
  const { t } = useTheme()
  const ref = useRef<SwipeableMethods | null>(null)
  const sub = state === 'in-wash' ? `after ${item.wearsSinceWash ?? 1} wear${(item.wearsSinceWash ?? 1) === 1 ? '' : 's'}` : STATE_LABEL[state]
  return (
    <Animated.View exiting={fadeOut}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1.6}
        rightThreshold={72}
        overshootRight={false}
        enabled={!busy}
        onSwipeableOpen={(direction) => {
          if (direction !== 'right') return
          haptics.tap()
          onBack()
          ref.current?.close()
        }}
        renderRightActions={() => (
          <View style={[styles.swipeAction, { backgroundColor: t.brass, borderRadius: radius }]}>
            <T role="label" tone="onBrass">
              {BACK_LABEL[state]}
            </T>
          </View>
        )}
        containerStyle={styles.swipe}
      >
        <View style={[styles.row, { backgroundColor: t.bone, borderBottomColor: alpha(t.ink, 0.1) }]}>
          <GarmentTile imageUrl={item.imageUrl} width={64} accessibilityLabel={title(nameOf(item))} onPress={() => router.push(`/closet/piece/${item.id}`)} />
          <View style={styles.rowText}>
            <T role="body" numberOfLines={1}>
              {title(nameOf(item))}
            </T>
            <T role="caption" tone="faint" numberOfLines={1}>
              {sub}
            </T>
          </View>
          <Button label={BACK_LABEL[state]} variant="ghost" size="sm" loading={busy} onPress={onBack} />
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  )
}

export default function BasketRoom() {
  const { t } = useTheme()
  const flash = useFlash()
  const invalidate = useInvalidateCloset()
  const basket = useBasket()
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function back(item: WardrobeItem) {
    setBusy(item.id)
    try {
      await updateWardrobeItem(item.id, { state: 'clean' })
      flash(`The ${nameOf(item)} is back in rotation.`)
      invalidate(item.id)
      await basket.refetch()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not bring it back.')
    } finally {
      setBusy(null)
    }
  }

  async function allClean() {
    setBusy('all')
    try {
      const { count } = await basketClean()
      haptics.success()
      flash(count === 1 ? 'One piece back from the wash.' : `${count} pieces back from the wash.`)
      invalidate()
      await basket.refetch()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not fold the load.')
    } finally {
      setBusy(null)
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    await basket.refetch().catch(() => undefined)
    setRefreshing(false)
  }

  const data = basket.data
  const groups = (['in-wash', 'packed', 'lent-out'] as const).map((s) => ({ state: s, items: data?.items.filter((i) => i.state === s) ?? [] })).filter((g) => g.items.length > 0)
  const inWash = data?.counts.inWash ?? 0

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: 'The basket' }} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.brass} />}
        contentContainerStyle={[styles.content, { paddingBottom: (inWash > 0 ? ACTION_BAR_HEIGHT : 0) + space.xl }]}
      >
        <Animated.View entering={rise(0)}>
          <RoomHeader eyebrow="The collection" title="The basket" lead={data ? `${data.items.length} out of rotation · last wash ${daysAgo(data.lastWashedAt)}` : undefined} />
        </Animated.View>
        <Animated.View entering={rise(1)}>
          <RoomTabs current="basket" />
        </Animated.View>

        {basket.isPending ? <ArchSkeleton count={4} width={280} /> : null}
        {basket.isError && !data ? <LoadError message="Couldn’t open the basket. Check your connection and try again." onRetry={() => void basket.refetch()} /> : null}

        {data ? (
          <>
            <Animated.View entering={rise(2)}>
              <Plaque style={styles.plaque}>
                <T role="label" tone="faint">
                  Laundry
                </T>
                <T role="lede">
                  {inWash === 0 ? 'Nothing in the wash. Everything is yours to wear.' : data.worthALoad ? `${inWash} pieces in the wash. Worth a load.` : `${inWash} in the wash. A load is worth it at ${data.loadWorth}.`}
                </T>
                {data.oneMoreWear.length > 0 ? (
                  <T role="bodySm" tone="muted">
                    One more wear and {data.oneMoreWear.length === 1 ? `the ${nameOf(data.oneMoreWear[0])} joins` : `${data.oneMoreWear.length} more pieces join`} it.
                  </T>
                ) : null}
              </Plaque>
            </Animated.View>

            {groups.length === 0 ? (
              <Animated.View entering={rise(3)} style={styles.empty}>
                <Arch width={140} variant="plain">
                  <View style={styles.emptyArch}>
                    <T role="micro" tone="faint">
                      Empty
                    </T>
                  </View>
                </Arch>
                <EmptyState title="The basket fills itself." line="Log a wear, and pieces come here when they’ve had their turn." />
              </Animated.View>
            ) : null}

            {groups.map((g, gi) => (
              <Animated.View key={g.state} entering={rise(3 + gi)} style={styles.group}>
                <SectionHead
                  title={STATE_LABEL[g.state]}
                  action={
                    <T role="caption" tone="faint">
                      {g.items.length}
                    </T>
                  }
                />
                <T role="caption" tone="faint">
                  Swipe a row left to bring it back.
                </T>
                <View style={[styles.rows, { borderTopColor: alpha(t.ink, 0.1) }]}>
                  {g.items.map((it) => (
                    <Row key={it.id} item={it} state={g.state} busy={busy === it.id} onBack={() => void back(it)} />
                  ))}
                </View>
              </Animated.View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {inWash > 0 ? (
        <ActionBar>
          <Button label={busy === 'all' ? 'Folding…' : 'Everything’s back from the wash'} block loading={busy === 'all'} disabled={busy !== null} onPress={() => void allClean()} />
        </ActionBar>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.sm, gap: space.lg },
  plaque: { padding: 16, paddingLeft: 22, gap: 6 },
  empty: { alignItems: 'center', gap: space.sm, paddingTop: space.md },
  emptyArch: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  group: { gap: 8, paddingTop: space.sm },
  rows: { borderTopWidth: hairline, marginTop: 4 },
  swipe: { overflow: 'hidden' },
  swipeAction: { width: 140, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: hairline },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  label: { fontFamily: fonts.sansSemi },
})
