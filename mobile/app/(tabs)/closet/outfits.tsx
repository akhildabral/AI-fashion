// The Outfits room: every look the closet can make. Suggested by the engine
// for the day you name, kept by you, worn and counted. Composing by hand has
// its own screen; this is where the results live.
import { router, Stack } from 'expo-router'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { deleteOutfit, EVENT_LABEL, saveOutfit, suggestOutfits, type Outfit, type Suggested } from '@zauq/shared/outfits'
import type { WardrobeItem } from '@zauq/shared/types'
import { logWear } from '@zauq/shared/wearlog'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { LookBoard } from '@/src/components/LookBoard'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { nameOf, useInvalidateCloset, useOutfits } from '@/src/features/closet/data'
import { RoomTabs } from '@/src/features/closet/RoomTabs'
import { shareCard } from '@/src/features/closet/share'
import { UndoBar, useUndoDelete } from '@/src/features/closet/UndoBar'

const OCCASIONS: { key: string; label: string; ask: string }[] = [
  { key: 'work', label: 'Work', ask: 'a normal working day' },
  { key: 'casual', label: 'Weekend', ask: 'an easy weekend day out' },
  { key: 'evening', label: 'Evening', ask: 'dinner out this evening' },
  { key: 'occasion', label: 'Occasion', ask: 'a special occasion' },
]

/** The board's aspect inside every card (the web's LookBoard, 5/4). */
const BOARD_ASPECT = 5 / 4

const names = (items: WardrobeItem[]) => items.map(nameOf).join(' · ')

function Provenance({ o }: { o: Outfit }) {
  const worn = o.wearCount > 0 ? `worn ${o.wearCount}×` : null
  const by = o.provenance === 'user' ? 'composed by you' : o.provenance === 'copied' ? 'from a friend' : 'from the stylist'
  return (
    <T role="micro" tone="faint">
      {EVENT_LABEL[o.eventType] ?? o.eventType} · {by}
      {worn ? ` · ${worn}` : ''}
    </T>
  )
}

