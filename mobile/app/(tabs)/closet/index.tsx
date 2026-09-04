// The Closet: every piece in its niche, two across. The mantel carries the
// estate value; the rooms sit on a row of tabs; the collection is cut by
// filters; the one brass verb, Add pieces, waits in the thumb zone.
import { FlashList } from '@shopify/flash-list'
import { useQueryClient } from '@tanstack/react-query'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { money } from '@zauq/shared/money'
import type { WardrobeItem, WardrobeListResponse } from '@zauq/shared/types'
import { deleteWardrobeItem } from '@zauq/shared/wardrobe'
import { Arch } from '@/src/components/Arch'
import { EmptyState, LoadError, Plaque, SectionHead } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Filter } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useJobs } from '@/src/context/JobsProvider'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, hitSlopFor, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { ClosetNotes } from '@/src/features/closet/ClosetNotes'
import { cpwLabel, GRID_GAP, GRID_ROW_GAP, isNew, nameOf, tileWidth, title, useGaps, useInsights, useInvalidateCloset, useRitual, useWardrobe, type Insights } from '@/src/features/closet/data'
import { Menu, type MenuItem } from '@/src/features/closet/Menu'
import { RoomTabs } from '@/src/features/closet/RoomTabs'
import { shareCard } from '@/src/features/closet/share'
import { UndoBar, useUndoDelete } from '@/src/features/closet/UndoBar'

type Collection = 'all' | 'most-worn' | 'never-worn' | 'orphans' | 'new' | 'twins'

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'most-worn', label: 'Most worn' },
  { id: 'never-worn', label: 'Never worn' },
  { id: 'orphans', label: 'Sitting idle' },
  { id: 'new', label: 'New this month' },
  { id: 'twins', label: 'Possible twins' },
]

/** The web's `w-44 h-1.5` rotation meter: brass-hi to brass, left to right. */
const METER_W = 176
const METER_H = 6

/** The starter state: four empty niches on the grid, and the one thing to do. */
function Starter({ width }: { width: number }) {
  const w = tileWidth(width, gutter)
  return (
    <Animated.View entering={rise(1)} style={styles.starter}>
      <View style={styles.starterGrid}>
        {[0, 1, 2, 3].map((i) => (
          <Arch key={i} width={w} variant="plain">
            {i === 0 ? (
              <View style={styles.starterLabel}>
                <T role="label" tone="faint">
                  Your first piece
                </T>
              </View>
            ) : null}
          </Arch>
        ))}
      </View>
      <EmptyState title="Your collection begins here." line="Add a few pieces. Flat-lays and hangers work best. Each garment is extracted and framed on its own." />
    </Animated.View>
  )
}

