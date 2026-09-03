// Reconsider one piece of today's look: swap it for another from the closet,
// or tell the stylist what's off so it learns. TodayPage.tsx's reconsider
// modal: the piece 80 wide beside one line, the labels 8 above their chips,
// the note on the soft brass wash at 16 / 12, the alternatives three across.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import { getBriefAlternatives, swapBriefItem, todayKey, type BriefItem, type BriefResponse } from '@zauq/shared/brief'
import type { FeedbackSignal } from '@zauq/shared/types'
import { sendItemFeedback } from '@zauq/shared/wardrobe'
import { EmptyState } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { FEEDBACK, itemLabel } from '@/src/features/today/copy'
import { tk } from '@/src/features/today/keys'
import { SheetShell } from '@/src/features/today/SheetShell'
import { looksOf, useBrief, useInvalidateDay } from '@/src/features/today/useToday'
import { qk } from '@/src/lib/query'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export default function ReconsiderSheet() {
  const { t } = useTheme()
  const params = useLocalSearchParams<{ date?: string; itemId?: string }>()
  const date = typeof params.date === 'string' && DAY_KEY.test(params.date) ? params.date : todayKey()
  const itemId = typeof params.itemId === 'string' ? params.itemId : ''
  const isToday = date === todayKey()
  const flash = useFlash()
  const qc = useQueryClient()
  const invalidate = useInvalidateDay()
  const W = useWindowDimensions().width - gutter * 2
  const tile = (W - 24) / 3

  const brief = useBrief(date, { peek: !isToday })
  const main = looksOf(brief.data)[0]
  const item = main?.items.find((i) => i.id === itemId) ?? brief.data?.brief?.items.find((i) => i.id === itemId) ?? null
  const exclude = main?.itemIds ?? []
  const [note, setNote] = useState<string | null>(null)

  const alternatives = useQuery({
    queryKey: tk.alternatives(item?.category ?? '', exclude),
    queryFn: () => getBriefAlternatives(item?.category ?? '', exclude),
    enabled: !!item && isToday,
    staleTime: 60_000,
  })

  const feedback = useMutation({
    mutationFn: (signal: FeedbackSignal) => sendItemFeedback(itemId, signal),
    onSuccess: ({ adjusted }, signal) => {
      const spec = FEEDBACK.find((f) => f.signal === signal)
      haptics.tap()
      if (signal === 'dont-suggest') {
        void invalidate(date)
        void qc.invalidateQueries({ queryKey: qk.wardrobe })
        router.back()
        flash(spec?.done ?? 'Off the rail.')
        return
      }
      setNote(adjusted ? (spec?.done ?? 'Noted.') : 'That’s already how you set it. It stays.')
    },
    onError: () => {
      haptics.failure()
      setNote('Couldn’t note that. Try again.')
    },
  })

  const swap = useMutation({
    mutationFn: (alt: BriefItem) => swapBriefItem(itemId, alt.id),
    onSuccess: (res, alt) => {
      qc.setQueryData<BriefResponse>(qk.brief(date), (d) =>
        d
          ? {
              ...d,
              brief: res.brief,
              looks: d.looks?.map((l, i) => (i === 0 ? { ...l, items: res.brief.items, itemIds: res.brief.itemIds, rationale: res.brief.rationale } : l)),
            }
          : d,
      )
      void qc.invalidateQueries({ queryKey: tk.weekAll })
      haptics.success()
      router.back()
      flash(`Swapped in the ${itemLabel(alt)}.`)
    },
    onError: (err) => {
      haptics.failure()
      setNote(err instanceof Error ? err.message : 'Swap failed.')
    },
  })

  if (!item) {
    return (
      <SheetShell title="Reconsider" footer={<Button label="Back to today" variant="ghost" onPress={() => router.back()} />}>
        {brief.isPending && !brief.data ? (
          <ArchSkeleton count={3} columns={3} width={W} />
        ) : (
          <EmptyState title="That piece isn’t on the board." line="Long-press a piece of today’s look to reconsider it." />
        )}
      </SheetShell>
    )
  }

  const busy = feedback.isPending || swap.isPending
  const alts = alternatives.data?.alternatives

  return (
    <SheetShell title={`The ${itemLabel(item)}`} footer={<Button label="Keep it as it is" variant="quiet" onPress={() => router.back()} />}>
      <View style={styles.intro}>
        <GarmentTile imageUrl={item.imageUrl} width={80} accessibilityLabel={itemLabel(item)} />
        <T role="bodySm" tone="muted" style={styles.fill}>
          Swap it for another piece. Or tell the stylist what’s off, and it’ll learn.
        </T>
      </View>

      <View style={styles.group}>
        <T role="label" tone="faint">
          Tell the stylist
        </T>
        {note ? (
          <Animated.View entering={fadeIn} style={[styles.note, { borderColor: alpha(t.brass, 0.3), backgroundColor: t.brassSoft, borderRadius: radius }]}>
            <T role="lede" style={{ color: alpha(t.ink, 0.8) }}>
              {note}
            </T>
          </Animated.View>
        ) : (
          <View style={styles.chips}>
            {FEEDBACK.map((f) => (
              <Chip key={f.signal} label={f.label} on={false} onPress={() => !busy && feedback.mutate(f.signal)} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.group}>
        <T role="label" tone="faint">
          Swap it
        </T>
        {!isToday ? (
          <T role="bodySm" tone="muted">
            Swaps are for today’s look. Plan another day from its own page.
          </T>
        ) : alternatives.isPending ? (
          <ArchSkeleton count={3} columns={3} width={W} />
        ) : alternatives.isError ? (
          <T role="bodySm" tone="muted">
            Couldn’t look for alternatives. Try again in a moment.
          </T>
        ) : !alts || alts.length === 0 ? (
          <View style={[styles.empty, { borderColor: alpha(t.ink, 0.2), borderRadius: radius }]}>
            <T role="bodySm" style={{ color: alpha(t.ink, 0.5) }}>
              No other {item.category} pieces free right now. Add more to your closet to unlock swaps.
            </T>
          </View>
        ) : (
          <View style={[styles.grid, swap.isPending && styles.swapping]}>
            {alts.map((alt) => (
              <GarmentTile
                key={alt.id}
                width={tile}
                imageUrl={alt.imageUrl}
                label={itemLabel(alt)}
                accessibilityLabel={`Swap in the ${itemLabel(alt)}`}
                onPress={() => !busy && swap.mutate(alt)}
              />
            ))}
          </View>
        )}
        {swap.isPending ? (
          <T role="bodySm" align="center" style={{ color: alpha(t.ink, 0.5) }}>
            swapping…
          </T>
        ) : null}
      </View>
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  // `.label` sits `mb-1.5` over its content.
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // `px-4 py-3`.
  note: { borderWidth: hairline, paddingHorizontal: space.lg, paddingVertical: space.md },
  empty: { borderWidth: hairline, borderStyle: 'dashed', padding: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swapping: { opacity: 0.5 },
})
