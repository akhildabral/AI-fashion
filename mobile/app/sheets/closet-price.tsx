// Pricing the closet: a quick pass over pieces without a price, so the
// estate value and cost-per-wear can exist. Save as you go; skip anything.
import { useQueryClient } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { currencySymbol } from '@zauq/shared/money'
import type { WardrobeItem, WardrobeListResponse } from '@zauq/shared/types'
import { updateWardrobeItem } from '@zauq/shared/wardrobe'
import { Alert, EmptyState, LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SheetShell } from '@/src/components/Sheet'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { nameOf, title, useInvalidateCloset, useWardrobe } from '@/src/features/closet/data'

/** The 48 arch at 4/5 beside each row. */
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
    <SheetShell title="What did these cost?" lead="A rough number is fine. Prices power your estate value and cost-per-wear; they’re only ever shown to you.">
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      {wardrobe.isPending ? (
        <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.row, i > 0 && [styles.rowRule, rule]]}>
              <SkeletonBlock width={THUMB_W} height={THUMB_H} />
              <View style={styles.grow}>
                <SkeletonBlock width="60%" height={14} />
              </View>
              <SkeletonBlock width={PRICE_W} height={height.secondary} />
              <SkeletonBlock width={64} height={height.secondary} />
            </View>
          ))}
        </View>
      ) : null}
      {wardrobe.isError && !wardrobe.data ? <LoadError onRetry={() => void wardrobe.refetch()} /> : null}
      {wardrobe.data && unpriced.length === 0 ? <EmptyState title="Every piece has a price. Your estate value is on the mantel." /> : null}
      {unpriced.length > 0 ? (
        <View>
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
      {error ? <Alert>{error}</Alert> : null}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // Each row 12 either side on a hairline.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowRule: { borderTopWidth: hairline },
  name: { flex: 1, minWidth: 0, fontFamily: fonts.sansMedium, textTransform: 'capitalize' },
  price: { width: PRICE_W },
})