export default function ClosetRoom() {
  const { t } = useTheme()
  const { width } = useWindowDimensions()
  const flash = useFlash()
  const qc = useQueryClient()
  const jobs = useJobs()
  const invalidate = useInvalidateCloset()

  const wardrobe = useWardrobe()
  const insightsQ = useInsights()
  const ritual = useRitual()
  const gaps = useGaps()

  const [search, setSearch] = useState('')
  const [collection, setCollection] = useState<Collection>('all')
  const [category, setCategory] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<WardrobeItem | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)

  // Tiles the upload queue just created land in the cache at once, ahead of
  // the refetch the queue also triggers.
  useEffect(() => {
    if (jobs.addedItems.length === 0) return
    qc.setQueryData<WardrobeListResponse>(qk.wardrobe, (prev) => {
      const have = new Set((prev?.items ?? []).map((i) => i.id))
      const fresh = jobs.addedItems.filter((i) => !have.has(i.id))
      return { ...prev, items: [...fresh, ...(prev?.items ?? [])] }
    })
    jobs.consumeAddedItems()
  }, [jobs, qc])

  const { refreshProcessing } = jobs
  useFocusEffect(
    useCallback(() => {
      refreshProcessing()
    }, [refreshProcessing]),
  )

  const list = useMemo(() => (wardrobe.data ?? []).filter((i) => !hidden.has(i.id)), [wardrobe.data, hidden])
  const insights = useMemo<Insights>(() => insightsQ.data ?? new Map(), [insightsQ.data])
  const stats = ritual.data

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const it of list) counts.set(it.category, (counts.get(it.category) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [list])

  const twins = list.filter((it) => it.twinOfId).length
  const collectionCounts: Record<Collection, number> = {
    all: list.length,
    'most-worn': list.filter((it) => (insights.get(it.id)?.wearCount ?? 0) >= 1).length,
    'never-worn': list.filter((it) => (insights.get(it.id)?.wearCount ?? 0) === 0).length,
    orphans: list.filter((it) => insights.get(it.id)?.orphan).length,
    new: list.filter(isNew).length,
    twins,
  }

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const visible = list.filter((it) => {
      if (category && it.category !== category) return false
      const ins = insights.get(it.id)
      if (collection === 'most-worn' && (ins?.wearCount ?? 0) < 1) return false
      if (collection === 'never-worn' && (ins?.wearCount ?? 0) > 0) return false
      if (collection === 'orphans' && !ins?.orphan) return false
      if (collection === 'new' && !isNew(it)) return false
      if (collection === 'twins' && !it.twinOfId) return false
      if (q) {
        const hay = `${it.subtype ?? ''} ${it.category} ${it.primaryColor ?? ''} ${it.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return collection === 'most-worn' ? [...visible].sort((a, b) => (insights.get(b.id)?.wearCount ?? 0) - (insights.get(a.id)?.wearCount ?? 0)) : visible
  }, [list, insights, category, collection, search])

  // ---- Valuation + ledger figures ----
  const totalValue = list.reduce((sum, it) => sum + (it.price ?? 0), 0)
  const unpriced = list.filter((it) => it.price == null).length
  const rotationPct = stats?.rotationPct ?? 0
  const idleCapital = list.filter((it) => insights.get(it.id)?.orphan).reduce((sum, it) => sum + (it.price ?? 0), 0)

  // ---- Deferred delete from the tile menu ----
  const undo = useUndoDelete<WardrobeItem>({
    commit: useCallback(
      async (it: WardrobeItem) => {
        await deleteWardrobeItem(it.id)
        invalidate(it.id)
      },
      [invalidate],
    ),
    onHide: useCallback((it: WardrobeItem) => setHidden((h) => new Set(h).add(it.id)), []),
    onRestore: useCallback((it: WardrobeItem) => {
      setHidden((h) => {
        const next = new Set(h)
        next.delete(it.id)
        return next
      })
    }, []),
    onFail: useCallback(() => flash('Couldn’t remove it. Try again.'), [flash]),
  })

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([wardrobe.refetch(), insightsQ.refetch(), ritual.refetch(), gaps.refetch()]).catch(() => undefined)
    setRefreshing(false)
  }, [wardrobe, insightsQ, ritual, gaps])

  const tileW = tileWidth(width, gutter)
  const showLedger = stats && (stats.wornThisQuarter > 0 || stats.streak > 0 || idleCapital > 0)
  const hasPieces = list.length > 0

  const menuItems: MenuItem[] = menuFor
    ? [
        { label: 'Try it on', onPress: () => router.push(`/(tabs)/mirror?items=${menuFor.id}`) },
        { label: 'Style it', onPress: () => router.push(`/closet/compose?pin=${menuFor.id}`) },
        { label: 'Let go', onPress: () => router.push(`/sheets/closet-let-go?id=${menuFor.id}`) },
        {
          label: 'Share',
          onPress: () => {
            shareCard('piece', menuFor.id, `${title(nameOf(menuFor))} from my closet`).catch((err) => flash(err instanceof Error ? err.message : 'Could not prepare the card.'))
          },
        },
        { label: 'Remove from the closet', danger: true, section: true, onPress: () => undo.remove(menuFor, `${title(nameOf(menuFor))} removed.`) },
      ]
    : []

  // The web's rhythm, top to bottom: the mantel (title, search, valuation)
  // closed by a hairline at pb-7; the rooms at mt-6; the ledger at mt-6; the
  // notes at mt-4; the collections at mt-8; the categories beneath; the twin
  // plaque and the grid at mt-6.
  const header = (
    <View style={styles.header}>
      <Animated.View entering={rise(0)}>
        <RoomHeader eyebrow="The collection" title="Closet" lead={hasPieces ? `${list.length} pieces${stats ? ` · ${rotationPct}% in rotation this quarter` : ''}` : undefined} />
      </Animated.View>

      {hasPieces ? (
        <Animated.View entering={rise(1)} style={styles.mantel}>
          <Field
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            accessibilityLabel="Search your closet"
          />

          {/* The valuation plate: the owned brass moment */}
          <Pressable accessibilityRole="button" accessibilityLabel="Price your pieces" pressRetentionOffset={12} onPress={() => router.push('/sheets/closet-price')}>
            <Plaque>
              <T role="micro" tone="faint" style={styles.estateLabel}>
                Estate value
              </T>
              {totalValue > 0 ? (
                <>
                  <T role="stat" tone="brass" style={styles.estateValue}>
                    {money(totalValue)}
                  </T>
                  <View style={[styles.meter, { backgroundColor: alpha(t.ink, 0.1) }]}>
                    <Svg width={METER_W} height={METER_H}>
                      <Defs>
                        <LinearGradient id="estate-meter" x1="0" y1="0" x2="1" y2="0">
                          <Stop offset="0" stopColor={t.brassHi} />
                          <Stop offset="1" stopColor={t.brass} />
                        </LinearGradient>
                      </Defs>
                      <Rect width={(METER_W * Math.min(100, Math.max(0, rotationPct))) / 100} height={METER_H} rx={2} fill="url(#estate-meter)" />
                    </Svg>
                  </View>
                  <T role="caption" tone="faint" style={styles.estateLine}>
                    <T role="caption" tone="muted" style={styles.semi}>
                      {rotationPct}%
                    </T>{' '}
                    worn this quarter{idleCapital > 0 ? ` · ${money(idleCapital)} idle` : ''}
                    {unpriced > 0 ? <T role="caption" tone="brass" style={styles.semi}>{` · ${unpriced} unpriced`}</T> : null}
                  </T>
                </>
              ) : (
                <>
                  <T role="h2" tone="muted">
                    Add prices to see it
                  </T>
                  <T role="caption" tone="brass" style={[styles.semi, styles.estatePrice]}>
                    Price {list.length} piece{list.length === 1 ? '' : 's'} →
                  </T>
                </>
              )}
            </Plaque>
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View entering={rise(2)} style={hasPieces ? styles.roomsAfterMantel : styles.roomsAfterTitle}>
        <RoomTabs current="pieces" />
      </Animated.View>

      {hasPieces ? (
        <>
          {showLedger ? (
            <Animated.View entering={rise(3)} style={styles.ledgerWrap}>
              <Plaque style={styles.ledger}>
                {[
                  { v: `${rotationPct}%`, l: 'in rotation' },
                  { v: String(stats.wornThisQuarter), l: 'wears this quarter' },
                  { v: stats.monthlyPayback > 0 ? money(stats.monthlyPayback) : '–', l: 'earned this month' },
                  { v: String(stats.streak), l: 'day streak' },
                ].map((s) => (
                  <View key={s.l} style={styles.ledgerStat} accessible accessibilityLabel={`${s.v} ${s.l}`}>
                    <T role="statSm">{s.v}</T>
                    <T role="micro" tone="faint" style={styles.ledgerLabel}>
                      {s.l}
                    </T>
                  </View>
                ))}
                {idleCapital > 0 ? (
                  <Pressable accessibilityRole="button" hitSlop={hitSlopFor(16)} onPress={() => setCollection('orphans')} style={styles.ledgerIdle}>
                    <T role="caption" tone="brass" style={styles.semi}>
                      {money(idleCapital)} sitting idle →
                    </T>
                  </Pressable>
                ) : null}
              </Plaque>
            </Animated.View>
          ) : null}

          <ClosetNotes riseFrom={4} />

          {/* Collections: the wardrobe cut different ways */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filters} style={[styles.filterRail, styles.collections]}>
            {COLLECTIONS.map((c) => (
              <Filter key={c.id} label={c.label} on={collection === c.id} count={collectionCounts[c.id] > 0 ? collectionCounts[c.id] : undefined} onPress={() => setCollection(c.id)} />
            ))}
          </ScrollView>

          {/* Categories: narrow the collection by kind */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filters} style={[styles.filterRail, styles.categories]}>
            <Filter label="All" on={category === null} count={list.length} onPress={() => setCategory(null)} />
            {categories.map(([cat, count]) => (
              <Filter key={cat} label={title(cat)} on={category === cat} count={count} onPress={() => setCategory((prev) => (prev === cat ? null : cat))} />
            ))}
          </ScrollView>

          {twins > 0 && collection !== 'twins' ? (
            <Pressable accessibilityRole="button" pressRetentionOffset={12} onPress={() => setCollection('twins')} style={styles.twinWrap}>
              <Plaque style={styles.twinPlaque}>
                <View style={styles.twinRow}>
                  <T role="bodySm" tone="muted" style={{ flex: 1 }}>
                    <T role="bodySm" style={styles.semi}>
                      {twins} {twins === 1 ? 'piece looks' : 'pieces look'} like {twins === 1 ? 'one' : 'ones'} you already have.
                    </T>{' '}
                    Decide on each: the same piece, or different.
                  </T>
                  <T role="micro" tone="brass" style={styles.twinReview}>
                    Review →
                  </T>
                </View>
              </Plaque>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  )

  const footer =
    hasPieces && gaps.data && gaps.data.length > 0 ? (
      <Animated.View entering={rise(5)} style={styles.gaps}>
        <SectionHead title="What the closet is missing" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gapRail} contentContainerStyle={styles.gapRow}>
          {gaps.data.map((g) => (
            <View key={g.category} style={[styles.gapCard, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
              <T role="h3">{title(g.wanted)}</T>
              <T role="bodySm" tone="muted">
                Unlocks {g.unlocks} {g.unlocks === 1 ? 'outfit' : 'outfits'} you can’t build today.
              </T>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    ) : null

  const loading = wardrobe.isPending
  const failed = wardrobe.isError && !wardrobe.data

  return (
    <Screen edges={['top']}>
      {failed ? (
        <View style={{ paddingHorizontal: gutter }}>
          {header}
          <LoadError message="Could not load your closet." onRetry={() => void wardrobe.refetch()} />
        </View>
      ) : (
        <FlashList
          data={sorted}
          numColumns={2}
          keyExtractor={(it) => it.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.brass} />}
          contentContainerStyle={{ paddingHorizontal: gutter - GRID_GAP / 2, paddingBottom: ACTION_BAR_HEIGHT + space.xl }}
          ListHeaderComponent={header}
          ListHeaderComponentStyle={styles.gridInset}
          ListFooterComponent={footer}
          ListFooterComponentStyle={styles.gridInset}
          ListEmptyComponent={
            loading ? (
              <View style={styles.gridInset}>
                <ArchSkeleton count={6} width={width - gutter * 2} />
              </View>
            ) : !hasPieces ? (
              <Starter width={width} />
            ) : (
              <T role="bodySm" tone="faint" align="center" style={styles.nothing}>
                Nothing matches that filter.
              </T>
            )
          }
          renderItem={({ item, index }) => (
            <View style={styles.cell}>
              <GarmentTile
                testID={index === 0 ? 'closet-first-tile' : undefined}
                imageUrl={item.imageUrl}
                width={tileW}
                label={title(nameOf(item))}
                sublabel={item.twinOfId ? 'A twin? · decide' : cpwLabel(item, insights.get(item.id))}
                badge={item.twinOfId ? 'twin' : isNew(item) ? 'new' : undefined}
                processing={item.status === 'processing'}
                accessibilityLabel={`${title(nameOf(item))}, ${cpwLabel(item, insights.get(item.id))}`}
                onPress={() => router.push(`/closet/piece/${item.id}`)}
                onLongPress={() => setMenuFor(item)}
              />
            </View>
          )}
        />
      )}

      <ActionBar>
        <Button
          label={!hasPieces ? 'Add your first piece' : jobs.upload.active ? `${Math.max(0, jobs.upload.total - jobs.upload.done - jobs.upload.failed)} left…` : 'Add pieces'}
          block
          onPress={() => router.push('/sheets/closet-add')}
        />
      </ActionBar>

      <Menu open={menuFor !== null} title={menuFor ? title(nameOf(menuFor)) : undefined} items={menuItems} onClose={() => setMenuFor(null)} />
      {undo.pending ? <UndoBar message={undo.pending.message} onUndo={undo.undo} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  // The grid's mt-6 sits under everything in the header.
  header: { paddingBottom: space.xl },
  // The mantel's column: search and valuation at gap-6; the title's own
  // pb-4 already sits above.
  mantel: { paddingTop: space.sm, gap: space.xl },
  // The mantel closes at pb-7 (28) above the hairline the rooms draw.
  roomsAfterMantel: { paddingTop: 28 },
  roomsAfterTitle: { paddingTop: space.md },
  semi: { fontFamily: fonts.sansSemi },
  // text-[10px] tracking-[0.22em]
  estateLabel: { letterSpacing: 2.2 },
  estateValue: { marginTop: space.xs },
  estateLine: { marginTop: 6 },
  estatePrice: { marginTop: space.xs },
  meter: { height: METER_H, width: METER_W, overflow: 'hidden', marginTop: space.sm, borderRadius: radius },
  // plaque mt-6 flex-wrap items-center gap-x-8 gap-y-2 p-4 pl-5
  ledgerWrap: { paddingTop: space.xl },
  ledger: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xxl, rowGap: space.sm, padding: space.lg, paddingLeft: 20 },
  ledgerStat: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  // text-[10px] tracking-[0.08em]
  ledgerLabel: { letterSpacing: 0.8 },
  ledgerIdle: { marginLeft: 'auto' },
  // The filter rows bleed to the screen edge; the tokens start on the gutter.
  filterRail: { marginHorizontal: -gutter },
  collections: { marginTop: space.xxl },
  categories: { marginTop: space.sm },
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: gutter },
  // plaque mt-6 p-3 pl-4 gap-3
  twinWrap: { paddingTop: space.xl },
  twinPlaque: { padding: space.md, paddingLeft: space.lg },
  twinRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  // text-[10px] tracking-[0.18em]
  twinReview: { letterSpacing: 1.8, flexShrink: 0 },
  gridInset: { paddingHorizontal: GRID_GAP / 2 },
  // gap-3 across, gap-y-5 down
  cell: { paddingHorizontal: GRID_GAP / 2, paddingBottom: GRID_ROW_GAP },
  // mt-12 under the filters: the header already gives 24.
  nothing: { paddingTop: space.xl, paddingBottom: space.xl },
  // mt-14 above the section, less the last row's gap-y-5.
  gaps: { paddingTop: 56 - GRID_ROW_GAP, gap: space.lg },
  gapRail: { marginHorizontal: -gutter },
  gapRow: { flexDirection: 'row', gap: space.lg, paddingHorizontal: gutter },
  gapCard: { width: 220, padding: 20, gap: 6, borderWidth: hairline },
  // mt-12 under the rooms: the header already gives 24. Aligned to the grid.
  starter: { paddingTop: space.xl, paddingHorizontal: GRID_GAP / 2 },
  starterGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GRID_GAP, rowGap: GRID_ROW_GAP },
  starterLabel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
