// Wishlist: pieces you don't own yet, each carrying its verdict. Ranked by
// what each one unlocks, not by when you added it.
import { router, Stack } from 'expo-router'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { money } from '@zauq/shared/money'
import { deleteWardrobeItem, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { EmptyState, LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { labelOf, nameOf, title, useInvalidateCloset, useWishlist, type WishItem } from '@/src/features/closet/data'
import { RoomTabs } from '@/src/features/closet/RoomTabs'
import { UndoBar, useUndoDelete } from '@/src/features/closet/UndoBar'

function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function WishlistRoom() {
  const { t } = useTheme()
  const flash = useFlash()
  const invalidate = useInvalidateCloset()
  const wishlist = useWishlist()
  const [busy, setBusy] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)

  async function bought(it: WishItem) {
    setBusy(it.id)
    try {
      await updateWardrobeItem(it.id, { owned: true })
      haptics.success()
      flash(`In the closet. The ${nameOf(it)} is a piece now.`)
      invalidate(it.id)
      await wishlist.refetch()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not move it in.')
    } finally {
      setBusy(null)
    }
  }

  const undo = useUndoDelete<WishItem>({
    commit: useCallback(
      async (it: WishItem) => {
        await deleteWardrobeItem(it.id)
        invalidate(it.id)
      },
      [invalidate],
    ),
    onHide: useCallback((it: WishItem) => setHidden((h) => new Set(h).add(it.id)), []),
    onRestore: useCallback((it: WishItem) => {
      setHidden((h) => {
        const next = new Set(h)
        next.delete(it.id)
        return next
      })
    }, []),
    onFail: useCallback(() => flash('Couldn’t let it go. Try again.'), [flash]),
  })

  const refresh = async () => {
    setRefreshing(true)
    await wishlist.refetch().catch(() => undefined)
    setRefreshing(false)
  }

  const items = wishlist.data ? wishlist.data.filter((i) => !hidden.has(i.id)) : null
  const total = (items ?? []).reduce((s, i) => s + (i.seenPrice ?? 0), 0)
  const card = { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: 'Wishlist' }} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.brass} />}
        contentContainerStyle={[styles.content, { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]}
      >
        <Animated.View entering={rise(0)}>
          <RoomHeader
            eyebrow="The collection"
            title="Wishlist"
            lead={items ? `${items.length} piece${items.length === 1 ? '' : 's'} in mind${total > 0 ? ` · ${money(total)} if you bought them all` : ''}` : undefined}
          />
        </Animated.View>
        <Animated.View entering={rise(1)}>
          <RoomTabs current="wishlist" />
        </Animated.View>

        {wishlist.isError && !items ? <LoadError message="Couldn’t load your wishlist. Check your connection and try again." onRetry={() => void wishlist.refetch()} /> : null}

        {wishlist.isPending ? (
          <View style={styles.list} accessibilityLabel="Loading" aria-busy>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.card, card]}>
                <SkeletonBlock width={96} height={115} />
                <View style={styles.cardText}>
                  <SkeletonBlock width="75%" height={20} />
                  <SkeletonBlock width="50%" height={14} />
                  <SkeletonBlock width={96} height={32} style={{ marginTop: 'auto' }} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {items && items.length === 0 ? (
          <Animated.View entering={rise(2)}>
            <EmptyState
              title="Nothing in mind yet."
              line="Next time you’re holding something in a shop, point the camera at it. The closet says how many outfits it makes before you pay for it, and “keep in mind” lands here."
            />
          </Animated.View>
        ) : null}

        {items && items.length > 0 ? (
          <Animated.View entering={rise(2)} style={styles.list}>
            {items.map((it) => {
              const v = it.verdict
              const label = labelOf(it)
              return (
                <View key={it.id} style={[styles.card, card]}>
                  <GarmentTile imageUrl={it.imageUrl} width={96} processing={it.status === 'processing'} accessibilityLabel={`${title(label)}, the verdict`} onPress={() => router.push(`/closet/store?item=${it.id}`)} />
                  <View style={styles.cardText}>
                    <T role="h3">{title(label)}</T>
                    {v ? (
                      <T role="bodySm" tone="muted">
                        <T role="bodySm" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                          {v.outfits} outfit{v.outfits === 1 ? '' : 's'}
                        </T>{' '}
                        · pairs with {v.pairs}
                      </T>
                    ) : (
                      <T role="bodySm" tone="faint">
                        {it.status === 'processing' ? 'still developing' : 'verdict pending'}
                      </T>
                    )}
                    <T role="caption" tone="faint">
                      {it.seenAt ? `Seen ${when(it.seenAt)}` : 'Seen'}
                      {it.store ? ` at ${it.store}` : ''}
                      {it.seenPrice != null ? ` · ${money(it.seenPrice)}` : ''}
                    </T>
                    {it.nudgeAt ? (
                      <T role="caption" tone="faint">
                        Nudge on {new Date(it.nudgeAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </T>
                    ) : null}
                    <View style={styles.actions}>
                      <Button label="Bought it" variant="ghost" size="sm" loading={busy === it.id} disabled={busy !== null} onPress={() => void bought(it)} />
                      <Button label="The verdict" variant="quiet" size="sm" onPress={() => router.push(`/closet/store?item=${it.id}`)} />
                      <Button label="Let it go" variant="quiet" size="sm" disabled={busy === it.id} onPress={() => undo.remove(it, `${title(nameOf(it))} let go.`)} />
                    </View>
                  </View>
                </View>
              )
            })}
          </Animated.View>
        ) : null}
      </ScrollView>

      <ActionBar>
        <Button label="Point at a piece" block onPress={() => router.push('/closet/store')} />
      </ActionBar>
      {undo.pending ? <UndoBar message={undo.pending.message} onUndo={undo.undo} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.sm, gap: space.lg },
  list: { gap: space.md, paddingTop: space.sm },
  card: { flexDirection: 'row', gap: 14, padding: 14, borderWidth: 1 },
  cardText: { flex: 1, gap: 4, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
})
