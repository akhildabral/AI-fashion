// The Mirror, as a fitting room. The glass at the top; under it the rail,
// the pieces on you, each a switch; the lens switch; then every render on
// the glass so far. "See it on me" lives in the thumb bar with the meter.
// Deep links: /mirror?items=a,b,c stages pieces on the rail, &lens=closet|inspiration picks the lens.
import { FlashList } from '@shopify/flash-list'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import type { InspirationLook } from '@zauq/shared/looks'
import type { TryOn } from '@zauq/shared/types'
import { tryOnWardrobeOutfit } from '@zauq/shared/wardrobe'
import { EmptyState, LoadError, SectionHead } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ACTION_BAR_HEIGHT, ActionBar, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Filter, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useJobs } from '@/src/context/JobsProvider'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { gutter } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { ClosetRail } from '@/src/features/mirror/ClosetRail'
import { isLive, pieceLabel, renderLabel, useCloset, useInvalidateMirror, useLookbooks, useReflections, useTryOns, useUsage } from '@/src/features/mirror/data'
import { useInspiration } from '@/src/features/mirror/inspiration'
import { InspirationLens } from '@/src/features/mirror/InspirationLens'
import { Reflection } from '@/src/features/mirror/Reflection'
import { MAX_COMPARE, mirror, useMirrorStore, type Lens } from '@/src/features/mirror/store'

const LENSES: { key: Lens; label: string }[] = [
  { key: 'closet', label: 'Your closet' },
  { key: 'inspiration', label: 'Inspiration' },
]
const LETTERS = ['A', 'B', 'C', 'D']

