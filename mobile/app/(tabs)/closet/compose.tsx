// Compose: build an outfit by hand. The board fills as you tap pieces in
// the rail beneath it; the validator reads it as you go, in words, not a
// number. Keep it, wear it today, or see it on you.
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { EVENT_LABEL, saveOutfit, validateOutfit, type Validation } from '@zauq/shared/outfits'
import type { WardrobeItem } from '@zauq/shared/types'
import { logWear } from '@zauq/shared/wearlog'
import { Arch } from '@/src/components/Arch'
import { EmptyState, LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Chip, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn, rise } from '@/src/design/motion'
import { gutter, space } from '@/src/design/tokens'
import { GRID_GAP, nameOf, tileWidth, title, useInvalidateCloset, useOutfits, useWardrobe } from '@/src/features/closet/data'

type SlotKey = 'outer' | 'top' | 'dress' | 'bottom' | 'shoes' | 'extras'
const SLOTS: { key: SlotKey; label: string; test: (i: WardrobeItem) => boolean }[] = [
  { key: 'top', label: 'Tops', test: (i) => i.category === 'top' || i.layerRole === 'base' || i.layerRole === 'mid' },
  { key: 'bottom', label: 'Bottoms', test: (i) => i.category === 'bottom' },
  { key: 'dress', label: 'Dresses', test: (i) => i.category === 'dress' },
  { key: 'shoes', label: 'Shoes', test: (i) => i.category === 'footwear' },
  { key: 'outer', label: 'Outer', test: (i) => i.category === 'outerwear' || i.layerRole === 'outer' },
  { key: 'extras', label: 'Extras', test: (i) => i.category === 'accessory' || i.category === 'other' },
]
const EVENTS = ['work', 'casual', 'evening', 'occasion']
const SINGULAR = new Set(['bottom', 'footwear', 'dress'])
const isSeparate = (i: WardrobeItem) => i.category === 'top' || i.category === 'bottom'

/** Would adding `a` mean wearing two of something you can't? Then `b` steps out. */
function conflicts(a: WardrobeItem, b: WardrobeItem): boolean {
  if (SINGULAR.has(a.category) && b.category === a.category) return true
  if (a.subtype && b.subtype && a.subtype === b.subtype) return true
  if (a.category === 'dress' && isSeparate(b)) return true
  if (isSeparate(a) && b.category === 'dress') return true
  return false
}

function verdictLine(v: Validation | null, n: number): { text: string; tone: 'faint' | 'ink' | 'danger' } {
  if (n === 0) return { text: 'Tap pieces to start. A top and a bottom, or a dress, is enough.', tone: 'faint' }
  if (!v) return { text: 'Reading it…', tone: 'faint' }
  if (v.violations.length) return { text: v.violations[0].message, tone: 'danger' }
  if (v.warnings.length) return { text: `Holds together. ${v.warnings[0].message}`, tone: 'ink' }
  if (v.pairQuality >= 8) return { text: 'This sings. The pieces were made for each other.', tone: 'ink' }
  if (v.pairQuality >= 6.5) return { text: 'Holds together well.', tone: 'ink' }
  return { text: 'Wearable. The colours are doing more work than the cut.', tone: 'ink' }
}

