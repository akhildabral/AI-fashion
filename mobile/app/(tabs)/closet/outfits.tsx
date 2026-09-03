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
import { EmptyState, LoadError, SectionHead } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { LookBoard } from '@/src/components/LookBoard'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, space } from '@/src/design/tokens'
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

  const boardW = width - gutter * 2 - 32
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
        <Animated.View entering={rise(1)}>
          <RoomTabs current="outfits" />
        </Animated.View>

        {/* Suggested: name the day, the engine composes from what's clean */}
        <Animated.View entering={rise(2)} style={styles.section}>
          <View style={styles.headline}>
            <T role="label" tone="faint">
              Suggested
            </T>
            <T role="h2" accessibilityRole="header">
              What would you{' '}
              <T role="h2" tone="brass" italic>
                wear for…
              </T>
            </T>
          </View>
          <View style={styles.chips}>
            {OCCASIONS.map((o) => (
              <Chip key={o.key} label={o.label} on={occasion === o.key} onPress={() => (asking ? undefined : void ask(o.key))} />
            ))}
          </View>
          {asking ? (
            <View style={styles.stack}>
              <T role="bodySm" tone="muted">
                composing from what’s clean…
              </T>
              <ArchSkeleton count={1} width={boardW} columns={1} />
            </View>
          ) : null}
          {suggested && suggested.length === 0 && !asking ? <T role="lede" tone="muted">Nothing held together for that. Try another day, or add a piece.</T> : null}
          {suggested && suggested.length > 0
            ? suggested.map((s) => {
                const key = s.items.map((i) => i.id).join(',')
                return (
                  <Animated.View key={key} entering={fadeIn} style={[styles.card, card]}>
                    <LookBoard items={s.items} width={boardW} />
                    <T role="lede">{s.rationale}</T>
                    <T role="caption" tone="muted">
                      {names(s.items)}
                    </T>
                    {s.validation.warnings.length > 0 ? (
                      <T role="caption" tone="faint">
                        {s.validation.warnings[0].message}
                      </T>
                    ) : null}
                    <View style={styles.actions}>
                      <Button label="Keep" variant="ghost" size="sm" loading={busy === `keep:${key}`} disabled={busy !== null} onPress={() => void keep(s)} />
                      <Button label="Wearing it today" variant="quiet" size="sm" loading={busy === `wear:${key}`} disabled={busy !== null} onPress={() => void wear({ items: s.items, eventType: occasion ?? undefined })} />
                    </View>
                  </Animated.View>
                )
              })
            : null}
        </Animated.View>

        {/* Yours */}
        <Animated.View entering={rise(3)} style={styles.section}>
          <View style={styles.headline}>
            <T role="label" tone="faint">
              Yours
            </T>
            <SectionHead title="Kept and worn" />
          </View>
          {outfits.isPending ? <ArchSkeleton count={2} width={boardW} columns={1} /> : null}
          {outfits.isError && !outfits.data ? <LoadError message="Couldn’t load your outfits. Check your connection and try again." onRetry={() => void outfits.refetch()} /> : null}
          {outfits.data && list.length === 0 ? (
            <EmptyState title="Nothing kept yet." line="Wear a brief, keep a suggestion, or compose one by hand, and it lives here." action={<Button label="Compose the first" variant="ghost" onPress={() => router.push('/closet/compose')} />} />
          ) : null}
          {list.map((o) => (
            <View key={o.id} style={[styles.card, card]}>
              <LookBoard items={o.items} width={boardW} />
              <View style={{ gap: 4 }}>
                <Provenance o={o} />
                {o.rationale ? <T role="lede">{o.rationale}</T> : null}
                <T role="caption" tone="muted">
                  {names(o.items)}
                </T>
              </View>
              <View style={styles.actions}>
                <Button label="Wearing it today" variant="ghost" size="sm" loading={busy === `wear:${o.id}`} disabled={busy !== null} onPress={() => void wear(o)} />
                <Button label="See it on me" variant="quiet" size="sm" onPress={() => router.push(`/(tabs)/mirror?items=${o.itemIds.join(',')}`)} />
                <Button label="Adjust" variant="quiet" size="sm" onPress={() => router.push(`/closet/compose?from=${o.id}`)} />
                <Button
                  label="Share"
                  variant="quiet"
                  size="sm"
                  onPress={() => {
                    shareCard('outfit', o.id, 'An outfit from my closet').catch((err) => flash(err instanceof Error ? err.message : 'Could not prepare the card.'))
                  }}
                />
                <Button label="Let it go" variant="quiet" size="sm" onPress={() => undo.remove(o, 'Outfit let go.')} />
              </View>
            </View>
          ))}
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
  content: { paddingHorizontal: gutter, paddingTop: space.sm, gap: space.lg },
  section: { gap: space.md, paddingTop: space.md },
  headline: { gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stack: { gap: space.md },
  card: { padding: 16, gap: 10, borderWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
})
