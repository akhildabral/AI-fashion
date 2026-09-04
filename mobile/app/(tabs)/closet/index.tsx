// The Closet: every piece in its niche, two across. The mantel carries the
// estate value; the rooms sit on a row of tabs; the collection is cut by
// filters; the one brass verb, Add pieces, sits in the head beside the title.
import { FlashList } from '@shopify/flash-list'
import { useQueryClient } from '@tanstack/react-query'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { money } from '@zauq/shared/money'
import type { WardrobeItem, WardrobeListResponse } from '@zauq/shared/types'
import { deleteWardrobeItem } from '@zauq/shared/wardrobe'
import { Arch } from '@/src/components/Arch'
import { Card, EmptyState, LoadError, Plaque, SectionHead, Stat } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Press } from '@/src/components/Press'
import { RoomHeader, useBottomReserve } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Filter } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useJobs } from '@/src/context/JobsProvider'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { ClosetNotes } from '@/src/features/closet/ClosetNotes'
import { cpwLabel, GRID_GAP, GRID_ROW_GAP, isNew, nameOf, tileWidth, title, useGaps, useInsights, useInvalidateCloset, useRitual, useWardrobe, type Insights } from '@/src/features/closet/data'
import { MenuSheet, type MenuItem } from '@/src/components/MenuSheet'
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

/** The rotation meter: brass-hi to brass, left to right, 176 x 6. */
const METER_W = 176
const METER_H = 6

