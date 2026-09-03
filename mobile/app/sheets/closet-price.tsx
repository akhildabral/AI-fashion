// Pricing the closet: a quick pass over pieces without a price, so the
// estate value and cost-per-wear can exist. Save as you go; skip anything.
import { useQueryClient } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { currencySymbol } from '@zauq/shared/money'
import type { WardrobeItem, WardrobeListResponse } from '@zauq/shared/types'
import { updateWardrobeItem } from '@zauq/shared/wardrobe'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, height, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { nameOf, title, useInvalidateCloset, useWardrobe } from '@/src/features/closet/data'

/** The web's w-12 arch at 4/5 beside each row. */
const THUMB_W = 48
const THUMB_H = Math.round(THUMB_W / (4 / 5))
const PRICE_W = 120

export default function PriceSheet() {
  const { t } = useTheme()
  const qc = useQueryClient()
  const invalidate = useInvalidateCloset()
  const wardrobe = useWardrobe()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(() => new Set())

  const unpriced = (wardrobe.data ?? []).filter((i) => i.price == null && !done.has(i.id))
  const rule = { borderTopColor: alpha(t.ink, 0.1) }

  async function save(item: WardrobeItem) {
    const raw = (drafts[item.id] ?? '').trim()
    const price = Number(raw)
    if (!raw || Number.isNaN(price) || price < 0) return
    setBusy(item.id)
    setError(null)
    try {
      await updateWardrobeItem(item.id, { price })
      haptics.tap()
      qc.setQueryData<WardrobeListResponse>(qk.wardrobe, (prev) => (prev ? { ...prev, items: prev.items.map((it) => (it.id === item.id ? { ...it, price } : it)) } : prev))
      setDone((d) => new Set(d).add(item.id))
      setDrafts((d) => {
        const next = { ...d }
        delete next[item.id]
        return next
      })
      invalidate(item.id)
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not save that price.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <T role="h2" accessibilityRole="header">
          What did these cost?
        </T>
        <T role="bodySm" tone="muted" style={styles.intro}>
          A rough number is fine. Prices power your estate value and cost-per-wear; they’re only ever shown to you.
        </T>
        {wardrobe.isPending ? (
          <View style={styles.list} accessibilityLabel="Loading" aria-busy>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.row, i > 0 && [styles.rowRule, rule]]}>
                <SkeletonBlock width={THUMB_W} height={THUMB_H} />
                <View style={{ flex: 1 }}>
                  <SkeletonBlock width="60%" height={14} />
                </View>
                <SkeletonBlock width={PRICE_W} height={height.secondary} />
                <SkeletonBlock width={64} height={height.secondary} />
              </View>
            ))}
          </View>
        ) : null}
        {wardrobe.isError && !wardrobe.data ? <LoadError onRetry={() => void wardrobe.refetch()} /> : null}
        {wardrobe.data && unpriced.length === 0 ? (
          <View style={[styles.allDone, { borderColor: alpha(t.ink, 0.2), borderRadius: radius }]}>
            <T role="bodySm" tone="muted" align="center">
              Every piece has a price. Your estate value is on the mantel.
            </T>
          </View>
        ) : null}
        {unpriced.length > 0 ? (
          <View style={styles.list}>
            {unpriced.map((item, i) => (
              <View key={item.id} style={[styles.row, i > 0 && [styles.rowRule, rule]]}>
                <GarmentTile imageUrl={item.imageUrl} width={THUMB_W} aspect={4 / 5} />
                <T role="bodySm" numberOfLines={1} style={styles.name}>
                  {title(nameOf(item))}
                </T>
                <View style={styles.price}>
                  <Field
                    compact
                    value={drafts[item.id] ?? ''}
                    onChangeText={(s) => setDrafts((d) => ({ ...d, [item.id]: s.replace(/[^\d.]/g, '') }))}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    placeholder={`${currencySymbol()} 0`}
                    onSubmitEditing={() => void save(item)}
                    accessibilityLabel={`Price for ${nameOf(item)}`}
                  />
                </View>
                <Button label="Save" size="sm" loading={busy === item.id} disabled={busy !== null || !(drafts[item.id] ?? '').trim()} onPress={() => void save(item)} />
              </View>
            ))}
          </View>
        ) : null}
        {error ? (
          <T role="caption" tone="danger" style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.xxl },
  intro: { marginTop: space.md },
  // ul mt-4; each li gap-3 py-3 border-t (not the first)
  list: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowRule: { borderTopWidth: hairline },
  // text-sm font-medium capitalize
  name: { flex: 1, minWidth: 0, fontFamily: fonts.sansMedium },
  price: { width: PRICE_W },
  // mt-6 border-dashed p-5
  allDone: { borderWidth: hairline, borderStyle: 'dashed', padding: 20, marginTop: space.xl },
  error: { marginTop: space.md },
})
