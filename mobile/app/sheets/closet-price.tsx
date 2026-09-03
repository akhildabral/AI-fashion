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
import { ArchSkeleton } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { nameOf, title, useInvalidateCloset, useWardrobe } from '@/src/features/closet/data'

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
        <T role="bodySm" tone="muted">
          A rough number is fine. Prices power your estate value and cost-per-wear; they’re only ever shown to you.
        </T>
        {wardrobe.isPending ? <ArchSkeleton count={2} width={280} /> : null}
        {wardrobe.isError && !wardrobe.data ? <LoadError onRetry={() => void wardrobe.refetch()} /> : null}
        {wardrobe.data && unpriced.length === 0 ? (
          <View style={[styles.allDone, { borderColor: alpha(t.ink, 0.2), borderRadius: radius }]}>
            <T role="bodySm" tone="muted" align="center">
              Every piece has a price. Your estate value is on the mantel.
            </T>
          </View>
        ) : null}
        {unpriced.map((item, i) => (
          <View key={item.id} style={[styles.row, i > 0 && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }]}>
            <GarmentTile imageUrl={item.imageUrl} width={48} aspect={4 / 5} />
            <T role="bodySm" numberOfLines={1} style={{ flex: 1 }}>
              {title(nameOf(item))}
            </T>
            <View style={{ width: 120 }}>
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
        {error ? (
          <T role="caption" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.xxl, gap: space.md },
  allDone: { borderWidth: hairline, borderStyle: 'dashed', padding: 20, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
})