export default function OutfitsRoom() {
  const { t } = useTheme()
  const { width } = useWindowDimensions()
  const flash = useFlash()
  const invalidate = useInvalidateCloset()
  const outfits = useOutfits()

  const [occasion, setOccasion] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<Suggested[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)

  // The card's p-4 either side of the board.
  const boardW = width - gutter * 2 - space.lg * 2
  const card = { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }

  async function ask(key: string) {
    const occ = OCCASIONS.find((o) => o.key === key)
    if (!occ) return
    setOccasion(key)
    setAsking(true)
    setSuggested(null)
    try {
      const r = await suggestOutfits({ occasion: occ.ask, eventType: key })
      setSuggested(r.outfits)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'The stylist could not compose right now.')
      setSuggested([])
    } finally {
      setAsking(false)
    }
  }

  async function keep(s: Suggested) {
    const key = `keep:${s.items.map((i) => i.id).join(',')}`
    setBusy(key)
    try {
      await saveOutfit({ itemIds: s.items.map((i) => i.id), rationale: s.rationale, eventType: occasion ?? 'work', provenance: 'ai' })
      haptics.success()
      flash('Kept. It’s in your outfits now.')
      invalidate()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not keep that.')
    } finally {
      setBusy(null)
    }
  }

  async function wear(o: { id?: string; items: WardrobeItem[]; eventType?: string }) {
    const key = `wear:${o.id ?? o.items.map((i) => i.id).join(',')}`
    setBusy(key)
    try {
      await logWear(o.id ? { outfitId: o.id } : { itemIds: o.items.map((i) => i.id), eventType: o.eventType })
      haptics.success()
      flash('Logged for today. Anything worn past its turn is in the basket.')
      invalidate()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not log that.')
    } finally {
      setBusy(null)
    }
  }

  const undo = useUndoDelete<Outfit>({
    commit: useCallback(
      async (o: Outfit) => {
        await deleteOutfit(o.id)
        invalidate()
      },
      [invalidate],
    ),
    onHide: useCallback((o: Outfit) => setHidden((h) => new Set(h).add(o.id)), []),
    onRestore: useCallback((o: Outfit) => {
      setHidden((h) => {
        const next = new Set(h)
        next.delete(o.id)
        return next
      })
    }, []),
    onFail: useCallback(() => flash('Couldn’t let it go. Try again.'), [flash]),
  })

  const refresh = async () => {
    setRefreshing(true)
    await outfits.refetch().catch(() => undefined)
    setRefreshing(false)
  }

  const list = (outfits.data ?? []).filter((o) => !hidden.has(o.id))
  const count = list.length

  /** A card the shape of a kept outfit, while they load. */
  const cardSkeleton = (i: number) => (
    <View key={i} style={[styles.card, card]}>
      <SkeletonBlock height={Math.round(boardW / BOARD_ASPECT)} />
      <SkeletonBlock width="85%" height={18} style={styles.cardBlock} />
      <SkeletonBlock width="50%" height={12} style={styles.cardLine} />
    </View>
  )

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: 'Outfits' }} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.brass} />}
        contentContainerStyle={[styles.content, { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]}
      >
        <Animated.View entering={rise(0)}>
          <RoomHeader eyebrow="The collection" title="Outfits" lead={outfits.data ? `${count} outfit${count === 1 ? '' : 's'} the closet has made` : undefined} />
        </Animated.View>
        <Animated.View entering={rise(1)} style={styles.rooms}>
          <RoomTabs current="outfits" />
        </Animated.View>

        {/* Suggested: name the day, the engine composes from what's clean */}
        <Animated.View entering={rise(2)} style={styles.suggested}>
          <T role="micro" tone="faint" style={styles.eyebrow}>
            Suggested
          </T>
          <T role="h2" accessibilityRole="header" style={styles.headline}>
            What would you{' '}
            <T role="h2" tone="brass" italic>
              wear for…
            </T>
          </T>
          <View style={styles.chips}>
            {OCCASIONS.map((o) => (
              <Chip key={o.key} label={o.label} on={occasion === o.key} onPress={() => (asking ? undefined : void ask(o.key))} />
            ))}
          </View>
          {asking ? (
            <View style={styles.after}>
              <T role="bodySm" tone="muted">
                composing from what’s clean…
              </T>
              <View style={styles.cardBlock}>{cardSkeleton(0)}</View>
            </View>
          ) : null}
          {suggested && suggested.length === 0 && !asking ? (
            <T role="lede" tone="muted" style={styles.after}>
              Nothing held together for that. Try another day, or add a piece.
            </T>
          ) : null}
          {suggested && suggested.length > 0 ? (
            <View style={[styles.after, styles.cards]}>
              {suggested.map((s) => {
                const key = s.items.map((i) => i.id).join(',')
                return (
                  <Animated.View key={key} entering={fadeIn} style={[styles.card, card]}>
                    <LookBoard items={s.items} width={boardW} />
                    <T role="lede" style={styles.cardBlock}>
                      {s.rationale}
                    </T>
                    <T role="caption" tone="faint" style={styles.cardLine}>
                      {names(s.items)}
                    </T>
                    {s.validation.warnings.length > 0 ? (
                      <T role="caption" tone="faint" style={styles.cardLine}>
                        {s.validation.warnings[0].message}
                      </T>
                    ) : null}
                    <View style={styles.actions}>
                      <Button label="Keep" variant="ghost" size="sm" loading={busy === `keep:${key}`} disabled={busy !== null} onPress={() => void keep(s)} />
                      <Button label="Wearing it today" variant="quiet" size="sm" loading={busy === `wear:${key}`} disabled={busy !== null} onPress={() => void wear({ items: s.items, eventType: occasion ?? undefined })} />
                    </View>
                  </Animated.View>
                )
              })}
            </View>
          ) : null}
        </Animated.View>

        {/* Yours */}
        <Animated.View entering={rise(3)} style={styles.yours}>
          <T role="micro" tone="faint" style={styles.eyebrow}>
            Yours
          </T>
          <T role="h2" accessibilityRole="header" style={styles.headline}>
            Kept and worn
          </T>
          {outfits.isPending ? (
            <View style={[styles.after, styles.cards]} accessibilityLabel="Loading" aria-busy>
              {[0, 1, 2].map(cardSkeleton)}
            </View>
          ) : null}
          {outfits.isError && !outfits.data ? <LoadError message="Couldn’t load your outfits. Check your connection and try again." onRetry={() => void outfits.refetch()} /> : null}
          {outfits.data && list.length === 0 ? (
            <View style={styles.after}>
              <T role="lede" tone="muted" style={styles.emptyLine}>
                Nothing kept yet. Wear a brief, keep a suggestion, or compose one by hand, and it lives here.
              </T>
              <Button label="Compose the first" variant="ghost" style={styles.emptyAction} onPress={() => router.push('/closet/compose')} />
            </View>
          ) : null}
          {list.length > 0 ? (
            <View style={[styles.after, styles.cards]}>
              {list.map((o) => (
                <View key={o.id} style={[styles.card, card]}>
                  <LookBoard items={o.items} width={boardW} />
                  <View style={styles.cardBlock}>
                    <Provenance o={o} />
                    {o.rationale ? (
                      <T role="lede" style={styles.cardLine}>
                        {o.rationale}
                      </T>
                    ) : null}
                    <T role="caption" tone="faint" style={styles.cardLine}>
                      {names(o.items)}
                    </T>
                  </View>
                  <View style={styles.actions}>
                    <Button label="Wearing it today" variant="ghost" size="sm" loading={busy === `wear:${o.id}`} disabled={busy !== null} onPress={() => void wear(o)} />
                    <Button label="See it on me" variant="quiet" size="sm" onPress={() => router.push(`/(tabs)/mirror?items=${o.itemIds.join(',')}`)} />
                    <Button label="Ask the circle" variant="quiet" size="sm" onPress={() => router.push('/sheets/circle-ask')} />
                    <Button
                      label="Share"
                      variant="quiet"
                      size="sm"
                      onPress={() => {
                        shareCard('outfit', o.id, 'An outfit from my closet').catch((err) => flash(err instanceof Error ? err.message : 'Could not prepare the card.'))
                      }}
                    />
                    <Button label="Adjust" variant="quiet" size="sm" onPress={() => router.push(`/closet/compose?from=${o.id}`)} />
                    <Button label="Let it go" variant="quiet" size="sm" onPress={() => undo.remove(o, 'Outfit let go.')} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <ActionBar>
        <Button label="Style by hand" block onPress={() => router.push('/closet/compose')} />
      </ActionBar>
      {undo.pending ? <UndoBar message={undo.pending.message} onUndo={undo.undo} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.sm },
  // The mantel's pb-7 above the rooms' hairline; the title carries 16 already.
  rooms: { paddingTop: space.md },
  // mt-8 and mt-12 for the two sections
  suggested: { paddingTop: space.xxl },
  yours: { paddingTop: 48 },
  // text-[10px] tracking-[0.2em]
  eyebrow: { letterSpacing: 2 },
  headline: { marginTop: space.xs },
  // mt-4 flex-wrap gap-2
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  // mt-6 for whatever follows the chips or the head
  after: { marginTop: space.xl },
  // grid gap-5
  cards: { gap: 20 },
  card: { padding: space.lg, borderWidth: hairline },
  cardBlock: { marginTop: space.md },
  cardLine: { marginTop: space.xs },
  // action-row mt-3 gap-x-4 gap-y-2
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.lg, rowGap: space.sm, marginTop: space.md },
  emptyLine: { maxWidth: 512 },
  emptyAction: { marginTop: space.lg },
})
