import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { addWardrobeItem, getWardrobe } from '../lib/wardrobe'
import { chooseImage } from '../lib/imagePicker'
import type { WardrobeItem } from '../lib/types'
import { Screen } from '../components/Screen'
import { WardrobeCard } from '../components/WardrobeCard'
import { OutfitSuggestions } from '../components/OutfitSuggestions'
import { WearJournal } from '../components/WearJournal'
import {
  Button,
  Card,
  CenteredSpinner,
  EmptyState,
  ErrorText,
  Heading,
  Subtle,
  TogglePill,
} from '../components/ui'
import { spacing } from '../theme'

export function WardrobeScreen() {
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    setLoadError(null)
    try {
      const { items: list } = await getWardrobe()
      setItems(list ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your wardrobe.')
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadedOnce(true)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!loadedOnce) void load()
    }, [load, loadedOnce]),
  )

  // Cataloging runs in the background on the server — poll while any item is
  // still processing so tags appear as they land.
  const hasProcessing = items?.some((it) => it.status === 'processing') ?? false
  useEffect(() => {
    if (!hasProcessing) return
    const timer = setInterval(() => {
      getWardrobe()
        .then(({ items: list }) => setItems(list ?? []))
        .catch(() => {
          // Transient poll failure — the next tick retries.
        })
    }, 3000)
    return () => clearInterval(timer)
  }, [hasProcessing])

  async function handleAdd() {
    setUploadError(null)
    const image = await chooseImage()
    if (!image) return
    setAnalyzing(true)
    try {
      const res = await addWardrobeItem(image)
      const added = res.items ?? [res.item]
      setItems((prev) => (prev ? [...added, ...prev] : added))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not add that item.')
    } finally {
      setAnalyzing(false)
    }
  }

  function handleUpdated(updated: WardrobeItem) {
    setItems((prev) =>
      prev ? prev.map((it) => (it.id === updated.id ? updated : it)) : prev,
    )
  }

  function handleDeleted(id: string) {
    setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev))
  }

  const hasItems = items != null && items.length > 0

  // Category filter with counts — a quick read on what the closet holds.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const categoryCounts = new Map<string, number>()
  for (const it of items ?? []) {
    categoryCounts.set(it.category, (categoryCounts.get(it.category) ?? 0) + 1)
  }
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])
  const visibleItems = categoryFilter
    ? (items ?? []).filter((it) => it.category === categoryFilter)
    : (items ?? [])

  return (
    <Screen
      title="Your wardrobe"
      subtitle="Add the clothes you own and we'll tag each one, then build outfits from your real closet."
      refreshing={refreshing}
      onRefresh={() => load(true)}
    >
      <Card style={styles.addCard}>
        <Heading size={22}>Add an item</Heading>
        <Subtle style={{ marginTop: 4 }}>
          Photograph one or more garments — a flat-lay, a rack, or even yourself
          wearing them. Each item is extracted, cleaned up, and tagged
          individually; you can correct anything after.
        </Subtle>
        <Button
          title="Add item"
          loadingTitle="Uploading…"
          loading={analyzing}
          onPress={handleAdd}
          style={{ marginTop: spacing.lg }}
        />
        <Subtle style={styles.hint}>JPG, PNG, or WebP · up to 10MB.</Subtle>
        {uploadError && (
          <View style={{ marginTop: spacing.md }}>
            <ErrorText>{uploadError}</ErrorText>
          </View>
        )}
      </Card>

      {loading && <CenteredSpinner />}

      {!loading && loadError && <ErrorText>{loadError}</ErrorText>}

      {!loading && !loadError && !hasItems && (
        <EmptyState>
          <Subtle>Your wardrobe is empty.</Subtle>
          <Subtle>Add your first item above to get started.</Subtle>
        </EmptyState>
      )}

      {!loading && !loadError && hasItems && (
        <>
          <View style={styles.filterRow}>
            <TogglePill
              label={`All · ${items.length}`}
              active={categoryFilter === null}
              onPress={() => setCategoryFilter(null)}
            />
            {categories.map(([category, count]) => (
              <TogglePill
                key={category}
                label={`${category} · ${count}`}
                active={categoryFilter === category}
                onPress={() =>
                  setCategoryFilter((prev) => (prev === category ? null : category))
                }
              />
            ))}
          </View>

          <View style={styles.grid}>
            {visibleItems.map((item) => (
              <View key={item.id} style={styles.gridItem}>
                <WardrobeCard
                  item={item}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              </View>
            ))}
          </View>

          <View style={styles.ideas}>
            <View style={{ marginBottom: spacing.lg }}>
              <Heading size={26}>Outfit ideas</Heading>
              <Subtle style={{ marginTop: spacing.sm }}>
                Let your stylist pull outfits together from the pieces you own.
              </Subtle>
            </View>
            <OutfitSuggestions />
          </View>

          <WearJournal />
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  addCard: {
    marginBottom: spacing.xl,
  },
  hint: {
    marginTop: spacing.md,
    fontSize: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  ideas: {
    marginTop: spacing.xxl,
  },
})