/** The starter state: four empty niches on the grid, and the one thing to do. What sits inside a niche uses the in-niche inks. */
function Starter({ width }: { width: number }) {
  const { t } = useTheme()
  const w = tileWidth(width, gutter)
  return (
    <Animated.View entering={rise(1)} style={styles.starter}>
      <View style={styles.starterGrid}>
        {[0, 1, 2, 3].map((i) => (
          <Arch key={i} width={w}>
            {i === 0 ? (
              <View style={styles.starterLabel}>
                <T role="label" style={{ color: t.inNicheMuted }}>
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
  const bottom = useBottomReserve()

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

  // The rhythm, top to bottom: the mantel (the room's head, the search, the
  // valuation, 16 apart) closed by a hairline a block beneath; the rooms; the
  // ledger a block beneath; the notes 16 beneath; the collections a block
  // beneath, the categories 8 under them; the twin plaque and the grid 16 on.
  const header = (
    <View style={styles.header}>
      <Animated.View entering={rise(0)}>
        <RoomHeader
          eyebrow="The collection"
          title="Closet"
          lead={hasPieces ? `${list.length} pieces${stats ? ` · ${rotationPct}% in rotation this quarter` : ''}` : undefined}
          right={
            <Button
              label={!hasPieces ? 'Add your first piece' : jobs.upload.active ? `${Math.max(0, jobs.upload.total - jobs.upload.done - jobs.upload.failed)} left…` : 'Add pieces'}
              size="sm"
              onPress={() => router.push('/sheets/closet-add')}
            />
          }
        />
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
          <Press accessibilityRole="button" accessibilityLabel="Price your pieces" haptic="tap" onPress={() => router.push('/sheets/closet-price')}>
            {totalValue > 0 ? (
              <Plaque label="Estate value" value={money(totalValue)} style={styles.estate}>
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
                <T role="caption" tone="faint">
                  <T role="caption" tone="muted" style={styles.semi}>
                    {rotationPct}%
                  </T>{' '}
                  worn this quarter{idleCapital > 0 ? ` · ${money(idleCapital)} idle` : ''}
                  {unpriced > 0 ? <T role="caption" tone="muted" style={styles.semi}>{` · ${unpriced} unpriced`}</T> : null}
                </T>
              </Plaque>
            ) : (
              <Plaque label="Estate value" style={styles.estate}>
                <T role="h2" tone="muted">
                  Add prices to see it
                </T>
                <T role="label" tone="brass">
                  Price {list.length} piece{list.length === 1 ? '' : 's'} →
                </T>
              </Plaque>
            )}
          </Press>
        </Animated.View>
      ) : null}

      <Animated.View entering={rise(2)} style={hasPieces ? styles.roomsAfterMantel : undefined}>
        <RoomTabs current="pieces" />
      </Animated.View>

      {hasPieces ? (
        <>
          {showLedger ? (
            <Animated.View entering={rise(3)} style={styles.ledgerWrap}>
              <Plaque style={styles.ledger}>
                <Stat small value={`${rotationPct}%`} label="in rotation" />
                <Stat small value={String(stats.wornThisQuarter)} label="wears this quarter" />
                <Stat small value={stats.monthlyPayback > 0 ? money(stats.monthlyPayback) : '–'} label="earned this month" />
                <Stat small value={String(stats.streak)} label="day streak" />
                {idleCapital > 0 ? <Button label={`${money(idleCapital)} sitting idle →`} variant="quiet" size="sm" onPress={() => setCollection('orphans')} style={styles.ledgerIdle} /> : null}
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
            <Press accessibilityRole="button" haptic="tap" onPress={() => setCollection('twins')} wrapStyle={styles.twinWrap}>
              <Plaque style={styles.twinPlaque}>
                <View style={styles.twinRow}>
                  <T role="bodySm" tone="muted" style={styles.twinText}>
                    <T role="bodySm" style={styles.semi}>
                      {twins} {twins === 1 ? 'piece looks' : 'pieces look'} like {twins === 1 ? 'one' : 'ones'} you already have.
                    </T>{' '}
                    Decide on each: the same piece, or different.
                  </T>
                  <T role="label" tone="brass" style={styles.twinReview}>
                    Review →
                  </T>
                </View>
              </Plaque>
            </Press>
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
            <Card key={g.category} padding={space.ml} style={styles.gapCard}>
              <T role="h3">{title(g.wanted)}</T>
              <T role="bodySm" tone="muted">
                Unlocks {g.unlocks} {g.unlocks === 1 ? 'outfit' : 'outfits'} you can’t build today.
              </T>
            </Card>
          ))}
        </ScrollView>
      </Animated.View>
    ) : null

  const loading = wardrobe.isPending
  const failed = wardrobe.isError && !wardrobe.data

  return (
    <Screen edges={['top']}>
      {failed ? (
        <View style={styles.failed}>
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
          contentContainerStyle={{ paddingHorizontal: gutter - GRID_GAP / 2, paddingBottom: bottom }}
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
              <EmptyState title="Nothing matches that filter." />
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

      <MenuSheet open={menuFor !== null} title={menuFor ? title(nameOf(menuFor)) : undefined} items={menuItems} onClose={() => setMenuFor(null)} />
      {undo.pending ? <UndoBar message={undo.pending.message} onUndo={undo.undo} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  // The grid 16 under everything in the header.
  header: { paddingBottom: space.lg },
  failed: { paddingHorizontal: gutter },
  // The mantel's column: search and valuation, element to element.
  mantel: { gap: space.lg },
  // The mantel closes a block above the hairline the rooms draw.
  roomsAfterMantel: { paddingTop: space.xxl },
  semi: { fontFamily: fonts.sansSemi },
  // The figure, the meter 8 beneath, the line 8 beneath.
  estate: { gap: space.sm },
  meter: { height: METER_H, width: METER_W, overflow: 'hidden', borderRadius: radius },
  // The ledger a block under the rooms: stats 32 across, 16 down.
  ledgerWrap: { paddingTop: space.xxl },
  ledger: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: space.xxl, rowGap: space.lg },
  ledgerIdle: { marginLeft: 'auto' },
  // The filter rows bleed to the screen edge; the tokens start on the gutter.
  filterRail: { marginHorizontal: -gutter },
  collections: { marginTop: space.xxl },
  categories: { marginTop: space.sm },
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: gutter },
  twinWrap: { paddingTop: space.lg },
  twinPlaque: { padding: space.md, paddingLeft: space.lg },
  twinRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  twinText: { flex: 1 },
  twinReview: { flexShrink: 0 },
  gridInset: { paddingHorizontal: GRID_GAP / 2 },
  cell: { paddingHorizontal: GRID_GAP / 2, paddingBottom: GRID_ROW_GAP },
  // A group under the board, less the last row's gap; the rail 16 under the head.
  gaps: { paddingTop: space.xxxl - GRID_ROW_GAP, gap: space.lg },
  gapRail: { marginHorizontal: -gutter },
  gapRow: { flexDirection: 'row', gap: space.lg, paddingHorizontal: gutter },
  gapCard: { width: 220, gap: space.sm },
  // The starter board 16 under the rooms, aligned to the grid.
  starter: { paddingTop: space.lg, paddingHorizontal: GRID_GAP / 2 },
  starterGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GRID_GAP, rowGap: GRID_ROW_GAP },
  starterLabel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