export default function MirrorRoom() {
  const { t } = useTheme()
  const flash = useFlash()
  const invalidate = useInvalidateMirror()
  const { width: sw } = useWindowDimensions()
  const params = useLocalSearchParams<{ items?: string; lens?: string }>()
  const { lens, rail, compareMode, compare } = useMirrorStore()
  const { activeRenders, trackRender } = useJobs()

  const reflQ = useReflections()
  const closetQ = useCloset()
  const tryOnsQ = useTryOns()
  const usageQ = useUsage()
  const booksQ = useLookbooks()

  const [book, setBook] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const photoUrl = reflQ.data?.photoUrl ?? null
  const photos = reflQ.data?.photos ?? []
  const photoMax = reflQ.data?.max ?? 3
  const photoChecked = reflQ.data !== undefined || reflQ.isError
  const closet = useMemo(() => closetQ.data ?? [], [closetQ.data])
  const byId = useMemo(() => new Map(closet.map((i) => [i.id, i])), [closet])
  const tryOns = useMemo(() => tryOnsQ.data?.tryOns ?? [], [tryOnsQ.data])
  const lookbooks = useMemo(() => booksQ.data?.lookbooks ?? [], [booksQ.data])

  // ---- deep links: pieces on the rail, a lens; consumed once ----
  const itemsParam = typeof params.items === 'string' ? params.items : ''
  const lensParam = typeof params.lens === 'string' ? params.lens : ''
  useEffect(() => {
    if (!itemsParam && !lensParam) return
    if (lensParam === 'closet' || lensParam === 'inspiration') mirror.setLens(lensParam)
    if (itemsParam) {
      mirror.setRail(itemsParam.split(',').filter(Boolean))
      mirror.setCompareMode(false)
    }
    router.setParams({ items: '', lens: '' })
  }, [itemsParam, lensParam])

  // Arriving with nothing in hand, the latest render's pieces are staged (as the web does), once.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !tryOnsQ.data) return
    seeded.current = true
    if (itemsParam || mirror.get().rail.length > 0) return
    const last = tryOns.find((x) => x.status !== 'failed')
    if (last?.itemIds?.length) mirror.setRail(last.itemIds)
  }, [tryOnsQ.data, tryOns, itemsParam])

  useEffect(() => {
    if (tryOnsQ.data) mirror.prune(new Set(tryOns.map((x) => x.id)))
  }, [tryOnsQ.data, tryOns])

  const chosen = rail.filter((r) => r.on && byId.has(r.id)).map((r) => r.id)
  const meter = usageQ.data?.usage.tryons
  const left = meter ? Math.max(0, meter.limit - meter.used) : null
  const out = left === 0

  const openReflections = () => router.push('/sheets/mirror-reflection')
  const inspiration = useInspiration({ hasPhoto: !!photoUrl, onNeedPhoto: openReflections })

  async function seeItOnMe() {
    if (chosen.length === 0 || busy) return
    if (!photoUrl) {
      openReflections()
      return
    }
    setBusy(true)
    try {
      const r = await tryOnWardrobeOutfit(chosen, false)
      invalidate()
      if (r.cached || r.tryOn.status === 'ready') {
        flash('Same pieces, same photo: from the cache, free.')
        router.push(`/reveal/${r.tryOn.id}`)
      } else {
        haptics.tap()
        trackRender(r.tryOn)
        flash('Dressing you. Leave if you like; you’ll hear when it’s ready.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'The render failed.'
      if (/photo/i.test(msg)) openReflections()
      else {
        haptics.failure()
        flash(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  async function seeLookOnMe(look: InspirationLook) {
    const tryOn = await inspiration.seeOnMe(look)
    if (tryOn && (tryOn.status === 'ready' || !tryOn.status)) router.push(`/reveal/${tryOn.id}`)
  }

  async function refresh() {
    setRefreshing(true)
    await Promise.all([reflQ.refetch(), closetQ.refetch(), tryOnsQ.refetch(), usageQ.refetch(), booksQ.refetch()]).catch(() => undefined)
    setRefreshing(false)
  }

  // ---- the renders ----
  const activeBook = book ? lookbooks.find((b) => b.id === book) : null
  const renders = activeBook ? tryOns.filter((x) => activeBook.tryOnIds.includes(x.id)) : tryOns
  const cellW = (sw - gutter * 2) / 2
  const tileW = cellW - 6
  // The glass spans the room, gutter to gutter, as on the web.
  const frameW = sw - gutter * 2
  const developing = activeRenders.length > 0

  const pressRender = (item: TryOn) => {
    if (compareMode) {
      if (isLive(item) || item.status === 'failed') return
      const changed = mirror.toggleCompare(item.id)
      if (changed) haptics.tap()
      else flash(`Up to ${MAX_COMPARE} at a time.`)
      return
    }
    router.push(`/reveal/${item.id}`)
  }
  const holdRender = (item: TryOn) => {
    if (isLive(item) || item.status === 'failed') return
    haptics.select()
    if (!compareMode) mirror.setCompareMode(true)
    mirror.toggleCompare(item.id)
  }

  const eyebrow = compareMode ? 'Which one?' : developing ? 'Dressing you' : 'Show yourself'

  const header = (
    <View style={styles.header}>
      <RoomHeader eyebrow={eyebrow} eyebrowVoice="italic" title={compareMode ? 'A, B,' : 'The'} emphasis={compareMode ? 'or C.' : 'Mirror.'} />

      <Reflection
        width={frameW}
        checked={photoChecked}
        photoUrl={photoUrl}
        developing={developing}
        onAdd={openReflections}
        onOpenDeveloping={developing ? () => router.push(`/reveal/${activeRenders[0].id}`) : undefined}
      />
      {photoChecked && (photos.length > 0 || photoUrl) ? (
        <View style={styles.reflectionRow}>
          <Button label={`Your reflections · ${Math.max(photos.length, 1)} of ${photoMax}`} variant="quiet" size="sm" onPress={openReflections} />
        </View>
      ) : null}

      <Tabs items={LENSES} value={lens} onChange={mirror.setLens} />

      {lens === 'closet' ? (
        <ClosetRail
          rail={rail}
          byId={byId}
          closet={closet}
          closetLoaded={closetQ.data !== undefined}
          onToggle={mirror.toggle}
          onSwap={(piece) =>
            router.push(
              `/sheets/mirror-swap?itemId=${piece.id}&slot=${encodeURIComponent(piece.category)}&label=${encodeURIComponent(pieceLabel(piece))}&exclude=${rail.map((r) => r.id).join(',')}`,
            )
          }
          onAdd={() => router.push('/sheets/mirror-add')}
          onPick={(id) => mirror.add([id])}
          onClear={() => {
            haptics.tap()
            mirror.clear()
          }}
        />
      ) : (
        <InspirationLens
          width={sw - gutter * 2}
          inspiration={{ ...inspiration, seeOnMe: async (look) => (await seeLookOnMe(look), null) }}
          onCloset={(look) => router.push(`/sheets/mirror-recreate?lookId=${look.id}&title=${encodeURIComponent(look.outfit.title ?? look.occasion)}`)}
        />
      )}

      {tryOns.length > 0 ? (
        <View style={styles.rendersHead}>
          <SectionHead
            title="Renders"
            action={
              tryOns.length >= 2 ? (
                <Button
                  label={compareMode ? 'Done' : 'Compare'}
                  variant={compareMode ? 'quiet' : 'ghost'}
                  size="sm"
                  onPress={() => {
                    haptics.select()
                    mirror.setCompareMode(!compareMode)
                  }}
                />
              ) : null
            }
          />
          {compareMode ? (
            <T role="bodySm" tone="muted">
              {compare.length < 2 ? `Pick two to ${MAX_COMPARE} renders. Still torn? Put it to the circle.` : 'Side by side. Still torn? Put it to the circle.'}
            </T>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Filter label="All" count={tryOns.length} on={book === null} onPress={() => setBook(null)} />
            {lookbooks.map((b) => (
              <Filter key={b.id} label={b.name} count={b.tryOnIds.length} on={book === b.id} onPress={() => setBook((prev) => (prev === b.id ? null : b.id))} />
            ))}
            {activeBook ? <Button label="Delete lookbook" variant="quiet" size="sm" onPress={() => router.push(`/sheets/mirror-lookbook?remove=${activeBook.id}`)} /> : null}
          </ScrollView>
        </View>
      ) : null}

      {tryOnsQ.isError && tryOns.length === 0 ? <LoadError onRetry={() => void tryOnsQ.refetch()} /> : null}
      {tryOnsQ.isPending && tryOns.length === 0 ? <ArchSkeleton width={sw - gutter * 2} count={2} /> : null}
      {tryOnsQ.data && tryOns.length === 0 && photoUrl ? <EmptyState title="Nothing on the glass yet." line="Put pieces on the rail and tap See it on me." /> : null}
      {activeBook && renders.length === 0 ? <EmptyState title="An empty lookbook." line="Open a render and add it here." /> : null}
    </View>
  )

  return (
    <Screen edges={['top']}>
      <FlashList
        data={renders}
        numColumns={2}
        keyExtractor={(item) => item.id}
        extraData={`${compareMode}:${compare.join(',')}`}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => {
          const idx = compare.indexOf(item.id)
          const live = isLive(item)
          const failed = item.status === 'failed'
          return (
            <View style={[styles.cell, { width: cellW, paddingLeft: index % 2 ? 6 : 0, paddingRight: index % 2 ? 0 : 6 }]}>
              <GarmentTile
                photo
                width={tileW}
                aspect={3 / 4}
                imageUrl={live || failed ? null : item.imageUrl}
                label={renderLabel(item)}
                sublabel={failed ? 'didn’t take' : item.reportedAt ? 'reported' : undefined}
                badge={idx >= 0 ? LETTERS[idx] : undefined}
                selected={idx >= 0}
                processing={live}
                accessibilityLabel={`${renderLabel(item)}${idx >= 0 ? `, ${LETTERS[idx]}` : ''}`}
                onPress={() => pressRender(item)}
                onLongPress={() => holdRender(item)}
              />
            </View>
          )
        }}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: ACTION_BAR_HEIGHT + 32 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.brass} />}
      />

      <ActionBar>
        {compareMode ? (
          <>
            <View style={styles.grow}>
              <Button label="Ask the circle" block disabled={compare.length < 2} onPress={() => router.push(`/sheets/mirror-ask?ids=${compare.join(',')}`)} />
            </View>
            <Button label="Done" variant="quiet" onPress={() => mirror.setCompareMode(false)} />
          </>
        ) : lens === 'inspiration' ? (
          <>
            <View style={styles.grow}>
              <Button label={inspiration.generating ? 'Sketching…' : 'Two looks'} block loading={inspiration.generating} onPress={inspiration.generate} />
            </View>
            {usageQ.data ? (
              <T role="caption" tone="muted" numberOfLines={2} style={styles.meter}>
                <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                  {Math.max(0, usageQ.data.usage.looks.limit - usageQ.data.usage.looks.used)} of {usageQ.data.usage.looks.limit}
                </T>
                {usageQ.data.lifetime ? '' : ' this month'}
              </T>
            ) : null}
          </>
        ) : photoChecked && !photoUrl ? (
          <View style={styles.grow}>
            <Button label="Add your reflection" block onPress={openReflections} />
          </View>
        ) : (
          <>
            <View style={styles.grow}>
              <Button label={busy ? 'Starting…' : 'See it on me'} block loading={busy} disabled={chosen.length === 0 || out || !photoChecked} onPress={() => void seeItOnMe()} />
            </View>
            {meter ? (
              out ? (
                <View style={styles.meter}>
                  <T role="caption" numberOfLines={1}>
                    No renders left
                  </T>
                  <Button label="See plans" variant="quiet" size="sm" onPress={() => router.navigate('/you')} />
                </View>
              ) : (
                <T role="caption" tone="muted" numberOfLines={2} style={styles.meter}>
                  <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                    {left} of {meter.limit}
                  </T>
                  {usageQ.data?.lifetime ? '' : ' this month'}
                </T>
              )
            ) : null}
          </>
        )}
      </ActionBar>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: 20, paddingBottom: 8 },
  reflectionRow: { alignItems: 'center', marginTop: -8 },
  rendersHead: { gap: 12 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  cell: { marginBottom: 16 },
  grow: { flex: 1 },
  meter: { maxWidth: 120, alignItems: 'flex-start', gap: 2 },
})