export default function Compose() {
  const { pin, from } = useLocalSearchParams<{ pin?: string; from?: string }>()
  const { width } = useWindowDimensions()
  const flash = useFlash()
  const invalidate = useInvalidateCloset()
  const wardrobe = useWardrobe()
  const outfits = useOutfits()

  const [chosen, setChosen] = useState<string[]>(() => (pin ? [pin] : []))
  const [slot, setSlot] = useState<SlotKey>('top')
  const [eventType, setEventType] = useState('work')
  const [validation, setValidation] = useState<Validation | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedFrom = useRef<string | null>(null)

  // Composing from a saved outfit: its pieces and its day, once they arrive.
  useEffect(() => {
    if (!from || loadedFrom.current === from) return
    const o = outfits.data?.find((x) => x.id === from)
    if (!o) return
    loadedFrom.current = from
    setChosen(o.itemIds)
    setEventType(o.eventType)
  }, [from, outfits.data])

  const closet = useMemo(() => (wardrobe.data ?? []).filter((i) => i.status === 'ready' && !i.suppressed), [wardrobe.data])
  const byId = useMemo(() => new Map(closet.map((i) => [i.id, i])), [closet])
  const picked = chosen.map((id) => byId.get(id)).filter((i): i is WardrobeItem => !!i)

  // Live validation, a beat after the last tap.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    setValidation(null)
    if (chosen.length === 0) return
    timer.current = setTimeout(() => {
      validateOutfit(chosen, eventType)
        .then((r) => setValidation(r.validation))
        .catch(() => setValidation(null))
    }, 350)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [chosen, eventType])

  function toggle(id: string) {
    haptics.tap()
    setChosen((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id)
      if (c.length >= 8) return c
      const item = byId.get(id)
      if (!item) return [...c, id]
      // One per slot: adding a piece swaps out anything it would double up.
      const kept = c.filter((xid) => {
        const x = byId.get(xid)
        return !x || !conflicts(item, x)
      })
      return [...kept, id]
    })
  }

  async function save() {
    setBusy('save')
    try {
      await saveOutfit({ itemIds: chosen, eventType, provenance: 'user' })
      haptics.success()
      flash('Kept. It lives in your outfits now.')
      invalidate()
      router.navigate('/closet/outfits')
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not keep that.')
    } finally {
      setBusy(null)
    }
  }

  async function wearToday() {
    setBusy('wear')
    try {
      await saveOutfit({ itemIds: chosen, eventType, provenance: 'user' })
      await logWear({ itemIds: chosen, eventType })
      haptics.success()
      flash('Logged for today.')
      invalidate()
      router.navigate('/closet/outfits')
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not log that.')
    } finally {
      setBusy(null)
    }
  }

  const line = verdictLine(validation, chosen.length)
  const current = SLOTS.find((s) => s.key === slot) ?? SLOTS[0]
  const inSlot = closet.filter(current.test)
  const boardW = width - gutter * 2
  const railW = tileWidth(width, gutter, 3)
  const slotItems = SLOTS.map((s) => ({ key: s.key, label: s.label, count: closet.filter(s.test).length })).filter((s) => s.count > 0)

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: 'Compose' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={rise(0)}>
          <RoomHeader eyebrow="Outfits" title="Compose" lead="Tap pieces; the stylist reads it as you go." />
        </Animated.View>

        {/* The board */}
        <Animated.View entering={rise(1)} style={styles.stack}>
          {picked.length > 0 ? (
            <LookBoard items={picked} width={boardW} />
          ) : (
            <Arch width={boardW} aspect={5 / 4} variant="plain">
              <View style={styles.emptyBoard}>
                <T role="lede" tone="faint" align="center">
                  The board is empty.
                </T>
              </View>
            </Arch>
          )}
          <T role="lede" tone={line.tone} accessibilityLiveRegion="polite">
            {line.text}
          </T>
          {picked.length > 0 ? (
            <View style={styles.stackSm}>
              <T role="label" tone="faint">
                In the outfit
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {picked.map((i) => (
                  <GarmentTile key={i.id} imageUrl={i.imageUrl} width={64} label={nameOf(i)} selected accessibilityLabel={`Remove ${nameOf(i)}`} onPress={() => toggle(i.id)} />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={styles.stackSm}>
            <T role="label" tone="faint">
              For
            </T>
            <View style={styles.chips}>
              {EVENTS.map((e) => (
                <Chip key={e} label={EVENT_LABEL[e]} on={eventType === e} onPress={() => setEventType(e)} />
              ))}
            </View>
          </View>
          {chosen.length >= 2 ? <Button label="See it on me" variant="quiet" onPress={() => router.push(`/(tabs)/mirror?items=${chosen.join(',')}`)} /> : null}
        </Animated.View>

        {/* The rail */}
        <Animated.View entering={rise(2)} style={styles.stack}>
          {wardrobe.isPending ? <ArchSkeleton count={6} width={boardW} columns={3} /> : null}
          {wardrobe.isError && !wardrobe.data ? <LoadError message="Couldn’t load your closet. Check your connection." onRetry={() => void wardrobe.refetch()} /> : null}
          {wardrobe.data && closet.length === 0 ? (
            <EmptyState title="Your closet is empty." line="Add a few pieces first, then style them by hand here." action={<Button label="Add pieces" variant="ghost" onPress={() => router.push('/sheets/closet-add')} />} />
          ) : null}
          {closet.length > 0 ? (
            <>
              <Tabs<SlotKey> value={slotItems.some((s) => s.key === slot) ? slot : (slotItems[0]?.key ?? slot)} items={slotItems} onChange={setSlot} />
              <Animated.View key={slot} entering={fadeIn} style={styles.grid}>
                {inSlot.map((i) => {
                  const on = chosen.includes(i.id)
                  const dirty = i.state !== 'clean'
                  return (
                    <GarmentTile
                      key={i.id}
                      imageUrl={i.imageUrl}
                      width={railW}
                      label={title(nameOf(i))}
                      sublabel={dirty ? (i.state === 'in-wash' ? 'in the wash' : i.state) : undefined}
                      selected={on}
                      accessibilityLabel={`${title(nameOf(i))}${dirty ? `, ${i.state}` : ''}`}
                      onPress={() => toggle(i.id)}
                    />
                  )
                })}
                {inSlot.length === 0 ? (
                  <T role="bodySm" tone="muted">
                    Nothing of this kind in the closet yet.
                  </T>
                ) : null}
              </Animated.View>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <ActionBar>
        <Button label="Keep it" block style={{ flex: 1 }} loading={busy === 'save'} disabled={chosen.length < 2 || busy !== null || !validation?.ok} onPress={() => void save()} />
        <Button label="Wearing it today" variant="ghost" loading={busy === 'wear'} disabled={chosen.length < 2 || busy !== null} onPress={() => void wearToday()} />
      </ActionBar>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.sm, gap: space.xl },
  stack: { gap: space.md },
  stackSm: { gap: 8 },
  emptyBoard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  rail: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingTop: 4 },
})
